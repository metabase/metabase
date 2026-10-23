(ns metabase.metabot.tools.prototype-filters
  "Prototype: the system-prompt context of the `:prototype_filters` profile (the natural-language filter box of the
  filter picker). It puts the details of the tables of the query into the prompt, so that the agent does not need
  `read_resource` calls to see the columns, their values, the segments and the AI context."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.agent-lib.representations.resolve :as repr.resolve]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.resources :as resources-tools]
   [metabase.metabot.tools.shared.content-store :as content-store]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private max-sample-values 30)

(defn- sample-values
  "The sample values of the columns of `table` that have them, as JSON lines. `table->xml` leaves them out."
  [{:keys [name fields]}]
  (str/join "\n" (for [{:keys [field_id display_name field_values]} fields
                       :when (seq field_values)]
                   (json/encode {:table    name
                                 :field_id field_id
                                 :column   display_name
                                 :values   (take max-sample-values field_values)}))))

(defn- table-xml [table-id]
  (try
    (resources-tools/check-table-resource-database table-id)
    (when-let [table (:structured-output
                      (entity-details/get-table-details {:entity-type          :table
                                                         :entity-id            table-id
                                                         :with-field-values?   true
                                                         :with-related-tables? true
                                                         :with-metrics?        false
                                                         :with-measures?       true
                                                         :with-segments?       true}))]
      (str (llm-shape/table->xml table)
           "\n\nSample values of the columns of " (:name table) " (complete for category columns):\n"
           (sample-values table)))
    (catch Throwable e
      (log/warnf e "Prototype filters: no details for Table %d" table-id)
      nil)))

(defn- ai-contexts
  "The AI context of the tables and their segments, as JSON lines."
  [table-ids]
  (let [rows (metabot.db/prototype-ai-contexts table-ids)]
    (str/join "\n" (for [{:keys [entity_type entity_local_id ai_context]} rows]
                     (json/encode {:entity_type entity_type
                                   :entity_id   entity_local_id
                                   :ai_context  ai_context})))))

(defn- source-table-ids
  "The ids of the source tables and the joined tables of `query`, in any MBQL version."
  [query]
  (into []
        (comp (filter map?)
              (keep #(or (:source-table %) (get % "source-table")))
              (filter pos-int?)
              (distinct))
        (tree-seq coll? seq query)))

(defn- query-table-ids [context]
  (->> (:user_is_viewing context)
       (mapcat (comp source-table-ids :query))
       distinct
       vec))

(defn query-tables-system-context
  "System-prompt template vars of the `:prototype_filters` profile: `:query_tables` (the details of each table of the
  viewed query) and `:ai_contexts`."
  [context]
  (let [table-ids (query-table-ids context)]
    {:query_tables (not-empty (str/join "\n\n" (keep table-xml table-ids)))
     :ai_contexts  (not-empty (ai-contexts table-ids))}))

;;; ------------------------------------------- direct filter builder -------------------------------------------
;;; The Metabot agent writes the whole query back in its tool call, and that is most of its time. This path asks the
;;; LLM for the new filter clauses only, and adds them to the query here.

(def ^:private response-schema
  {:type       "object"
   :properties {:terms   {:type        "array"
                          :description "First, each phrase of the request and what defines it, as `<phrase> -> <definition>`."
                          :items       {:type "string"}}
                :filters {:type        "array"
                          :description "The new filter clauses."
                          :items       {:type "array"}}
                :error   {:type        "string"
                          :description "Only when no filter is possible: one short sentence that says what is missing."}}
   :required   ["terms" "filters"]})

