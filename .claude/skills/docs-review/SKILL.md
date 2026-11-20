---
name: docs-review
description: Review documentation changes for compliance with the Metabase writing style guide. Use when reviewing pull requests, files, or diffs that touch `docs/`.
allowed-tools: Read, Grep, Bash, Glob
metadata:
  metareview:
    title: Docs review
    kind: agent
    rule: Documentation changed
    watches: ["docs/**/*.md"]
    icon: book
    color: yellow
---

# Documentation review skill

## Read the guide, then read the change for intent

If you haven't already, read [the style guide](../_shared/metabase-style-guide.md) (relative to this skill's directory) before anything else. Then read the diff once for intent before you flag anything. When you review a file instead of a diff, every line is in scope.

## Check the facts nobody confirmed

Check only the product facts in scope: a setting, a default, a limit, a UI label, a permission, or a plan.

- **A fact with a link to code**: If the PR body or the author links the fact to code, open the link and check that the lines say what the page says. Don't search further.
- **A fact with no link**: Run `docs-research` on those facts only. Pass the facts themselves, since `docs-research` can't see this conversation.
- **If you can't run `docs-research`**: List each unlinked fact in one line at the end of the review, marked "Not checked."

## Rank issues by tier

Existential questions come first, then broken things, then clarity, then style. One issue outranks any number of issues in a lower tier.

**Tier 0: Existential.** Ask whether the page, section, or sentence needs to exist at all. Be ruthless with cutting. A page or section nobody reads costs maintenance and clutters the content people actually need. If the content really helps people solve problems in or with Metabase, look for a relevant section to merge it into, or trim it. If you don't think readers care about it, wince and cut it completely.

**Tier 1: Broken.** A fact that the code contradicts is broken. In a diff, also check for:

- A moved or renamed page with no `redirect_from` entry for its old path, like `/docs/latest/old-section/old-page`, or one that drops the old page's own `redirect_from` entries.
- A link that still points at a moved page's old path, in `docs/`, in a frontend `useDocsUrl` call, or in backend code. Search for the old page name:

  ```sh
  grep -rn "old-page" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src
  ```

- A changed heading whose old anchor is still linked. Search for the anchor, without the `#`:

  ```sh
  grep -rn "cache-configuration" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src
  ```

- A new page with no `title` or `summary` front matter.

**Tier 2: Clarity.** The rules under the guide's "Put the reader's task first" heading, like:

- Action buried under explanation
- A heading naming a topic instead of a point
- Commands out of the order people run them
- A paragraph doing two jobs or none
- A concept in bullets that belongs in prose
- A pronoun that could point at two things
- A full-page screenshot where a scoped one would do

**Tier 3: Style.** The rules under these guide headings:

- Sound friendly, not peppy
- Prefer everyday words to database terms
- Use Metabase's names for things
- Point at the UI the same way every time
- Format for the docs site
- Make code examples pasteable

## Post only issues, numbered by tier

If a page is clean, say so in one line and post nothing else.

Cut anything that won't materially help the reader, then number remaining issues from 1, organized by tier.

```markdown
## Issues

**Issue 1 (Broken)**: Line 5
The page says public sharing is off by default. The `enable-public-sharing` setting defaults to `true`.

**Issue 2 (Clarity)**: Line 8
"Cache configuration" names the topic. State the point: "Turn on caching for slow questions."

**Issue 3 (Clarity)**: Lines 12–14
The command comes after two sentences of explanation. Lead with the command, then explain.

**Issue 4 (Style)**: Lines 15–22
"cannot" → "can't," "users" → "people."

**Not checked**: Line 30
The page says caching is on by default.
```
