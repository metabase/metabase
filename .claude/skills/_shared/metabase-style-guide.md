# Metabase writing style guide

Write like people normally talk with each other. Read your draft out loud. If it sounds formal, rewrite it.

Prioritize clarity over style.

## Write for four kinds of readers

- **Prospects** want to know whether Metabase solves their problem.
- **Customers** already run Metabase and want to learn how a part of it works.
- **Developers** build Metabase. They also read `docs/developers-guide/`.
- **Agents** answer questions for people, or build things with Metabase.

## Cut more than you think you should

Readers are smart and impatient. Explain only what readers need and don't already know. Tailor length to complexity, elaborating only when a topic requires it (but still cut what you can). Cut more than you think you should. Writers review your PRs, so save them the extra work.

## Match your edits to the page's Diátaxis type

When you edit a page, identify its Diátaxis type (tutorial, how-to guide, explanation, or reference), and tailor your edits to that type.

## Put the reader's task first

**Lead with the important thing.** Action first, then how, then why.

**Use headings to highlight key points.** Someone who reads only the headings gets the gist of the page: "Use headings to highlight key points," not "How to write a good heading." _Exception:_ on a troubleshooting page, make the heading the reader's symptom, in the words they'd type into search: "No access to Metabase login page."

Write headings in sentence case, with no bold, no italics, and no skipped levels. Leave off end punctuation, except a question mark on a troubleshooting page or the rare exclamation point.

Task headings are imperative: "Create a dashboard," not "Creating a dashboard." A heading that's a UI label matches the label's case.

**Commands go in fenced blocks, in the order people run them.** The explanation comes after the block, not wrapped around it.

**Frame use cases, not software.** Readers arrive from search with a problem to solve, and may not know Metabase's terms yet. Frame headings around what readers are trying to do, then name the feature that does it. Mirror the UI's wording where it helps, and break from it where a use case is easier to find. "Embed a view-only dashboard," not "Embedded dashboards with guest authentication." Readers don't know what guest authentication is until they've used it, though they may see the term in the product and look it up.

**Make each section stand alone.** Readers often land mid-page. Put a condition in the heading with its consequence: "If you're using H2, stop Metabase before importing," not a list of conditions above a consequence.

**One job per paragraph.** Cut what doesn't help the reader. When in doubt, cut.

**Cut filler.** It adds length and nothing else:

- An opening paragraph that restates the H1, or "In this section, we'll…"
- A closing summary, or a "Next steps" list that doesn't link somewhere real
- "Note that," "It's worth noting," "Keep in mind"
- Hedges on deterministic behavior: Metabase "caches results," not "typically caches" or "may cache" them

**Scope images to the UI element you're pointing at.** A screenshot goes stale faster than the prose around it, so leave the screenshot out if people can follow without it. For query results, use a Markdown table.

**Write versions, limits, and quotas so they survive a change.** Point at where the value lives, or word the sentence so it stays true.

**Explain in prose, not bullets.** Bullets are for parallel items, like options and requirements, and for reference material readers scan. Steps go in numbered lists, not in bullets or in a click path inside a paragraph.

**Answer the questions you had when learning.** State the answer, not the question: "Metabase supports pivot tables," not "Does Metabase support pivot tables?"

**Repeat a new term** instead of switching to a pronoun or a stand-in like "the former" or "the latter." Use a pronoun only when it can point at one thing.

**Subject, verb, object.** Deviate only with good reason, like a leading conditional. "Create summary tables for data you summarize often," not "Since summary tables get written to the warehouse, having them can streamline things."

**Prefer positive constructions.** Say what to do, not what to avoid: "Keep your encryption key somewhere safe," not "Don't lose your encryption key."

## Sound friendly, not peppy

One exclamation point per page is plenty. Jokes and Easter eggs are fine in moderation. Keep them out of steps, warnings, and troubleshooting pages, and out of anything that would annoy someone whose production Metabase is down. Skip tired tropes about nerdiness.

**Acknowledge frustration when it's warranted**, like on a troubleshooting page.

**Describe what the feature does instead of praising it.** "Loads in under a second," not "powerful," "seamless," or "robust."

**If a sentence could caption a stock photo** of people in an office, rewrite it.

**Let readers decide whether a task is easy.** "A simple bar chart" is fine. "Setup is easy," "just click," and "simply run" aren't.

