# Metabase writing style guide

Write like people normally talk with each other. Read your draft out loud. If it sounds formal, rewrite it.

Prioritize clarity over style.

## Write for four kinds of readers

- **Prospects** want to know whether Metabase solves their problem. Say what a feature does before how to set it up.
- **Customers** already run Metabase and want to learn how a part of it works. Give them the steps.
- **Developers** embed Metabase in their own app, or build Metabase itself. Give them complete code examples.
- **Agents** answer questions for people, or build things with Metabase. Give them the exact names of settings and labels.

## Cut more than you think you should

Readers are smart and impatient. Explain only what readers need and don't already know. When an example makes the point, show the example and cut the explanation. Tailor length to complexity, elaborating only when a topic requires it.

If readers wouldn't miss the content, cut it. But keep the sentence that defines a term, and the sentence that says why someone would care, unless another sentence already does that job.

Before you finish, reread once as someone who hasn't seen your sources. Delete every sentence they could skip, and fix every sentence they couldn't follow.

## Put the reader's task first

**Lead with the important thing.** Open with what the reader most needs to know, like the news, the request or action they need to take, or what the feature does.

**Use headings to highlight key points.** Someone who reads only the headings gets the gist: "Use headings to highlight key points," not "How to write a good heading."

Write headings in sentence case, with no bold, no italics, and no skipped levels. Keep them as short as the point allows. Leave off end punctuation where possible.

Task headings are imperative: "Create a dashboard," not "Creating a dashboard." Think about how someone searching for the task would search for the task or problem.

**Frame use cases, not software.** Readers have a problem to solve, and may not know Metabase's terms yet. Frame headings around what readers are trying to do, then name the feature that does it. Mirror the UI's wording where it helps, and break from the UI's wording where a use case is easier to find. "Embed a view-only dashboard," not "Embedded dashboards with guest authentication." Readers don't know what guest authentication is until they've used it (though they may see the term in the product and look it up).

**Recommend an option.** When readers have to choose, say which option most people need, then cover the rest.

**One job per paragraph.** Split a paragraph that does two jobs, and drop one that does none.

**Cut filler.** It adds length and nothing else. Examples:

- An opening that restates the title without defining it, or "In this section, we'll…"
- A closing summary
- "Note that," "It's worth noting," "Keep in mind"

**Explain in prose, not bullets.** Bullets are for parallel items, like options and requirements, and for reference material readers scan. Steps go in numbered lists, not in bullets.

**Answer the questions a newcomer would be embarrassed to ask.** State the answer, not the question: "Metabase supports pivot tables," not "Does Metabase support pivot tables?"

**Repeat a new term** instead of switching to a pronoun or a stand-in like "the former" or "the latter." Use a pronoun only when the pronoun can point at one thing.

**Subject, verb, object.** Deviate only with good reason, like a leading conditional (which allows readers to bail early on content irrelevant to their task). "Create summary tables for data you summarize often," not "Since summary tables get written to the warehouse, having them can streamline things."

**Prefer positive constructions.** Say what to do, not what to avoid: "Keep your encryption key somewhere safe," not "Don't lose your encryption key." _Exception:_ a warning about losing data or getting locked out.

## State facts you can back up

A hedge doesn't fix a fact that nobody checked. Confirm the fact or cut it.

## Sound friendly, not peppy

One exclamation point per page, email, or post is plenty. Be occasionally clever, never joke-y. Keep clever lines out of steps, warnings, and troubleshooting content, and out of anything that would annoy someone whose production Metabase is down. Skip tired tropes about nerdiness.

**Skip the confetti.** "You've reset your password," not "Awesome, you've reset your password!" Leave out emoji, even in emails and social posts.

**Describe what the feature does instead of praising it.** "Loads in under a second," not "powerful," "seamless," or "robust."

**If a sentence could caption a stock photo** of people in an office, rewrite it.

**Let readers decide whether a task is easy.** "A simple bar chart" is fine. "Setup is easy," "just click," and "simply run" aren't.

## Prefer everyday words to database terms

Prefer words people know from spreadsheet apps, like "summarize" and "filter," to database terms. Use jargon when it's the correct term and it clarifies.

| Write                              | Not                          | Exception                                                                                               |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| people, companies, the next person | users                        | The admin concept: user account, user group, the API. Always "user attributes" and "user provisioning." |
| can't, don't                       | cannot, do not               | Quoted errors, code, config values.                                                                     |
| use                                | utilize, leverage            |                                                                                                         |
| summarize                          | aggregate                    | SQL and database terms, like "aggregation function."                                                    |
| see, take a look at                | reference (as a verb)        |                                                                                                         |
| and                                | &                            | Proper nouns.                                                                                           |
| Metabase shows a warning           | Metabase will show a warning | Things that happen later: "your trial will end."                                                        |

## Use Metabase's names for things

| Write                                                                                   | Not                                          | Exception                                                                   |
| --------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| SQL editor, SQL question, SQL query                                                     | native editor, native question, native query | Databases that don't use SQL, like MongoDB. UI labels and permission names. |
| row and column security                                                                 | sandboxing, data sandboxes                   | One mention as the former name.                                             |
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

## Punctuate and format the same way every time

**Use bold for anything a person clicks or sees labeled on the screen**: buttons, menu items, tabs, settings, option values. "Click the **Save** button," not "Click the `Save` button" or "Click the 'Save' button." Use code formatting for code, variables, parameters, and file paths. Use italics for emphasis, never all caps.

**List punctuation.** Start every item with a capital letter. In a list of terms, write "**Term**: Description." Put the colon outside the bold, and a period at the end, even if the description is a fragment. In other lists, if any item is a full sentence, every item ends with a period. If every item is a fragment, none gets a period.

**Put links on the words in the sentence that name the destination**: "[Turn on caching](https://www.metabase.com/docs/latest/configuring-metabase/caching) for slow questions," not "Turn on caching for slow questions. See [Caching](https://www.metabase.com/docs/latest/configuring-metabase/caching)." When a separate pointer reads better, any casual verb works: see, check out, take a look at. Never link "here."

**Every image gets alt text** that says what the image shows.

**Use American spelling and serial commas**, and keep list formatting consistent.

**Numbers**: Words for zero to nine, numerals for 10 and up: "three dashboards," "50 questions." Write "hundreds," not "100s." _Exception:_ versions, units, setting values, and anything the reader types: "Metabase 57," "5 GB," "set it to 2."

**Periods and commas go inside quotation marks**: call them "people," not "users." Question marks go inside only when they're part of the quote. _Exception:_ code and anything in code formatting.

**Em dashes**: Put a space on each side: "settings — everything in your Metabase."

**Version numbers**: "Metabase 57," not "v57," "version 57," or "Metabase 0.57." Write the full `v0.57.2` or `v1.57.2` only when a person types it, like a Docker tag.

## Make code examples pasteable

- **Shell prompts**: Leave out the `$` (so commands are easy to copy and paste).
- **Complete examples**: A query has its `FROM`, and a command has every flag it needs. People paste examples.
- **Placeholders**: Write secrets and IDs as `YOUR_API_KEY` and `YOUR_MODEL_ID`, not `<your-value>` or `{your-value}`, which people can mistake for syntax.
- **Example domains**: Use `metabase.example.com` for a Metabase, `example.com` for any other site, and `person@example.com` for an email.
- **SQL**: Uppercase keywords, `{{variable}}` with no spaces inside the braces, `[[ optional clause ]]` with spaces inside the brackets.
