# こんだてアプリ 運用ガイド

夫婦2人用の夜ご飯献立PWA。**このファイルを読めば、どのモデル(Sonnet単体を含む)でも開発〜公開まで完結できる。**

- 公開URL: https://younyoun22.github.io/kondate-app/ (GitHub Pages)
- リポジトリ: https://github.com/younyoun22/kondate-app (公開)
- ユーザーは非プログラマー(映像編集者)。説明は平易に、ターミナル操作を求めるときは1コマンドずつ+期待される表示をセットで

## 絶対に守る方針

1. **API課金ゼロ**: Claude API等の従量課金APIは使わない(ユーザーの明確な意向)。献立は内蔵レシピDBから生成
2. **シンプル構成維持**: ビルドなし・フレームワークなし。index.html + recipes.js の静的構成を崩さない
3. **Nintendo 2001デザイントークンを変えない**: 色(#e60012/#f68d1f/#ecab37/#e48600/#7a8aba/#9fbee7/#3d4f97/#dedede/#21242e)、Arial、直角基調、ベベル(上辺ハイライト+下辺Chrome Indigo影)、スマホ専用1カラム(max-width 430px)
4. 文字は本文12px以上、タップ領域44px以上、ピンチ拡大を禁止しない

## ファイル構成

| ファイル | 内容 |
|---|---|
| `index.html` | アプリ本体(CSS/JS全部入り)。機能変更はここ |
| `recipes.js` | レシピデータ(320品)。レシピ追加はここに追記 |
| `sw.js` | Service Worker。本体(index/recipes/manifest)はnetwork-first、アイコンはcache-first。**アイコンPNGを変えたらCACHE_NAMEのバージョンを上げる**(本体変更だけなら不要) |
| `manifest.json` / `icon-*.png` / `apple-touch-icon.png` | PWA設定とモンスターボールアイコン |
| `.github/workflows/pages.yml` | デプロイ設定(push→約30秒で公開)。触る必要なし |

## recipes.js のスキーマ

```js
{ name: "鶏むね肉の照り焼き",            // 全320品でユニーク必須
  category: "main",                      // main(主菜150) / side(副菜100) / soup(汁物70)
  genre: "和",                           // 和 / 洋 / 中
  protein: "鶏",                         // mainのみ: 鶏/豚/牛/魚/卵・豆腐
  ingredients: [{ n: "鶏むね肉", a: "1枚(約300g)" }, ...],  // aは2人分の分量
  time: 15,                              // 調理時間(分)。10以下が「いそぎ」対象
  memo: "ひとことポイント" }
```

### レシピ追加時の注意(地雷)
- **食材名は既存の表記に必ず合わせる**(index.htmlのALIASES・SEASONALとマッチングされるため)。新しい表記を増やさない
- **表記の衝突回避が確立済み**: 鮭は「生鮭」(「酒」との正規化衝突)、長ねぎは「長ねぎ」(「玉ねぎ」との部分一致)、「新玉ねぎ」と「玉ねぎ」は別物として扱われる
- 追加後は必ず全件検証:
```bash
cd ~/Downloads/kondate-app && node --check recipes.js && node -e '
const fs=require("fs");
eval(fs.readFileSync("recipes.js","utf8")+";globalThis.__R=RECIPES;");
const R=globalThis.__R;
const bad=R.filter(r=>!r.name||!r.category||!r.genre||!r.time||!r.memo||!Array.isArray(r.ingredients)||r.ingredients.some(i=>!i.n||!i.a)||(r.category==="main"&&!r.protein));
const names=new Set(R.map(r=>r.name));
console.log("total:",R.length,"unique:",names.size,"bad:",bad.length);'
```
- 旬食材をSEASONAL(index.html内、月→食材名リスト)に足す場合は、全レシピ×12ヶ月で誤マッチ(部分一致の巻き込み)がないかnodeスクリプトで検証すること

## index.html の内部構造(要点)

- **献立生成の優先順位**(pickBest周辺、レイヤー式ソフト除外=プールが尽きたら段階的に緩める):
  1. 使いたい食材キーワード(最優先) → 2. さける食材(avoidList、ハード寄り) → 3. 時間フィルタ(いそぎ≦10分/ふつう≦20分) → 4. 週内重複(usedNames) → 5. 履歴(過去2世代、HISTORY_KEY) → 6. 旬クォータ(1日3品中最低2品、主菜優先、forceSeasonalフラグ) → 7. 主菜のprotein/genre連続回避
- **食材マッチング**: normalizeForSearch()(NFKC+ALIASES辞書+ひらがな→カタカナ)。「にら/ニラ/韮」が同一視される。食材比較は必ずこれを通す
- **localStorage**: `kondate-app-state-v4`(献立・チェック・キープ・設定類)、`kondate-app-history-v3`(生成履歴)。スキーマ変更時は後方互換のデフォルト補完で済むならバージョン据え置き、互換が壊れるならバージョンを上げる
- **チェック(消し込み)状態(checkedSet)**: 新規生成時のみリセット。**さける食材の差し替え経路・人数変更・タブ切替では絶対にリセットしない**(ユーザーの重要要件: 買い物途中でカートをやり直させない)
- **長押し(買い物リスト→さける食材)**: iOS実機対応のためpointer/touch二重経路タイマー+touch-action:pan-y。壊れやすいので変更時は慎重に
- **確認バー(.confirm-bar)**: 画面下部固定オーバーレイ(過去にページ上部にあって見えないバグがあった)
- **キープ中の料理でしか使っていない食材**は、さける食材に登録しない仕様(説明バーのみ)
- **PokeAPI**: 画像はjsDelivrミラー(`cdn.jsdelivr.net/gh/PokeAPI/sprites@master/...`)経由。**raw.githubusercontent.comは429で使用不可**。フォールバック: jsDelivr→raw→モンスターボール

## 動作検証の手順(必須の回避策あり)

**⚠️ Claude Previewの内蔵プロキシは macOSのTCC制限で ~/Downloads を読めない(404になる)。** 検証は次の手順で:

1. プロジェクト一式をスクラッチパッド(セッションのscratchpadディレクトリ)にコピー
2. Bashで `python3 -m http.server <ポート> --directory <コピー先>` を起動
3. preview_start(既存のlaunch.json設定でよい)→ preview_evalで `window.location = "http://localhost:<ポート>/"` に遷移して検証
4. **修正の適用先は必ず本体(~/Downloads/kondate-app/)**。検証後はコピー・サーバー・launch.jsonへの一時変更をすべて撤去
5. SWキャッシュが邪魔なときは preview_eval で `caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k))))`

**検証チェックリスト**(毎回): 375px幅で横スクロールなし / コンソールエラーなし / リロードで状態復元 / 既存機能(生成・キープ・ピン・チェック・タブ・長押し・時間/人数/さける設定)が壊れていない

## 公開(デプロイ)の手順

```bash
cd ~/Downloads/kondate-app
git add <変更ファイル>
git commit -m "日本語で内容を説明するコミットメッセージ"
git push
# 約30秒でデプロイ完了。確認:
gh api repos/younyoun22/kondate-app/actions/runs --jq '.workflow_runs[0] | {status, conclusion}'
# conclusion: "success" ならOK。最終確認は curl で公開URLに変更が入ったかgrep
```

- ghはアカウント younyoun22 でログイン済み(credential helper設定済み)。認証エラーが出たら `gh auth status` を確認
- コミット末尾の Co-Authored-By 行は担当モデル名で付けてよい

## ユーザーへの案内テンプレ

- 公開後: 「スマホでアプリを開き直す(または下に引っ張って更新)と反映されます」(SWはnetwork-firstなので確実に更新される)
- アイコンを変えたとき: 「ホーム画面のアイコンを削除→Safariで開く→共有→ホーム画面に追加、で新アイコンになります」
- localStorageのスキーマを上げたとき: 「保存形式が変わったため、前回の献立は一度リセットされます」

## やらないこと

- Claude API連携(課金が発生するため。提案もユーザー確認なしに実装しない)
- レシピの直接URL埋め込み(リンク切れリスク。「レシピをみる」はGoogle検索リンク方式を維持)
- PC向け2カラムレイアウト(スマホ専用の方針)
