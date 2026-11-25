---
name: metabase-docs
description: Write, edit, review, or fact-check Metabase documentation. Use when creating, editing, or reviewing pages, files, or diffs in `docs/`, or when checking in the code whether a product fact is true.
allowed-tools: Read, Write, Edit, Grep, Bash, Glob
metadata:
  metareview:
    title: Docs review
    kind: agent
    rule: Documentation changed
    watches: ["docs/**/*.md"]
    icon: book
    color: yellow
---

# Metabase docs skill

If you haven't already, read [the style guide](../_shared/metabase-style-guide.md) before anything else. Paths are relative to this skill's directory. When the style guide and this skill disagree, this skill wins. When a page and a rule disagree, the rule wins.

Read the other files only when you need them:

- **To review a change**: [review.md](./review.md).
- **To write or check product facts**: [research.md](./research.md).
- **To add, move, or rename a page, rewrite a heading, or change links**: [pages.md](./pages.md).
- **To write a new page, or add a code example**: [the style mechanics](../_shared/metabase-style-mechanics.md).

## State only facts that someone confirmed in the code

A product fact is a setting, environment variable, default, limit, UI label, permission, plan, version, API endpoint, or behavior. The code has to back each one you write:

- **A change with new product facts**: Check the facts in this session with [the research guide](./research.md) before you draft. Write only the facts you confirm. For a contradicted fact, write what the code does.
- **If you already have a fact table**, research only the facts that aren't in it.
- **A change with no new product facts**, like a link fix or a rewrite for clarity, needs no research.

State only the facts the issue asks for, and the facts readers need to do what it describes. Never guess a limit. Most plans and versions aren't in the code, so take them only from the issue or the person who asked for the change. If the code confirms that a feature is paid, add the blockquote from [Format for the docs site](#format-for-the-docs-site).

## Write for someone who hasn't seen the code

**Open the page with what the feature is and why someone would use it.** "Segments are saved filters on tables. You can use segments to create official definitions that everyone on your team can refer to." From there, say what to do, then how. The site shows the `summary` front matter too, so the two can share the job, without a repeat.

**When a word has two meanings on a page, say which one you mean.** "Here, permissions are OAuth scopes, not Metabase permissions."

**Name who acts, and keep the same name.** An admin, a group, and the person viewing a dashboard can do different things. Write "a group," not "people," when the group holds the permission.

**Put the goal before the action.** "To select a range of cells, click and drag," not "Click and drag to select a range of cells."

**When two rules interact, give one concrete example.** "A group can have permission to write SQL, but no access to the MCP tools for SQL. Those people can run SQL in Metabase, but not through MCP."

## Build each page around the reader's task

**Cut pages and sections nobody needs.** Look for a section to merge new content into. If the content doesn't help people solve problems in or with Metabase, cut it. Pages about building Metabase go in `docs/developers-guide/`.

**Match your edits to the page's Diátaxis type**: tutorial, how-to guide, explanation, or reference.

**On troubleshooting and reference pages, use the words people look up as headings.** That's the symptom on a troubleshooting page ("No access to Metabase login page"), and the name of the setting or field on a reference page ("Host").

**Commands go in fenced blocks, in the order people run them.** Explain after the block. Run each example you add or change, or check each name in it against the code.

**Put steps in a numbered list, not in a click path inside a paragraph.** Put the result in the same step, in present tense. Mark optional steps with "Optional:" at the start.

**Make each section stand alone.** Readers land mid-page. Put a condition in the heading with its consequence: "If you're using H2, stop Metabase before importing." Then say what applies to everyone else.

**Leave out a screenshot or GIF that people can follow without.** Scope the ones you keep to the UI element you're pointing at. For query results, use a Markdown table.

**Say where the feature stops**, like a database it doesn't support. Word versions, limits, and counts so they survive a change: "these settings," not "these two settings."

**Draw or change a diagram only when the person asks for one.** Then read `.claude/skills/docs-diagram/SKILL.md`. If your change makes a diagram wrong, say so in your reply.

**Keep the jokes and clever lines you find.** Writing new ones, or cutting old ones, is a job for human writers.

## Format for the docs site

- **Callouts**: Plain blockquotes, with no labels like "Note:" or "WARNING:" and no emoji. For a risk of losing data or getting locked out, open the blockquote with a bold sentence stating the risk.
- **Paid features**: `{% include plans-blockquote.html feature="Official collections" %}` at the top of the smallest section that covers the feature, or under the H1 for the whole page. The include is in the docs site repo, and names the Pro and Enterprise plans. In a list or table, write "(Pro and Enterprise plans)" instead.
- **Add-ons**: A plain blockquote instead of the include, like `> Transform inspector requires the [Advanced transforms add-on](./addons.md).` The add-ons are in `docs/data-modeling/transforms/addons.md`, `docs/cloud/` (storage and Google Sheets), and `docs/ai/overview.md` (AI service).
- **Deprecated features**: A blockquote under the heading: what's deprecated, since which version, and what to use instead.
- **Double braces**: Wrap any `{{ }}` that readers need to see in `{% raw %}` and `{% endraw %}`, or Liquid drops the variable from the page. In a code fence, put the tags on their own lines inside the fence.
- **Code fences**: A lowercase language tag on each one: `sh` for shell, and `text` for output, logs, and custom expressions.
- **Links to other docs pages**: Relative, like `[text](./page.md)`.
- **Images**: PNGs or GIFs in an `images/` folder, with no angle brackets in the alt text. The site doesn't publish SVGs.
- **Settings**: A heading for each one, so each has an anchor. A heading that's a UI label matches the label's case.
- **Em dashes**: Typed as `---`, and never at the start of a line.
- **"We" and "our"**: Only for the team speaking, like in "we recommend."
- **Paragraphs**: Unwrapped, on one line each.

## Change only what you were asked to change

- **Fix style only in the sentences you change.** Leave the rest of the page as it is, and list the problems you see.
- **Reformat only the lines you change.** Run `bunx prettier --check` on the file before you edit. If the check passes, run `bunx prettier --write` when you're done. If the check fails, skip `--write`, or Prettier rewrites lines you didn't touch. When you edit part of a paragraph, leave the line breaks in the rest of it as they are.
- **Match the file** on anything the rules don't cover, like list markers or table layout.
- **Change a generated page at its source.** A generated page usually says so near the top, or `.github/CODEOWNERS` marks it. [pages.md](./pages.md#change-generated-pages-at-their-source) has the list.

## Finish with a reread and a list for the writer

Do the reread that the style guide asks for. Check that each paragraph makes sense without the code or the issue, and that no two sentences seem to disagree.

End your reply with the items that apply, and leave out the rest:

- **Evidence**: Each product fact you added or changed, with its full link from the fact table, or its path and lines. Put the evidence in the PR body too, in the form that the caller asks for, so reviewers don't research the fact again.
- **Plans and versions**: Each one, with where you got it, so a person can confirm it.
- **Open facts**: Facts the code contradicted or didn't confirm, and limits the material doesn't give.
- **Left out**: Confirmed facts that you didn't put on the page.
- **Likely bugs**: Problems in the product. Keep them off the page.
- **Not run**: Checks and code examples you couldn't run.
- **Not fixed**: Problems elsewhere on the page, and a new page you kept out of the nav, with the reason.
