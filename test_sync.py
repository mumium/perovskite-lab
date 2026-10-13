"""Exercise the real sync handler in a disposable directory and ephemeral port."""
import copy, importlib.util, json, shutil, tempfile, threading, unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler

class SyncTemplatesTest(unittest.TestCase):
    def test_template_roundtrip_and_old_client_compatibility(self):
        scratch=Path(__file__).resolve().parent/'.build-tools'
        scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='crystallab-sync-',dir=scratch) as folder:
            root=Path(folder)
            shutil.copyfile(Path(__file__).with_name('server.py'),root/'server.py')
            spec=importlib.util.spec_from_file_location('isolated_companion',root/'server.py')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            class QuietHandler(module.Handler):
                def log_message(self,*args):pass
            server=module.http.server.ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            local_http=build_opener(ProxyHandler({}))
            def post(data):
                req=Request('http://127.0.0.1:'+str(server.server_port)+'/api/sync',data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-PV-Token':module.TOKEN})
                with local_http.open(req,timeout=5) as res:return json.load(res)
            try:
                old={'batches':[{'id':'b'}],'devices':[{'id':'d','batchId':'b','results':[]}]}
                self.assertEqual(post(old)['templates'],[])
                new=copy.deepcopy(old)
                new['templates']=[{'id':'t','kind':'device','name':'退火方案','values':{'anneal':'110 °C / 30 min','area':'0.1'}}]
                received=post(new);self.assertEqual(received['templates'],new['templates'])
                self.assertEqual(post(old)['templates'],new['templates'],'old client must not erase templates')
                self.assertEqual(post({'batches':[],'devices':[]})['templates'],new['templates'])
                new['templates'][0]['values']['anneal']='120 °C / 30 min'
                self.assertEqual(post(new)['templates'][0]['values']['anneal'],'120 °C / 30 min')
                for bad in [None,{},[{'id':'t','kind':'bad','name':'x','values':{}}],[{'id':'t','kind':'device','name':'x','values':{'area':[]}}]]:
                    invalid=copy.deepcopy(old);invalid['templates']=bad
                    with self.assertRaises(HTTPError) as raised:post(invalid)
                    self.assertEqual(raised.exception.code,400)
                self.assertEqual(json.loads(module.STORE.read_text(encoding='utf-8'))['templates'],new['templates'])
                self.assertTrue((root/'lab-data.previous.json').exists())
            finally:
                server.shutdown();server.server_close();thread.join(3)

if __name__=='__main__':unittest.main()
