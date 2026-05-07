# 📊 Test Analyzer

ブラウザ上で動作するテスト結果分析Webアプリケーション。
学校採用フォーマットの集計Excelをアップロードすると、設問ごとの点数から
「どの知識・思考が抜けているか」を多角的に可視化し、生徒個人へのアドバイスと
教員へのフィードバックを自動生成します。

> 🔒 **完全クライアントサイド** — データはブラウザから出ません。サーバーへの送信なし。
> 📱 **GitHub Pages 対応** — 静的ホスティングだけで動きます（ビルド不要）。

[easy_stat_edu](https://github.com/itou-daiki/easy_stat_edu) のアーキテクチャ・デザインを踏襲。

## 🚀 主な機能

| ページ | 内容 |
|---|---|
| 概要・EDA | 得点分布／クラス比較／項目別ヒートマップで全体像を把握 |
| 項目分析（CTT） | 困難度・識別力・Cronbach α・α-if-deleted で「良問／要改善問」を抽出 |
| クラスタ分析 | K-means + PCA で生徒タイプを4〜8群に分類、レーダーで可視化 |
| 生徒別フィードバック | 個人カルテ／強み弱み／自動コーチング文／類似生徒／ペア学習推奨／印刷対応 |
| 連関分析 | アソシエーション・ルール抽出（Apriori-lite）／同時失点ヒートマップ／相関ネットワーク |
| 教員ダッシュボード | 再指導優先度ランキング／クラス比較ANOVA／要支援生徒一覧／本日の指導テーマ／Excelダウンロード |
| 縦断比較 | 複数考査をまたいだZスコア軌跡／伸びた・落ちた生徒検出／持続的下位検出／次回予測スコア |

## 💡 独自の工夫

- **隠れリスク検出**: 合計点は普通でも基礎項目で取りこぼしている生徒を自動抽出
- **ペア学習推奨**: 弱み項目を相手が得意としている補完的な生徒を提案
- **本日の指導テーマ**: 困難度×識別力スコアで翌日の授業優先テーマを自動提案
- **次回予測スコア**: 2回以上の考査からの線形外挿で次回スコアを予測
- **印刷対応個人カルテ**: ブラウザ印刷で保護者面談用の資料がそのまま出せる
- **教員レポートExcel**: 指導記録に貼り付けられる形式で一括ダウンロード

## 📋 使い方

1. ブラウザで本アプリを開く
2. 「データ読込」エリアにExcelファイル（.xlsx）をドラッグ＆ドロップ
3. 同一フォーマットなら自動で解析。複数ファイルOK（縦断比較が有効化される）
4. 「利用できる分析」のカードから目的の分析を選ぶ

## 🛠️ ローカル動作確認

```bash
cd test_analyzer_web
python3 -m http.server 8000
# → http://localhost:8000 をブラウザで開く
```

または `npx http-server -c-1`、`npx serve` などお好みで。

## 🌐 GitHub Pages デプロイ

1. このディレクトリ全体をリポジトリにpush
2. GitHubの **Settings → Pages** で **Source = `main` branch / root** を選択
3. 数分で `https://<USER>.github.io/<REPO>/` で公開される

`.nojekyll` を含めているので、Jekyll処理がスキップされファイル名のアンダースコアもそのまま動きます。

## 📄 対応データ形式

学校採用の集計データExcelに合わせて自動解析します:

- 1シート目: メタ列（生徒管理コード／学年／クラス／番号／氏名）+ 得点列（合計点／知／思／小計1..N など）
- ヘッダー行は0行目または1行目を自動検出
- 「クラス平均」シートに `配点` 行があれば配点を自動取得
- ファイル名末尾の12桁（YYYYMMDDHHMM）をテスト日付として認識

## 🔧 技術スタック

- **Pure JavaScript (ES Modules)** — ビルド不要
- **[Plotly.js](https://plotly.com/javascript/)** — インタラクティブなグラフ
- **[SheetJS](https://sheetjs.com/)** — Excel読み書き
- **[jStat](http://jstat.github.io/)** — 統計分布
- **自前実装**: K-means / PCA / Apriori-lite

## 📁 ディレクトリ構成

```
test_analyzer_web/
├── index.html              ← エントリポイント
├── .nojekyll               ← GitHub Pages 用
├── css/style.css           ← デザイン（easy_stat_edu 準拠）
├── js/
│   ├── main.js             ← ファイル読込／ビュー切り替え
│   ├── loader.js           ← Excel→TestData変換
│   ├── utils.js            ← 表・グラフ・統計ヘルパー
│   ├── picker.js           ← 共通テスト選択ウィジェット
│   ├── ml.js               ← K-means / PCA / Apriori
│   └── analyses/
│       ├── overview.js
│       ├── item_analysis.js
│       ├── clustering.js
│       ├── student_feedback.js
│       ├── association.js
│       ├── teacher_dashboard.js
│       └── longitudinal.js
└── README.md
```

## 📜 ライセンス

MIT
