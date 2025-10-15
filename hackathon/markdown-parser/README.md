# Markdown Parser for Metabase Documents

Phase 0 - Development Setup Complete ✓

## Quick Start

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

## Test Files

Created sample markdown files in `test-files/`:

- **basic.md** - Standard markdown elements (headings, lists, code, links)
- **metabase.md** - Full example with card embeds and smart links
- **cards-only.md** - Focus on `{% card %}` syntax variations
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

## Next Steps

### Phase 1: Basic Markdown Parsing (Next)
- Implement actual markdown-it parsing
- Handle standard CommonMark elements
- Test round-trip conversion

### Phase 2: Card Embed Parser
- Add `{% card id=X %}` syntax support
- Generate cardEmbed nodes
- Extract id and name attributes

### Phase 3: Smart Link Parser
- Add `metabase:model/id` link support
- Generate smartLink nodes
- Handle all entity types

## Current Status

✓ Phase 0 Complete
- [x] Directory structure created
- [x] Test files created
- [x] Placeholder parser namespace created
- [x] CLI test utility created
- [x] REPL test examples documented

⏳ Phase 1 Next (Basic Markdown Parsing)
