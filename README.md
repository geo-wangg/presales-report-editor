# 售前报告编辑工具

一个可在 GitHub Pages 上运行的纯前端工具。使用者导入平台生成的同模板售前报告 HTML，直接修改文案和数值，同步更新图标、颜色及图表，再另存为新的 HTML。

## 使用

1. 打开发布后的工具网址。
2. 点击「导入报告 HTML」，选择平台生成的原始报告或已保存的可编辑报告。
3. 点击正文直接编辑；选中文字后设置加粗、斜体、下划线或颜色。
4. 点击数值或图表，填写数据并应用。占比支持整组输入，不会在输入另一项时自动改动先前填写的数值。
5. 点击「另存为 HTML」下载新报告。新报告保留编辑能力，可以再次导入。

报告文件在访问者的浏览器本地处理，不上传到 GitHub 或其他服务器。工具不保存未导出的修改。报告的原有在线图片和字体仍使用原资源地址。

## GitHub Pages 部署

网站入口已经构建为 `docs/index.html`，所有运行代码和编辑器样式内嵌，不需要安装依赖，也不需要服务器后端。

仓库启用 GitHub Pages 时，选择 **Deploy from a branch → main → /docs**。发布完成后，把 Pages 页面给出的 HTTPS 地址分享给使用者。

GitHub Free 的 Pages 需要公开仓库；其他方案可能支持私有仓库。无论仓库采用哪种可见性，都不要把客户报告、上传文件、凭据或本地测试报告放进发布目录。本发布包只包含通用工具代码。

参考：[GitHub Pages 官方部署说明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。

## 维护

修改 `src/` 中的源文件后，重新构建并提交 `docs/index.html`：

```sh
python3 scripts/build.py
node scripts/verify_rules.cjs
node scripts/verify_importer.cjs
```

`src/tool.html.template` 是界面模板。实际网页入口是 `docs/index.html`。

## 适用范围

- 支持当前售前报告模板，品牌、竞品、平台和主题数量可以不同。
- 搜索量图标、主题可见度色块、条形图、份额环图、位次分布、评分进度、情绪占比、竞争推荐率及信源分类可以随数值同步更新。
- 同一统计口径且已绑定的重复指标同步变化。
- 分析文案仍需人工复核。模板未提供的上游业务诊断算法不会推测，相关状态可手动选择。
- 改变模板结构、增删主题/品牌/图表及替换图片暂不支持。

## 文件结构

```text
docs/       实际发布的静态网页
src/        通用工具与模板适配代码
scripts/    构建和规则验证
```
