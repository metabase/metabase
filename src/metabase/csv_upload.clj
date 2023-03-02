(ns metabase.csv-upload
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.query-processor.writeback :as qp.writeback]))

;;; ------------------------------------------------ CREATE TABLE, add rows -------------------------------------------------
(def ^:private schema-type-mapping
  {:string [:varchar 255]
   :int    :int
   :float  :decimal})

(defn- databasify
  [identifier]
  (-> identifier
      (str/replace #"[^a-zA-z0-9_]" "_")
      (str/lower-case)
      (keyword)))

(defn- schema->column-spec
  [schema]
  ;; todo malli schema
  (map (fn [[column-name type]]
         [(databasify (name column-name)) (get schema-type-mapping (keyword type))])
       schema))

(defn create-sql-table!
  "Create a new table in the given database"
  [db-id name schema]
  ;; TODO check if actions enabled, etc.
  ;; TODO SQL dialect? Non-postgres Will break with :serial
  (let [sql (first (sql/format {:create-table (databasify name)
                                :with-columns
                                (conj (schema->column-spec schema)
                                      [:id :serial]
                                      [[:primary-key :id]])}))
        query {:type :native
               :database db-id
               :native {:query sql}}]
    (qp.writeback/execute-write-query! query)))

(defn add-rows!
  "Add the given rows (a map of two arrays: `:columns` and `:values`) to the table."
  [{:keys [name db_id] :as _table}
   {:keys [columns values]}]
  (let [[sql & params] (sql/format {:insert-into name
                                      :columns columns
                                      :values values})
        query          {:type :native
                        :database db_id
                        :native {:query sql
                                 :params params}}]
    (qp.writeback/execute-write-query! query)))
