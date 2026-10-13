package cn.pvlab.notebook;
import android.app.Activity;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Resize the actual WebView viewport; WebView padding does not reliably
        // move CSS sticky/fixed controls away from Android's system bars.
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(245,247,252));
        web = new WebView(this);
        container.addView(web,new FrameLayout.LayoutParams(-1,-1));
        if(android.os.Build.VERSION.SDK_INT>=30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        getWindow().getDecorView().setSystemUiVisibility(getWindow().getDecorView().getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        container.setOnApplyWindowInsetsListener((v,insets)-> {
            int left,top,right,bottom;
            if(android.os.Build.VERSION.SDK_INT>=30) {
                android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
            } else {
                left=insets.getSystemWindowInsetLeft();top=insets.getSystemWindowInsetTop();
                right=insets.getSystemWindowInsetRight();bottom=insets.getSystemWindowInsetBottom();
                android.view.DisplayCutout cutout=insets.getDisplayCutout();
                if(cutout!=null) {
                    left=Math.max(left,cutout.getSafeInsetLeft());top=Math.max(top,cutout.getSafeInsetTop());
                    right=Math.max(right,cutout.getSafeInsetRight());bottom=Math.max(bottom,cutout.getSafeInsetBottom());
                }
            }
            FrameLayout.LayoutParams layout=(FrameLayout.LayoutParams)web.getLayoutParams();
            if(layout.leftMargin!=left || layout.topMargin!=top || layout.rightMargin!=right || layout.bottomMargin!=bottom) {
                layout.setMargins(left,top,right,bottom);web.setLayoutParams(layout);
            }
            // Tell WebView these insets are already handled, including updates
            // when the keyboard closes; do not leave stale viewport padding.
            WindowInsets.Builder remaining=new WindowInsets.Builder(insets);
            if(android.os.Build.VERSION.SDK_INT>=30) {
                remaining.setInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime(),android.graphics.Insets.NONE);
                remaining.setInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout(),android.graphics.Insets.NONE);
            } else remaining.setSystemWindowInsets(android.graphics.Insets.NONE).setStableInsets(android.graphics.Insets.NONE);
            return remaining.setDisplayCutout(null).build();
        });
        setContentView(container);
        container.post(container::requestApplyInsets);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.addJavascriptInterface(new ExportBridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("app.pvlab.local".equals(u.getHost())) {
                    String path = u.getPath();
                    if (path == null || path.equals("/")) path = "/index.html";
                    if (!path.matches("/(index\\.html|style\\.css|presets\\.js|app\\.js)")) return new WebResourceResponse("text/plain", "UTF-8", null);
                    try { return new WebResourceResponse(path.endsWith(".css")?"text/css":path.endsWith(".js")?"application/javascript":"text/html", "UTF-8", getAssets().open(path.substring(1))); }
                    catch(Exception e) { return new WebResourceResponse("text/plain", "UTF-8", null); }
                }
                return super.shouldInterceptRequest(v,r);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if(chooser!=null) chooser.onReceiveValue(null);
                chooser=callback;
                Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT); i.setType("*/*"); i.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(i,12); return true;
            }
        });
        web.loadUrl("http://app.pvlab.local/index.html");
    }
    @Override protected void onActivityResult(int req,int result,Intent data) {
        super.onActivityResult(req,result,data);
        if(req==12 && chooser!=null) { chooser.onReceiveValue(result==RESULT_OK && data!=null?new Uri[]{data.getData()}:null); chooser=null; }
    }
    private class ExportBridge {
        @JavascriptInterface public void saveFile(String name,String content,String mime) {
            try {
                ContentValues values=new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME,name.replaceAll("[^a-zA-Z0-9\\p{IsHan}_.-]","_"));
                values.put(MediaStore.Downloads.MIME_TYPE,mime.split(";")[0]);
                values.put(MediaStore.Downloads.IS_PENDING,1);
                Uri uri=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
                if(uri==null) throw new Exception("无法创建导出文件");
                try(OutputStream out=getContentResolver().openOutputStream(uri)) { out.write(content.getBytes(StandardCharsets.UTF_8)); }
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING,0); getContentResolver().update(uri,values,null,null);
                runOnUiThread(()->Toast.makeText(MainActivity.this,"已保存到下载目录",Toast.LENGTH_LONG).show());
            } catch(Exception e) { runOnUiThread(()->Toast.makeText(MainActivity.this,"导出失败，请检查存储空间",Toast.LENGTH_LONG).show()); }
        }
    }
}
