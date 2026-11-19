# web-guidelines-audit

[English](README.md)

Web ガイドラインのチェックリスト（ページ品質・アクセシビリティ）の項目を、AI エージェントがブラウザでページを開いて検査するためのスキルです。
結果はチェック記録の作業ファイル（JSON）になり、担当者がチェック記録（`/checklist-app`）で読み込んで確かめます。

スキル本体（`SKILL.md`）は英語で書いています。日本語で依頼すれば日本語で報告し、所見も日本語で書きます。

## 構成

```text
skills/
  web-guidelines-audit/
    SKILL.md         # 手順
    scripts/
      probe.js       # ページの中で実行して値を集める
      workfile.mjs   # findings.json から作業ファイルを作る
```

## 導入

スキルのフォルダを、Claude Code のスキルのフォルダにコピーします。

```bash
git clone https://github.com/cayenne-co/web-guidelines-audit-skills.git
cp -R web-guidelines-audit-skills/skills/web-guidelines-audit ~/.claude/skills/
```

## 必要なもの

- ブラウザを操作できるツール（Claude in Chrome か Playwright MCP）
- Node.js 18 以上（`workfile.mjs` を実行するため）
- Web ガイドラインのサイト（`/checklist.json` を読む）

## 版

- スキルの版は `skills/web-guidelines-audit/SKILL.md` の `metadata.version` です。タグ（`vX.Y.Z`）はこれに揃えます。
- `metadata.guidelines` は、スキルが対応するガイドラインの版の範囲です（例: `>=0.1.0 <0.2.0`）。
- `workfile.mjs` はスキルの版を表示し、ガイドラインの版が範囲の外なら警告します。
- 変更の内容は [CHANGELOG.md](CHANGELOG.md) にあります。

手元のスキルの版を確かめる:

```bash
grep -A2 '^metadata:' ~/.claude/skills/web-guidelines-audit/SKILL.md
```

## 更新

最新のリリース（または特定のタグ）を取り出し、スキルのフォルダをコピーし直します。

```bash
cd web-guidelines-audit-skills
git fetch --tags
git checkout vX.Y.Z   # または: git checkout main && git pull
rm -rf ~/.claude/skills/web-guidelines-audit
cp -R skills/web-guidelines-audit ~/.claude/skills/
```

検査に使うガイドラインのサイトの版が、`guidelines` の範囲に入るリリースを選びます。

## 安全のための約束

スキルは、利用者が許可したサイトだけを読み取り中心で検査します。フォームの送信・ログイン・個人情報の入力はしません。
詳しくは `skills/web-guidelines-audit/SKILL.md` の「Rules」を参照してください。

## ライセンス

[MIT](LICENSE)
