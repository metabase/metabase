Build a Metabase dashboard about: {{{topic}}}

Work in this order, and load the `dashboard` skill before you start building.

1. **Find what exists.** `search` for questions, models, and metrics that already cover {{{topic}}}, and
   `browse_collection` to see where related content lives. Reuse a saved question rather than writing
   the same query again — an existing "Revenue by month" is the one people already trust.
2. **Fill the gaps.** For anything missing, inspect the tables with `browse_data`, write and run the
   query with `execute_query`, and save it with `create_question`, passing the `query_handle` the run
   returned. Give each question a name someone could find by searching, and a `display` that suits its
   shape — load the `visualization` skill if the chart needs settings.
3. **Assemble.** One `create_dashboard` call: a name, {{{collection}}} as the save target, and
   `question_ids` listing every question in the order you want them laid out. Cards are positioned
   automatically. Adjust afterwards with `update_dashboard` if something wants to be wider or higher up.
4. **Report back** with the dashboard's name, where it was saved (read `collection_path` from the
   response), what each card shows, and anything you chose to leave out.

Dashboard filters and tabs can't be set from here. If {{{topic}}} needs them, build the dashboard, then
say what's left to add in Metabase — don't hard-code the constraint into every card instead.

Ask before creating content the request didn't call for.
