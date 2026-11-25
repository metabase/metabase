# Review a docs change

Read [the skill](./SKILL.md), the style guide, and [the style mechanics](../_shared/metabase-style-mechanics.md) first. Apply their rules, and skip the steps for writers, like running Prettier. Report what you find, and leave the page as it is.

If you wrote the change in this session, give the review to a new subagent. Pass the path of this file, the diff, and the path of a file with the evidence. Leave out your reasons for the change. If you can't start a subagent, say so in your reply, and review the change here.

## Read the change before you read the code

Read the changed sections once before you open any evidence or code. Note what you can't follow, and statements that seem to disagree. You can't see those problems once you know the code.

In a diff, flag only the changed lines, and anything those changes break elsewhere. In a file, every line is in scope. Skip [generated pages](./pages.md#change-generated-pages-at-their-source).

## Check the facts nobody confirmed

- **A fact with a link to code, or a path and lines**: Check that those lines, in this checkout, say what the page says. If the code isn't here, use `git show COMMIT:PATH`. Don't search further.
- **A fact with a row in a fact table**: Use the status in the row.
- **Any other fact**: Check it with [the research guide](./research.md), and keep the table out of the review. Check five at most, starting with the ones that would hurt readers most if they were wrong. End the review with one "Not checked" line for the rest.

Then act on the status:

- **Contradicted**: A Broken issue. So is a page that two confirmed facts together contradict.
- **Not found**: A question for the author.
- **Not in code**: A question, unless the PR body, a linked issue, or the author gives the source. Put all the plan claims in one question.

## Rank issues by tier

One issue outranks any number of issues in a lower tier. Drop any issue that won't materially help the reader.

1. **Existential**: The page, section, or sentence doesn't need to exist. Recommend a merge, a trim, or a cut. When you recommend a cut, say where readers still get the definition and the reason to care.
2. **Broken**: Any of these:
   - A fact that the code contradicts.
   - A code example that errors, or that's missing something it needs to run.
   - A paid feature that the page doesn't mark as paid, or an add-on marked as a Pro and Enterprise feature.
   - `{{ }}` that readers need to see, outside `{% raw %}`.
   - A moved page with no `redirect_from` for its old path, or one that drops the old page's own entries.
   - A link to an old path or anchor that the code builds from variables. CI checks the other links. [pages.md](./pages.md) has the searches.
   - A new page with no `title` or `summary`. If it's not in the nav, ask.
3. **Clarity**: What you couldn't follow, statements that seem to disagree, a missing definition or reason, and breaks of the rules for readers, headings, and page structure.
4. **Style**: Breaks of any other rule. Put all the style breaks in a file in one issue.

## Report only issues and questions

Return the review as your reply. Don't run `gh pr comment` or `gh pr review` unless someone asks you to. If every page is clean, say so in one line. Otherwise, number the issues from 1, by tier, and put questions after them. Give the file and the line numbers from the new version of the file.

```markdown
**Issue 1 (Broken)**: `docs/embedding/public-links.md`, line 5
The page says public sharing is off by default. The `enable-public-sharing` setting defaults to `true`.

**Issue 2 (Style)**: `docs/configuring-metabase/caching.md`, lines 15–22
"cannot" → "can't," "users" → "people."

**Question 1**: `docs/databases/sync-scan.md`, line 26
The code doesn't show a retry. Where does "three times" come from?

**Not checked**: 9 facts with no link. Check first: caching is on by default (`docs/configuring-metabase/caching.md`, line 30).
```
