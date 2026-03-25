Review your conversation transcript from this session and generate a structured improvement report. Save the report to `FIXBOT-SUGGESTIONS.md` in the current worktree root.

## What to analyze

Scroll back through the full conversation history from this session. Look at every tool call, every error, every retry, every place you got stuck or went in circles. Categorize what you find.

## Categories to evaluate

### 1. Tool issues
- Tools that failed, returned unexpected results, or required workarounds
- Tools you tried to use but couldn't (missing permissions, wrong arguments, etc.)
- Tools you used inefficiently (e.g., multiple calls where one would suffice)

### 2. Prompt gaps
- Steps that were missing from your initial prompt that you had to figure out on your own
- Instructions that were ambiguous or led you down the wrong path
- Steps that were in the wrong order or had missing prerequisites
- Situations where you had to ask the user for clarification that should have been covered in the prompt

### 3. Knowledge gaps
- Facts about the codebase, architecture, or conventions you had to discover through trial and error
- Things you assumed incorrectly about how the code works
- Database schemas, API endpoints, config options, or other reference info that would have saved time if documented upfront

### 4. Memory-worthy patterns
- Stable lessons learned that would benefit future fixbot sessions (not one-off fixes)
- Common failure modes and their solutions
- Patterns about how this codebase works that aren't obvious from reading the code

### 5. Workflow inefficiencies
- Places where you repeated work unnecessarily
- Times you went down a dead end — what signal should have told you earlier?
- Test/verify cycles that could have been shorter

## Report format

Write `FIXBOT-SUGGESTIONS.md` with this structure:

```markdown
# Fixbot Auto-Improvement Report

**Session:** <issue ID>
**Date:** <today's date>
**Outcome:** <succeeded / partially succeeded / failed>

## Summary

<2-3 sentence summary of the session and the main improvement themes>

## Suggestions

### <Category name>

#### <Short title for the suggestion>

**What happened:** <Describe the specific problem you encountered>
**Where to fix:** <Exact file path and section/line range>
**Proposed change:** <The actual text to add, remove, or modify — be specific enough that someone can apply it directly>
**Impact:** <What this would have saved — time, retries, user interruptions, etc.>

(Repeat for each suggestion, grouped by category)

## Quick wins

<Bulleted list of the 3-5 highest-impact, lowest-effort changes>
```

## Rules

- **Be specific** — include exact file paths, section names, line ranges, and actual proposed text changes. Vague suggestions like "improve error handling" are useless.
- **Be actionable** — every suggestion must propose a concrete fix that can be applied. If you can't propose a specific change, it's not ready to be a suggestion.
- **Be honest** — if you made a mistake due to your own reasoning (not a prompt gap), say so. Not everything is the prompt's fault.
- **Prioritize by impact** — order suggestions within each category by how much time/frustration they would save in future sessions.
- **Include prompt text diffs** — for prompt gap suggestions, show the exact text you'd add to the prompt file (e.g., `.fixbot/metabase-fixbot-<ID>-prompt.md` template or `.claude/fixbot/fixbot-agent.md`) as a before/after or insertion.
- **Cover the fixbot orchestrator too** — if the issue was in how the session was set up (database choice, prompt generation, environment config), suggest changes to `.claude/commands/fixbot.md` as well.
- **Don't suggest things that are already documented** — if the answer was in the prompt and you just missed it, that's a different problem than a missing instruction. Note which it was.