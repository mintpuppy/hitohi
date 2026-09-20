# きょうのページ

1日1ページの紙の手帳を、iPadで。
書き出す（① LIST）→ 3つ選ぶ（② TOP 3）→ 時間に置く（③ TIME）→ チェックする（④ DONE）。

## GitHub Pages に置く

1. リポジトリを作る（公開・非公開どちらでも可。非公開の場合は Pages の設定に Pro が必要）。
2. このフォルダの中身を**すべてリポジトリ直下に**アップロードする（フォルダを作らない）。
3. Settings → Pages → Source を `Deploy from a branch`、Branch を `main` / `/ (root)` にして保存。
4. 1〜2分待って `https://ユーザー名.github.io/リポジトリ名/` を開く。
5. iPad の Safari で開き、共有ボタン →「ホーム画面に追加」。次からはアプリとして起動する。

更新したときは、Safari で一度アプリを開き直すと新しい版に入れ替わる（Service Worker が古い版を消して入れ替える）。

## データについて

- 保存先は iPad のブラウザ内（localStorage）。サーバーにもクラウドにも送られない。
- Safari の「履歴とWebサイトデータを消去」をすると消える。ホーム画面から起動していれば通常の閲覧履歴の削除では消えない。
- 同じ端末・同じブラウザでのみ読める（端末間の同期はしない）。

## ファイル

すべて同じ階層に置く。

```
index.html
style.css
script.js
manifest.json
sw.js
apple-touch-icon.png
icon-192.png
icon-512.png
icon-maskable-512.png
README.md
```
