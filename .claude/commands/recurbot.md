Review this conversation and generate a structured improvement report. Save it to `.bot/SUGGESTIONS-<TIMESTAMP>.md` (where `<TIMESTAMP>` is `YYYYMMDD-HHMMSS` — construct it from the current date/time you already know).

## What to analyze

Read back through the full conversation history from this session. Look at every tool call, every error, every retry, every place you or the user got stuck or went in circles. Categorize what you find.

## Categories to evaluate

### 1. Tool issues
- Tools that failed, returned unexpected results, or required workarounds
- Tools you tried to use but couldn't (missing permissions, wrong arguments, etc.)
- Tools you used inefficiently (e.g., multiple calls where one would suffice)

### 2. Prompt gaps
- Steps that were missing from the initial prompt that had to be figured out on the fly
- Instructions that were ambiguous or led down the wrong path
- Steps that were in the wrong order or had missing prerequisites
- Situations where clarification was needed that should have been covered in the prompt

### 3. Knowledge gaps
- Facts about the codebase, architecture, or conventions discovered through trial and error
- Incorrect assumptions about how the code works
- Database schemas, API endpoints, config options, or other reference info that would have saved time if documented upfront

### 4. Memory-worthy patterns
- Stable lessons learned that would benefit future sessions (not one-off fixes)
- Common failure modes and their solutions
- Patterns about how this codebase works that aren't obvious from reading the code

### 5. Workflow inefficiencies
- Places where work was repeated unnecessarily
- Dead ends — what signal should have indicated earlier to change approach?
- Test/verify cycles that could have been shorter

## Report format

Write `.bot/SUGGESTIONS-<TIMESTAMP>.md` with this structure:

```markdown
# Session Improvement Report

**Session:** <brief description of what was being done>
**Date:** <today's date>
**Outcome:** <succeeded / partially succeeded / failed>
**Transcript:** <absolute path to this conversation's transcript JSONL file — find it with `ls -lt ~/.claude/projects/-Users-nvoxland-src-metabase-metabase-4/*.jsonl | head -1`>

## Summary

<2-3 sentence summary of the session and the main improvement themes>

## Suggestions

### <Category name>

#### <Short title for the suggestion>

**What happened:** <Describe the specific problem encountered>
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
- **Be honest** — if the mistake was due to reasoning (not a prompt gap), say so. Not everything is the prompt's fault.
- **Prioritize by impact** — order suggestions within each category by how much time/frustration they would save in future sessions.
- **Include prompt text diffs** — for prompt gap suggestions, show the exact text you'd add to the relevant prompt or agent file as a before/after or insertion.
- **Cover the orchestrator too** — if the issue was in how the session was set up (database choice, prompt generation, environment config), suggest changes to the relevant `.claude/commands/*.md` file as well.
- **Don't suggest things that are already documented** — if the answer was in the prompt and was just missed, that's a different problem than a missing instruction. Note which it was.
- **Print the absolute path** — after writing the file, print the full absolute path to the suggestions file so the user can easily find it.
