---
name: docs-review
description: Review documentation changes for accuracy, clarity, and compliance with the Metabase writing style guide. Use when reviewing or fact-checking pull requests, files, or diffs that touch `docs/`.
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

## Read the rules, then read the change for intent

If you haven't already, read [the style guide](../_shared/metabase-style-guide.md) and [the `docs-write` skill](../docs-write/SKILL.md) (relative to this skill's directory) before anything else. `docs-write` has the rules that only the docs need. Apply those rules, and skip its steps for writers, like running Prettier. Then read the diff once for intent before you flag anything. In a diff, flag only the changed lines, and anything those changes break elsewhere. When you review a file instead of a diff, every line is in scope. Skip the generated pages that `docs-write` lists.

If you wrote the change in this session, give the review to a new subagent, since it's hard to see the problems in a page you just wrote. Pass the path of this skill, the diff, and the evidence for each fact. Leave out your reasons for the change. If you can't start a subagent, review the change here, and say so in your reply.

## Check the facts nobody confirmed

Check only the product facts in scope. `docs-write` lists the kinds under "State only facts that someone confirmed in the code."

- **A fact with a link to code**: If the PR body, the author, or a fact table in this conversation links the fact to code, or gives the path and lines, read the same lines in this checkout, and check that they say what the page says. The code can change after the linked commit. If the code isn't in this checkout, read it with `git show COMMIT:PATH`. Don't search further.
- **A fact with no link**: Check it with [the research guide](../docs-write/research.md), and keep the table out of the review. Skip any fact that already has a row in a fact table in this conversation, and use the status in that row.
- **More than five facts with no link**: Split them between read-only subagents, and give each one the path of the research guide. If you can't start subagents, check five at most, starting with the ones that would hurt readers most if they were wrong. If any facts are left, end the review with one "Not checked" line. Give the number of facts left, and name the five at most to check first.

Then act on the status of each fact:

- **Confirmed**: Nothing to report, unless two confirmed facts together contradict the page. If SSO embeds need a token feature, and the page says SSO embeds work on every plan, that's a Tier 1 issue.
- **Contradicted**: A Tier 1 issue.
- **Not found**: A question for the author, not an issue.
- **Not in code**: Nothing to report if the PR body, a linked issue, or the author says where the plan or version comes from. Otherwise, a question for the author. Put all the plan claims in one question.

## Rank issues by tier

Existential questions come first, then broken things, then clarity, then style. One issue outranks any number of issues in a lower tier.

**Tier 0: Existential.** The rules under the style guide's "Cut more than you think you should" heading, and the "Cut pages and sections nobody needs" heading in `docs-write`. Ask whether the page, section, or sentence needs to exist at all. Be ruthless. If the content really helps people solve problems in or with Metabase, recommend a section to merge it into, or a trim. If you don't think readers care about it, wince and recommend that the author cut it completely.

**Tier 1: Broken.** A fact that the code contradicts is broken. So is:

- A code example that errors, or that's missing something it needs to run.
- A paid feature that the page doesn't mark as paid, or an add-on marked as a Pro and Enterprise feature. A plan blockquote that's only in the wrong place is Style.
- Text with `{{ }}` that readers need to see, but that's not wrapped in `{% raw %}` and `{% endraw %}`. Liquid drops the variable from the page.

In a diff, also check for:

- A moved or renamed page with no `redirect_from` entry for its old path, or one that drops the old page's own `redirect_from` entries.
- A link that still points at a moved page's old path, in `docs/`, in a frontend `useDocsUrl` call, or in backend code. Search for the old page name:

  ```sh
  grep -rn "old-page" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src modules resources
  ```

- A changed heading whose old anchor is still linked. Search for the anchor, without the `#`:

  ```sh
  grep -rn "cache-configuration" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src modules resources
  ```

- A new page with no `title` or `summary` front matter.
- A new page that's not in `docs/util/data/nav.yml`. Some pages stay out of the nav on purpose, so ask.

**Tier 2: Clarity.** The rules under the style guide's "Write for four kinds of readers" and "Put the reader's task first" headings, and the "Match your edits to the page's Diátaxis type" and "Build each page around the reader's task" headings in `docs-write`, like:

- Action buried under explanation
- A heading naming a topic instead of a point, except on a reference page
- Commands out of the order people run them
- A paragraph doing two jobs or none
- A concept in bullets that belongs in prose
- A pronoun that could point at two things
- A full-page screenshot where a scoped one would do

**Tier 3: Style.** The rules under these headings, except the ones that Tier 1 covers:

- Sound friendly, not peppy
- Prefer everyday words to database terms
- Use Metabase's names for things
- Point at the UI the same way every time
- Punctuate and format the same way every time
- Make code examples pasteable
- Format for the docs site (in `docs-write`)

## Report only issues and questions, numbered by tier

Return the review as your reply. Don't run `gh pr comment` or `gh pr review` unless someone asks you to.

If every page is clean, say so in one line and report nothing else. Otherwise, leave out the clean pages.

Drop any issue that won't materially help the reader, then number the rest from 1, organized by tier. Questions come after the issues, and the "Not checked" line comes last. Give the file and the line numbers from the new version of the file.

```markdown
## Issues

**Issue 1 (Existential)**: `docs/dashboards/introduction.md`, lines 40–52
"How caching works" repeats `docs/configuring-metabase/caching.md`. Recommend a cut, with a link to that page.

**Issue 2 (Broken)**: `docs/embedding/public-links.md`, line 5
The page says public sharing is off by default. The `enable-public-sharing` setting defaults to `true`.

**Issue 3 (Clarity)**: `docs/configuring-metabase/caching.md`, line 8
"Cache configuration" names the topic. State the point: "Turn on caching for slow questions."

**Issue 4 (Clarity)**: `docs/configuring-metabase/caching.md`, lines 12–14
The command comes after two sentences of explanation. Lead with the command, then explain.

**Issue 5 (Style)**: `docs/configuring-metabase/caching.md`, lines 15–22
"cannot" → "can't," "users" → "people."

## Questions

**Question 1**: `docs/databases/sync-scan.md`, line 26
The page says sync retries three times. The code doesn't show a retry. Where does the number come from?

**Not checked**: 9 facts with no link. Check first: caching is on by default (`docs/configuring-metabase/caching.md`, line 30).
```
