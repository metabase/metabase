# Security Token Scanner

The security token scanner is a tool that automatically detects potentially leaked API keys, secrets, and other sensitive tokens in the Metabase codebase. It runs as a git precommit hook to prevent accidental token leaks from being committed.

## What it scans for

The scanner looks for patterns that match common token formats:

- **Airgap Tokens**: JWE tokens starting with `airgap_`
- **Hash/Dev Tokens**: 64-character hex strings or `mb_dev_` prefixed tokens
- **OpenAI API Keys**: Keys starting with `sk-` (48 characters total)
- **JWT Tokens**: Standard JWT format with header.payload.signature
- **JWE Tokens**: Encrypted JWT tokens (400+ characters)
- **GitHub Tokens**: Personal access tokens starting with `gh[pousr]_`
- **Slack Bot Tokens**: Bot tokens starting with `xoxb-`
- **AWS Access Keys**: Access key IDs starting with `AKIA`

## Running the scanner

### Basic usage

```bash
# Scan files changed in current branch vs master
./bin/mage token-scan

# Scan files changed vs specific branch
./bin/mage token-scan develop

# Scan all files in the project
./bin/mage token-scan -a

# Show just file paths without line details
./bin/mage token-scan -n
```

### Example output

```
Scanning 143 files with 8 patterns using 16 threads...
/Users/dev/metabase/src/metabase/api/auth.clj
  Line# 42 [OpenAI API Key]: const apiKey = "sk-1234567890abcdef1234567890abcdef123456789012";

Scan completed in 89ms
Files scanned:      143
Files with matches: 1
Total matches:      1
```

## Ignoring legitimate tokens

Sometimes you need to include tokens in source code for testing or examples. Use the `metabase-scanner-ignore` comment on the same line:

```clojure
;; Good: token is ignored
(def test-token "sk-1234567890abcdef1234567890abcdef123456789012") ; metabase-scanner-ignore

;; Bad: token will be flagged
(def test-token "sk-1234567890abcdef1234567890abcdef123456789012")
```

```javascript
// Good: token is ignored
const testKey = "eyJhbGciOiJIUzI1NiI..."; // metabase-scanner-ignore

// Bad: token will be flagged
const testKey = "eyJhbGciOiJIUzI1NiI...";
```

### Unused ignore comments

The scanner will error if you have `metabase-scanner-ignore` comments that don't suppress any matches:

```
/Users/dev/metabase/src/example.clj
  Line# 15: Unused metabase-scanner-ignore comment

Unused ignores: 1
```

This prevents ignore comments from accumulating over time. Remove unused ignore comments to fix this error.

## Adding new token patterns

To add a new token pattern, edit `mage/mage/token_scan.clj` and add an entry to the `token-patterns` map:

```clojure
(def ^:private token-patterns
  {"Existing Pattern" #"existing-regex"
   "New Token Type" #"new-token-pattern-regex"})
```

### Pattern guidelines

- **Be specific**: Patterns should match the actual token format, not environment variable assignments
- **Include length constraints**: Use `{min,max}` quantifiers to avoid false positives
- **Add comments**: Explain the token format and expected length
- **Test thoroughly**: Run the scanner on the codebase to check for false positives

Example of a good pattern:
```clojure
"Stripe API Key" #"sk_live_[A-Za-z0-9]{24}" ;; Stripe live keys: sk_live_ + 24 chars
```

## Modifying file filtering

The scanner excludes certain files to avoid false positives from generated content. To modify the filtering, edit the `exclude-path-str?` function in `mage/mage/token_scan.clj`:

```clojure
(defn- exclude-path-str?
  "Check if a file should be excluded from scanning"
  [path-str]
  (or
   ;; Existing exclusions
   (str/includes? path-str "/.git/")
   (str/includes? path-str "/node_modules/")
   
   ;; Add new exclusions
   (str/includes? path-str "/my-generated-dir/")
   (str/ends-with? path-str ".generated.js")))
```

### Common exclusions

The scanner currently excludes:
- **Build directories**: `target/`, `node_modules/`, `.git/`
- **Generated files**: `*.bundle.js`, `*.min.js`, `*.map`
- **Binary files**: `*.jar`, `*.class`, `*.so`, `*.dll`
- **Media files**: `*.png`, `*.jpg`, `*.svg`
- **Test data**: `/stories-data/`, `/test-data/`, `/fixtures/`
- **Checksum files**: `SHA256.sum`, `*.sha256`, `*.md5`

## Git Hook Integration

The scanner runs automatically as a git precommit hook. If it finds tokens or unused ignore comments, the commit will be blocked with:

- **Token detected**: Review the file to ensure it's not a real secret
- **Unused ignore**: Remove the unnecessary `metabase-scanner-ignore` comment

The scanner only scans files that are staged for commit, making it fast and focused on new changes.

## Troubleshooting

### False positives

If the scanner flags legitimate code:

1. **Add an ignore comment** if it's a test token or example
2. **Refine the pattern** if it's too broad (edit `token-patterns`)
3. **Exclude the file type** if it's generated content (edit `exclude-path-str?`)

### Performance issues

The scanner uses parallel processing and should complete in under 5 seconds for most commits. If it's slow:

1. Check if too many files are being scanned (`-v` flag shows file list)
2. Consider excluding large generated directories
3. Patterns with broad wildcards (like `.*`) can be slow

### Bypassing the hook

If you need to bypass the scanner for a specific commit (not recommended):

```bash
git commit --no-verify -m "commit message"
```

Use this sparingly and only when absolutely necessary.

### Getting help

For issues with the scanner:

1. Check the git hook output for detailed error messages
2. Run the scanner locally to debug: `./bin/mage token-scan -v`
3. Ask in the #security or #dev channels for help with patterns or exclusions