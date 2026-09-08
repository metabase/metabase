(ns metabase.app-db.db
  "Application database queries for the app-db module's encryption and setting storage. Every function here is a direct
  Toucan 2 call with no additional logic, so no other namespace in the module runs a query itself -- except the custom
  migrations, which keep their own, frozen at the version they shipped in. Every write is a plain `t2/query` rather
  than a Toucan DML statement: the cloud-migration guard on Toucan DML reads `read-only-mode` through the Setting model
  first, and while rows are being re-encrypted a setting row can be plaintext under a key, or ciphertext under a key
  not yet in effect, which that model's strict read rejects."
  (:require
   [honey.sql :as sql]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn current-timestamp-string
  "The application DB's own current timestamp, as a string, for app DB type `db-type`."
  ^String [db-type]
  ;; for MySQL, cast(current_timestamp AS char); for H2 & Postgres, cast(current_timestamp AS text)
  (let [cast-form (h2x/cast (if (= db-type :mysql) :char :text) (h2x/current-datetime-honeysql-form db-type))]
    (:timestamp (t2/query-one {:select [[cast-form :timestamp]]}))))

;;; ------------------------------------------------ Liquibase ------------------------------------------------

(defn changelog-by-id
  "The Liquibase changelog row with `changelog-id` in the app DB of type `db-type`, or nil."
  [db-type changelog-id]
  (let [table-name (case db-type
                     (:postgres :h2) "databasechangelog"
                     :mysql          "DATABASECHANGELOG")]
    (t2/query-one [(format "select * from %s where id = ?" table-name) changelog-id])))

(defn changelog-ids
  "The ids among `changelog-ids` still present in the Liquibase changelog table `changelog-table-name`, read on
  `conn`."
  [conn changelog-table-name changelog-ids]
  (map :id (t2/query conn (sql/format {:select [:id]
                                       :from   [(keyword changelog-table-name)]
                                       :where  [:in :id changelog-ids]}))))

;;; ------------------------------------------------ Settings ------------------------------------------------

(def ^:private unmigrated-settings-where
  [:and [:= :value_with_aad nil] [:not= :value nil] [:not= :value ""]])

(defn setting-value
  "The legacy `value` of the setting row with `setting-key`, or nil."
  [setting-key]
  (t2/select-one-fn :value :setting :key setting-key))

(defn settings
  "Every setting row, raw."
  []
  (t2/select :setting))

(defn reducible-setting-values-with-aad
  "A reducible of the key and `value_with_aad` of every setting row that has one."
  []
  (t2/reducible-select [:setting :key :value_with_aad] {:where [:!= :value_with_aad nil]}))

(defn unmigrated-settings?
  "Whether any setting row has a non-blank `value` but no `value_with_aad`."
  []
  (t2/exists? :setting {:where unmigrated-settings-where}))

(defn unmigrated-settings
  "Every setting row with a non-blank `value` but no `value_with_aad`, locked for update."
  []
  (t2/select :setting {:where unmigrated-settings-where, :for :update}))

(defn insert-setting!
  "Insert a setting row for `setting-key` holding `value` and `value-with-aad`."
  [setting-key value value-with-aad]
  (t2/query {:insert-into :setting
             :values      [{:key setting-key, :value value, :value_with_aad value-with-aad}]}))

(defn update-setting-values!
  "Set the columns in `changes` -- `:value` and/or `:value_with_aad`, nil writing NULL -- of the setting row with
  `setting-key`."
  [setting-key changes]
  (t2/query {:update :setting
             :set    (select-keys changes [:value :value_with_aad])
             :where  [:= :key setting-key]}))

(defn delete-setting!
  "Delete the setting row with `setting-key`."
  [setting-key]
  (t2/query {:delete-from :setting, :where [:= :key setting-key]}))

(defn reducible-column-values
  "A reducible of the id and `column` value of every row of `table`."
  [table column]
  (t2/reducible-select [table :id [column :value]]))

(defn update-column-value!
  "Set `column` of the row of `table` with `id` to `value`."
  [table column id value]
  (t2/query {:update table, :set {column value}, :where [:= :id id]}))

(defn delete-query-cache!
  "Delete every cached query result."
  []
  (t2/query {:delete-from :query_cache}))
