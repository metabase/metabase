export const KITCHEN_SINK_MARKDOWN = `# Heading level 1

## Heading level 2

### Heading level 3

Paragraph with **bold**, *italic*, ~~strikethrough~~, \`inline code\` and a
[link](https://metabase.test) plus an autolink https://metabase.test/autolink.

Line before a hard break\\
line after a hard break.

- Bullet item
- Bullet item with \`code\`
  - Nested bullet item
  - Another nested bullet item
- Last bullet item

1. Ordered item
2. Ordered item
3. Ordered item

- [ ] Unchecked task
- [x] Checked task

> Blockquote spanning
> two lines.

\`\`\`sh
java -jar metabase.jar migrate up
\`\`\`

| Column | Status |
| --- | --- |
| Static embedding | Vulnerable |
| Interactive embedding | Not affected |

![Image](https://metabase.test/image.png)

---

Footnote reference[^1].

[^1]: Footnote definition.
`;

export const UNBREAKABLE_TABLE_MARKDOWN = `| Setting | Value |
| --- | --- |
| Endpoint | \`https://metabase.test/api/setting/report-timezone?include-updated-at=true\` |
| Token | MB_PREMIUM_EMBEDDING_TOKEN_0123456789abcdef0123456789abcdef |
`;
