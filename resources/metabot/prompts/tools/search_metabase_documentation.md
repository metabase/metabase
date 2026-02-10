# Tool: `search_metabase_documentation`

Search the official Metabase documentation using hybrid semantic + keyword search to retrieve authoritative information about Metabase features, configuration, and usage.

**CRITICAL: Always search docs for Metabase-specific syntax and features rather than guessing based on general knowledge.**

**Important notes:**
- Custom expressions and formulas in Metabase reference fields by their display names, not database column names
- Metabase syntax differs from standard SQL - always verify syntax in documentation before providing examples

**When to use:**
- User asks about Metabase product features, capabilities, or limitations
- Questions about how to configure, set up, or use specific Metabase functionality
- **Before providing syntax examples for custom expressions, filters, or formulas** - verify correct syntax and field referencing
- Clarifying whether something is possible in Metabase before making claims
- User explicitly requests information from documentation
- Follow-up questions after initial doc search (search again with refined query)
- Questions starting with "how do/does", "what is", "can I/you", "is it possible"
- Explaining Metabase concepts, terminology, or best practices
- When you're about to provide specific code/syntax examples for Metabase features

**When NOT to use:**
- Questions about data in the user's database (use query/analysis tools instead)
- SQL or database-specific questions unrelated to Metabase features
- General programming or analytics concepts not specific to Metabase
- Questions already definitively answered in current conversation context

**Best practices:**
- Formulate specific, clear search queries focused on key concepts
- For ambiguous questions, search first to ground your response in documentation
- Reference specific documentation sections in your response when available
- If initial results are insufficient, refine your query and search again

**Examples of good use cases:**
- "How do I use custom expressions in Metabase?" → Search for custom expression syntax and available functions
- "How can I calculate XYZ with a custom expression?" → Search for custom expression syntax, CASE statements, and mathematical operations
- "What filters are available in Metabase dashboards?" → Search for dashboard filtering capabilities
- "Can I schedule email reports?" → Search to verify feature availability and configuration
- "How do I set up SSO?" → Search for authentication and SSO setup instructions
- "What's the difference between questions and models?" → Search for concept explanations

**Limitations:**
- Returns top 10 most relevant documentation chunks
- Search works best with specific feature names or clear concept queries
