(ns metabase.app-db.db
  "Application database queries for the app-db module's encryption and setting storage. Every function here is a direct
  Toucan 2 call with no additional logic, so no other namespace in the module runs a query itself -- except the custom
  migrations, which keep their own, frozen at the version they shipped in. Every write is a plain `t2/query` rather
  than a Toucan DML statement: the cloud-migration guard on Toucan DML reads `read-only-mode` through the Setting model
  first, and while rows are being re-encrypted a setting row can be plaintext under a key, or ciphertext under a key
  not yet in effect, which that model's strict read rejects."
  (:require
   [honey.sql :as sql]
   [metabase.util.encryption.dek :as dek]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection Statement)))

(set! *warn-on-reflection* true)

(mu/defn current-timestamp-string
  "The application DB's own current timestamp, as a string, for app DB type `db-type`."
  ^String [db-type :- [:enum :h2 :mysql :postgres]]
  ;; for MySQL, cast(current_timestamp AS char); for H2 & Postgres, cast(current_timestamp AS text)
  (let [cast-form (h2x/cast (if (= db-type :mysql) :char :text) (h2x/current-datetime-honeysql-form db-type))]
    (:timestamp (t2/query-one {:select [[cast-form :timestamp]]}))))

;;; ------------------------------------------------ Liquibase ------------------------------------------------

(mu/defn changelog-by-id
  "The Liquibase changelog row with `changelog-id` in the app DB of type `db-type`, or nil."
  [db-type      :- [:enum :h2 :mysql :postgres]
   changelog-id :- :string]
  (let [table-name (case db-type
                     (:postgres :h2) "databasechangelog"
                     :mysql          "DATABASECHANGELOG")]
    (t2/query-one [(format "select * from %s where id = ?" table-name) changelog-id])))

(mu/defn changelog-ids
  "The ids among `changelog-ids` still present in the Liquibase changelog table `changelog-table-name`, read on
  `conn`."
  [conn                 :- (ms/InstanceOfClass java.sql.Connection)
   changelog-table-name :- :string
   changelog-ids        :- [:set :string]]
  (map :id (t2/query conn (sql/format {:select [:id]
                                       :from   [(keyword changelog-table-name)]
                                       :where  [:in :id changelog-ids]}))))

;;; ------------------------------------------------ Settings ------------------------------------------------

(def ^:private unmigrated-settings-where
  [:and [:= :value_with_aad nil] [:not= :value nil] [:not= :value ""]])

(mu/defn setting-value
  "The legacy `value` of the setting row with `setting-key`, or nil."
  [setting-key :- :string]
  (t2/select-one-fn :value :setting :key setting-key))

(mu/defn setting :- [:maybe :map]
  "The setting row with `setting-key`, raw, or nil."
  [setting-key :- :string]
  (t2/select-one :setting :key setting-key))

(mu/defn settings
  "Every setting row, raw."
  []
  (t2/select :setting))

(mu/defn reducible-setting-values-with-aad
  "A reducible of the key and `value_with_aad` of every setting row that has one."
  []
  (t2/reducible-select [:setting :key :value_with_aad] {:where [:!= :value_with_aad nil]}))

(mu/defn unmigrated-settings?
  "Whether any setting row has a non-blank `value` but no `value_with_aad`."
  []
  (t2/exists? :setting {:where unmigrated-settings-where}))

(mu/defn unmigrated-settings
  "Every setting row with a non-blank `value` but no `value_with_aad`, locked for update."
  []
  (t2/select :setting {:where unmigrated-settings-where, :for :update}))

(mu/defn insert-setting!
  "Insert a setting row for `setting-key` holding `value` and `value-with-aad`, returning the number inserted (as a
  one-element sequence -- `t2/query` on an INSERT, unlike `t2/insert!`, does not unwrap it)."
  [setting-key    :- :string
   value          :- [:maybe :string]
   value-with-aad :- [:maybe :string]]
  (t2/query {:insert-into :setting
             :values      [{:key setting-key, :value value, :value_with_aad value-with-aad}]}))

(mu/defn update-setting-values!
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

(mu/defn delete-setting!
  "Delete the setting row with `setting-key`, returning the number deleted (as a one-element sequence -- `t2/query`
  on a DELETE, unlike `t2/delete!`, does not unwrap it)."
  [setting-key :- :string]
  (t2/query {:delete-from :setting, :where [:= :key setting-key]}))

