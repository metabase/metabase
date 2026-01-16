(ns metabase-enterprise.metabot-v3.tools.instructions
  "Instruction constants for LLM tool results.
   These guide the LLM on how to interpret and use tool outputs.
   Matches Python AI Service InstructionResultSchema patterns exactly.")

(def search-result-instructions
  "Instructions for LLM when processing search results."
  "Search results ranked by relevance (highest first).

When using results:
- Prioritize verified dashboards, questions, and metrics over raw data exploration
- Check available fields before recommending
- Reference results using the metabase protocol link format: [display name](metabase://type/id)
Examples: [Customer Metrics](metabase://metric/42), [Sales Dashboard](metabase://dashboard/158)")

(def entity-metadata-instructions
  "Instructions for LLM when processing entity metadata (tables, models, metrics)."
  "The data above contains the metadata for the requested tables, models, and metrics.
Metabot needs to:
- Use this metadata to understand the structure of the data
- Handle ambiguous field names by asking clarifying questions if necessary.
- Always check the actual field values before applying filters to avoid empty results.")

(def field-metadata-instructions
  "Instructions for LLM when processing field metadata with sample values."
  "The field values above are sample data (like df.sample(n).describe() in pandas) - a
statistical snapshot of a subset of rows, not the complete dataset.

Metabot needs to:
- Use these samples to understand FORMAT patterns: how values are structured (codes vs names,
  capitalization, date formats, numeric encodings)
- Understand that samples show rough ranges but not all possible values - the full dataset may
  contain data outside these ranges
- ALWAYS build queries even when the user's requested value is not in samples or outside sample
  ranges
- For categorical fields: Apply the observed format pattern (e.g., if samples show \"US\", \"DE\",
  \"FR\", use ISO code \"AT\" for Austria)
- For date/time fields: Apply the user's requested date even if it falls outside the sample date
  range
- For numeric fields: Apply the user's requested number even if it falls outside the sample
  numeric range
- For text fields: Search for the user's keywords/phrases even if not seen in sample text
- Disclose in your FINAL message to the user when you used values outside sample ranges or not in
  samples, noting that the full dataset may contain data the samples did not show
- Use statistics ONLY for query planning (e.g., percent_null indicates whether to handle NULLs,
  distinct_count suggests field cardinality), NEVER to answer the user's question directly")

(def query-created-instructions
  "Instructions for LLM after a query has been created."
  "Query created successfully.
To visualize results: use create_chart with the query_id
To show results to user: use show_results_to_user with the query_id")

(defn chart-created-instructions
  "Generate instructions for chart creation result."
  [chart-id]
  (str "Chart created successfully.\n"
       "Present link to user using: [Chart](metabase://chart/" chart-id ")\n"
       "Replace 'Chart' with a meaningful description of what the chart shows."))

(def answer-sources-instructions
  "Instructions for LLM when processing available answer sources (metrics and models)."
  "These are the available metrics and models for answering questions.
Use this information to understand what data sources are available.
Reference items using: [name](metabase://type/id)")

(def edit-sql-query-instructions
  "Instructions for LLM after editing an SQL query."
  "The updated query is shown in the result data above.

After you have edited the query, do a thorough analysis of the query to ensure it is correct and efficient.
If the query is correct, present the results to the user.")

(def show-results-instructions
  "Instructions for LLM after showing results to user."
  "Results have been shown to the user.
Continue the conversation based on the displayed data.")

(def dashboard-subscription-instructions
  "Instructions for LLM after creating a dashboard subscription."
  "Dashboard subscription created successfully.
The user will receive updates according to the schedule specified.")
