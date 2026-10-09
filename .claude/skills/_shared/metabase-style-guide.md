# Metabase writing style guide

Write like people normally talk with each other. Read it out loud: if it sounds formal, rewrite it.

Clear comes before on-style. One buried instruction outweighs any number of "users" that should be "people."

## Who reads this

- **Prospects**, working out whether Metabase solves their problem.
- **Customers**, already running Metabase and learning how a piece of it works.
- **Developers** building Metabase, who also read `docs/developers-guide/`.

## Key points

- Our readers are smart and impatient; most of them don't want to spend time reading docs.
- Don't explain what they already know.
- Don't explain things they don't need to know.
- Don't assume their context, like the season or where they live.
- Hard things are hard. Explain more where the topic is difficult, and still cut what you can.

## Structure and clarity

**Lead with the important thing.** Action first, then how, then why.

**Commands go in fenced blocks, in the order they're run.** Explanation comes after, never wrapped around the command.

**Say what Metabase can't do**, plainly, and own it when the product is at fault. A feature described without its limits isn't finished. Put each limit where it applies, not in a separate limitations section.

**Frame use cases, not software.** Readers arrive from search, trying to solve a problem, and may not know Metabase's terms yet. Name what they're trying to do, not the feature that does it. Mirror the UI's framing where it helps, and break from it where a use case is easier to find.

- "Embed a view-only dashboard": good.
- "Embedded dashboards with guest authentication": readers don't know what guest authentication is until they've used it.

**Use headings to highlight key points.** Readers should be able to read the headings and get a good idea of what you're saying. Take the following example:

Avoid:

> How to write a good heading

Better:

> Use headings to highlight key points

Sentence case, no end punctuation, except (sparingly) bangs, and question marks on troubleshooting pages. No bold or italics, no skipped levels. No link unless the whole heading is a link.

_Exception:_ troubleshooting pages, where the heading is the reader's symptom. "No access to Metabase login page" is what they'd have typed into search.

Task headings are imperative: "Create a dashboard," not "Creating a dashboard." A heading that's a UI label matches the label's case.

**Each section stands alone.** Readers arrive from search, mid-page. Put the condition in the heading with its consequence: "If you're using H2, stop Metabase before importing," not a list of conditions above a consequence.

**Ask whether the page/section/sentence should exist at all.** A page or section nobody will read costs maintenance and hides the ones people do read. Cut the section or fold it into where they'll look.

**One job per paragraph.** Cut what doesn't help the reader. When in doubt, cut.

**Cut the filler that writes itself.** These add length and nothing else:

- An opening paragraph that restates the H1, or "In this section, we'll…"
- A closing summary, or a "Next steps" list that doesn't link somewhere real
- "Note that," "It's worth noting," "Keep in mind"
- Hedges on deterministic behavior: Metabase "caches results," it doesn't "typically" or "may" cache them
- Defining the term the reader just searched for

_Exception to the hedges rule:_ behavior that depends on a setting or a plan. Say what it depends on instead of hedging.

**Images are minimal and scoped** to the UI element you're pointing at. A screenshot goes stale faster than the prose around it. Leave the image out if people can follow without it. For query results, use a Markdown table.

**Numbers go stale.** Versions, limits, quotas: point at where the value lives, or craft the sentence so it survives changes.

**Explain in prose, not bullets.** Bullets are for parallel items: options, requirements. Steps go in numbered lists, not bullets or a click path in a paragraph. _Exception:_ reference material readers scan.

**Answer the questions you had when learning.** Instead of the question ("Does Metabase support pivot tables?"), write the answer: "Metabase supports pivot tables."

**Repeat new terms** before falling back to pronouns or stand-ins like "the former" and "the latter." Avoid pronouns when they could introduce ambiguity.

**Subject, verb, object.** Deviate only with good reason, like a leading conditional. "Create summary tables for frequently aggregated data," not "Since summary tables get written to the warehouse, having them can streamline things."

**Prefer positive constructions.** Say what to do, not what to avoid: "Keep your encryption key somewhere safe," not "Don't lose your encryption key."

## Tone and voice

**Friendly, not peppy.** One exclamation point per page is plenty. Jokes and Easter eggs are fine; don't overdo them, and keep them out of steps, warnings, and troubleshooting pages. The test: would the joke annoy someone whose production Metabase is down? No tired tropes about nerdiness.

**Acknowledge frustration when it's warranted**, like on a troubleshooting page.

**Describe what it does instead of praising it.** "Loads in under a second," not "powerful," "seamless," or "robust."

**If a sentence could caption a stock photo** of people in an office, rewrite it.

**Don't describe tasks as easy.** "A simple bar chart" is fine. "Setup is easy," "just click," and "simply run" aren't.

## Word choice

Prefer words people know from spreadsheet apps, like summarize and filter, to database terms.

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

"Metabase" or "it," not "we," for what the product does. "We" makes it sound like the Metabase team can see people's data.

## Metabase terms

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

Spelling: timezone, dropdown, environment variable (not "env var"). "Set up" is the verb, "setup" the noun. "Drill-through" is the noun, "drill through" the verb.

