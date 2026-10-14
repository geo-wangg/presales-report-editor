"""打包本地浏览器工具为 GitHub Pages 静态页面，使用 Python 标准库。"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'src'
assets = {
    'rules': (SOURCE / 'editor-rules.js').read_text(encoding='utf-8'),
    'editor': (SOURCE / 'report-editor.js').read_text(encoding='utf-8'),
    'css': (SOURCE / 'report-editor.css').read_text(encoding='utf-8'),
    'template': (SOURCE / 'template-interactions.js').read_text(encoding='utf-8'),
}
html = (SOURCE / 'tool.html.template').read_text(encoding='utf-8')
assert html.count('<!-- TOOL_ASSETS -->') == 1
assert html.count('<!-- TOOL_SCRIPTS -->') == 1
payload = json.dumps(assets, ensure_ascii=False).replace('<', '\\u003c')
html = html.replace('<!-- TOOL_ASSETS -->', '<script id="tool-assets" type="application/json">' + payload + '</script>')
script = (SOURCE / 'importer.js').read_text(encoding='utf-8') + '\n' + (SOURCE / 'tool.js').read_text(encoding='utf-8')
assert '</script' not in script.lower()
html = html.replace('<!-- TOOL_SCRIPTS -->', '<script>\n' + script + '\n</script>')
destination = ROOT / 'docs'
destination.mkdir(exist_ok=True)
(destination / 'index.html').write_text(html, encoding='utf-8')
(destination / '.nojekyll').write_text('', encoding='utf-8')
print('已构建 docs/index.html')
