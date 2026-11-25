---
name: docs-write
description: Write documentation following Metabase's conversational, clear, and reader-focused style. Use when creating or editing pages or diagrams in `docs/`, or when checking in the code whether a product fact is true.
allowed-tools: Read, Write, Edit, Grep, Bash, Glob
---

# Documentation writing skill

If you haven't already, read [the style guide](../_shared/metabase-style-guide.md) (relative to this skill's directory) before anything else. This skill adds the rules that only the docs need. When the style guide and this skill disagree, this skill wins.

Existing docs break the rules in places. When a page and a rule disagree, the rule wins.

## State only facts that someone confirmed in the code

Before you write a product fact, make sure the code backs it. A product fact is a setting, an environment variable, a default, a limit, a UI label, a permission, a plan, a version, an API endpoint, or a behavior:

- **A change with new product facts**: Read [the research guide](./research.md), and check the facts in this session before you draft. Write only the facts you confirm. For a contradicted fact, write what the code does.
- **If you already have a fact table**, research only the facts that aren't in it.
- **A change with no new product facts**, like a link fix or a rewrite for clarity, needs no research.

State only the facts the issue asks for, and the facts readers need to do what it describes. Leave out facts the code didn't confirm. If the material doesn't say where the feature stops, leave the limit out instead of guessing.

Plans and versions are the exception, since most aren't in the code:

- **If the code confirms that a feature is paid**, add the blockquote for a plan or an add-on from [Format for the docs site](#format-for-the-docs-site).
- **In the text, take a plan or version only from the issue or the person who asked for the change.** Don't work it out yourself.

[Tell the writer](#list-what-a-writer-needs-to-check) what you confirmed and what you didn't.

## Write for someone who hasn't seen the code

**Open the page with what the feature is and why someone would use it.** "Segments are saved filters on tables. You can use segments to create official definitions that everyone on your team can refer to." From there, say what to do, then how. The site shows the `summary` front matter too, so don't repeat the summary. Between the summary and the opening, readers need to get both.

**When a word has two meanings on a page, say which one you mean.** "Here, permissions are OAuth scopes, not Metabase permissions."

**Name who acts, and keep the same name.** An admin, a group, and the person viewing a dashboard can do different things. Write "a group," not "people," when the group holds the permission.

**Put the goal before the action.** "To select a range of cells, click and drag," not "Click and drag to select a range of cells."

**When two rules interact, give one concrete example.** "A group can have permission to write SQL, but no access to the MCP tools for SQL. People in that group can run SQL in Metabase, but not through MCP."

## Cut pages and sections nobody needs

A page or section nobody reads costs maintenance and clutters the content people need. Before you add one, look for a section to merge the content into. If the content doesn't help people solve problems in or with Metabase, cut it.

Pages about building Metabase go in `docs/developers-guide/`.

## Match your edits to the page's Diátaxis type

When you edit a page, identify its Diátaxis type (tutorial, how-to guide, explanation, or reference), and tailor your edits to that type.

## Build each page around the reader's task

**On troubleshooting and reference pages, use the words people look up as headings.** On a troubleshooting page, make the heading the reader's symptom, in the words they'd type into search: "No access to Metabase login page." The heading can end in a question mark. On a reference page, make the heading the name people look up, like a setting or a connection field: "Host."

**Commands go in fenced blocks, in the order people run them.** The explanation comes after the block, not wrapped around it.

**Put steps in a numbered list, not in a click path inside a paragraph.** Put the result in the same step, in present tense. Mark optional steps with "Optional:" at the start.

**Make each section stand alone.** Readers often arrive from search and land mid-page. Put a condition in the heading with its consequence: "If you're using H2, stop Metabase before importing," not a list of conditions above a consequence. Then say what applies to everyone else, so people who aren't using H2 know they can skip the step.

**Cut a "Next steps" list that doesn't link somewhere real.**

**Leave out a screenshot or GIF that people can follow without**, or remove the one that's there. Screenshots and GIFs go stale faster than the prose around them. Scope the ones you keep to the UI element you're pointing at. For query results, use a Markdown table.

**Save diagrams for flows with three or more parts.** Draw a diagram when readers have to keep three or more parts in mind at once: who talks to what, in which order, and what's blocked. Numbered steps, a list, or a single screen don't need one. A diagram backs up the text, so the text must make sense without the diagram.

**Write versions, limits, and quotas so they survive a change.** Point at where the value lives, or word the sentence so it stays true. Leave out counts that can change: "these settings," not "these two settings."

**Say where the feature stops.** Give the limits people will run into, like a database or a plan that the feature doesn't support.

## Format for the docs site

**Use backticks for code formatting, and underscores for italics.**

**Write term lists as** `- **Term**: Description.`

**Save "we" and "our" for the team speaking**, like in "we recommend," or in `docs/CONTRIBUTING.md`.

**Callouts are plain blockquotes**, with no labels like "Note:" or "WARNING:" and no emoji. For a risk of losing data or getting locked out, open the blockquote with a bold sentence stating the risk.

**Emoji**: ✅ and ❌ are fine in comparison tables.

**Paid features carry a plan blockquote**, at the top of the smallest section that covers the feature, or under the H1 if the whole page covers a paid feature:

```html
{% include plans-blockquote.html feature="Official collections" %}
```

The include lives in the docs site repo, not in this one. By default, it names the Pro and Enterprise plans, so don't use it for an add-on.

A paid item in a list or table gets a short parenthetical instead: "(Pro and Enterprise plans)."

**Add-ons get a plain blockquote** that links to the add-on's page:

```markdown
> Transform inspector requires the [Advanced transforms add-on](./addons.md).
```

To check whether a feature is an add-on, look in `docs/data-modeling/transforms/addons.md` (transforms), `docs/cloud/` (Metabase Cloud Storage and Google Sheets), and `docs/ai/overview.md` (Metabase's AI service).

**Deprecated features get a blockquote**, not "(DEPRECATED)" in the heading. Put it under the heading, and say what's deprecated, since which version, and what to use instead.

**Links to other docs pages are relative**: `[text](./page.md)`, not `https://www.metabase.com/docs/latest/...`.

**Leave angle brackets out of alt text**, since Markdown parsers can drop them as HTML. For a flow diagram, start with "A flow diagram of," and tell the whole flow in sentences, in order, including what's blocked. `docs/data-apps/build.md` has an example.

**Keep images in an `images/` folder**, as PNGs or GIFs. The docs site doesn't publish SVGs.

**Document settings with a heading per setting**, so each has an anchor to link to. A heading that's a UI label matches the label's case.

**Type em dashes as `---`.** The site renders `---` as an em dash, and `---` is easier to read in Markdown than a literal em dash character. Never put `---` at the start of a line, where it's a horizontal rule.

**Give every code fence a lowercase language tag.** Write `sh`, not `bash` or `shell`, and `text`, not `txt` or `plaintext`, for output, logs, and custom expressions. For other languages, any standard tag works.

**Wrap any `{{ }}` that readers need to see** in `{% raw %}` and `{% endraw %}`, or Liquid evaluates it and the variable disappears from the page. In a code fence, put the tags on their own lines inside the fence.

**Match the surrounding file's formatting** for things that neither the style guide nor this skill covers, like list markers or table layout.

**Docs Markdown is unwrapped.** Keep each paragraph on one line, however long.

## Give a new page front matter and a nav entry, then format it

Every page has `title` and `summary` front matter, and an entry in `docs/util/data/nav.yml`. Some pages stay out of the nav on purpose. When you're done, run `bunx prettier --write` on the page.

## Change only what you were asked to change

- **Fix style only in the sentences you change.** Leave the rest of the section and the page as they are, and list the problems you see.
- **Reformat only the lines you change.** When you edit part of a paragraph, leave the line breaks in the rest of it as they are.
- **Check the formatting before you edit.** Run `bunx prettier --check` on the file. If the check passes, run `bunx prettier --write` on the file when you're done. If the check fails, skip `bunx prettier --write`, or Prettier rewrites lines you didn't touch.
- **If you rewrite a heading, fix the links to it.** Product code links to docs anchors too. Before you change `## Cache configuration`, search for the anchor it generates, without the `#`:

  ```sh
  grep -rn "cache-configuration" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src modules resources
  ```

  CI checks links and anchors, but it skips links that the code builds from variables, so search even if CI passes.

## Redirect a moved or replaced page, and fix links to it

- **List the old path in `redirect_from`** on the page that moved, or that replaces another page, along with the old page's own entries:

  ```yaml
  redirect_from:
    - /docs/latest/old-section/old-page
  ```

- **Update the links to the old page.** Search for the old page name:

  ```sh
  grep -rn "old-page" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src modules resources
  ```

## Check the links you changed

If you changed a link, a heading, or a page's path, run:

```sh
docs/util/check-links.sh
bun run lint-docs-links
```

The first command checks links in `docs/`, in the nav, and in the source code. It needs [lychee](https://lychee.cli.rs) and `jq`. The second command checks `useDocsUrl` and `getDocsUrl` calls in the frontend, and installs the frontend dependencies first. CI runs both checks too.

## Check that code examples work

Run each code example you add or change. If you can't run it, check each name in it (commands, flags, settings, props, columns) against the code.

## Change generated pages at their source

Scripts generate the following pages from source, most of them every weeknight. To change one of these pages, change its source.

- `docs/configuring-metabase/environment-variables.md` and `config-template.md`
- `docs/installation-and-operation/commands.md`
- `docs/api.html`
- `docs/ai/providers.md` and `docs/ai/mcp-tools.md`
- `docs/usage-and-performance-tools/usage-analytics-reference.md`
- `docs/questions/visualizations/country-codes.md`
- `docs/databases/feature-support.md`
- `docs/exploration-and-organization/keyboard-shortcuts.md`
- `docs/embedding/sdk/api/` and `docs/embedding/eajs/snippets/`

A script also updates the Docker tags in `docs/installation-and-operation/running-metabase-on-docker.md` and `upgrading-metabase.md`. Leave those tags alone.

People write the code in `docs/embedding/snippets/` and `docs/embedding/sdk/snippets/`, which pages pull in with `include_file`. Edit and review those files like any other code example.

## Read the diagram guide before you draw or change a diagram

Most pages don't need a diagram. Before you draw or change a diagram, or change text that a diagram repeats, read [the diagram guide](./diagrams.md). Its scripts draw and render diagrams in the docs' style.

## Leave the clever lines to the humans

Keep the jokes and clever lines you find on a page. Writing new ones, or cutting old ones, is a job for human writers.

## Reread before you finish

Do the reread that the style guide asks for. Your sources are the code and the issue, so check that each paragraph makes sense from the page alone, and that no two sentences seem to disagree.

## List what a writer needs to check

End your reply with the items that apply, and leave out the rest:

- **Evidence**: Each product fact you added or changed, as the page states it, with its full link from the fact table, or its path and lines if the table has no link. If you write the PR body, put the evidence there too, in the form that the caller asks for. Reviewers read those lines instead of researching the fact again.
- **Plans and versions**: Each one on the page, with where you got it. If the code confirms that a feature is paid, ask a person to confirm the plans.
- **Open facts**: Facts the code contradicted or didn't confirm, and limits the material doesn't give.
- **Left out**: Confirmed facts that you didn't put on the page.
- **Likely bugs**: Problems in the product. Keep them off the page.
- **Not run**: Checks and code examples you couldn't run.
- **Not fixed**: Problems elsewhere on the page, and a new page you kept out of the nav, with the reason.
