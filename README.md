## AskCandidateEngine(愛媛県松山市ダブル選挙対応版)

## AskTokyo2014 open source version

このリポジトリは、2014年2月9日に行われた東京都知事選の際に、候補者に対して有権者がTwitterを通じて質問をできるようにした企画、[「AskTokyo2014」のオープンソース版](https://github.com/Keishake/AMAonTwitterEngine)をforkし、愛媛県松山市でも使えないか(直近だとダブル選挙)検証用リポジトリになります。

### 動作環境

- node.js v0.8.12
- MongoDB
- redis
- nginx


#### app.js
サイト

#### proxy.js
twitterからハッシュタグツイートを収集する

#### admin.js
候補者用ページ。
