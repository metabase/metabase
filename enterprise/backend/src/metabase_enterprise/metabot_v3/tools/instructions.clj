(ns metabase-enterprise.metabot-v3.tools.instructions
  "Instruction constants for LLM tool results.
   These guide the LLM on how to interpret and use tool outputs.
   Matches Python AI Service InstructionResultSchema patterns.")

(def search-result-instructions
  "Search results ranked by relevance (highest first).

When using results:
- Prioritize verified dashboards, questions, and metrics over raw data exploration
- Check available fields before recommending
- Reference results using the metabase protocol link format: [display name](metabase://type/id)
Examples: [Customer Metrics](metabase://metric/42), [Sales Dashboard](metabase://dashboard/158)")

(def entity-metadata-instructions
  "Use this metadata to understand the structure of the data.
- Handle ambiguous field names by asking clarifying questions
- Check field values before applying filters using read_resource")

(def field-metadata-instructions
  "Field values above are sample data - a statistical snapshot.
- Use samples to understand FORMAT patterns
- Build queries even when requested value not in samples
- Disclose when using values outside sample ranges")

(def query-created-instructions
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
  "These are the available metrics and models for answering questions.
Use this information to understand what data sources are available.
Reference items using: [name](metabase://type/id)")
