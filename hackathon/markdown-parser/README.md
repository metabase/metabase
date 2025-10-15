# Markdown Parser for Metabase Documents

**Status:** Phase 2 Complete ✅ (Card Embeds + Row Layout)

## Quick Start

### Direct Node.js Usage

```bash
# Parse a file
node hackathon/markdown-parser/parse-markdown.mjs test-files/basic.md

# Parse from stdin
cat test-files/basic.md | node hackathon/markdown-parser/parse-markdown.mjs
echo "# Test" | node hackathon/markdown-parser/parse-markdown.mjs

# Verbose mode (diagnostics to stderr)
node hackathon/markdown-parser/parse-markdown.mjs --verbose test-files/basic.md
```

### Test from CLI (Babashka)

```bash
# Basic test
bb hackathon/markdown-parser/cli-test.clj hackathon/markdown-parser/test-files/basic.md

# Show ProseMirror JSON output
bb hackathon/markdown-parser/cli-test.clj hackathon/markdown-parser/test-files/metabase.md --json

# Test card embeds
bb hackathon/markdown-parser/cli-test.clj hackathon/markdown-parser/test-files/cards-only.md

# Test smart links
bb hackathon/markdown-parser/cli-test.clj hackathon/markdown-parser/test-files/links-only.md
```

### Test from Clojure REPL

```clojure
;; Start REPL
./bin/mage -repl

;; Load the namespace
(require '[metabase-enterprise.documents.import.markdown :as md-import])

;; Parse a string
(md-import/parse-markdown "# Hello World")

;; Parse a file
(md-import/markdown-file->prosemirror-json 
  "hackathon/markdown-parser/test-files/basic.md")

;; Pretty print result
(require '[cheshire.core :as json])
(println 
  (json/generate-string 
    (md-import/markdown-file->prosemirror-json "hackathon/markdown-parser/test-files/metabase.md")
    {:pretty true}))
```

### Test from Mage

```bash
# Parse and display
./bin/mage -repl '(require (quote [metabase-enterprise.documents.import.markdown :as md]))
                  (md/markdown-file->prosemirror-json "hackathon/markdown-parser/test-files/basic.md")'
```

## Metabase Markdown Syntax

### Card Embeds

```markdown
# Single card
{% card id=123 %}

# Card with custom title
{% card id=456 name="My Custom Title" %}

# Two cards side by side
{% row widths="75:25" %}
{% card id=789 %}
{% card id=999 %}
{% endrow %}

# Two cards with default 50:50 split
{% row %}
{% card id=111 %}
{% card id=222 %}
{% endrow %}
```

### Output Structure

**Single card** → `resizeNode` containing `cardEmbed`
**Row** → `resizeNode` containing `flexContainer` with 2 `cardEmbed` nodes

## Test Files

Created sample markdown files in `test-files/`:

- **basic.md** - Standard markdown elements (headings, lists, code, links)
- **document-example.md** - Full example matching actual Document structure
- **cards-only.md** - Focus on `{% card %}` syntax variations
- **metabase.md** - Full example with card embeds and smart links
- **links-only.md** - Focus on `metabase:model/id` links

## Directory Structure

```
hackathon/markdown-parser/
├── README.md                       # This file
├── cli-test.clj                   # Babashka CLI test utility
└── test-files/
    ├── basic.md                   # Standard markdown
    ├── metabase.md                # Full Metabase document
    ├── cards-only.md              # Card embed tests
    └── links-only.md              # Smart link tests

enterprise/backend/src/metabase_enterprise/documents/import/
└── markdown.clj                   # Main parser namespace (placeholder)
```

## ProseMirror Document Structure

Documents use this JSON structure:

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
      "type": "paragraph",
      "content": [
        {"type": "text", "text": "Regular text with "},
        {"type": "text", "text": "bold", "marks": [{"type": "strong"}]},
        {"type": "text", "text": "."}
      ]
    },
    {
      "type": "cardEmbed",
      "attrs": {"id": 123, "name": "My Chart"}
    }
  ]
}
```

## Current Status

✅ **Phase 0: Setup** - Complete
- [x] Directory structure created
- [x] Test files created
- [x] CLI test utility created
- [x] REPL integration documented

✅ **Phase 1: Basic Markdown Parsing** - Complete
- [x] Using prosemirror-markdown via Node.js
- [x] Parses all standard CommonMark elements
- [x] Headings, paragraphs, lists, code blocks, links, emphasis
- [x] Clojure wrapper with shell integration

✅ **Phase 2: Card Embed Parser** - Complete
- [x] `{% card id=X %}` syntax support
- [x] `{% card id=X name="Title" %}` with custom names
- [x] `{% row %}...{% endrow %}` for side-by-side layout
- [x] Wraps standalone cards in `resizeNode`
- [x] Wraps rows in `resizeNode` → `flexContainer`
- [x] Custom column widths: `{% row widths="75:25" %}`

⏳ **Phase 3: Smart Link Parser** - Next
- [ ] Add `[text](metabase:model/id)` link support
- [ ] Generate smartLink nodes
- [ ] Handle all entity types (card, dashboard, collection, etc.)

## Next Steps

### Phase 3: Smart Link Parser (2 hours)
- Extend link token handler to detect `metabase:` protocol
- Create smartLink mark/node in schema
- Parse model and entityId from URL
- Test with links-only.md
