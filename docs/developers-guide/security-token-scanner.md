# Security Token Scanner

The security token scanner is a tool that automatically detects potentially leaked API keys, secrets, and other sensitive tokens in the Metabase codebase. It runs as a git precommit hook via `lint-staged` to prevent accidental token leaks from being committed.

## What it scans for

The scanner looks for patterns that match common token formats:

- **Airgap Tokens**: JWE tokens starting with `airgap_` (400+ characters)
- **Hash/Dev Tokens**: 64-character hex strings or `mb_dev_` prefixed tokens
- **OpenAI API Keys**: Keys starting with `sk-` (43-51 characters total)
- **JWT Tokens**: Standard JWT format with header.payload.signature
- **JWE Tokens**: Encrypted JWT tokens (400+ characters)
- **GitHub Tokens**: Personal access tokens starting with `gh[pousr]_`
- **Slack Bot Tokens**: Bot tokens starting with `xoxb-`
- **AWS Access Keys**: Access key IDs starting with `AKIA`

## Running the scanner

The scanner runs automatically via `lint-staged` on staged files during git commits. You can also run it directly from mage.

### Basic usage

```bash
# Scan specific files
./bin/mage -token-scan file1.txt file2.txt

# Scan all files in the project
./bin/mage -token-scan -a

# Run with verbose output
./bin/mage -token-scan -v file1.txt file2.txt

# Scan without showing line details
./bin/mage -token-scan --no-lines file1.txt file2.txt
```

### Example output

```
Scanning 143 files
Using thread pool size: 16
/Users/dev/metabase/src/metabase/api/auth.clj
  Line# 42 [OpenAI API Key]: const apiKey = "sk-1234567890abcdef1234567890abcdef123456789012";

Scan completed in:   89ms
Files scanned:      143
Files with matches: 1
Total matches:      1
```

## Whitelisting legitimate tokens

Sometimes you need to include token-like strings in source code for testing or examples. The scanner uses a whitelist file to avoid flagging known safe tokens.

The whitelist is located at `mage/resources/token_scanner_whitelist.txt` and contains strings that should not be flagged as secrets:

```
# Common test/example tokens that appear in documentation
sk-1234567890abcdef1234567890abcdef123456789012
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

# Hash values from tests and examples
430bb02a37bb2471176e54ca323d0940c4e0ee210c3ab04262cb6576fe4ded6d
sha256:9ff56186de4dd0b9bb2a37c977c3a4c9358647cde60a16f11f4c05bded1fe77a

# Slack bot tokens from examples
xoxb-781236542736-2364535789652-GkwFDQoHqzXDVsC6GzqYUypD
```

To whitelist a token, add the exact string to this file. Each line is treated as a substring that will be checked against the entire line containing the token using exact substring matching.

**Important**: The whitelist uses simple substring matching, not regex patterns. Add the exact token string that should be ignored.

## Adding new token patterns

To add a new token pattern, edit `mage/mage/token_scan.clj` and add an entry to the `token-patterns` map:

```clojure
(def ^:private token-patterns
  {"Existing Pattern" #"existing-regex"
   "Your New Token Type" #"13{2}7"})
```

### Pattern guidelines

- **Be specific**: Patterns should match the actual token format, not environment variable assignments
- **Include length constraints**: Use `{min,max}` quantifiers to avoid false positives
- **Add comments**: Explain the token format and expected length
- **Test thoroughly**: Run the scanner on the codebase to check for false positives
    - Run it on everything with: `mage -token-scan -a`

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


The scanner only scans files that are staged for commit, making it fast and focused on new changes.

## Troubleshooting

### False positives

If the scanner flags legitimate code:

1. **Add to whitelist** if it's a test token or example (edit `token_scanner_whitelist.txt`)
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
2. Run the scanner locally to debug: `./bin/mage -token-scan -v file1.txt file2.txt`
3. Ask in the #security or #dev channels for help with patterns or exclusions
