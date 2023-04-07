(ns metabase.metabot.util
  "Functions for denormalizing input, prompt input generation, and sql handing.
  If this grows much, we might want to split these out into separate nses."
  (:require
   [cheshire.core :as json]
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.db.query :as mdb.query]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.models :refer [Card FieldValues]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn supported?
  "Is metabot supported for the given database."
  [db-id]
  (let [q "SELECT 1 FROM (SELECT 1 AS ONE) AS TEST"]
    (try
      (some?
       (qp/process-query {:database db-id
                          :type     "native"
                          :native   {:query q}}))
      (catch Exception _ false))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Input Denormalization ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn normalize-name
  "Normalize model and column names to SLUG_CASE.
  The current bot responses do a terrible job of creating all kinds of SQL from a table or column name.
  Example: 'Created At', CREATED_AT, \"created at\" might all come back in the response.
  Standardization of names produces dramatically better results."
  [s]
  (some-> s
          u/upper-case-en
          (str/replace #"[^\p{Alnum}]+" " ")
          str/trim
          (str/replace #" " "_")))

(defn- aliases
  "Create a seq of aliases to be used to make model columns more human friendly"
  [{:keys [dataset_query result_metadata]}]
  (let [alias-map (update-vals
                   (into {} (map (juxt :id :display_name) result_metadata))
                   (fn [v] (cond-> v
                             (str/includes? v " ")
                             normalize-name)))
        {:keys [query]} (let [qp (qp.reducible/combine-middleware
                                  (vec qp/around-middleware)
                                  (fn [query _rff _context]
                                    (add/add-alias-info
                                     (#'qp/preprocess* query))))]
                          (qp dataset_query nil nil))
        {:keys [fields]} query]
    (for [field fields
          :let [[_ id m] field
                alias (::add/desired-alias m)]]
      [alias (alias-map id)])))

(defn- fix-model-reference
  "The formatter may expand the parameterized model (e.g. {{#123}} -> { { # 123 } }).
  This function fixes that."
  [sql]
  (str/replace
   sql
   #"\{\s*\{\s*#\s*\d+\s*\}\s*\}"
   (fn [match] (str/replace match #"\s*" ""))))

(defn inner-query
  "Produce a SELECT * over the parameterized model with columns aliased to normalized display names.
  This can be used in a CTE such that an outer query can be called on this query."
  [{:keys [id] :as model}]
  (let [column-aliases (->> (aliases model)
                            (map (partial apply format "\"%s\" AS %s"))
                            (str/join ","))]
    (->> (format "SELECT %s FROM {{#%s}} AS INNER_QUERY" column-aliases id)
         mdb.query/format-sql
         fix-model-reference)))

(defn denormalize-field
  "Create a 'denormalized' version of the field which is optimized for querying
  and prompt engineering. Add in enumerated values (if a low-cardinality field),
  a sql-friendly name, and remove fields unused in prompt engineering."
  [{:keys [display_name id base_type] :as field}]
  (let [field-vals (when (not= :type/Boolean base_type)
                     (t2/select-one-fn :values FieldValues :field_id id))]
    (-> (cond-> field
          (seq field-vals)
          (assoc :possible_values (vec field-vals)))
        (assoc :sql_name (normalize-name display_name))
        (dissoc :field_ref :id))))

(defn- create-enum-ddl
  "Create the postgres enum for any item in result_metadata that has enumerated/low cardinality values."
  [{:keys [result_metadata]}]
  (into {}
        (for [{:keys [sql_name possible_values]} result_metadata
              :when (seq possible_values)]
          [sql_name
           (format "create type %s_t as enum %s;"
                   sql_name
                   (str/join ", " (map (partial format "'%s'") possible_values)))])))

(defn- create-table-ddl
  "Create an equivalent DDL for this model"
  [{:keys [sql_name result_metadata] :as model}]
  (let [enums (create-enum-ddl model)
        [ddl] (sql/format
               {:create-table sql_name
                :with-columns (for [{:keys [sql_name base_type]} result_metadata
                                    :let [k sql_name]]
                                [k (if (enums k)
                                     (format "%s_t" k)
                                     base_type)])}
               {:dialect :ansi})]
    (str/join "\n\n"
              (conj (vec (vals enums)) (mdb.query/format-sql ddl)))))

(defn- add-create-table-ddl [model]
  (assoc model :create_table_ddl (create-table-ddl model)))

(defn denormalize-model
  "Create a 'denormalized' version of the model which is optimized for querying.
  All foreign keys are resolved as data, sql-friendly names are added, and
  an inner_query is added that is a 'plain sql' query of the data
  (with sql friendly column names) that can be used to query this model."
  [{model-name :name :as model}]
  (-> model
      (update :result_metadata #(mapv denormalize-field %))
      (assoc :sql_name (normalize-name model-name))
      (assoc :inner_query (inner-query model))
      add-create-table-ddl
      (dissoc :creator_id :dataset_query :table_id :collection_position)))

(defn- models->json-summary
  "Convert a map of {:models ...} to a json string summary of these models.
  This is used as a summary of the database in prompt engineering."
  [{:keys [models]}]
  (json/generate-string
   {:tables
    (for [{model-name :name model-id :id :keys [result_metadata] :as _model} models]
      {:table-id     model-id
       :table-name   model-name
       :column-names (mapv :display_name result_metadata)})}
   {:pretty true}))

(defn- add-model-json-summary [database]
  (assoc database :model_json_summary (models->json-summary database)))

(defn denormalize-database
  "Create a 'denormalized' version of the database which is optimized for querying.
  Adds in denormalized models, sql-friendly names, and a json summary of the models
  appropriate for prompt engineering."
  [{database-name :name db_id :id :as database}]
  (let [models (t2/select Card :database_id db_id :dataset true)]
    (-> database
        (assoc :sql_name (normalize-name database-name))
        (assoc :models (mapv denormalize-model models))
        add-model-json-summary)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Prompt Input ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- prompt-template->messages
  "Given a prompt template and a context, fill the template messages in with
  the appropriate values to create the actual submitted messages."
  [{:keys [messages]} context]
  (letfn [(update-contents [s]
            (str/replace s #"%%([^%]+)%%"
                         (fn [[_ path]]
                           (let [kw (->> (str/split path #":")
                                         (mapv (comp keyword u/lower-case-en)))]
                             (or (get-in context kw)
                                 (let [message (format "No value found in context for key path '%s'" kw)]
                                   (throw (ex-info
                                           message
                                           {:message     message
                                            :status-code 400}))))))))]
    (map (fn [prompt] (update prompt :content update-contents)) messages)))

(def ^:private ^:dynamic *prompt-templates*
  "Return a map of prompt templates with keys of template type and values
  which are objects containing keys 'latest' (the latest template version)
   and 'templates' (all template versions)."
  (memoize/ttl
   (fn []
     (log/info "Refreshing metabot prompt templates.")
     (let [all-templates (-> (metabot-settings/metabot-get-prompt-templates-url)
                             slurp
                             (json/parse-string keyword))]
       (-> (group-by (comp keyword :prompt_template) all-templates)
           (update-vals
            (fn [templates]
              (let [ordered (vec (sort-by :version templates))]
                {:latest    (peek ordered)
                 :templates ordered}))))))
   ;; Check for updates every hour
   :ttl/threshold (* 1000 60 60)))

(defn create-prompt
  "Create a prompt by looking up the latest template for the prompt_task type
   of the context interpolating all values from the template. The returned
   value is the template object with the prompt contained in the ':prompt' key."
  [{:keys [prompt_task] :as context}]
  (if-some [{:keys [messages] :as template} (get-in (*prompt-templates*) [prompt_task :latest])]
    (assoc template
      :message_templates messages
      :messages (prompt-template->messages template context))
    (throw
     (ex-info
      (format "No prompt inference template found for prompt type: %s" prompt_task)
      {:prompt_type prompt_task}))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Results Processing ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn select-all?
  "Is this a simple SELECT * query?"
  [sql]
  (some? (re-find #"(?i)^select\s*\*" sql)))

(defn find-result
  "Given a set of choices returned from the bot, find the first one returned by
   the supplied message-fn."
  [message-fn {:keys [choices]}]
  (or
   (some
    (fn [{:keys [message]}]
      (when-some [res (message-fn (:content message))]
        res))
    choices)
   (log/infof
    "Unable to find appropriate result for user prompt in responses:\n\t%s"
    (str/join "\n\t" (map (fn [m] (get-in m [:message :content])) choices)))))

(defn extract-sql
  "Search a provided string for a SQL block"
  [s]
  (if (str/starts-with? (u/upper-case-en (str/trim s)) "SELECT")
    ;; This is just a raw SQL statement
    (mdb.query/format-sql s)
    ;; It looks like markdown
    (let [[_pre sql _post] (str/split s #"```(sql|SQL)?")]
      (mdb.query/format-sql sql))))

(defn bot-sql->final-sql
  "Produce the final query usable by the UI but converting the model to a CTE
  and calling the bot sql on top of it."
  [{:keys [inner_query sql_name] :as _denormalized-model} outer-query]
  (let [model-with-cte (format "WITH %s AS (%s) %s" sql_name inner_query outer-query)]
    (fix-model-reference model-with-cte)))

(defn response->viz
  "Given a response from the LLM, map this to visualization settings. Default to a table."
  [{:keys [display description visualization_settings]}]
  (let [display (keyword display)
        {:keys [x-axis y-axis]} visualization_settings]
    (case display
      (:line :bar :area :waterfall) {:display                display
                                     :name                   description
                                     :visualization_settings {:graph.dimensions [x-axis]
                                                              :graph.metrics    y-axis}}
      :scalar {:display                display
                 :name                   description
                 :visualization_settings {:graph.metrics    y-axis
                                          :graph.dimensions []}}
      {:display                :table
       :name                   description
       :visualization_settings {:title description}})))
