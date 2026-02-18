# Metabase Developer Assistant Instructions

For detailed coding standards and conventions, see `CLAUDE.md` and the skills in `.claude/skills/`.

## Code Review Standards

When reviewing code, focus on:

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

Always prioritize security vulnerabilities and performance issues that could impact users.

Language-specific rules are in `.github/instructions/*.instructions.md`.
