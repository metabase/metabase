(ns metabase.api.metabot
  (:require
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.db.query :as mdb.query]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Card Collection Database Field FieldValues Table]]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.setting :refer [defsetting]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]
   [wkok.openai-clojure.api :as openai.api]
   ))

(defn normalize-name [s]
  (some-> s
          str/upper-case
          (str/replace #"\s+" "_")))

(set! *warn-on-reflection* true)

(defsetting is-metabot-enabled
  (deferred-tru "Is Metabot enabled?")
  :type :boolean
  :visibility :authenticated
  :default true)

(defsetting openai-api-key
  (deferred-tru "The OpenAI API Key.")
  :visibility :settings-manager)

(defsetting openai-organization
  (deferred-tru "The OpenAPI Organization ID.")
  :visibility :settings-manager)

(defn bot-directions [{:keys [engine]}]
  (format
   (str "You are a helpful assistant that writes SQL based on my input."
        "Don't explain your answer, just show me the SQL using '%s' as the dialect.")
   (name engine)))

(defn- column-types
  "Given a model, provide a set of statements about each column type and display name."
  [{model-name :name :keys [result_metadata]}]
  (map (fn [{:keys [display_name description]}]
         (format "The column '%s' in table '%s' is described as '%s'"
                 display_name
                 (normalize-name model-name)
                 description))
       result_metadata))

(defn- enumerated-values
  "Given a model, provide a set of statements about which values a column may take on."
  [{model-name :name :keys [result_metadata]}]
  (for [{:keys [display_name id]} result_metadata
        :let [{:keys [values]} (t2/select-one FieldValues :field_id id)]
        :when (seq values)]
    (format "The column named '%s' in the table '%s' has these potential values: %s."
            display_name
            (normalize-name model-name)
            (str/join ", " (map (partial format "'%s'") values)))))

(defn model-messages
  "Given a model, provide a set of statements about this model, including:
   - The model name (called a table)
   - The types in each column and column aliases
   - What types the column may take on, if low cardinality"
  [{model-name :name :keys [result_metadata] :as model}]
  (let [col-names (str/join ", " (map (comp (partial format "'%s'") :name) result_metadata))]
    (map
     (fn [s] {:role "assistant" :content s})
     (reduce
      into
      [(format "I have a table named '%s' with the following columns: %s." (normalize-name model-name) col-names)]
      [(column-types model)
       (enumerated-values model)]))))

(defn get-sql-from-bot [database model-assertions prompt]
  (let [resp (openai.api/create-chat-completion
              {:model    "gpt-3.5-turbo"
               ;; Just produce a single result
               :n        1
               :messages (conj
                          (into
                           [{:role "system" :content (bot-directions database)}]
                           model-assertions)
                          {:role "user" :content prompt})}
              {:api-key      (openai-api-key)
               :organization (openai-organization)})]
    (tap> {:openai-response resp})
    resp))

(defn extract-sql [bot-response]
  (let [[_pre sql _post] (str/split bot-response #"```(sql|SQL)?")]
    (when sql (mdb.query/format-sql sql))))

(defn bot-response->sql [resp]
  (some->> resp
           :choices
           first
           :message
           :content
           extract-sql))

(defn aliases [{:keys [dataset_query result_metadata]}]
  (let [alias-map (update-vals
                   (into {} (map (juxt :id :display_name) result_metadata))
                   (fn [v] (cond-> v
                             (str/includes? v " ")
                             normalize-name)))
        {:keys [query]} (let [driver (driver.u/database->driver (:database (qp/preprocess dataset_query)))]
                          (let [qp (qp.reducible/combine-middleware
                                    (vec qp/around-middleware)
                                    (fn [query _rff _context]
                                      (add/add-alias-info
                                       (#'qp/preprocess* query))))]
                            (qp dataset_query nil nil)))
        {:keys [fields]} query]
    (for [field fields
          :let [[_ id m] field
                alias (::add/desired-alias m)]]
      [alias (alias-map id)])))

(defn inner-query [{:keys [id] :as model}]
  (let [column-aliases (->> (aliases model)
                            (map (partial apply format "\"%s\" AS %s"))
                            (str/join ","))]
    (mdb.query/format-sql (format "SELECT %s FROM {{#%s}}" column-aliases id))))

(defn get-sql [{:keys [database_id] :as model} {:keys [question fake]}]
  (let [database (t2/select-one Database :id database_id)]
    (cond
      fake "SELECT * FROM ORDERS; -- THIS IS FAKE"
      (and (openai-api-key) (openai-organization)) (let [model-assertions (model-messages model)
                                                         resp             (get-sql-from-bot database model-assertions question)]
                                                     (tap> {:response resp})
                                                     (bot-response->sql resp))
      :else "Set MB_OPENAI_API_KEY and MB_OPENAI_ORGANIZATION env vars and relaunch!")))

(defn fix-model-reference [sql]
  (str/replace
   sql
   #"\{\s*\{\s*#\s*\d+\s*\}\s*\}\s*"
   (fn [match] (str/replace match #"\s*" ""))))

(defn generate-sql-from-prompt
  ([{model-name :name :keys [database_id] :as model} prompt fake]
   (let [inner-query (inner-query model)
         bot-sql     (get-sql model {:question prompt :fake fake})
         final-sql   (fix-model-reference (format "WITH %s AS (%s) %s"
                                                  (normalize-name model-name)
                                                  inner-query
                                                  bot-sql))
         _           (tap> {:bot-sql   bot-sql
                            :final-sql final-sql})
         response    {:dataset_query          {:database database_id
                                               :type     "native"
                                               :native   {:query final-sql}}
                      :display                :table
                      :visualization_settings {}}]
     (tap> response)
     response))
  ([model prompt] (generate-sql-from-prompt model prompt false)))

(defn card->column-names [{model-name :name :keys [id result_metadata] :as _model}]
  (format
   "Table '%s' has name '%s' and columns %s."
   id
   model-name
   (->> (map :display_name result_metadata)
        (map (partial format "'%s'"))
        (str/join ","))))

(defn find-best-model
  "Given a prompt, find the model in the db that might be the best fit "
  [{database-id :id :as _database} prompt]
  (let [models        (t2/select Card :database_id database-id :dataset true)
        model-options (str/join "," (map (fn [{:keys [id]}] (format "'%s'" id)) models))
        l1            (format "My table names are %s" model-options)
        descs         (map (fn [s] {:role "assistant" :content s}) (map card->column-names models))
        model-input   (conj
                       (into
                        [{:role "system" :content "You are a helpful assistant. Tell me which table in my database is the best fit for my question."}
                         {:role "assistant" :content l1}]
                        descs)
                       {:role "user" :content (format
                                               "Which table would be most appropriate if I am trying to '%s'"
                                               prompt)})
        _             (tap> {:find-best-model-input model-input})
        response      (openai.api/create-chat-completion
                       {:model    "gpt-3.5-turbo"
                        :n        1
                        :messages model-input}
                       {:api-key      (openai-api-key)
                        :organization (openai-organization)})
        message       (->> response :choices first :message :content)]
    (when-some [[[_ m]] (and message (re-seq #"'(\d+)'" message))]
      (let [best-model-id (parse-long m)]
        (some (fn [{model-id :id :as model}] (when (= model-id best-model-id) model)) models)))))

(comment
  (find-best-model
   (t2/select-one Database :id 1)
   "people")

  (find-best-model
   (t2/select-one Database :id 1)
   "Tell me the names of people born in July")

  (find-best-model
   (t2/select-one Database :id 1)
   "Tell me the names of people born in the fall")

  (let [prompt "If I know the state, price, and rating of an item, can you show me the average price and max rating per state?"
        model  (find-best-model
                (t2/select-one Database :id 1) prompt)]
    (generate-sql-from-prompt model prompt))

  (let [prompt "which of my people were born in September?"
        model  (find-best-model
                (t2/select-one Database :id 1) prompt)]
    (generate-sql-from-prompt model prompt))
  )

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model/:model-id"
  "Ask Metabot to generate a SQL query given a prompt about a given model."
  [model-id :as {{:keys [question fake] :as body} :body}]
  (tap> {:model-id model-id
         :request  body})
  (let [model (api/check-404 (t2/select-one Card :id model-id :dataset true))]
    (generate-sql-from-prompt model question fake)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/database/:database-id"
  "Ask Metabot to generate a SQL query given a prompt about a given database."
  [database-id :as {{:keys [question fake] :as body} :body}]
  (tap> {:database-id database-id
         :request     body})
  (let [{:as database} (api/check-404 (t2/select-one Database :id database-id))
        model (find-best-model database question)]
    (generate-sql-from-prompt model question fake)))

(api/define-routes)
