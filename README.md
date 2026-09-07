# ぶおー法螺貝道場

依田芳乃的非官方粉丝互动小游戏。日语界面，优先适配手机竖屏。使用提供的三张人物图和标题，青蓝、米白为主色，朱红为点缀。

## 运行与部署

纯 HTML / CSS / JavaScript，无运行时依赖、后端、外部字体或 CDN。根目录本身就是完整网站，所有资源使用相对路径，兼容 `https://用户名.github.io/仓库名/`。

### 直接使用 GitHub Pages（无需构建）

1. 将本目录文件上传至 GitHub 仓库，保留 `assets` 目录和文件名大小写。
2. 打开仓库 **Settings → Pages**。
3. Source 选择 **Deploy from a branch**，选择存放代码的分支和 **/ (root)**，保存。
4. 若上传了 `.github/workflows/pages.yml`，采用这种分支部署方式时删除该文件，避免同时运行另一条部署流程。
5. 等待 GitHub 给出 HTTPS 地址，即可打开游戏。

部署规则参考 [GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

### 使用自动检查与部署

仓库包含 `.github/workflows/pages.yml`。若使用此方式，在 Settings → Pages 将 Source 设为 **GitHub Actions**，推送到 `main` 或手动运行工作流。工作流会安装测试所需的开发依赖和 Chromium，再进行语法检查、自动测试、手机尺寸布局测试、打包和部署。网站运行仍无第三方依赖。两种部署方式选一种即可。参考 [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

### 本地预览

需要 Node.js 20 或以上：

```sh
npm run dev
```

打开 `http://localhost:4173`。修改后刷新页面。麦克风需要 HTTPS 或 localhost；手机直接访问电脑的局域网 HTTP 地址时请用长按试玩，或部署到 GitHub Pages 后体验真实吹气。不要通过双击 HTML 的 `file://` 方式启动 ES module 网站。

```sh
npm run check
npm test
npm run build
```

构建后 `dist/` 内只有网页和素材，可上传至任意静态托管服务。

## 游戏行为

- 进入页面：人物 A 左右摇晃。
- 点击「法螺貝を吹く」：切换静止人物 B，请求麦克风权限。
- 允许后：约 0.8 秒检测环境底噪，提示玩家暂时保持安静，然后等待吹气。
- 持续检测到约 0.2 秒吹气特征：切换人物 C 并循环放大缩小。
- 开始时飘出「武」，之后每秒依次出现「謳」「鶯」「王」，随后出现读作「お／オ」的汉字。词池用完循环；结算保留本次完整顺序，包括重复字符。
- 持续约 0.75 秒未检测到吹气后结算，计时不包含最后这段等待时间。短暂波动容许继续。
- 真实吹气和长按试玩均最多 **30 秒**，到时自动结算；起吹立即出现一字，因此完整 30 秒最多 31 字。
- 结算包含「お疲れさまでした」、全部汉字、吹气时间、再来一次、投票入口和分享。
- 分享优先调用系统分享面板，否则复制文字；剪贴板也不可用时展示可手动复制的文本。
- 麦克风被拒绝、不支持或不可用时，仍可长按试玩；试玩结果有明确标记。也支持空格或 Enter 按住试玩。
- 结束、取消、后台切换或离开页面会停止麦克风。权限请求中取消后，晚到的授权流也会立即关闭。
- 支持减少动态效果的系统偏好、键盘焦点和原生对话框。

## 修改投票地址

`config.js` 中的 `voteUrl` 按要求留空。此时按钮显示为待准备状态，点击只提示「投票先は、ただいま準備中です」。有地址后填写，例如：

```js
voteUrl: 'https://你的正式投票地址',
```

仅接受 HTTP / HTTPS，实际跳转新标签页。该按钮打开投票页面，不代替玩家提交投票。

## 吹气检测的范围

Web Audio 在端侧分析音量、频谱平坦度、高低频分布，并结合底噪校准、起吹去抖和结束滞后来检测吹气。请求关闭浏览器的降噪、自动增益与回声消除，避免风噪被作为背景音滤除；设备可能忽略部分设置。

这是一种声音特征启发式，不是声音分类模型。持续的环境风声或某些人声仍可能触发；不同手机的麦克风需要实际体验后调节感度。没有录音、保存、播放或上传音频。没有分析服务、Cookie、登录或持久记录。麦克风条件参考 [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。

开头「武・謳・鶯・王」是指定的趣味序列，并非都读单独的「お」。后续字池参考 [漢字ペディア「オ／お」音训索引](https://www.kanjipedia.jp/sakuin/onkun/%E3%82%AA)。

## 验证范围

自动测试覆盖汉字序列与边界、30 秒上限、环境校准、吹气去抖、结束计时、短暂停顿、灵敏度、频谱计算，以及模拟浏览器依赖下的交互和麦克风资源清理。模拟信号和环境不能替代 iPhone / Android 的真机麦克风体验。

另外提供 10 项 Chromium 布局回归检查，覆盖 320×568、375×667、390×844、430×932 和 768×1024：请求权限、校准、等待吹气和吹响期间，人物区域的高度和位置保持不变；三张图按实际人物轮廓校正视觉高度；最多 31 个汉字按数量和可用宽度缩放，完整显示，不使用内部滚动条。

运行布局检查：

```sh
npm ci
npx playwright install chromium
npm run test:layout
```

macOS 若已安装 Chrome，会直接使用系统 Chrome；其他环境使用 Playwright 的 Chromium。

浏览器若支持实验性的 `document.modelContext`，另有读取游戏状态和准备长按试玩的工具；不支持时完全不影响游戏。实际浏览器 WebMCP 注册尚未验证。

## 素材

`assets/` 中原始四个 PNG 保留。页面标题使用新增的 `title-logo-transparent.png`，从原始标题通过边缘连通白底分离获得，带真实 RGBA 透明通道。生成式工具输出的棋盘格版本未采用。`scripts/extract-logo.py` 可重做抠图（维护时需要 Pillow、NumPy、SciPy，网站运行和构建不需要 Python）。三个人物图片仍是原文件，仅用 CSS 校准显示比例和动画。

没有使用参考网站的代码、图片或设计；没有新增来自いらすとや的图片。
