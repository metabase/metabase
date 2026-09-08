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
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn current-timestamp-string :- :string
  "The application DB's own current timestamp, as a string, for app DB type `db-type`."
  ^String [db-type :- [:enum :h2 :mysql :postgres]]
  ;; for MySQL, cast(current_timestamp AS char); for H2 & Postgres, cast(current_timestamp AS text)
  (let [cast-form (h2x/cast (if (= db-type :mysql) :char :text) (h2x/current-datetime-honeysql-form db-type))]
    (:timestamp (t2/query-one {:select [[cast-form :timestamp]]}))))

;;; ------------------------------------------------ Liquibase ------------------------------------------------

(mu/defn changelog-by-id :- [:maybe :map]
  "The Liquibase changelog row with `changelog-id` in the app DB of type `db-type`, or nil."
  [db-type      :- [:enum :h2 :mysql :postgres]
   changelog-id :- :string]
  (let [table-name (case db-type
                     (:postgres :h2) "databasechangelog"
                     :mysql          "DATABASECHANGELOG")]
    (t2/query-one [(format "select * from %s where id = ?" table-name) changelog-id])))

(mu/defn changelog-ids :- [:sequential :string]
  "The ids among `changelog-ids` still present in the Liquibase changelog table `changelog-table-name`, read on
  `conn`."
  [conn                 :- :any
   changelog-table-name :- :string
   changelog-ids        :- [:seqable :string]]
  (map :id (t2/query conn (sql/format {:select [:id]
                                       :from   [(keyword changelog-table-name)]
                                       :where  [:in :id changelog-ids]}))))

;;; ------------------------------------------------ Settings ------------------------------------------------

(def ^:private unmigrated-settings-where
  [:and [:= :value_with_aad nil] [:not= :value nil] [:not= :value ""]])

(mu/defn setting-value :- [:maybe :string]
  "The legacy `value` of the setting row with `setting-key`, or nil."
  [setting-key :- :string]
  (t2/select-one-fn :value :setting :key setting-key))

(mu/defn settings :- [:sequential :map]
  "Every setting row, raw."
  []
  (t2/select :setting))

(mu/defn reducible-setting-values-with-aad
  "A reducible of the key and `value_with_aad` of every setting row that has one."
  []
  (t2/reducible-select [:setting :key :value_with_aad] {:where [:!= :value_with_aad nil]}))

(mu/defn unmigrated-settings? :- :boolean
  "Whether any setting row has a non-blank `value` but no `value_with_aad`."
  []
  (t2/exists? :setting {:where unmigrated-settings-where}))

(mu/defn unmigrated-settings :- [:sequential :map]
  "Every setting row with a non-blank `value` but no `value_with_aad`, locked for update."
  []
  (t2/select :setting {:where unmigrated-settings-where, :for :update}))

(mu/defn insert-setting! :- [:sequential :int]
  "Insert a setting row for `setting-key` holding `value` and `value-with-aad`, returning the number inserted (as a
  one-element sequence -- `t2/query` on an INSERT, unlike `t2/insert!`, does not unwrap it)."
  [setting-key    :- :string
   value          :- [:maybe :string]
   value-with-aad :- [:maybe :string]]
  (t2/query {:insert-into :setting
             :values      [{:key setting-key, :value value, :value_with_aad value-with-aad}]}))

(mu/defn update-setting-values! :- [:sequential :int]
  "Set the columns in `changes` -- `:value` and/or `:value_with_aad`, nil writing NULL -- of the setting row with
  `setting-key`, returning the number updated (as a one-element sequence -- `t2/query` on an UPDATE, unlike
  `t2/update!`, does not unwrap it)."
  [setting-key :- :string
   changes     :- [:map {:closed true}
                   [:value          {:optional true} [:maybe :string]]
                   [:value_with_aad {:optional true} [:maybe :string]]]]
  (t2/query {:update :setting
             :set    (select-keys changes [:value :value_with_aad])
             :where  [:= :key setting-key]}))

(mu/defn delete-setting! :- [:sequential :int]
  "Delete the setting row with `setting-key`, returning the number deleted (as a one-element sequence -- `t2/query`
  on a DELETE, unlike `t2/delete!`, does not unwrap it)."
  [setting-key :- :string]
  (t2/query {:delete-from :setting, :where [:= :key setting-key]}))

(mu/defn reducible-column-values
  "A reducible of the id and `column` value of every row of `table`."
  [table  :- :keyword
   column :- :keyword]
  (t2/reducible-select [table :id [column :value]]))

(mu/defn update-column-value! :- [:sequential :int]
  "Set `column` of the row of `table` with `id` to `value`, returning the number updated (as a one-element
  sequence -- `t2/query` on an UPDATE, unlike `t2/update!`, does not unwrap it)."
  [table  :- :keyword
   column :- :keyword
   id     :- ms/PositiveInt
   value  :- :any]
  (t2/query {:update table, :set {column value}, :where [:= :id id]}))

(mu/defn delete-query-cache! :- [:sequential :int]
  "Delete every cached query result, returning the number deleted (as a one-element sequence -- `t2/query` on a
  DELETE, unlike `t2/delete!`, does not unwrap it)."
  []
  (t2/query {:delete-from :query_cache}))