(mu/defn reducible-column-values
  "A reducible of the id and `column` value of every row of `table`."
  [table  :- :keyword
   column :- :keyword]
  (t2/reducible-select [table :id [column :value]]))

(mu/defn update-column-value!
  "Set `column` of the row of `table` with `id` to `value`, returning the number updated (as a one-element
  sequence -- `t2/query` on an UPDATE, unlike `t2/update!`, does not unwrap it)."
  [table  :- :keyword
   column :- :keyword
   id     :- ms/PositiveInt
   value  :- [:maybe [:or :string bytes?]]]
  (t2/query {:update table, :set {column value}, :where [:= :id id]}))

(mu/defn delete-query-cache!
  "Delete every cached query result, returning the number deleted (as a one-element sequence -- `t2/query` on a
  DELETE, unlike `t2/delete!`, does not unwrap it)."
  []
  (t2/query {:delete-from :query_cache}))

;;; ------------------------------------------ Data-encryption keys ------------------------------------------
;;;
;;; The `data_encryption_key` table holds one row per DEK generation of local envelope encryption (see
;;; `metabase.app-db.dek-store`). Wrapped key material is read as a byte array *during* result-set reduction: some
;;; drivers return it as a JDBC `Blob`, which cannot be read once its connection is back in the pool.

(mu/defn max-data-encryption-key-id :- [:maybe ms/PositiveInt]
  "The id of the newest DEK generation, or nil when there is none."
  []
  (t2/select-one-fn :id :data_encryption_key {:order-by [[:id :desc]], :limit 1}))

(mu/defn data-encryption-key-ids :- [:sequential ms/PositiveInt]
  "The id of every DEK generation, ascending."
  []
  (vec (t2/select-pks-vec :data_encryption_key {:order-by [[:id :asc]]})))

(mu/defn data-encryption-key-material :- [:maybe bytes?]
  "The wrapped key material of the DEK generation with `id`, or nil when there is no such generation."
  [id :- ms/PositiveInt]
  (t2/select-one-fn (comp dek/->bytes :key_material) :data_encryption_key :id id))

(mu/defn data-encryption-keys :- [:map-of ms/PositiveInt bytes?]
  "The wrapped key material of every DEK generation, by id."
  []
  (t2/select-fn->fn :id (comp dek/->bytes :key_material) :data_encryption_key))

(mu/defn insert-data-encryption-key! :- ms/PositiveInt
  "Insert a DEK generation holding wrapped `key-material`, returning its id. Plain JDBC rather than a Toucan insert,
  for the same reason as every other write here: a generation is minted by the first write in the v2 format, which can
  be a backfill running while a setting row is in a state the Setting model's strict read rejects."
  [key-material :- bytes?]
  (t2/with-connection [^Connection conn]
    (with-open [stmt (.prepareStatement conn
                                        "INSERT INTO data_encryption_key (key_material, created_at) VALUES (?, CURRENT_TIMESTAMP)"
                                        Statement/RETURN_GENERATED_KEYS)]
      (.setBytes stmt 1 key-material)
      (.executeUpdate stmt)
      (with-open [rs (.getGeneratedKeys stmt)]
        (when-not (.next rs)
          (throw (ex-info "Inserting a data-encryption key returned no generated id" {})))
        (.getLong rs 1)))))

(mu/defn update-data-encryption-key-material!
  "Replace the wrapped key material of the DEK generation with `id`, returning the number updated (as a one-element
  sequence -- `t2/query` on an UPDATE, unlike `t2/update!`, does not unwrap it)."
  [id           :- ms/PositiveInt
   key-material :- bytes?]
  (t2/query {:update :data_encryption_key, :set {:key_material key-material}, :where [:= :id id]}))

(mu/defn delete-data-encryption-keys!
  "Delete every DEK generation -- all but the one with `except-id`, when given -- returning the number deleted (as a
  one-element sequence -- `t2/query` on a DELETE, unlike `t2/delete!`, does not unwrap it)."
  ([]
   (t2/query {:delete-from :data_encryption_key}))
  ([except-id :- ms/PositiveInt]
   (t2/query {:delete-from :data_encryption_key, :where [:not= :id except-id]})))
