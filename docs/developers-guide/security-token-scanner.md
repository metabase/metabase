# Security Token Scanner

Security token scanner detects potentially leaked API keys and secrets in the Metabase codebase. Runs automatically as a git precommit hook on staged files.

## Usage

```bash
# Scan specific files
./bin/mage -token-scan deps.edn bb.edn

# Scan all files
./bin/mage -token-scan -a

# Verbose output
./bin/mage -token-scan -v deps.edn
```

## Token Types Detected

- Airgap tokens (`airgap_`)
- Dev tokens (`mb_dev_`, 64-char hex)
- OpenAI API keys (`sk-`)
- JWT/JWE tokens
- GitHub tokens (`gh[pousr]_`)
- Slack bot tokens (`xoxb-`)
- AWS access keys (`AKIA`)

The scanner uses `.gitignore` to filter files and will block commits containing detected tokens.

## False positives

If the scanner flags a non-token string, you should **exclude the literal token string** by adding it to: `mage/resources/token_scanner/token_whitelist.txt`.

```
echo 'my-token-string' >> mage/resources/token_scanner/token_whitelist.txt && git add mage/resources/token_scanner/token_whitelist.txt
```

## Bypassing (not recommended)

```bash
git commit --no-verify -m "commit message"
```
