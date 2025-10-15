# Markdown Parser for Metabase Documents

Bidirectional converter between Markdown (with Metabase extensions) and ProseMirror JSON.

## Usage

### Markdown → ProseMirror JSON

```bash
# Parse a file
node parse-markdown.mjs file.md

# Parse from stdin
cat file.md | node parse-markdown.mjs
echo "# Test" | node parse-markdown.mjs

# Verbose mode (diagnostics to stderr)
node parse-markdown.mjs --verbose file.md
```

### ProseMirror JSON → Markdown

```bash
# Serialize a file
node serialize-prosemirror.mjs document.json

# Serialize from stdin
cat document.json | node serialize-prosemirror.mjs
echo '{"type":"doc","content":[...]}' | node serialize-prosemirror.mjs

# Verbose mode
node serialize-prosemirror.mjs --verbose document.json
```

### Round-trip Test

```bash
# Verify markdown → json → markdown produces identical output
node parse-markdown.mjs file.md | node serialize-prosemirror.mjs | diff - file.md
```

### With jq for analysis

```bash
# List block types
node parse-markdown.mjs file.md | jq '.content[] | .type'

# Count blocks
node parse-markdown.mjs file.md | jq '.content | length'

# Extract card IDs
node parse-markdown.mjs file.md | jq '.. | .cardEmbed? | select(.) | .attrs.id'
```

## Metabase Markdown Syntax

### Standard Markdown

All standard CommonMark elements are supported:
- Headings (`#`, `##`, `###`)
- Paragraphs
- Bold (`**bold**`) and italic (`*italic*`)
- Links (`[text](url)`)
- Lists (ordered and unordered)
- Code blocks and inline code
- Blockquotes

### Card Embeds

```markdown
# Single card with numeric ID
{% card id=123 %}

# Card with ref (for Representations)
{% card id=ref:my-chart %}

# Card with custom title
{% card id=456 name="My Custom Title" %}
```

**ID Format:**
- Numeric: `id=123` → JSON has `"id": 123` (number)
- Ref: `id=ref:my-chart` → JSON has `"id": "ref:my-chart"` (string)

**Output:** `resizeNode` containing `cardEmbed`

### Side-by-Side Layout

```markdown
# Two cards side by side with custom widths
{% row widths="75:25" %}
{% card id=789 %}
{% card id=999 %}
{% endrow %}

# Default 50:50 split
{% row %}
{% card id=111 %}
{% card id=222 %}
{% endrow %}
```

**Output:** `resizeNode` containing `flexContainer` with 2 `cardEmbed` nodes

**Note:** Rows must contain exactly 2 cards.

## ProseMirror Output Structure

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": {"level": 1},
      "content": [{"type": "text", "text": "Hello"}]
    },
    {
      "type": "resizeNode",
      "attrs": {"height": 442, "minHeight": 280},
      "content": [{
        "type": "cardEmbed",
        "attrs": {"id": 123, "name": null}
      }]
    },
    {
      "type": "resizeNode",
      "attrs": {"height": 442, "minHeight": 280},
      "content": [{
        "type": "cardEmbed",
        "attrs": {"id": "ref:my-chart", "name": null}
      }]
    },
    {
      "type": "resizeNode",
      "attrs": {"height": 442, "minHeight": 280},
      "content": [{
        "type": "flexContainer",
        "attrs": {"columnWidths": [75, 25]},
        "content": [
          {"type": "cardEmbed", "attrs": {"id": 456, "name": null}},
          {"type": "cardEmbed", "attrs": {"id": 789, "name": "Custom"}}
        ]
      }]
    }
  ]
}
```

## Test Files

Sample markdown files in `test-files/`:

- **basic.md** - Standard markdown elements
- **document-example.md** - Full example matching Document structure
- **cards-only.md** - Card embed variations
- **metabase.md** - Complete example with cards and links
- **links-only.md** - Smart link examples (future feature)

## From Clojure

### Parsing (Markdown → JSON)

```clojure
(require '[metabase-enterprise.documents.import.markdown :as md-import])

;; Parse markdown string
(md-import/parse-markdown "# Hello\n\n{% card id=123 %}")

;; Parse markdown file
(md-import/markdown-file->prosemirror-json "path/to/file.md")
```

### Serializing (JSON → Markdown)

```clojure
(require '[metabase-enterprise.documents.import.markdown :as md-import])

;; Serialize ProseMirror JSON to markdown
(md-import/prosemirror-json->markdown {:type "doc" :content [...]})

;; Serialize document file
(md-import/prosemirror-file->markdown "path/to/document.json")
```

See `enterprise/backend/src/metabase_enterprise/documents/import/markdown.clj` for implementation.
