# Tool: `search`

The search tool uses a hybrid semantic and keyword search strategy to find SQL-queryable data sources (tables and models)
throughout the Metabase instance.

## When to Use

This search tool is specifically designed for discovering tables and models that can be queried using SQL. Use it when:
- Building SQL queries and need to find relevant tables or models
- Exploring the data warehouse structure
- Looking for specific database tables or curated models
- The user asks about available data for SQL-based analysis

### Core Use Cases
- Before creating SQL queries to verify relevant tables or models exist
- When the user asks about available tables or data models
- To understand the database schema and relationships between tables and models
- When exploring what SQL-queryable data sources are available

### Iterative Search Strategy
Search is not a one-shot operation. Use multiple searches to refine your understanding:
- Start with broad exploration searches to discover what exists
- Based on initial results, issue more focused searches with refined keywords or filtered entity types
- Iterate until you have sufficient context to address the user's needs

### Multi-Concept Queries Require Multiple Searches
When a user's question involves multiple distinct concepts, you MUST issue separate search calls for each concept:

Example scenarios:
- User: "Show me customer data and product inventory tables"
  → Issue search 1 for customer data
  → Issue search 2 for product inventory

Each search should focus on a single conceptual area to maximize result quality.

## Parameter Guidance
`database_id`:
- The ID of the database you want to search. Use the ID of the database the user has selected in the SQL editor.

`semantic_queries`:
- Provide 2-3 semantic search query variations that capture the user's analytical intent from different angles.
- These are processed through vector similarity search to find conceptually related entities.
- Each variation should express the same underlying need using different phrasing or emphasis.

`keyword_queries`:
- Provide 2-4 single-word keywords that will be used for exact text matching via full-text search.
- Each keyword must be a single word, not a phrase.
- Include variations, abbreviations, and conceptual synonyms.

`entity_types`:
- Optionally filter the results to specific data source types (tables or models).
- Leave empty to search across both tables and models.
- Use filtering when the user explicitly requests a specific type or when context makes it clear which types are relevant.

## Examples

<context>
User is viewing the SQL editor with database id 123 selected.
</context>

<example>
<user_prompt>
What tables do we have for orders and customers?
</user_prompt>
<note>This question has two distinct concepts (orders and customers), so issue two separate search calls.</note>

<search_call_1>
"semantic_queries": ["order data and transactions", "purchase and sales orders"],
"keyword_queries": ["order", "orders", "purchase", "transaction"],
"database_id": 123,
"entity_types": ["table"]
</search_call_1>

<search_call_2>
"semantic_queries": ["customer information and profiles", "client and user data"],
"keyword_queries": ["customer", "client", "user", "account"],
"database_id": 123,
"entity_types": ["table"]
</search_call_2>
</example>

<example>
<user_prompt>
Find models related to revenue reporting
</user_prompt>
<parameter_values>
"semantic_queries": ["revenue reporting and financial metrics", "sales income and earnings analysis"],
"keyword_queries": ["revenue", "sales", "income", "financial"],
"database_id": 123,
"entity_types": ["model"]
</parameter_values>
</example>
