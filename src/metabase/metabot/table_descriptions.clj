(ns metabase.metabot.table-descriptions
  "REPL utilities for generating and saving LLM-produced descriptions for database tables."
  (:require
   [clojure.string :as str]
   ^{:clj-kondo/ignore [:metabase/modules]} [metabase.llm.anthropic :as anthropic]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private system-prompt
  "You are a data analyst. Write concise, informative descriptions of database tables.
Respond with 2-3 sentences only — no preamble, no bullet points.")

(defn generate-description
  "Call the LLM to produce a short description of a table.
   Returns the description string.

   `opts` keys:
   - :schema      - database schema name (may be nil)
   - :table-name  - table name
   - :field-names - seq of column names"
  [{:keys [schema table-name field-names]}]
  (let [qualified-name (if (str/blank? schema)
                         table-name
                         (str schema "." table-name))
        user-message   (str "Table: " qualified-name "\n"
                            "Columns: " (str/join ", " field-names) "\n\n"
                            "Write a 2-3 sentence description of what this table likely contains "
                            "and how it might be used.")]
    (-> (anthropic/text-completion
         {:system   system-prompt
          :messages [{:role "user" :content user-message}]})
        :result)))

(defn generate-and-save-description!
  "Generate an LLM description for the table with `table-id` and overwrite its description."
  [table-id]
  (let [table       (t2/select-one :model/Table :id table-id)
        _           (when-not table
                      (throw (ex-info "Table not found" {:table-id table-id})))
        fields      (t2/select :model/Field
                               :table_id        table-id
                               :active          true
                               :visibility_type [:not= "retired"])
        field-names (map :name fields)
        description (generate-description {:schema     (:schema table)
                                           :table-name (:name table)
                                           :field-names field-names})]
    (t2/update! :model/Table table-id {:description description})
    description))

(defn generate-descriptions-for-database!
  "Generate and save LLM descriptions for all active tables in `db-id`."
  [db-id]
  (let [tables (t2/select :model/Table :db_id db-id :active true)]
    (mapv (fn [table]
            (let [desc (generate-and-save-description! (:id table))]
              {:id (:id table) :name (:name table) :description desc}))
          tables)))

(comment
  (generate-description {:schema "public" :table-name "orders" :field-names ["id" "user_id" "total" "created_at"]})

    ;; Generate + save for one table
  (generate-and-save-description! 42)

    ;; Bulk run for an entire database
  (generate-descriptions-for-database! 1))