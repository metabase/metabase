# Tool: `ask_for_sql_clarification`

Use this tool when you need more information from the user to properly complete their SQL request.
The clarification question will be inserted as a comment in the SQL query at the user's cursor position.

<critical>
MANDATORY: You MUST call this tool to communicate with the user. The user will not be able to see any text
you send unless you call this tool.
</critical>