## Prefer everyday words to database terms

Prefer words people know from spreadsheet apps, like "summarize" and "filter," to database terms. Use jargon when it's the correct term and it clarifies.

| Write                                                   | Not                                  | Exception                                                                                               |
| ------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| people, companies, the next person                      | users                                | The admin concept: user account, user group, the API. Always "user attributes" and "user provisioning." |
| Metabase caches results                                 | we cache results                     | The team speaking, e.g. `docs/CONTRIBUTING.md`.                                                         |
| can't, don't                                            | cannot, do not                       | Quoted errors, code, config values.                                                                     |
| use                                                     | utilize, leverage                    |                                                                                                         |
| say what it is                                          | offerings, actionable insights       |                                                                                                         |
| must, you'll need to (required); we recommend (advised) | should, have to, Metabase recommends | "You should see" for an expected result.                                                                |
| you, or the imperative                                  | we'll, let's, our                    |                                                                                                         |
| Metabase shows a warning                                | Metabase will show a warning         | Things that happen later: "your trial will end."                                                        |
| summarize                                               | aggregate                            | SQL and database terms, like "aggregation function."                                                    |
| see, take a look at                                     | reference (as a verb)                |                                                                                                         |
| and                                                     | &                                    | Proper nouns.                                                                                           |
| allowlist, blocklist                                    | whitelist, blacklist                 |                                                                                                         |
| main, or say what it does                               | master                               | A real branch name, and URLs that contain it. A third party's term, like the AWS "master username."     |
| quick check                                             | sanity check                         |                                                                                                         |
| they                                                    | he, she                              | A real person's stated pronouns.                                                                        |

"We" for what the product does makes it sound like the Metabase team can see people's data.

## Use Metabase's names for things

| Write                                                                                   | Not                                          | Exception                                                                   |
| --------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| SQL editor, SQL question, SQL query                                                     | native editor, native question, native query | Databases that don't use SQL, like MongoDB. UI labels and permission names. |
| row and column security                                                                 | sandboxing, data sandboxes                   | One mention per page as the former name.                                    |
| Pro and Enterprise plans                                                                | Pro/Enterprise, paid plans                   |                                                                             |
| Metabase Cloud                                                                          | cloud, Metabase cloud                        |                                                                             |
| self-hosted                                                                             | on-prem, self hosted                         |                                                                             |
| your Metabase                                                                           | your Metabase instance, your instance        | Counting or comparing them: "multiple instances."                           |
| application database                                                                    | app database, app DB                         |                                                                             |
| admin, admins                                                                           | administrator                                | The **Admin** menu item. "Administrators" as the group name.                |
| dashboard, collection, model, metric, query builder, notebook editor, custom expression | Dashboard, Query Builder, Notebook Editor    | A UI label.                                                                 |
| PostgreSQL, Microsoft Entra ID, JavaScript, GitHub                                      | Postgres, Azure AD, Javascript, Github       | Code and connection strings.                                                |

Spell third-party names the way the vendor does.

**Spelling**: timezone, dropdown, environment variable (not "env var"). "Set up" is the verb, "setup" the noun. "Drill through" is the verb, "drill-through" the noun.

## Point at the UI the same way every time

- **Navigation paths**: Italics for a path, bold for a single thing to click: "Go to _Admin > Settings > Domains_ and click **Save**."
- **Icons**: Bold only the name: "the **grid** icon." For the three-dot menu, bold the dots: "the three-dot menu (**...**)."
- **Verbs**: Write "click," not "click on," and "go to," not "navigate to." Use "select" for options in a list, and "press" for keys.
- **Keyboard shortcuts**: Plain text, with no backticks or bold: Cmd/Ctrl + K.
- **Steps**: Put the result in the same step, in present tense. Mark optional steps with "Optional:" at the start.

## Format for the docs site

**Use backticks for code, variables, parameters, and file paths.** Use bold for anything a person clicks or sees labeled on the screen: buttons, menu items, tabs, settings, option values. "Click the **Save** button," not "Click the `Save` button" or "Click the 'Save' button." Use italics, with underscores, for emphasis, never all caps.

**List punctuation.** Write `- **Term**: Description.`, with the colon outside the bold. If any item is a full sentence, every item starts with a capital letter and ends with a period. If every item is a fragment, none gets a period.

