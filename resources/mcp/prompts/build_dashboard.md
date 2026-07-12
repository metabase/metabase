Build a Metabase dashboard about: {{{topic}}}

Work in this order, and load the `dashboard` skill before you start editing.

1. **Find what exists.** `search` for questions, models, and metrics that already cover {{{topic}}}, and
   `browse_collection` to see where related content lives. Reuse a saved question rather than writing
   the same query again — an existing "Revenue by month" is the one people already trust.
2. **Fill the gaps.** For anything missing, inspect the tables with `browse_data`, write the query with
   `execute_query`, run it, and save it with `question_write` using the handle the run returned. Give
   each question a name someone could find by searching.
3. **Assemble.** One `dashboard_write` call: `method: "create"`, a name, {{{collection}}} as the save
   target, and an ordered `ops` list — headings for structure, `add_card` per question, autoplaced
   unless the user asked for a layout.
4. **Make it filterable.** Add the one or two parameters that matter (usually a date range), and
   `wire_parameter` with `autowire: true` so every compatible card follows them. A filter wired to
   nothing is worse than no filter.
5. **Report back** with the dashboard's name, where it was saved, what each card shows, and anything you
   chose to leave out.

Ask before creating content the request didn't call for.
