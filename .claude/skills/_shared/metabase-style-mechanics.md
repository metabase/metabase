# Metabase style mechanics

The details behind [the style guide](./metabase-style-guide.md).

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
