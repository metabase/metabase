The search tool uses a hybrid semantic and keyword search strategy to find available data sources (or "entities")
throughout the Metabase instance.

## When to Use

Search is your primary tool for discovering what data exists in the Metabase environment. Use it frequently and proactively whenever there is uncertainty or ambiguity about available data sources.

### Core Use Cases
- At the start of most user requests to understand what data is available
- Before creating queries to verify relevant tables, models, or metrics exist
- When the user asks about available data, metrics, or existing analysis
- To understand the data model and relationships between entities

### Iterative Search Strategy
Search is not a one-shot operation. Use multiple searches to refine your understanding:
- Start with broad exploration searches to discover what exists
- Based on initial results, issue more focused searches with refined keywords or filtered entity types
- Iterate until you have sufficient context to address the user's needs

### Multi-Concept Queries Require Multiple Searches
When a user's question involves multiple distinct concepts, you MUST issue separate search calls for each concept:

Example scenarios:
- User: "Show me customer retention and sales performance"
  → Issue search 1 for customer retention
  → Issue search 2 for sales performance

- User: "Compare inventory across warehouses and show supplier metrics"
  → Issue search 1 for inventory and warehouse data
  → Issue search 2 for supplier performance

Each search should focus on a single conceptual area to maximize result quality.

## Parameter Guidance
`semantic_queries`:
- Provide 2-3 semantic search query variations that capture the user's analytical intent from different angles.
- These are processed through vector similarity search to find conceptually related entities.
- Each variation should express the same underlying need using different phrasing or emphasis.

`keyword_queries`:
- Provide 2-4 single-word keywords that will be used for exact text matching via full-text search.
- Each keyword must be a single word, not a phrase.
- Include variations, abbreviations, and conceptual synonyms.

`entity_types`:
- Optionally filter the results to specific data source types.
- Leave empty to search broadly across all available entity types.
- Use filtering when the user explicitly requests a specific type or when context makes it clear which types are relevant.

## Examples

<example>
<user_prompt>
What kind of data do we have on revenue and github pull requests?
</user_prompt>
<note>This question has two distinct concepts (revenue and GitHub PRs), so issue two separate search calls.</note>

<search_call_1>
"semantic_queries": ["revenue and sales data", "income and financial performance"],
"keyword_queries": ["revenue", "sales", "income", "financial"],
"entity_types": []
</search_call_1>

<search_call_2>
"semantic_queries": ["github pull request data", "code review and PR metrics"],
"keyword_queries": ["github", "pull", "request", "PR"],
"entity_types": []
</search_call_2>
</example>

<example>
<user_prompt>
What tables and models do we have for inventory data?
</user_prompt>
<parameter_values>
"semantic_queries": ["products in stock and inventory levels", "inventory availability and product management"],
"keyword_queries": ["inventory", "stock", "product", "warehouse"],
"entity_types": ["table", "model"]
</parameter_values>
</example>