## UI references

- **Navigation paths**: Italics for a path, bold for a single thing to click: "Go to _Admin > Settings > Domains_ and click **Save**."
- **Icons**: "the **grid** icon," with only the name in bold. "The three-dot menu (**...**)."
- **Verbs**: "click," not "click on." "Select" for options in a list. "Press" for keys. "Go to," not "navigate to."
- **Keyboard shortcuts**: Plain text, with no backticks or bold: Cmd/Ctrl + K.
- **Steps**: Put the result in the same step, in present tense. Mark optional steps with "Optional:" at the start.

## Formatting

**Backticks** for code, variables, parameters, file paths. **Bold** for anything a person clicks or sees labeled on the screen: buttons, menu items, tabs, settings, option values. "Click the **Save** button," not "Click the `Save` button" or "Click the "Save" button." Italics, with underscores, for emphasis, never all caps.

**List punctuation.** `- **Term**: Description.` with the colon outside the bold. If any item is a full sentence, every item starts with a capital letter and ends with a period. If every item is a fragment, none gets a period.

**Callouts are plain blockquotes.** No labels like "Note:" or "WARNING:" and no emoji. For a risk of losing data or getting locked out, open the blockquote with a bold sentence stating the risk.

**Paid features carry a plan blockquote**, at the top of the smallest section it gates, or under the H1 if the whole page covers a paid feature:

```html
{% include plans-blockquote.html feature="Official collections" %}
```

The include lives in the docs site repo, not here.

A paid item in a list or table gets a short parenthetical instead: "(Pro and Enterprise plans)."

**Deprecated features get a blockquote** under the heading that says what's deprecated, since which version, and what to use instead. Not "(DEPRECATED)" in the heading.

**Put links on the words in the sentence that name the destination**: "[Turn on caching](./caching.md) for slow questions," not "Turn on caching for slow questions. See [Caching](./caching.md)." When a separate pointer reads better, any casual verb works: see, check out, take a look at. Never link "here." Links to other docs pages are relative: `[text](./page.md)`, not `https://www.metabase.com/docs/latest/...`.

**Every image gets alt text** that says what the image shows.

**Document settings with a heading per setting**, so each has an anchor to link to.

**American spelling, serial commas**, and consistent list formatting within a page.

**Numbers**: words for zero to nine, numerals for 10 and up: "three dashboards," "50 questions." Write "hundreds," not "100s." _Exception:_ versions, units, setting values, and anything the reader types: "Metabase 57," "5 GB," "set it to 2."

**Periods and commas go inside quotation marks**: call them "people," not "users." _Exception:_ code and anything in backticks.

**Em dashes**: type `---` with a space on each side: "settings --- everything in your Metabase." The site renders it as an em dash, and it's easier to read in Markdown than the "—" character. Never at the start of a line, where `---` is a horizontal rule.

**Version numbers**: "Metabase 57," not "v57," "version 57," or "Metabase 0.57." Write the full `v0.57.2` or `v1.57.2` only when a person has to type it, like a Docker tag.

**Match the surrounding file's formatting.** Don't reformat lines you didn't change. On lines you change, this guide wins. For things it doesn't cover, like list markers or table layout, match the file.

**Docs markdown is unwrapped.** One line per paragraph, however long. Never hard-wrap, and never reflow a paragraph you're only editing part of.

## Code

- **Every fence gets a lowercase language tag.** Write `sh`, not `bash` or `shell`, and `text`, not `txt` or `plaintext`, for output, logs, and custom expressions. For other languages, any standard tag works. No shell prompt (`$`).
- **Complete examples**: A query has its `FROM`, and a command has every flag it needs. People paste them.
- **Placeholders** for secrets and IDs: `YOUR_API_KEY`, `YOUR_MODEL_ID`. Not `<your-value>` or `{your-value}`, which can be mistaken for syntax.
- **Example domains**: `metabase.example.com` for a Metabase, `example.com` for any other site, `person@example.com` for an email.
- **SQL**: Uppercase keywords, `{{variable}}` with no spaces inside the braces, `[[ optional clause ]]` with spaces inside the brackets.
- **Double braces**: Wrap anything containing `{{ }}` in `{% raw %}` and `{% endraw %}`, or Jekyll evaluates it and the variable disappears from the page. In a code fence, put the tags on their own lines inside the fence.

## Generated pages

These are generated from source, most of them every weeknight. Don't edit or review them. Change the source instead.

- `docs/configuring-metabase/environment-variables.md` and `config-template.md`
- `docs/installation-and-operation/commands.md`
- `docs/api.html`
- `docs/usage-and-performance-tools/usage-analytics-reference.md`
- `docs/questions/visualizations/country-codes.md`
- `docs/embedding/sdk/api/` and `docs/embedding/eajs/snippets/`
- Code pulled into a page with `include_file`, which lives under `snippets/`

## This style guide is aspirational

You'll find places in existing docs that break this guide. If you find one while working in an existing doc, like a "user" that should be a "person," fix it. But don't go outside of the current work to fix them. Treat it as a "while I'm on this page, I might as well tidy up" kind of thing.
