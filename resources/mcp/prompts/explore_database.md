Explore the Metabase database: {{{database}}}

Give me an orientation I can act on, not a schema dump.

1. **Map it.** `browse_data` — `list_databases` if you need to resolve {{{database}}} to an id, then
   `list_schemas` and `list_tables`. Note the tables that look like the core entities (the ones other
   tables point at) versus lookup and staging tables.
2. **Read the important tables.** `browse_data(action: "get_fields", table_ids: [...])` on the handful
   that matter. Say what each one is, its grain (one row per what?), and the foreign keys that connect
   it to the others. Use `response_format: "detailed"` where sample values would settle what a column
   actually holds.
3. **Check what's already built.** `search` and `browse_data(action: "list_models")` for the questions,
   models, and metrics people have saved on this database — the existing semantic layer is part of the
   answer, and it tells you which tables are actually used.
4. **Show it working.** Run one or two `execute_query` calls that answer an obvious question about the
   data, and report the numbers. A row count and a distribution are worth more than a paragraph.
5. **Summarize**: what this database is for, the tables worth knowing, the joins between them, what's
   already modeled, and the questions it can answer. Flag anything that looks stale, empty, or
   duplicated.

This is a read-only exploration. Don't save anything unless asked.