**Callouts are plain blockquotes**, with no labels like "Note:" or "WARNING:" and no emoji. For a risk of losing data or getting locked out, open the blockquote with a bold sentence stating the risk.

**Paid features carry a plan blockquote**, at the top of the smallest section that covers the feature, or under the H1 if the whole page covers a paid feature:

```html
{% include plans-blockquote.html feature="Official collections" %}
```

The include lives in the docs site repo, not in this one.

A paid item in a list or table gets a short parenthetical instead: "(Pro and Enterprise plans)."

**Deprecated features get a blockquote**, not "(DEPRECATED)" in the heading. Put it under the heading, and say what's deprecated, since which version, and what to use instead.

**Put links on the words in the sentence that name the destination**: "[Turn on caching](./caching.md) for slow questions," not "Turn on caching for slow questions. See [Caching](./caching.md)." When a separate pointer reads better, any casual verb works: see, check out, take a look at. Never link "here." Links to other docs pages are relative: `[text](./page.md)`, not `https://www.metabase.com/docs/latest/...`.

**Every image gets alt text** that says what the image shows.

**Document settings with a heading per setting**, so each has an anchor to link to.

**Use American spelling and serial commas**, and keep list formatting consistent within a page.

**Numbers**: Words for zero to nine, numerals for 10 and up: "three dashboards," "50 questions." Write "hundreds," not "100s." _Exception:_ versions, units, setting values, and anything the reader types: "Metabase 57," "5 GB," "set it to 2."

**Periods and commas go inside quotation marks**: call them "people," not "users." _Exception:_ code and anything in backticks.

**Em dashes**: Type `---` with a space on each side: "settings --- everything in your Metabase." The site renders `---` as an em dash, and `---` is easier to read in Markdown than a literal em dash character. Never at the start of a line, where `---` is a horizontal rule.

**Version numbers**: "Metabase 57," not "v57," "version 57," or "Metabase 0.57." Write the full `v0.57.2` or `v1.57.2` only when a person types it, like a Docker tag.

**Match the surrounding file's formatting.** Reformat only the lines you change, and on those lines, this guide wins. For things the guide doesn't cover, like list markers or table layout, match the file.

**Docs Markdown is unwrapped.** Keep each paragraph on one line, however long. When you edit part of a paragraph, leave the line breaks in the rest of it as they are.

## Make code examples pasteable

- **Language tags**: Every fence gets a lowercase one. Write `sh`, not `bash` or `shell`, and `text`, not `txt` or `plaintext`, for output, logs, and custom expressions. For other languages, any standard tag works.
- **Shell prompts**: Leave out the `$` (so commands are easy to copy and paste).
- **Complete examples**: A query has its `FROM`, and a command has every flag it needs. People paste examples.
- **Placeholders**: Write secrets and IDs as `YOUR_API_KEY` and `YOUR_MODEL_ID`, not `<your-value>` or `{your-value}`, which people can mistake for syntax.
- **Example domains**: Use `metabase.example.com` for a Metabase, `example.com` for any other site, and `person@example.com` for an email.
- **SQL**: Uppercase keywords, `{{variable}}` with no spaces inside the braces, `[[ optional clause ]]` with spaces inside the brackets.
- **Double braces**: Wrap anything containing `{{ }}` in `{% raw %}` and `{% endraw %}`, or Jekyll evaluates it and the variable disappears from the page. In a code fence, put the tags on their own lines inside the fence.

## Change generated pages at their source

Scripts generate the following pages from source, most of them every weeknight. To change one of these pages, change its source. Skip these pages in reviews.

- `docs/configuring-metabase/environment-variables.md` and `config-template.md`
- `docs/installation-and-operation/commands.md`
- `docs/api.html`
- `docs/usage-and-performance-tools/usage-analytics-reference.md`
- `docs/questions/visualizations/country-codes.md`
- `docs/embedding/sdk/api/` and `docs/embedding/eajs/snippets/`
- Code under `snippets/` that a page pulls in with `include_file`

## This style guide is aspirational

Existing docs break this guide in places. When you find a break on a page you're working on, like a "user" that needs to be a "person," fix it. Leave breaks on other pages for later. The rule is "while I'm on this page, I might as well tidy up."
