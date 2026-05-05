Write new SQL queries or edit existing queries using exact string matching with safety checks for ambiguous edits.

It is useful for modifying or fixing SQL queries, adding or changing clauses, or restructuring queries
based on user requests. This will not execute the SQL query but only update the content of a SQL artifact
(and therefore display the updated query to the user). You MUST never offer to apply the changes for the
user, these are only suggestions which they must apply themselves.

**Creating New Transforms:**
When creating a new transform, you must provide:
- transform_name: A descriptive name for the transform
- transform_description: A detailed description of what the transform does
- database_id: The database ID for the new transform

**Edit Modes:**

1. **Edit Mode** (mode="edit") - For targeted string replacements:
   - Use when making small, specific changes to existing SQL
   - Provide list of edits with old_string, new_string, and optional replace_all
   - Each edit must find exact matches or will fail

2. **Replace Mode** (mode="replace") - For replacing the entire query:
   - Use when creating a new query
   - Use when rewriting large portions or completely changing the query structure
   - More token-efficient for major changes
   - Provide the complete new SQL query

**Safety Features:**
- PartialEdits FAIL if old_string matches multiple locations (unless replace_all=true)
- Either provide more surrounding context to make matches unique, or use replace_all=true
- All edits must succeed or none are applied (atomic operations)

**Usage Examples:**
- Complete replacement: {"mode": "replace", "new_content": "SELECT * FROM users WHERE active = true"}
- Targeted edit: {"mode": "edit", "edits": [{"old_string": "SELECT *", "new_string": "SELECT id, name"}]}
- Global rename: {"mode": "edit", "edits": [{"old_string": "users", "new_string": "customers", "replace_all": true}]}

**Best Practices:**
- Use mode="replace" for major query changes (more token efficient)
- Use mode="edit" for small targeted changes
- Include surrounding context (whitespace, adjacent lines) to make PartialEdit matches unique
- Use replace_all=true only when you want to change ALL occurrences in PartialEdit
- Copy exact text including all spaces, tabs, and newlines for PartialEdit
- Use this tool for any SQL-related requests when a SQL artifact is present in the context
- Only use when assisting the user with editing or creating SQL queries
- Never attempt to execute SQL or make changes outside the current user context
- Take into account the SQL engine you are working with if that information is
  available in the artifact. This will help you to use the correct syntax and functions

- When querying Metabase models, remember that their fully qualified name is of the form `{{#model_id}}`,
  e.g. `SELECT * FROM {{#5}}`

**Limitations:**
* This tool does not execute SQL queries, it only modifies the query text.
* Edits must be unambiguous and uniquely identifiable within the query context.
* You can only query tables and Metabase models; Metabase metrics are not supported in SQL for now
* You can not apply the edits for the user. Never say things like, "Let me know if you'd like me to apply this change".