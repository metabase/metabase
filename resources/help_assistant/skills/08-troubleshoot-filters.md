---
id: troubleshoot-filters
title: Filters that don't work
description: Dashboard or question filters show a text box instead of a dropdown, have missing, stale or wrong values, load slowly, can't be connected to a card, disappear, show an error (including HTTP 431 or 414 with many selected values), or return wrong results. Includes linked filters, locked parameters, SQL variables and filters on embedded dashboards.
references:
  - troubleshooting-guide/filters.md
  - troubleshooting-guide/linked-filters.md
  - dashboards/filters.md
  - dashboards/linked-filters.md
  - data-modeling/metadata/metadata-editing.md
  - databases/sync-scan.md
  - embedding/dashboard.md
  - questions/native-editor/sql-parameters.md
  - monitor/application-logs.md
  - configuring-metabase/environment-variables.md
---
This is a decision tree built from recent support tickets. Start at T1. Each node is one question to ask (ASK), one thing for the user to look at (CHECK), or an end point (EXIT). Skip any node the user has already answered.

Two rules for using it:
- The triage answers are clues, not gates. A clue moves the matching checks to the front of the branch. It never removes other checks. If the first checks don't find it, keep going down the branch.
- If the user says "I don't know", tell them in one line where to find the answer (usually Table Metadata, or the filter's settings in dashboard edit mode). If it's hard to find, skip that node and come back to it later.
- The labels (T1, A1, EXIT-A1 and so on) are only for you. Never show them to the user; describe the check in plain words instead, for example "So the Filtering setting isn't it."
- When you need to know how a card was built, ask whether it's a query builder question or a SQL question. Don't ask about tables or models.

## Triage

[T1] ASK: Is there an error message? If so, the exact text.
- "Request Header Fields Too Large", HTTP 431, or "URI Too Long", HTTP 414 → EXIT-E1
- "operator does not exist: character varying = boolean" → EXIT-E2
- Any other error → E1
- No error → T2

[T2] ASK: What do they see?
- A text or search box where they expected a dropdown → branch A
- Dropdown values are missing, out of date or wrong (including values that don't follow another filter) → branch B
- The dropdown is slow to load → branch C
- The filter won't connect to a card, a column is missing from the list, or the filter disappears → branch D (skip T3–T6)
- The filter doesn't apply, or the numbers look wrong → E1

[T3] ASK, always for branches A, B and C, even when the user didn't mention it: Does this happen in Metabase itself, or only in an embed? If it's embedded: which kind of embed (guest, legacy static, modular/SDK, full app, or public link). Only for guest or legacy static embeds, also ask which parameters are locked and which ones the token passes; other embed types don't have locked parameters. Ask this before any other check. It was a factor in more recent filter tickets than any other question.
- Only in the embed → "embed"
- If a guest or legacy static embed has locked parameters, also note "linked". A locked parameter narrows every other filter on the dashboard through the foreign keys in Table Metadata, including filters the user never linked.

[T4] ASK: Did anything change around when it started? Things like edits to the filter's mapping, model or data changes, a move to a new data source or instance, serialization or Remote Sync, or new foreign keys. And what have they already tried? Write down both. A recent change is the first thing to check. If something they tried only partly worked, note exactly how they did it, for example discarding cached values for one table rather than the whole database.

[T5] ASK: Where else does it work, and where doesn't it? Keep asking comparisons until one shows a difference, at most two: admins vs other users; this dashboard vs a copy or a one-card test dashboard; this database or environment vs another; one filter vs the other filters on the same dashboard. Clues:
- Works for admins only → "users"
- Works on a one-card test dashboard or a copy → "mapping"
- Works on another database, environment or instance → "env"
- Only some filters are affected → compare what's different about those columns: their table, their foreign keys, how many distinct values they have

[T6] ASK: Is the filter linked to another filter? → "linked"

## A. Text or search box instead of a dropdown

Check in this order, and put checks that match a clue or a recent change first:

[A1] CHECK: The column's Filtering setting in Table Metadata, on every column the filter is connected to, on every card and every tab. A SQL card can point at a same-named column in a different table, and two tables can share a column name.
- Any of them is "Search box" or "Plain input box" → EXIT-A1

[A2] If "linked": CHECK whether the parent's current selection leaves any values. Have them clear the parent and look again.
- It works with the parent cleared, and the parent's selection truly has no matching rows → EXIT-A2 (expected)

[A3] If "linked", "mapping" or "users", or the mapping changed recently: CHECK which column the filter is mapped to on each card. Look for three things. The filter maps to different columns or tables on different cards. A linked child is wired to a column with no foreign key path to the parent's column. The parent isn't wired to all the cards the child is wired to.
- Found → EXIT-A3

[A4] If "linked" (including locked parameters), or only some filters are affected: CHECK the foreign keys in Table Metadata on the tables between this filter's column and the linked or locked column. A table with two foreign keys that both lead to the locked or parent column, or an unexpected path through a long chain of joins, can leave the lookup with no values or narrow them more than expected.
- Found → EXIT-A4

[A5] If "users" or "embed": CHECK two things. First, where the filter's values come from (the filter's settings, under its selectable values). Second, whether the restricted group can read the table of every column the filter is mapped to. A SQL question as the values source doesn't work for viewers with row or column security. A column on a table the group can't read gives them a search box.
- Found → EXIT-A5

[A7] If "env": CHECK what differs between the two: the Filtering setting (a new instance or a new sync doesn't keep manual settings), and the database connection, including its name if content was moved with serialization or Remote Sync.

[A8] CHECK cached values: **Discard cached field values** on the field, then re-scan. If that doesn't fix it, or "env" or "embed" points at one database, discard the saved field values for the whole database (Admin, Databases).
- Fixed → EXIT-B2

[A9] CHECK: More than 1,000 distinct values → EXIT-A9 (expected)
- Nothing found → EXIT-LOG

## B. Values missing, out of date or wrong

[B1] CHECK: Where do the filter's values come from?
- A custom list → EXIT-B1. A custom list is fixed and won't follow linked filters or locked parameters.
- A SQL variable → check, in the SQL editor's variables sidebar, that the variable has a values source configured. If not → EXIT-B5.
- Another question or model → check that the question returns the expected values for this user.
- The connected column → B2

[B2] CHECK cached values: **Discard cached field values** on the field, then re-scan. Then, if needed, discard for the whole database.

Gotchas:
- A re-sync doesn't refresh dropdown values.
- Values for linked filters and for users with row-level security are cached separately, and the scheduled scan doesn't clear them. After changes like reassigning which user sees which rows, those values stay stale until they're discarded. → EXIT-B6 (expected)
- A value that's new for one tenant but already exists for another doesn't trigger a refresh.

[B3] If "linked", "mapping" or the values don't follow another filter: run A3 and A4. Wiring a child to an extra column with no relationship to the parent mixes unfiltered values into the list.

[B4] CHECK: More than 1,000 distinct values? Only the first 1,000 are cached, so the rest only turn up by searching. → EXIT-B3

[B5] Is the missing value NULL? NULL is never offered as a dropdown option. → EXIT-B4 (expected)
- Nothing found → EXIT-LOG

## C. Slow dropdown

[C1] CHECK: Is there a database index on the columns the values query uses? For a linked filter, that includes the parent's column. → EXIT-C1

[C2] If a guest or legacy static embed has locked parameters: CHECK how many tables the locked parameter is mapped to. The values query has to respect it, so each extra table makes the query heavier. → EXIT-C2

[C3] Many distinct values → set Filtering to "Search box". Still slow → EXIT-LOG. Linked filter lookups have had performance fixes in recent versions, so the upgrade question at the end of the general steps matters here.

## D. Can't connect, column missing, or filter disappears

[D1] ASK: Which one is it?
- The filter disappears when they leave edit mode → EXIT-D1
- A column is missing from the list → D2
- It won't connect to one card → D3

[D2] CHECK: The column's Visibility setting in Table Metadata. Anything other than "Everywhere" can hide it. If the column comes from a model or a synced copy, also check that its type metadata looks right, for example a text column that only offers "Is empty" and "Not empty". → EXIT-D2

[D3] ASK: What kind of column or card is it?
- A time grouping filter, and the card has a custom column added after Summarize → EXIT-D3 (expected)
- The filter type doesn't match the column or variable type. Examples: a text filter on a true/false custom column, or a SQL variable whose type doesn't match the filter. → EXIT-D4
- A linked filter on a custom column or a summary → EXIT-D5 (expected)
- A card that combines several questions → connect each one by hand

## E. Errors and wrong results

[E1] CHECK: Look up the exact error text in the docs. Then:
- Typed dates are read in the wrong order (day and month swapped) → EXIT-E3
- The numbers look wrong → compare the SQL Metabase generates in the working and failing cases. For example, changing the time grouping recalculates ratios over the whole period, which is expected.
- Filters aren't passed when someone clicks through from a dashboard in an SDK embed → EXIT-ESC

## Exits

- EXIT-A1: Set Filtering to "A list of all values" on each column that's set to something else, then use **Discard cached field values** and re-scan.
- EXIT-A2: Expected. A linked filter falls back to a text box when the parent selection leaves no values.
- EXIT-A3: Map the filter to the same column on every card. Wire the parent to every card the child uses, or unwire the child from columns with no relationship to the parent.
- EXIT-A4: Remove or correct the extra foreign key in Table Metadata so there's one clear path. Or don't lock that parameter, or use permissions instead of locked parameters.
- EXIT-A5: Use a query builder question, or the column itself, as the values source, and map the filter to a column the restricted group can read.
- EXIT-A9: Expected above 1,000 distinct values. "Search box" is the recommended setting.
- EXIT-B1: Switch the values source to the connected column if it needs to follow other filters.
- EXIT-B2: Done. If it keeps happening, check the scan schedule.
- EXIT-B3: Set Filtering to "Search box", or connect the filter to a column with fewer values.
- EXIT-B4: Expected. Workaround: a custom column that replaces NULL with a label like "Empty".
- EXIT-B5: Set up the variable's dropdown values in the variables sidebar (see the SQL parameters page).
- EXIT-B6: Expected. Discard cached field values on the table whenever the assignments change. This can be scripted with the API.
- EXIT-C1: Add an index on the columns the values query uses. Their database admin does this.
- EXIT-C2: Map the locked parameter through fewer tables, for example one key column the cards share.
- EXIT-D1: Expected. A filter that isn't connected to any card on the current tab isn't shown. Connect it to a card.
- EXIT-D2: Set Visibility to "Everywhere". If the type metadata is wrong, fix the column's type, or refresh the model's metadata where it was created.
- EXIT-D3: Expected. Workarounds: move the calculation into Summarize, move it before Summarize, or use SQL with a time grouping variable.
- EXIT-D4: Match the filter type to the column or variable type, for example a Boolean filter for a true/false column.
- EXIT-D5: Expected. Link on a database column instead, or create the column in the database or in a view.
- EXIT-E1: Too much filter state in the request. Self-hosted: increase MB_JETTY_REQUEST_HEADER_SIZE (default 8192), plus any limit on a proxy in front of Metabase. Metabase Cloud: support can raise it. Meanwhile, select fewer values or split the dashboard into tabs.
- EXIT-E2: A known bug in some version 63 releases when filtering a text column for "true" or "false". If it happens on this instance's version, treat it as a bug. Workaround: a SQL question.
- EXIT-E3: Pick the date from the calendar, or type it as YYYY-MM-DD.
- EXIT-LOG: The cause is still unknown. Only if "linked" (a linked filter, or locked parameters in a guest or legacy static embed), explain how to increase logging for linked filters (the application logs page has an example configuration). Those logs don't help with a filter that isn't linked, so skip them otherwise. Ask them to open the dashboard, filter the logs by "chain-filter", and paste the lines here. Read them yourself. For example, "Could not choose between multiple FKs for a chain filters join" means two foreign key paths lead to the linked column: go to the foreign key check (A4).
  If the log lines are a SQL query rather than an error:
  - Clean it up so it runs: unescape quotes and line breaks, and fill in any parameter placeholders with the values shown in the log. Give it back in a SQL code block.
  - Ask them to run it directly on their data warehouse (not through Metabase) and tell you whether it returns rows and how long it takes. No rows explains an empty dropdown. A slow run points to the slow dropdown checks (branch C).
  - Read it yourself: which tables it joins, and whether they match what the filter is mapped to. An unexpected table or a long chain of joins points to the mapping and foreign key checks (A3, A4). Check whether the linked or locked filter's condition is in the WHERE clause.
  - If they don't understand why the query looks the way it does or how Metabase built it, suggest they email the Success team at [help@metabase.com](mailto:help@metabase.com), and offer to draft the email with the query and what they found.
  Then go to the end of the general troubleshooting steps.
- EXIT-ESC: Likely a bug. Go to the end of the general troubleshooting steps.
