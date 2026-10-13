"""Trusted LAN companion. Python standard library only."""
import http.server, json, os, secrets, socket, threading, sys, webbrowser
from pathlib import Path
ROOT = Path(__file__).resolve().parent
DATA_ROOT = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else ROOT
STORE = DATA_ROOT / 'lab-data.json'
TOKEN_FILE = DATA_ROOT / '.pairing-key'
if not TOKEN_FILE.exists():
    TOKEN_FILE.write_text(secrets.token_urlsafe(24), encoding='utf-8')
TOKEN = TOKEN_FILE.read_text(encoding='utf-8').strip()
LOCK = threading.Lock()

def validate(data):
    if not isinstance(data, dict): raise ValueError('invalid data')
    for key in ('batches', 'devices'):
        if not isinstance(data.get(key), list): raise ValueError('invalid collection')
        ids = set()
        for row in data[key]:
            if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'] or row['id'] in ids: raise ValueError('invalid id')
            ids.add(row['id'])
    batch_ids = {b['id'] for b in data['batches']}
    for d in data['devices']:
        if d.get('batchId') not in batch_ids or not isinstance(d.get('results'), list): raise ValueError('invalid device')
        for r in d['results']:
            if not isinstance(r, dict) or not isinstance(r.get('id'), str): raise ValueError('invalid result')

    if 'templates' in data:
        if not isinstance(data['templates'], list): raise ValueError('invalid templates')
        ids = set()
        for t in data['templates']:
            if not isinstance(t, dict) or not isinstance(t.get('id'), str) or not t['id'] or t['id'] in ids: raise ValueError('invalid template id')
            if t.get('kind') not in ('batch', 'device') or not isinstance(t.get('name'), str) or not t['name'].strip(): raise ValueError('invalid template')
            if not isinstance(t.get('values'), dict) or any(not isinstance(v, str) for v in t['values'].values()): raise ValueError('invalid template values')
            ids.add(t['id'])

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-PV-Token')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()
    def do_POST(self):
        if self.path != '/api/sync': self.send_error(404); return
        if not secrets.compare_digest(self.headers.get('X-PV-Token', ''), TOKEN): self.send_error(403); return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 20_000_000: self.send_error(413); return
            incoming = json.loads(self.rfile.read(size))
            validate(incoming)
            with LOCK:
                current = json.loads(STORE.read_text(encoding='utf-8')) if STORE.exists() else {'batches': [], 'devices': []}
                for key in ('batches', 'devices', 'templates'):
                    merged = {x['id']: x for x in current.get(key, [])}
                    merged.update({x['id']: x for x in incoming.get(key, [])})
                    current[key] = list(merged.values())
                validate(current)
                if STORE.exists(): (DATA_ROOT / 'lab-data.previous.json').write_bytes(STORE.read_bytes())
                temp = DATA_ROOT / 'lab-data.tmp'
                temp.write_text(json.dumps(current, ensure_ascii=False), encoding='utf-8')
                os.replace(temp, STORE)
            body = json.dumps(current, ensure_ascii=False).encode('utf-8')
            self.send_response(200); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        except (ValueError, KeyError, TypeError): self.send_error(400, 'Invalid experiment data')

if __name__ == '__main__':
    print('电脑打开 http://localhost:8765')
    print('手机填写 http://电脑局域网IP:8765 （同一可信 Wi-Fi）')
    print('电脑主机名:', socket.gethostname())
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith('127.'): print('手机候选地址: http://' + ip + ':8765')
    except OSError: pass
    print('配对密钥:', TOKEN)
    print('局域网 HTTP 未加密，请仅在可信网络使用；勿映射到公网。')
    if getattr(sys, 'frozen', False): threading.Timer(0.8, lambda: webbrowser.open('http://localhost:8765')).start()
    try:
        http.server.ThreadingHTTPServer(('0.0.0.0',8765), Handler).serve_forever()
    except OSError as e:
        print('启动失败：端口可能已被占用，请先关闭其他电脑端窗口。', e)
        input('按回车退出。')
