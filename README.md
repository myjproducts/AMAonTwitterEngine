## AskCandidateEngine(愛媛県松山市ダブル選挙対応版)

## AskEhime2014 open source version

このリポジトリは、2014年2月9日に行われた東京都知事選の際に、候補者に対して有権者がTwitterを通じて質問をできるようにした企画、[「AskTokyo2014」のオープンソース版](https://github.com/Keishake/AMAonTwitterEngine)をforkし、愛媛県松山市でも使えないか(直近だとダブル選挙)検証用リポジトリになります。

### 動作環境

- heroku(node.js v0.10.x)
- MongoDB(heroku Add-on:mongoHQ)
- redis(heroku Add-on:redistogo)


#### app.js
サイト

#### proxy.js
twitterからハッシュタグツイートを収集する

#### admin.js
候補者用ページ。