(def ^:private system-prompt
  "You are a filter builder for Metabase. The user is in the query builder with a query. The user describes, in
natural language, which rows they want. Return the filter clauses to add to the query.

# Rules

- Return only the new filters. The query keeps its existing filters, so do not repeat them.
- Add only what the user asked for. First split the request into its phrases (`terms`). Each filter must come from
  one phrase. Do not add filters for definitions that the request does not name, also when they look related.
- Keep the exact comparison of a definition: \"or more\" is `>=`, \"or lower\" is `<=`.
- A filter can use the columns of the source table, of the joined tables (with their `join-alias`) and of tables
  that a foreign key reaches (implicit joins, with `source-field`). When the request needs data that the query cannot
  reach, return no filters and an `error`.
- When the user gives an explicit value, use it. For example, \"signed up in the last 30 days\" means 30 days, also
  when a segment says 45 days.

# Use the definitions of this Metabase instance first

For each business term of the request, look for a definition in this order, and use the first that you find:

1. A segment of the source table (the `<segment>` elements below, and their AI context synonyms). Use
   `[\"segment\", {}, \"<portable_entity_id>\"]`.
2. A glossary term. Build the filter exactly as the definition says.
3. The AI context and the description of a table or a column.
4. Only when nothing defines the term, choose a reasonable filter.

A definition is only for its own term and the synonyms in its AI context. Do not use it for a different term that is
only similar: for example, \"EU\" is not \"EMEA\". When no definition has the term, look for a column that matches it.

For a category column, take the values from its sample values, with the same spelling and case.

# Clause syntax (MBQL 5)

Every clause is `[\"<op>\", {}, <args>...]` with an options map in position 1. A column is
`[\"field\", {}, <field_id>]`, with the numeric `field_id` from the tables below. A column of a joined table is
`[\"field\", {\"join-alias\": \"<alias>\"}, <field_id>]`. A column of a table that a foreign key reaches is
`[\"field\", {\"source-field\": <fk field_id>}, <field_id>]`.

Operators:
- `=`, `!=` with one or more values: `[\"=\", {}, <field>, \"a\", \"b\"]` means a OR b.
- `<`, `<=`, `>`, `>=`: `[\">=\", {}, <field>, 1000]`. `between`: `[\"between\", {}, <field>, 1, 5]`.
- `is-null`, `not-null`, `is-empty`, `not-empty`: `[\"is-null\", {}, <field>]`.
- `contains`, `does-not-contain`, `starts-with`, `ends-with`: `[\"contains\", {\"case-sensitive\": false}, <field>, \"abc\"]`.
- `time-interval` for relative dates: `[\"time-interval\", {}, <field>, -30, \"day\"]` (the last 30 days),
  `[\"time-interval\", {}, <field>, \"current\", \"month\"]`. Units: minute, hour, day, week, month, quarter, year.
  \"Not in the last 30 days\" (before that window) is
  `[\"<\", {}, <field>, [\"relative-datetime\", {}, -30, \"day\"]]`.
- Ages and other conditions relative to today use `relative-datetime`, not a fixed date. An adult (18 or older) is
  `[\"<=\", {}, <birth date field>, [\"relative-datetime\", {}, -18, \"year\"]]`: born 18 or more years ago.
- Absolute dates: `[\">=\", {}, <field>, \"2025-01-01\"]`, `[\"between\", {}, <field>, \"2025-01-01\", \"2025-03-31\"]`.
- `and`, `or`, `not`: `[\"or\", {}, <clause>, <clause>]`.

The query combines all its filters with AND. Write each condition as a separate filter, and put alternative values of
one column into one `=` clause. For example, \"on the Enterprise or Business plan with a lifetime value of $1,000 or
more\" is two filters: `[\"=\", {}, <plan>, \"Enterprise\", \"Business\"]` and `[\">=\", {}, <lifetime value>, 1000]`.
Use `or` only for alternatives on different columns, for example \"churned or suspended for a year\".
- `segment`: `[\"segment\", {}, \"<portable_entity_id>\"]`.

Example `filters` value: `[[\"=\", {}, [\"field\", {}, 12], \"Enterprise\", \"Business\"], [\">=\", {}, [\"field\", {}, 14], 1000]]`.")

(defn- glossary-text []
  (let [definitions (metabot.db/glossary-definitions :id 200)]
    (when (seq definitions)
      (str/join "\n" (for [[term definition] (sort-by key definitions)]
                       (str "- " term ": " definition))))))

(defn- user-message [exported-query table-ids message]
  (str "The query (portable MBQL 5; the filters go on its first stage):\n" (json/encode exported-query)
       "\n\n# The tables of the query\n\n" (str/join "\n\n" (keep table-xml table-ids))
       (when-let [glossary (glossary-text)]
         (str "\n\n# Glossary\n\n" glossary))
       (when-let [contexts (not-empty (ai-contexts table-ids))]
         (str "\n\n# AI context\n\nCurators wrote these instructions and synonyms. Follow them.\n\n" contexts))
       "\n\nToday is " (t/local-date) "."
       "\n\n# Request\n\n" message))

(defn- call-llm [user-content]
  (metabot.self/call-llm-structured
   ;; Prototype: the mini model is about twice as fast, and it is as correct when it lists the `terms` first.
   (metabot.settings/llm-mini-model)
   [{:role "system" :content system-prompt}
    {:role "user" :content user-content}]
   response-schema
   0
   1024
   ;; Prototype: "unknown", because the EE usage log rejects sources that it does not know.
   {:source              "unknown"
    :tag                 "prototype-nl-filters"
    :required-permission :permission/metabot-other-tools}))

(defn- portable-field-fk [mp field-id]
  (let [{:keys [table-id name]} (lib.metadata/field mp field-id)
        table                   (lib.metadata/table mp table-id)]
    [(:name (lib.metadata/database mp)) (:schema table) (:name table) name]))

(defn- portable-field-refs
  "The LLM writes columns with their numeric ids, because that is short. The repair pipeline wants portable FKs."
  [mp clause]
  (walk/postwalk (fn [x]
                   (if (and (vector? x) (= "field" (first x)) (int? (nth x 2 nil)))
                     (let [opts (second x)]
                       ["field"
                        (cond-> opts
                          (int? (get opts "source-field")) (update "source-field" #(portable-field-fk mp %)))
                        (portable-field-fk mp (nth x 2))])
                     x))
                 clause))

(defn- split-and
  "One filter for each part of a top-level `and`, so that each part gets its own filter pill."
  [clause]
  (if (and (vector? clause) (= "and" (first clause)))
    (mapcat split-and (drop 2 clause))
    [clause]))

(defn build-filters
  "Ask the LLM for the filters that `message` describes, and add them to the first stage of `query` (legacy or MBQL
  5). Returns `{:query <MBQL 5 query>}`, or `{:error \"...\"}` when the LLM adds no filters."
  [query message]
  (let [query     (walk/keywordize-keys query)
        mp        (lib-be/application-database-metadata-provider (:database query))
        exported  (repr.resolve/export-query mp (lib/query mp query) content-store/default-store)
        table-ids (source-table-ids query)
        content   (user-message exported table-ids message)
        attempt   (fn [content]
                    (let [{:keys [filters error]} (call-llm content)
                          clauses (into [] (comp (mapcat split-and) (map #(portable-field-refs mp %))) filters)]
                      (if (empty? clauses)
                        {:error (or error "Metabot did not find filters for this request.")}
                        (let [new-query (update-in exported ["stages" 0 "filters"] (fnil into []) clauses)]
                          {:query (get-in (construct/execute-representations-query
                                           (json/decode+kw (json/encode new-query)))
                                          [:structured-output :query])}))))]
    (try
      (attempt content)
      (catch clojure.lang.ExceptionInfo e
        ;; Prototype: one retry that shows the error to the LLM, like the agent loop does.
        (log/infof "Prototype filters: retry after %s" (ex-message e))
        (attempt (str content "\n\nYour previous filters failed with this error. Fix them.\n" (ex-message e)))))))
