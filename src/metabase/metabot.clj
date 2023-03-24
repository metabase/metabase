(ns metabase.metabot
  (:require
   [clojure.string :as str]
   [metabase.db.query :as mdb.query]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Card Collection Database Field FieldValues Table]]
   [metabase.models.setting :refer [defsetting]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]
   [wkok.openai-clojure.api :as openai.api]))

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

(defn- normalize-name
  "Normalize model and column names to SLUG_CASE.
  The current bot responses do a terrible job of creating all kinds of SQL from a table or column name.
  Example: 'Created At', CREATED_AT, \"created at\" might all come back in the response.
  Standardization of names produces dramatically better results."
  [s]
  (some-> s
          str/upper-case
          (str/replace #"\s+" "_")))


(defn- bot-directions
  "Prepare directions for the bot. The model is used to indirectly determine the
  db engine used so that we can suggest the desired return SQL dialect.
  This dialect suggestion may or may not be useful -- We'll see what we learn."
  [{database-id :database_id :as _model}]
  (let [engine (t2/select-one-fn :engine Database :id database-id)]
    (format
     (str "You are a helpful assistant that writes SQL based on my input."
          "Don't explain your answer, just show me the SQL using '%s' as the dialect.")
     (name engine))))

(defn- column-types
  "Given a model, provide a set of statements about each column type and display name."
  [{model-name :name :keys [result_metadata]}]
  (for [{:keys [display_name description]} result_metadata
        :when description]
    ;; TODO - Actually add some type info.
    (format "The column '%s' in table '%s' is described as '%s'"
            display_name
            (normalize-name model-name)
            description)))

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

(defn- model-messages
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

(defn- prepare-sql-generator-input
  "Given a model, prepare "
  [model prompt]
  (let [system-prompt    (bot-directions model)
        model-assertions (model-messages model)]
    (conj
     (into
      [{:role "system" :content system-prompt}]
      model-assertions)
     {:role "user" :content prompt})))

(defn get-sql-generation-response-from-bot
  "Call the bot and return the reponse.
  This will contain the raw response, which may or may not contain useful SQL."
  [model prompt]
  (let [resp (openai.api/create-chat-completion
              {:model    "gpt-3.5-turbo"
               ;; Just produce a single result
               :n        1
               :messages (prepare-sql-generator-input model prompt)}
              {:api-key      (openai-api-key)
               :organization (openai-organization)})]
    (tap> {:openai-response resp})
    resp))

(defn bot-response->sql
  "Given the raw response from the bot, extract just the sql.
  In the future, we may want to actually return the message content for debugging purposes."
  [resp]
  (letfn [(extract-sql
            [bot-response]
            (let [[_pre sql _post] (str/split bot-response #"```(sql|SQL)?")]
              (when sql (mdb.query/format-sql sql))))]
    (some->> resp :choices first :message :content extract-sql)))

(defn aliases
  "Create a seq of aliases to be used to make model columns more human friendly"
  [{:keys [dataset_query result_metadata]}]
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

(defn inner-query
  "Produce a SELECT * over the parameterized model with columns aliased to normalized display names.
  This will be used in a CTE such that the bot response can be called on this query."
  [{:keys [id] :as model}]
  (let [column-aliases (->> (aliases model)
                            (map (partial apply format "\"%s\" AS %s"))
                            (str/join ","))]
    (mdb.query/format-sql (format "SELECT %s FROM {{#%s}}" column-aliases id))))

(defn- get-sql
  "Given a model and a question, call the bot (if the fake key isn't true and the env is configured correctly)
  and return the parsed SQL."
  [model {:keys [question fake]}]
  (cond
    fake "SELECT * FROM ORDERS; -- THIS IS FAKE"
    (and (openai-api-key) (openai-organization)) (let [resp (get-sql-generation-response-from-bot model question)]
                                                   (bot-response->sql resp))
    :else "Set MB_OPENAI_API_KEY and MB_OPENAI_ORGANIZATION env vars and relaunch!"))

(defn- fix-model-reference
  "The formatter may expand the parameterized model (e.g. {{#123}} -> { { # 123 } }).
  This function fixes that."
  [sql]
  (str/replace
   sql
   #"\{\s*\{\s*#\s*\d+\s*\}\s*\}\s*"
   (fn [match] (str/replace match #"\s*" ""))))

(defn- bot-sql->final-sql
  "Produce the final query usable by the UI but converting the model to a CTE
  and calling the bot sql on top of it."
  [{model-name :name :as model} bot-sql]
  (let [inner-query    (inner-query model)
        model-with-cte (format
                        "WITH %s AS (%s) %s"
                        (normalize-name model-name)
                        inner-query
                        bot-sql)]
    (fix-model-reference model-with-cte)))

(defn generate-dataset-from-prompt
  "Given a model and prompt, attempt to generate a native dataset."
  ([{:keys [database_id] :as model} prompt fake]
   (when-some [bot-sql (get-sql model {:question prompt :fake fake})]
     (let [final-sql   (bot-sql->final-sql model bot-sql)
           response    {:dataset_query          {:database database_id
                                                 :type     "native"
                                                 :native   {:query final-sql}}
                        :display                :table
                        :visualization_settings {}}]
       (tap> {:bot-sql   bot-sql
              :final-sql final-sql
              :response  response})
       response)))
  ([model prompt] (generate-dataset-from-prompt model prompt false)))

(defn- card->column-names
  "Generate a string of the format 'Table named '%model-id%' has title '%model-name%' and columns 'a', 'b''
  Note that for model selection, we care about the model id, not the name.
  The name is only there for user search (e.g. \"show me data in the X table\" references the name,
  but we only care about returning the ID, which is trivial to regex out.
  The bot will assuredly munge your model name)."
  [{model-name :name :keys [id result_metadata] :as _model}]
  (format
   "Table named '%s' has title '%s' and columns %s."
   id
   model-name
   (->> (map :display_name result_metadata)
        (map (partial format "'%s'"))
        (str/join ","))))

(defn- prepare-model-finder-input
  "Given a seq of models, produce input to the bot for best model discovery.
  The goal is for the bot to return a message with the numeric model id in it.
  The actual model name is put in the data to cross-reference if the prompt references it,
  but we actually want the model id returned."
  [models prompt]
  (let [model-options (str/join "," (map (fn [{:keys [id]}] (format "'%s'" id)) models))
        descs         (map (fn [s] {:role "assistant" :content s}) (map card->column-names models))
        user-prompt   (format "Which table would be most appropriate if I am trying to '%s'" prompt)]
    (conj
     (into
      [{:role "system" :content "You are a helpful assistant. Tell me which table name is the best fit for my question."}
       {:role "assistant" :content (format "My table names are %s" model-options)}]
      descs)
     {:role "user" :content user-prompt})))

(defn- find-table-id [message candidates]
  (when message
    (let [discovered (map parse-long (re-seq #"\d+" message))]
      (first (filter candidates discovered)))))

(defn find-best-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  [{database-id :id :as _database} prompt]
  (let [models      (t2/select Card :database_id database-id :dataset true)
        model-input (prepare-model-finder-input models prompt)
        response    (openai.api/create-chat-completion
                     {:model    "gpt-3.5-turbo"
                      :n        1
                      :messages model-input}
                     {:api-key      (openai-api-key)
                      :organization (openai-organization)})
        message     (->> response :choices first :message :content)]
    (tap> {:find-best-model-input    model-input
           :find-best-model-response response})
    (let [best-model-id (find-table-id message (set (map :id models)))]
      (some (fn [{model-id :id :as model}] (when (= model-id best-model-id) model)) models))))


(comment
  ;; Show how to feed data into the sql generator bot
  (prepare-sql-generator-input
   (t2/select-one Card :id 1)
   "test")

  ;; If you know your model id, try this
  (generate-dataset-from-prompt
   (t2/select-one Card :id 1151)
   "show total sales per region, where regions are intermountain west, new england, and other states")

  ;; Show how we feed data into the model selector bot
  (prepare-model-finder-input
   (t2/select Card :database_id 1 :dataset true)
   "how many accounts have we had over time?")

  ;; Example of searching for the best model
  (find-best-model {:id 1} "how many accounts have we had over time?")
  )
