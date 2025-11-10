---
name: docs-review
description: Review documentation changes for compliance with the Metabase writing style guide. Use when reviewing pull requests, files, or diffs containing documentation markdown files.
allowed-tools: Read, Grep, Bash, Glob
---

# Documentation Review Skill

@./../\_shared/metabase-style-guide.md

## Review Process

1. Read the changes through once to understand intent
2. Check all issues that violate style guide or significantly impact readability
3. Only flag issues worth mentioning - if it won't make a material difference to the reader, skip it
4. **REQUIRED: Number ALL feedback sequentially** - Start from Issue 1 and increment for each issue found

## Review Checklist

Run through the diff looking for these issues:

**Tone and Voice:**

- [ ] Formal/corporate language ("utilize" not "use", "offerings", etc.)
- [ ] "We can X" instead of "Metabase can X" (privacy implication)
- [ ] "Users" instead of "people" or "companies"
- [ ] Excessive exclamation points or overly peppy tone
- [ ] Telling readers something is cool instead of showing them

**Structure and Clarity:**

- [ ] Important information buried instead of leading
- [ ] Verbose text that adds little value
- [ ] Paragraphs without clear purpose
- [ ] Vague headings that don't convey the point
- [ ] Instructions explain "why" before telling "what to do"
- [ ] Headings longer than 7 words
- [ ] Tasks described as "easy" or "simple"

**Links and References:**

- [ ] Linking the word "here" instead of descriptive text
- [ ] Links in headings (unless entire heading is a link)

**Formatting:**

- [ ] Backticks on UI elements (should use **bold**)
- [ ] Backticks used as quotation marks
- [ ] Ampersands as "and" substitute (except proper nouns)
- [ ] Inconsistent list formatting

**Code and Examples:**

- [ ] Code examples that don't work or would error
- [ ] Commands not in execution order
- [ ] Full-width screenshots instead of scoped UI elements
- [ ] Excessive or unnecessary images

**Sentence Construction:**

- [ ] Overuse of pronouns when introducing new terms

## Quick Scan Table

| Pattern                       | Issue                                         |
| ----------------------------- | --------------------------------------------- |
| `Button name` or `UI element` | Should use **bold** not backticks             |
| we can do X, our feature      | Should be "Metabase" or "it"                  |
| click here, read more here    | Need descriptive link text                    |
| easy, simple, just            | Remove condescending qualifiers               |
| users                         | Should be "people" or "companies" if possible |

## Feedback Format

**MANDATORY REQUIREMENT: Every single issue MUST be numbered sequentially starting from Issue 1.**

This numbered format is NON-NEGOTIABLE. It allows users to efficiently reference specific issues (e.g., "fix issues 1, 3, and 5") and track which feedback has been addressed.

**Required Format:**

```markdown
## Issues

**Issue 1: [Brief title]**
Line X: Succinct description of the issue
[code or example]
Suggested fix or succinct explanation

**Issue 2: [Brief title]**
Line Y: Description of the issue
Suggested fix or explanation

**Issue 3: [Brief title]**
...
```

**NEVER use unnumbered feedback.** Every issue must follow the "Issue N:" format where N starts at 1 and increments by 1 for each subsequent issue.

**Examples:**

> **Issue 1: Backticks on UI elements**
> Line 42: This uses backticks for the UI element. Use **bold** instead: **Filter** not `Filter`.

> **Issue 2: Formal tone**
> Line 15: This could be more conversational. Consider: "You can't..." instead of "You cannot..."

> **Issue 3: Vague heading**
> Line 8: The heading could be more specific. Try stating the point directly: "Run migrations before upgrading" vs "Upgrade process"

## Final Check

1. Remove any issues from your assessment that won't make a material difference to the reader if addressed. Only flag issues worth the author's time to fix.
2. **Verify all issues are numbered sequentially** starting from Issue 1 with no gaps in numbering.
3. Confirm the format exactly matches: `**Issue N: [Brief title]**` where N is the issue number.
