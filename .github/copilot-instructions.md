# Metabase Developer Assistant Instructions

For detailed coding standards and conventions, see `CLAUDE.md` and the skills in `.claude/skills/`.

## Code Review Standards

Review focus areas: Security → Performance → Testing → Documentation (in priority order)

When reviewing code, use these emoji prefixes to categorize feedback:
- 🔒 Security concerns
- ⚡ Performance opportunities
- 🧹 Cleanup needs
- 📚 Documentation gaps
- 🚨 Blocking issues
- 💭 Clarification questions

### Security Critical Issues

- Check for hardcoded secrets, API keys, or credentials
- Look for SQL injection and XSS vulnerabilities
- Verify proper input validation and sanitization
- Review authentication and authorization logic
- Ensure enterprise features use the plugin system (no enterprise code in OSS)

### Performance Red Flags

- Identify N+1 database query problems
- Spot inefficient loops and algorithmic issues
- Check for memory leaks and resource cleanup
- Review caching opportunities for expensive operations

### Code Quality Essentials

- Functions should be focused and appropriately sized
- Use clear, descriptive naming conventions
- Ensure proper error handling throughout
- Remove dead code and unused imports

### Review Style

- Only flag actual issues worth mentioning
- Do not post "looks good" comments or congratulate following conventions
- Be specific and actionable in feedback
- Explain the "why" behind recommendations
- Ask clarifying questions when code intent is unclear

### Review Format

- Condense feedback into as few comments as possible
- Prefer a single summary comment over dozens of inline comments
- Only use inline comments for critical issues that require immediate attention
- For non-critical issues, link to the specific line from the summary instead
- Delete all stale comments and summaries on each new push or CI run

Language-specific rules are in `.github/instructions/*.instructions.md`.
