# 中国野鸡大学辨别小游戏

> 本项目灵感来源 猜盐：野鸡大学辨别 —— 找出正规大学！ https://xiaoce.fun/q/79778

游戏直达：[https://rhhhhhhh.github.io/Fake-CN-University-Game.github.io/](https://rhhhhhhh.github.io/Fake-CN-University-Game/)

从 30 所学校中找出 15 所正规大学，别被野鸡大学骗了。

## 玩法

- 四个难度：简单 / 中等 / 困难 / 地狱，点卡片即开始
- 每局限时 5 分钟，允许错 5 次
- 选对立即变绿，选错立即标红并扣一次机会
- 5 次用尽或时间到，自动公布全部答案

## 数据来源

- 正规高校：教育部《全国普通高等学校名单（截至 2025 年 6 月）》
- 野鸡大学：人民日报曝光的 392 所虚假大学名单

## 本地运行

纯静态页面，无依赖、无构建步骤：

```bash
python -m http.server 8000   # 然后打开 http://127.0.0.1:8000/
```

也可以直接用 `standalone/野鸡大学辨别-单文件版.html`（双击即可打开）。

## 目录说明

```
index.html   页面
style.css    样式
game.js      游戏逻辑
data.js      校名数据
```
