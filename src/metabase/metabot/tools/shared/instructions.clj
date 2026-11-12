(ns metabase.metabot.tools.shared.instructions
  "Instruction constants for LLM tool results.
   These guide the LLM on how to interpret and use tool outputs.
   Matches Python AI Service InstructionResultSchema patterns exactly.")

(def search-result-instructions
  "Instructions for LLM when processing search results."
  "Search results ranked by relevance (highest first).

When using results:
- Prioritize verified dashboards, questions, and metrics over raw data exploration when they match the user's request; treat models as a fallback
- Check available fields or metadata of promising results before recommending them to ensure they contain needed data
- **Be proactive with clear matches**: When the top result(s) have names or descriptions that clearly match the user's request, use them to achieve the users goal first, then list alternatives at the end. Don't ask for confirmation when there's an obvious best choice.
- **Collection metadata**: Results may include collection information (name, description, authority level) that can help you determine whether the result is relevant to the user's query. Use this context to assess relevance.
- **Save destinations**: Dashboard and document results include `can_write`. Only offer or use destinations where `can_write=true`; `can_write=false` means the user can view but cannot save there.
- **Present options for ambiguous results**: When search returns multiple plausible options without a clear best match, present them and ask the user to choose
- **Drill in via the `uri` attribute**: To inspect a result's details, pass its `uri` attribute to `read_resource` (append `/fields` for a table/model/question's columns). URIs always use the numeric `id` — never put a `portable_entity_id` in a URI; that value belongs only in `construct_notebook_query` query text (`source-card:` and metric/measure/segment references)
- Reference results using the metabase protocol link format: [display name](metabase://type/id)

Examples: [Customer Metrics](metabase://metric/42), [Sales Dashboard](metabase://dashboard/158)")

(def entity-metadata-instructions
  "Instructions for LLM when processing entity metadata (tables, models, metrics)."
  "The data above contains the metadata for the requested tables, models, and metrics.
The assistant needs to:
- Use this metadata to understand the structure of the data
- Handle ambiguous field names by asking clarifying questions if necessary.
- Always check the actual field values before applying filters to avoid empty results.")

(def field-metadata-instructions
  "Instructions for LLM when processing field metadata with sample values."
  "The field values above are sample data (like df.sample(n).describe() in pandas) - a
statistical snapshot of a subset of rows, not the complete dataset.

The assistant needs to:
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

(def not-saved-instruction
  "Tells the model that what it just built has no card, so that it does not claim a save."
  (str "- It is not saved. Do not bring this up unless the user asks about saving, "
       "or what they asked for needs it saved. "
       "Say that it is saved only after a tool result says so."))

(defn chart-created-instructions
  "Generate instructions for chart creation result."
  [chart-id]
  (str "Chart created successfully.\n"
       "Present link to user using: [Chart](metabase://chart/" chart-id ")\n"
       "Replace 'Chart' with a meaningful description of what the chart shows.\n"
       not-saved-instruction))

(def answer-sources-instructions
  "Instructions for LLM when processing available answer sources (metrics and models)."
  "These are the available metrics and models for answering questions.
Use this information to understand what data sources are available.
Reference items using: [name](metabase://type/id)")

(defn query-created-instructions-for
  "Generate instructions for a newly created SQL query, embedding the query ID
   in the link template. Matches Python CreateSQLQueryToolV2._create_result.
   With `results-readable?`, the model is told it can read the results with `run_query`."
  [query-id results-readable?]
  (str "The assistant needs to:\n"
       (if results-readable?
         "- Run the query with `run_query` when the answer needs a value from its results\n"
         "- Remember you cannot view the results directly yourself\n")
       "- Always provide a direct link using `[Link text](metabase://query/" query-id ")` "
       "so the user can open it themselves\n"
       not-saved-instruction "\n"
       "- Consider whether to create a chart or graph when that better matches the user's intent\n"
       "- Present the results in a way that matches the user's intent and follow up if they need clarification"))

(def query-loaded-in-editor-instructions
  "Instructions for a SQL query proposed in the user's open SQL editor buffer. The editor shows it as
   a suggested change the user accepts or rejects — it is not applied to the buffer until they accept."
  (str "The assistant needs to:\n"
       "- Remember you cannot view the results directly yourself\n"
       "- Tell the user the query is waiting in their SQL editor as a proposed change to accept or "
       "reject — do not offer a link, the query is already in front of them\n"
       "- Present what the query does in a way that matches the user's intent and follow up if they need clarification"))

(def client-query-shown-instruction
  "Added to the instructions for an edit of the user's own query that the model asked to hide, which is shown anyway."
  "This is the user's own query, so the change was shown to them although you passed `show_chart: false`.")

(def client-query-variant-instruction
  "Follows [[client-query-shown-instruction]] when run_query can read SQL results, to say how to read a variant."
  (str "To read a variant of their query without showing it, write the SQL with `create_sql_query` (pass "
       "`show_chart: false`) and run that query with `run_query`."))

(defn query-hidden-instructions-for
  "Instructions for a query, SQL or notebook, that the model asked not to show the user."
  [query-id]
  (str "The user has not been shown this query.\n"
       "- To read its values, call `run_query` with `query_id` `" query-id "`, then give the user the values in "
       "your answer.\n"
       "- If the user wants to open the query, link it using `[Link text](metabase://query/" query-id ")`.\n"
       not-saved-instruction))

(defn- delivery-instruction
  "The delivery line for an updated query, by how it reached the user.
   That is `:editor` when it is proposed in their open editor buffer for them to accept or reject.
   It is `:link` when it is handed back as a query they open themselves, and `:hidden` when it is not shown at all."
  [query-id delivery]
  (case delivery
    :editor (str "- The updated query is proposed in the user's SQL editor for them to accept or reject — "
                 "tell them it's waiting there, do not offer a link")
    :link   (str "- Always provide a direct link using: "
                 "`[Updated Query](metabase://query/" query-id ")` "
                 "where Updated Query is a meaningful link text\n"
                 not-saved-instruction)
    :hidden (query-hidden-instructions-for query-id)))

(defn edit-sql-query-instructions-for
  "Generate instructions for an edited SQL query.
   The `delivery` argument is how the result reached the user, as [[delivery-instruction]] takes it."
  [query-id delivery]
  (str "The updated query is shown in the result data above.\n\n"
       "After you have edited the query, do a thorough analysis of the query to find any potential errors.\n\n"
       "**If the returned SQL query is NOT correct:**\n\n"
       "- Make further refinements using this tool again\n\n"
       "**If the returned SQL query is correct:**\n\n"
       (delivery-instruction query-id delivery)))

(defn replace-sql-query-instructions-for
  "Generate instructions for a replaced SQL query.
   The `delivery` argument is how the result reached the user, as [[delivery-instruction]] takes it."
  [query-id delivery]
  (str "The updated query is shown in the result data above.\n\n"
       "After you have replaced the query, do a thorough analysis of the query to find any potential errors.\n\n"
       "**If the returned SQL query is NOT correct:**\n\n"
       "- Make further refinements using this tool or edit_sql_query again\n\n"
       "**If the returned SQL query is correct:**\n\n"
       (delivery-instruction query-id delivery)))

(def sql-dialect-checklist
  "Dialect differences to check after SQL syntax validation fails."
  (str
   "Common issues to check:\n"
   "- Dialect-specific function names (e.g., DATE_TRUNC vs TRUNC, ILIKE vs LIKE)\n"
   "- Quote style for identifiers (double quotes vs backticks vs square brackets)\n"
   "- String concatenation operators (|| vs + vs CONCAT)\n"
   "- Date/time literal syntax and formatting functions\n"
   "- NULL handling differences between dialects\n"
   "- Case sensitivity of identifiers\n"))

(defn sql-reference-warnings-instructions
  "Instructions that list possible bad table references in a constructed SQL query, or nil when there are none.

  When `repeated?`, this turn has already shown each of the warnings and the query is accepted, so the text asks the
  model to do nothing about them."
  [warnings repeated?]
  (when (seq warnings)
    (let [warning-list (apply str (map #(str "- " % "\n") warnings))]
      (if repeated?
        (str "The query was created and accepted, although checking its table references against the "
             "database metadata found possible problems that this turn has already reported:\n"
             warning-list)
        (str "The query was created, but checking its table references against the database metadata "
             "found possible problems:\n"
             warning-list
             "\n"
             "This check can report false positives. Verify each reference against the table metadata you "
             "have gathered, and fix any that are wrong. If the references are correct, keep the query: when you can "
             "only respond with tool calls, send the same complete SQL again to accept it (after an edit, as a full "
             "replacement of the query). If you are unsure, "
             "ask the user (with `ask_for_sql_clarification` when that tool is available).")))))

(defn with-sql-reference-warnings
  "`text` followed by [[sql-reference-warnings-instructions]] for the `:warnings` of `validation-result`, or `text`
  when there are none."
  [text {:keys [warnings repeated-warnings?] :as _validation-result}]
  (if-let [warnings-text (sql-reference-warnings-instructions warnings repeated-warnings?)]
    (str text "\n\n" warnings-text)
    text))
