# Tool: `search`

The search tool uses a hybrid semantic and keyword search strategy to find data sources that can be queried using natural language
(models, metrics, and tables) throughout the Metabase instance.

## When to Use

This search tool is specifically designed for discovering entities that can be queried through natural language queries. Use it when:
- Building natural language queries and need to find relevant data sources
- Looking for curated models or pre-defined metrics
- Exploring available data for conversational data analysis
- The user asks about available metrics, models, or raw tables for querying

### Core Use Cases
- Before creating natural language queries to verify relevant models, metrics, or tables exist
- When the user asks about available metrics or curated data models
- To understand what data can be queried conversationally
- When exploring analytical data sources (as opposed to pre-built visualizations)

### Iterative Search Strategy
Search is not a one-shot operation. Use multiple searches to refine your understanding:
- Start with broad exploration searches to discover what exists
- Based on initial results, issue more focused searches with refined keywords or filtered entity types
- Iterate until you have sufficient context to address the user's needs

### Multi-Concept Queries Require Multiple Searches
When a user's question involves multiple distinct concepts, you MUST issue separate search calls for each concept:

Example scenarios:
- User: "Show me revenue metrics and customer data"
  → Issue search 1 for revenue metrics
  → Issue search 2 for customer data

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
- Optionally filter the results to specific data source types (models, metrics, or tables).
- Leave empty to search across all queryable entity types.
- Use filtering when the user explicitly requests a specific type or when context makes it clear which types are relevant.

## Examples

<example>
<user_prompt>
What metrics do we have for sales performance?
</user_prompt>
<parameter_values>
"semantic_queries": ["sales performance metrics and KPIs", "revenue and sales tracking measures"],
"keyword_queries": ["sales", "revenue", "performance", "metric"],
"entity_types": ["metric"]
</parameter_values>
</example>

<example>
<user_prompt>
Find customer and order data for analysis
</user_prompt>
<note>This question has two distinct concepts (customers and orders), so issue two separate search calls.</note>

<search_call_1>
"semantic_queries": ["customer information and profiles", "client and user data"],
"keyword_queries": ["customer", "client", "user", "profile"],
"entity_types": []
</search_call_1>

<search_call_2>
"semantic_queries": ["order and purchase data", "transaction and sales records"],
"keyword_queries": ["order", "purchase", "transaction", "sales"],
"entity_types": []
</search_call_2>
</example>
