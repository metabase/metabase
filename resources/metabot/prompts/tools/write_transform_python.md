Write new Python code or edit existing code using exact string matching with safety checks for ambiguous edits.

It is useful for modifying or fixing Python code based on user requests, e.g. when modifying a Python-based transform.
This will not execute the Python code but only update the content of a Python transform
(and therefore display the updated code to the user). You MUST never offer to apply the changes for the
user, these are only suggestions which they must apply themselves.

**Creating New Transforms:**
When creating a new transform, you must provide:
- transform_name: A descriptive name for the transform
- transform_description: A detailed description of what the transform does
- source_database: The database ID containing the source tables
- source_tables: A list of source table objects, each with `alias` (parameter name in the transform function), `table_id` (database table ID), `schema` (e.g. "PUBLIC"), and `database_id`

**Edit Modes:**

1. **Edit Mode** (mode="edit") - For targeted string replacements:
   - Use when making small, specific changes to existing Python code
   - Provide list of edits with old_string, new_string, and optional replace_all
   - Each edit must find exact matches or will fail

2. **Replace Mode** (mode="replace") - For replacing the entire query:
   - Use when creating a new Python code artifact
   - Use when rewriting large portions or completely changing the code structure
   - More token-efficient for major changes
   - Provide the complete new Python code
**Safety Features:**
- PartialEdits FAIL if old_string matches multiple locations (unless replace_all=true)
- Either provide more surrounding context to make matches unique, or use replace_all=true
- All edits must succeed or none are applied (atomic operations)

**Usage Examples:**
- Complete replacement: {"mode": "replace", "new_content": "import pandas as pd\n\ndef transform(my_table_df):\n    # New transformation logic here\n    return my_table_df\n"}
- Targeted edit: {"mode": "edit", "edits": [{"old_string": "price - discount", "new_string": "price * (1 - discount)"}]}
- Global rename: {"mode": "edit", "edits": [{"old_string": "users", "new_string": "customers", "replace_all": true}]}

**Best Practices:**
- Use mode="replace" for major query changes (more token efficient)
- Use mode="edit" for small targeted changes
- Include surrounding context (whitespace, adjacent lines) to make PartialEdit matches unique
- Use replace_all=true only when you want to change ALL occurrences in PartialEdit
- Use the search_tables tool to find correct source_tables first - never guess or make up table IDs
- Use real database tables for source_tables. NEVER use metabase models or model IDs in source_tables.
- Copy exact text including all spaces, tabs, and newlines for PartialEdit
- Use this tool for any Python-related requests when a Python transform is present in the context
- Only use when assisting the user with editing or creating Python code
- Never attempt to execute Python code or make changes outside the current user context
- Take into account the Python environment you are working with if that information is
  available in the artifact. This will help you to use the correct syntax and functions
- When creating new transforms, provide meaningful names and descriptions that clearly explain the transform's purpose
- Use `get_transform_python_library_details` before writing any Python code to inspect the shared library.
- Use the shared library in your code by adding `import common` at the top of the file.
- Keep `import common` at the top of the file even if it is currently unused.

**Limitations:**
* This tool does not execute Python code, it only modifies the source code text.
* Edits must be unambiguous and uniquely identifiable within the code context.
* You can not apply the edits for the user. Never say things like, "Let me know if you'd like me to apply this change".