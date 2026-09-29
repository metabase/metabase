# Docs style decisions

Calls made on the splits listed in [style inconsistencies](./style-inconsistencies.md), which has the counts and examples behind each one. These are drafts until they're folded into the [writing style guide](./metabase-style-guide.md).

Like the guide, these are aspirational. Apply them to the page you're working on. Don't go hunting for exceptions elsewhere.

## Still to decide

Each of these is marked **TODO** where it appears below.

| #   | Call                                                                     | What's blocking it                                              |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1   | [Log in or sign in](#log-in-or-sign-in)                                  | The UI uses both, so this needs the product team                |
| 2   | [Remote Sync, Data Studio, and All Users capitalization](#feature-names) | The UI has both forms of each                                   |
| 3   | [Enterprise Edition](#plans-and-editions)                                | Whether it's still the name of the JAR and Docker image         |
| 4   | [Link target for paid plans](#plans-and-editions)                        | `/pricing` or the two `/product/` pages                         |
| 5   | [Breadcrumb line under settings headings](#navigation-paths)             | Keep and add everywhere, or drop                                |
| 6   | [Location first or action first](#steps)                                 | The suggestion goes against what most pages do                  |
| 7   | [Choose and pick](#verbs)                                                | Whether they need to be distinct from "select"                  |
| 8   | [Dashes in prose](#dashes)                                               | Whether to use them at all                                      |
| 9   | [Trailing semicolons in SQL](#sql)                                       | The query formatter keeps whatever you give it                  |
| 10  | [Front matter keys](#front-matter)                                       | Whether the docs site reads `description` and the `cloud/` keys |
| 11  | [Voice of summaries](#front-matter)                                      | Imperative or descriptive                                       |
| 12  | [Troubleshooting page titles](#page-titles)                              | Symptom in first person, third person, or "Troubleshooting X"   |
| 13  | [Standard section names](#standard-sections)                             | Whether they're an exception to "headings state the point"      |
| 14  | [Naming "just" and "simply"](#existing-rules)                            | Whether the guide should name them again                        |
| 15  | [Scope of the developers guide](#guidance-fixes)                         | Whether the style guide applies to `docs/developers-guide/`     |

## Names

### Feature names

Lowercase a feature when it's a thing people make or use. Capitalize only the proper name of a product area or a built-in item, and only its first word unless the UI does otherwise. When the name is bold as a UI label, match the UI exactly.

| Write                                         | Not                                           | Exception                                                                   |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| Admin settings                                | Admin Panel, admin panel, Admin Settings      | In a navigation path, the first item is **Admin**.                          |
| query builder                                 | Query Builder, query-builder                  | **Query builder** as a permission level or UI label.                        |
| notebook editor                               | Notebook Editor                               |                                                                             |
| metrics explorer                              | Metrics Explorer                              | Start of a sentence or a heading.                                           |
| custom expression                             | Custom Expression                             | **Custom expression** as a UI label.                                        |
| dashboard, collection, model, metric, segment | Dashboard, Collection, Model, Metric, Segment | A UI label.                                                                 |
| admin, admins                                 | Admin (as a role), administrator              | The **Admin** menu item. "Administrators" as the group name.                |
| Table Metadata                                | table metadata, Table metadata                | Lowercase when it means metadata in general, not the admin page.            |
| Usage analytics                               | Usage Analytics                               |                                                                             |
| Sample Database                               | Sample database, sample database              |                                                                             |
| Trash                                         | trash                                         | Lowercase as a verb: "trash the question".                                  |
| Official collections                          |                                               | Lowercase for the general idea: "mark a collection as official".            |
| Browse data                                   | Browse Data                                   |                                                                             |
| application database                          | app database, app DB                          |                                                                             |
| your Metabase                                 | your Metabase instance, your instance         | Counting or comparing them: "a development instance", "multiple instances". |
| All Users                                     | All users                                     | When referring to the default All Users group.                              |
| Remote Sync                                   | Remote sync                                   |                                                                             |
| Data Studio                                   | Data studio                                   |                                                                             |

### SQL editor

| Write        | Not                                                                                    | Exception                                                                   |
| ------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| SQL editor   | native editor, native query editor, native SQL editor, native/SQL editor, query editor |                                                                             |
| SQL question | native question                                                                        |                                                                             |
| SQL query    | native query                                                                           | Databases that don't use SQL, like MongoDB. UI labels and permission names. |

### Row and column security

| Write                   | Not                        | Exception                                                                        |
| ----------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| row and column security | sandboxing, data sandboxes | One mention per page as the former name. Unrelated uses, like iframe sandboxing. |
| row-level security      |                            | Only for the database feature of that name.                                      |

### Plans and editions

| Write                    | Not                                                | Exception                                                         |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------------------------- |
| Pro and Enterprise plans | Pro/Enterprise, Pro or Enterprise plan, paid plans | "Pro or Enterprise" when the sentence is about one person's plan. |
| Metabase Open Source     | OSS, Open Source Edition                           |                                                                   |
| open source              | open-source                                        | Hyphenate before a noun: "open-source software".                  |
| Metabase Cloud           | cloud, Metabase cloud                              |                                                                   |
| self-hosted              | on-prem, self hosted                               |                                                                   |

### Third-party names

Spell third-party names the way the vendor does.

| Write                                   | Not                                    | Exception                           |
| --------------------------------------- | -------------------------------------- | ----------------------------------- |
| PostgreSQL                              | Postgres, postgres                     | Code and connection strings.        |
| Microsoft Entra ID                      | Azure AD                               | "Formerly Azure AD" once per page.  |
| Docker                                  | docker                                 | The `docker` command, in backticks. |
| JAR                                     | jar                                    | `metabase.jar`, in backticks.       |
| JavaScript, TypeScript, Node.js, GitHub | Javascript, Typescript, NodeJS, Github |                                     |
| SQL Server                              | MS SQL, SQL server                     |                                     |
| iframe                                  | iFrame, IFrame                         | The name of a third-party product.  |

## Spelling

### Log in, not sign in

- Two words as a verb, never "login" as a verb.
- "in to", never "into": "log in to Metabase".
- Hyphenate the noun and adjective: "the login page".
- Keep "login" in names, like "Admin backup login".

### Word list

| Write                                 | Not                                   | Exception                                                  |
| ------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| timezone                              | time zone                             |                                                            |
| drill-through (noun, adjective)       | drill through, drillthrough           | Two words as a verb: "drill through the data".             |
| set up (verb)                         | setup                                 | One word as a noun or adjective: "the setup guide".        |
| subcollection, subfolder, subquery    | sub-collection, sub-folder, sub-query |                                                            |
| allowlist                             | whitelist                             |                                                            |
| re-scan, re-sync, re-run              | rescan, resync, rerun                 | Closed when the word is common: recreate, reorder, rename. |
| homepage                              | home page                             |                                                            |
| file name                             | filename                              | A parameter or variable called `filename`.                 |
| ad hoc                                | ad-hoc                                |                                                            |
| two-factor authentication (2FA)       | multi-factor, MFA                     | Another product's name for it.                             |
| environment variable                  | env var, env variable                 |                                                            |
| dropdown, popup, checkbox, email      | drop-down, pop-up, check box, e-mail  |                                                            |
| up to date                            | up-to-date                            | Hyphenate before a noun: "an up-to-date backup".           |
| built-in                              | built in                              |                                                            |
| people using your app, your customers | end users, end-users                  |                                                            |
| OK                                    | okay                                  |                                                            |

## UI references

### Navigation paths

Prefer the italicized path. Like _Admin > Settings > Domains_.

Where possible, avoid inline `**Admin > Databases**`, `Admin -> Databases`, `→`, or `**Admin**>**Databases**`. So if a section has a numbered list, assume readers know to navigate to the italicized list.

### Labels

Bold for anything a person clicks or sees labeled on the screen: buttons, menu items, tabs, settings, option values.

| Case                           | Write                                                |
| ------------------------------ | ---------------------------------------------------- |
| Button or menu item            | Click **Save**.                                      |
| Option value                   | Set **View data** to **Can view**.                   |
| Text a person types            | Search for "Branding". Exact values go in backticks. |
| Label the UI shows in all caps | The case of the underlying string: **SMTP host**.    |
| Toggle state                   | Lowercase, no bold: "turn the setting off".          |

Not quotes, backticks, or bold plus quotes for labels.

### Icons and menus

| Write                        | Not                                                               |
| ---------------------------- | ----------------------------------------------------------------- |
| the **grid** icon            | the **grid icon**, the grid icon, the **Gear** icon               |
| the three-dot menu (**...**) | three dots, three dots icon, three dot menu, ellipsis, kebab menu |

- Capitalize an icon's name only when it has a visible text label.
- Use three periods, not the ellipsis character.
- Name a shape or label along with a color: "the green checkmark", not "the green icon".

### Verbs

| Write                 | Not                                | Exception                           |
| --------------------- | ---------------------------------- | ----------------------------------- |
| click                 | click on, hit                      |                                     |
| select                |                                    | For options in a list or dropdown.  |
| press                 | hit                                | For keys.                           |
| go to                 | navigate to, visit, head to        | "Visit" for an external site.       |
| toggle on, toggle off | turn on, turn off, enable, disable | "Toggle" as a noun for the control. |

### Position

| Write                     | Not                                |
| ------------------------- | ---------------------------------- |
| top right, top left       | upper right, upper left            |
| bottom right, bottom left | lower right, lower left            |
| left sidebar              | left nav, left navigation, nav bar |
| navigation sidebar        | main sidebar, main nav             |

- Hyphenate only before a noun: "the top-right corner".
- Use "navigation sidebar" only to tell the main sidebar apart from another one.
- Replace "above" and "below" with a link to the section.

### Keyboard shortcuts

Write `Cmd/Ctrl + K`.

- Capitalize key names.
- Spaces around `+`.
- No bold, no backticks, no `⌘`.
- Write key sequences with "then": "press G, then D". Not `>`, which is for navigation paths.

### Steps

- Numbered lists for anything with more than one step. Not bullets, and not a click path in a paragraph.
- Mark optional steps with "Optional:" at the start of the step.
- Put the result in the same step, in present tense: "Metabase shows a confirmation."
- Offer the command palette route on the command palette page, not on every settings page.
- Location first

## Formatting

### Lists

| Case                           | Write                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Label being defined            | `- **Term**: Description.` Punctuation outside the bold, capital after the colon. |
| Lead-in that's a full sentence | `- **Turn on model actions.** Then the detail.` Period inside the bold.           |
| Every item is a fragment       | No end punctuation.                                                               |
| Any item is a full sentence    | A period on every item.                                                           |

Not `**Term:**`, `**Term** -`, or a list punctuated as one long sentence with commas.

### Callouts

| Case                                      | Write                                                          |
| ----------------------------------------- | -------------------------------------------------------------- |
| Aside                                     | A blockquote with no label.                                    |
| Risk of losing data or getting locked out | A blockquote that opens with a bold sentence stating the risk. |
| Paid feature                              | The plans blockquote.                                          |

Not "Note:", "NOTE:", "Tip:", "WARNING:", or emoji.

### Dashes

A colon, a comma, or a new sentence is usually clearer.

Ranges of numbers use "to": "5 to 10 minutes".

### Punctuation and abbreviations

| Write                           | Not                | Exception                                   |
| ------------------------------- | ------------------ | ------------------------------------------- |
| straight quotes and apostrophes | curly quotes       |                                             |
| ...                             | …                  |                                             |
| for example, or like            | e.g., for instance | "e.g.," with the comma, inside parentheses. |
| that is                         | i.e.               | "i.e.," with the comma, inside parentheses. |
| and so on, or a specific list   | etc., etc          |                                             |
| vs.                             | vs, versus         |                                             |
| or                              | and/or             |                                             |
| through, with, by               | via                |                                             |

### Emphasis

Italics for emphasis, with underscores: `_not_`. Bold is for UI labels. Never all caps.

If a sentence needs emphasis to be understood, try rewriting the sentence first.

### Table and column names

| Case                          | Write                      |
| ----------------------------- | -------------------------- |
| A table, by its display name  | the Orders table           |
| A column, by its display name | the Created At column      |
| A database identifier         | `created_at`, in backticks |
| A name to click               | **Orders**, in bold        |

### Tables

- Sentence case in header cells.
- Document settings with a heading per setting, so each has an anchor to link to. Not a table or bold-lead bullets.

### Numbers

| Write              | Not                     | Exception                                   |
| ------------------ | ----------------------- | ------------------------------------------- |
| 1,000              | 1000                    | Code, and values a person types.            |
| 10 MB              | 10MB                    |                                             |
| 5 minutes, 2 hours | five minutes, two hours |                                             |
| one through nine   | 1 through 9             | With a unit. In a table. A value in the UI. |
| 50%                | 50 percent              |                                             |

### Version numbers

| Write       | Not                                                 | Exception                                                                        |
| ----------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Metabase 57 | v57, version 57, Metabase 0.57, Metabase 1.57, x.57 | The full `v0.57.2` or `v1.57.2` when a person has to type it, like a Docker tag. |

### Links

| Write                              | Not                                                                      | Exception |
| ---------------------------------- | ------------------------------------------------------------------------ | --------- |
| `[text](./page.md)`                | `[text](page.md)`                                                        |           |
| inline links                       | reference-style links                                                    |           |
| relative links to other docs pages | `https://www.metabase.com/docs/latest/...`                               |           |
| See [the docs](link)               | Check out, Refer to, Take a look at, Learn more about, For more info see |           |
| period outside the link text       | period inside the link text                                              |           |

Link the first mention of an environment variable on a page to the environment variables reference. Leave later mentions unlinked.

### Images

- Path: `./images/file-name.png`.
- File names in kebab-case.
- Alt text on every image: a sentence-case fragment, no period, that says what the image shows.
- No image before the first paragraph of a page.

## Code

### Code fences

Every fence gets a language tag, in lowercase.

| Content                                                    | Tag          |
| ---------------------------------------------------------- | ------------ |
| Shell commands                                             | `sh`         |
| SQL                                                        | `sql`        |
| JSON                                                       | `json`       |
| YAML                                                       | `yaml`       |
| JavaScript                                                 | `javascript` |
| TypeScript                                                 | `typescript` |
| React components                                           | `jsx`, `tsx` |
| Output, logs, custom expressions, anything that isn't code | `text`       |

Not `bash`, `shell`, `yml`, `js`, `ts`, `txt`, or `plaintext`. No shell prompt (`$`).

### Placeholders

Write `YOUR_UPPER_SNAKE`: `YOUR_API_KEY`, `YOUR_METABASE_URL`.

Not `<your-value>`, `{your-value}`, `[your value]`, `your_value`, `your-value`, or `xxxx`. Brackets and braces can be mistaken for syntax.

### Example domains

| Case                     | Write                  |
| ------------------------ | ---------------------- |
| A Metabase               | `metabase.example.com` |
| Any other site           | `example.com`          |
| An email address         | `person@example.com`   |
| Local development guides | `localhost:3000`       |

Not `yourcompany.com`, `mycompany.com`, or `yourdomain.com`, which could belong to someone.

### SQL

Match what the **Format query** button produces, so examples look like what readers see in the editor:

- Uppercase keywords.
- Two-space indent.
- `{{variable}}`, with no spaces inside the braces.
- `[[ optional clause ]]`, with spaces inside the brackets.
- Trailing commas, not leading commas.

Write `{% raw %}` and `{% endraw %}` with spaces.

Prefer a trailing semicolons.

### Example people

Use singular "they" for every persona, including named ones.

## Pages

### Front matter

Every page has `title` and `summary`. Quote a value only when YAML needs it, like a title with a colon.

The key for redirects is `redirect_from`, with an underscore.

Voice of summaries should be descriptive, not imperative.

### Page titles

| Page type            | Form       | Example           |
| -------------------- | ---------- | ----------------- |
| Task                 | Imperative | Set up email      |
| Concept or reference | Noun       | Dashboard filters |

Not gerunds ("Setting up email") and not "How to…". The `title` and the H1 match.

### Headings

| Case                                      | Write                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Task                                      | Imperative: "Create a dashboard", not "Creating a dashboard".                                  |
| Setting, parameter, or function           | Code formatting is fine.                                                                       |
| UI label that's Title Case in the product | Match the label. This is the exception to sentence case.                                       |
| Long procedure                            | `### 1. Do the thing`, not `## Step 1: Do the thing`. Only when a numbered list won't hold it. |
| Question                                  | Only on troubleshooting pages.                                                                 |

No bold or italics in headings. No skipped levels.

### Page openings

Open with one or two sentences that say what the reader can do with the feature. Then the plans blockquote, if there is one.

### Standard sections

| Write           | Not                                                             |
| --------------- | --------------------------------------------------------------- |
| Further reading | Related topics, Related, Learn more, Next steps, More resources |
| Prerequisites   | Requirements, Before you start                                  |
| Limitations     | Known limitations, Caveats, Gotchas                             |

Add a closing section only when there's somewhere useful to send the reader.

### Paid features, versions, and deprecations

| Case                           | Write                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| A paid section or page         | The plans blockquote. Copy the include exactly, with a space before `%}`.                                 |
| A paid item in a list or table | A short parenthetical: "(Pro and Enterprise plans)".                                                      |
| A deprecated feature           | A blockquote under the heading that says what's deprecated, since which version, and what to use instead. |

Not asterisk footnotes, and not "(DEPRECATED)" in a heading.

No dated promotions in docs. They go stale and nobody owns removing them.

## Voice

### "We"

| Case                  | Write                   | Not                 |
| --------------------- | ----------------------- | ------------------- |
| What the product does | Metabase caches results | we cache results    |
| Advice from the team  | we recommend            | Metabase recommends |
| Tutorials             | you, or the imperative  | we'll, let's, our   |

### Tense

Present tense: "Metabase shows a warning", not "Metabase will show a warning".

Keep "will" for things that happen later: "your trial will end".

### Requirements and advice

| Meaning         | Write                            | Not                      |
| --------------- | -------------------------------- | ------------------------ |
| Required        | you'll need to, must             | have to, should          |
| Advised         | we recommend                     | should                   |
| Expected result | you should see                   |                          |
| Optional        | you can                          |                          |
| A step          | the imperative: "Click **Save**" | "You can click **Save**" |

### How pages refer to themselves

"This page", and only when it's needed. Not "this guide", "this article", or "this doc".

### Humor

Jokes are fine where a reader has time for them. Keep them out of steps, warnings, and troubleshooting pages. The test: would the joke annoy someone whose production Metabase is down?

### Words to avoid

| Write                     | Not          | Exception                                             |
| ------------------------- | ------------ | ----------------------------------------------------- |
| allowlist                 | whitelist    |                                                       |
| blocklist                 | blacklist    |                                                       |
| main, or say what it does | master       | A third party's term, like the AWS "master username". |
| quick check               | sanity check |                                                       |
| keep the existing         | grandfather  |                                                       |
| stop, end                 | kill         | The command name.                                     |
| they                      | he, she      | A real person's stated pronouns.                      |

## Existing rules

Keep every rule in the guide. None needs to change because the docs break it. The gaps are cleanup to do while working on a page.

## Guidance fixes

Changes to the guidance itself.

| #   | Where                    | Change                                                                                               |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | Style guide, word choice | Replace "take a look at, not reference" with "see, not reference (as a verb)".                       |
| 2   | Style guide, word choice | Add an exception to "summarize, not aggregate": SQL and database terms, like "aggregation function". |
| 3   | Style guide, word choice | Replace the "we" row with the three cases under ["We"](#we).                                         |
| 4   | Style guide, word choice | Change the link example from "Check out" to "See".                                                   |
| 5   | Style guide, headings    | Add: a heading that's a UI label matches the label's case.                                           |
| 6   | Style guide, headings    | Limit question headings to troubleshooting pages.                                                    |
| 7   | Style guide, structure   | Change "Bullets are for… steps" to say steps go in numbered lists.                                   |
| 8   | Style guide, formatting  | Add the list punctuation rule.                                                                       |
| 9   | Style guide, accuracy    | Add the version number format under "Numbers go stale".                                              |
| 10  | Style guide, tone        | Add the test for jokes and where they don't belong.                                                  |
| 11  | `docs-write` skill       | Replace "copy the neighbors' front matter" with the required keys.                                   |
| 12  | `docs/CONTRIBUTING.md`   | Link "Style Guide" to the writing style guide, or rename the Storybook link.                         |
| 13  | Root `CLAUDE.md`         | Update the description of `docs-review`, which no longer has a checklist.                            |

