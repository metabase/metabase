(ns metabase.app-db.encryption
  (:require
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.string :as string]
   [toucan2.core :as t2])
  (:import
   (java.sql Blob)))

(set! *warn-on-reflection* true)

(defn- blob->bytes [^Blob b]
  (.getBytes ^Blob b 0 (.length ^Blob b)))

(defn- maybe-blob->bytes
  "Normalize a raw `secret.value` read to a byte array: some drivers return a JDBC `Blob`, others a byte array."
  [v]
  (cond-> v
    (instance? Blob v) blob->bytes))

;; All columns whose whole value is encrypted at rest (via `mi/transform-encrypted-json`, or the encrypted-text/EDN
;; transforms in explorations). The on-disk format is `encrypt(string)`, so rotating the key only requires decrypting
;; the raw value with the current key and re-encrypting the resulting string. We list raw table names (not models) so
;; this also works for enterprise models that aren't loaded in every edition.
(def ^:private encrypted-string-columns
  [[:metabase_database :details]
   [:metabase_database :settings]
   [:metabase_database :write_data_details]
   [:metabase_database :admin_details]
   [:core_user :settings]
   [:channel :details]
   [:api_key :key]
   [:auth_identity :credentials]
   [:exploration_query_result :chart_stats]
   [:exploration_query_result :metric_description]
   [:exploration_query_result :chart_description]
   [:report_card :public_uuid]
   [:report_dashboard :public_uuid]
   [:action :public_uuid]
   [:document :public_uuid]
   [:notification_recipient :details]
   [:pulse_channel :details]])

(def ^:private encrypted-bytes-columns
  "`^bytes` columns encrypted at rest via `mi/transform-secret-value` (a strict `maybe-decrypt-bytes` on read). Unlike
  the string/JSON columns above these hold raw bytes, so encryption and key rotation must decrypt-and-re-encrypt them as
  bytes. Any such column omitted here would keep whatever plaintext it held before a key was set, and the strict read
  would then reject it."
  [[:secret :value]
   [:stored_result :result_data]])

;; Older versions of dump-to-h2 and key rotation only processed `metabase_database.details` (plus settings and
;; secrets), skipping every other encrypted JSON column. A dump or rotation from such a version left the skipped
;; columns encrypted with the source instance's key, so on databases that have been through one they can hold values
;; the current (otherwise correct) key cannot decrypt. Only the columns listed here — the ones confirmed affected in
;; production — may be cleared when undecryptable; everything else still aborts, so that legitimately decryptable
;; data can never be cleared by mistake.
(def ^:private clearable-when-undecryptable
  #{[:core_user :settings]})

(def ^:private encryption-check-key "encryption-check")

(mu/defn encryption-check-status :- [:enum :valid :invalid :absent]
  "Whether the current MB_ENCRYPTION_SECRET_KEY is the right key for this database, according to the
  `encryption-check` sentinel setting -- a random UUID encrypted under the key, present if and only if the database is encrypted:

    :valid   - a key is set and the sentinel decrypts to a UUID with it, so the key is correct
    :invalid - the sentinel exists but does not decrypt (wrong or unset key, corruption)
    :absent  - no sentinel: a `setting` table that does not exist yet (before migrations on a fresh database), no
               row, or the plaintext \"unencrypted\" marker (inserted by the v53 migration, and written back when
               the database is decrypted) -- an explicit statement of the same thing a missing row means"
  []
  (let [raw (u/ignore-exceptions (t2/select-one-fn :value :setting :key encryption-check-key))]
    (cond
      (or (nil? raw) (= raw "unencrypted"))
      :absent

      (and (encryption/default-encryption-enabled?)
           (u/ignore-exceptions (string/valid-uuid? (encryption/maybe-decrypt raw))))
      :valid

      :else
      :invalid)))

(defn- column-exists?
  "Whether `table`.`column` exists in the connection's own catalog and schema, per JDBC metadata (a same-named table
  in another schema of the database must not count). Identifiers are matched as stored and upper-cased, since H2
  upper-cases unquoted names."
  [table column]
  (t2/with-connection [^java.sql.Connection conn]
    (let [metadata (.getMetaData conn)
          catalog  (.getCatalog conn)
          schema   (.getSchema conn)]
      (boolean (some (fn [[t c]]
                       (with-open [rs (.getColumns metadata catalog schema t c)]
                         (.next rs)))
                     [[(name table) (name column)]
                      [(u/upper-case-en (name table)) (u/upper-case-en (name column))]])))))

(mu/defn- column-sample-value
  "One non-null value of `table`.`column`, or nil when there is none. A table or column that does not exist yet (this
  runs before migrations, on a fresh or old database) counts as empty; any other failure to read it propagates, since
  answering \"empty\" wrongly could mark an unencrypted database as encrypted."
  [table :- :keyword
   column :- :keyword]
  (try
    (:value (t2/query-one {:select [[column :value]], :from [table], :where [:is-not column nil], :limit 1}))
    (catch Exception e
      (if (column-exists? table column)
        (throw e)
        nil))))

(mu/defn encrypted-content-status :- [:enum :none :decryptable :not-decryptable]
  "Whether the encrypted-at-rest columns hold content, and whether that content was encrypted under the current key,
  judged from one sampled value per column (the single rows a NOT NULL probe would touch -- never a full scan):

    :none            - no encrypted-at-rest column holds any value: a database that has never held such content
    :decryptable     - every sampled value decrypts with the current key, which only a database encrypted under
                       exactly this key can produce
    :not-decryptable - some sampled value does not decrypt: plaintext waiting for `enable-encryption`, ciphertext
                       under some other key, or a mix

  The `setting` table is not sampled: whether a given setting is encrypted at rest is decided per setting, so a
  single sampled value proves nothing about the database."
  []
  (let [sample  (fn [decryptable? [table column]]
                  (when-some [value (column-sample-value table column)]
                    (decryptable? value)))
        samples (into []
                      (remove nil?)
                      (concat (map (partial sample encryption/decryptable-string?) encrypted-string-columns)
                              (map (partial sample (comp encryption/decryptable-bytes? maybe-blob->bytes))
                                   encrypted-bytes-columns)))]
    (cond
      (empty? samples)       :none
      (every? true? samples) :decryptable
      :else                  :not-decryptable)))

(defn- replace-encryption-check!
  "Replace the `encryption-check` sentinel on `conn`: with a fresh UUID encrypted by `encrypt-fn`, or with the
  plaintext \"unencrypted\" marker when `encrypt-fn` is nil (the database is being decrypted)."
  [conn encrypt-fn]
  (t2/delete! :conn conn :setting :key encryption-check-key)
  (t2/insert! :conn conn :setting {:key   encryption-check-key
                                   :value (if encrypt-fn
                                            (encrypt-fn (str (random-uuid)))
                                            "unencrypted")}))

(defn write-encryption-check!
  "Record that the database is encrypted under the current MB_ENCRYPTION_SECRET_KEY by replacing the `encryption-check`
  sentinel with a fresh UUID encrypted under it. Only ever writes the sentinel -- never touches any other row."
  []
  (t2/with-transaction [conn]
    (replace-encryption-check! conn encryption/encrypt)))

(defn- reencrypt-encrypted-column!
  "Re-encrypt `column` for every row in `table` using `encrypt-str-fn`. See `encrypted-string-columns`. Streams the
  rows so a large column does not have to be held in memory all at once.

  When `clear-undecryptable?` is true, a value that cannot be decrypted with the current key is reset to an empty
  JSON object (with a warning) instead of aborting. Only pass true when the current key is known to be correct for
  this database (see `encryption-check-status`) and the column can legitimately hold values written with some other
  key (see `clearable-when-undecryptable`): such values are equally unreadable at runtime, so clearing them loses
  nothing that was usable."
  [conn table column encrypt-str-fn clear-undecryptable?]
  (run! (fn [{:keys [id value]}]
          (when (some? value)
            (let [decrypted (try
                              (encryption/maybe-decrypt-accepting-plaintext value)
                              (catch Throwable e
                                (if clear-undecryptable?
                                  (do
                                    (log/warnf "Can't decrypt %s.%s for id %s with MB_ENCRYPTION_SECRET_KEY even though the key is correct for this database; resetting the value to {}. It was likely written with a different key and has been unreadable at runtime."
                                               (name table) (name column) id)
                                    "{}")
                                  (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY")
                                                  {:table table, :id id, :column column} e)))))]
              (t2/update! :conn conn table {:id id} {column (encrypt-str-fn decrypted)}))))
        (t2/reducible-select [table :id [column :value]])))

(defn- reencrypt-encrypted-bytes-column!
  "Re-encrypt a `^bytes` `column` for every row in `table` using `encrypt-bytes-fn`. See `encrypted-bytes-columns`.
  Streams the rows so a large column (e.g. `stored_result.result_data`) does not have to be held in memory all at
  once. A value that cannot be decrypted with the current key aborts rather than being re-encrypted: re-encrypting it
  would produce `encrypt_new(encrypt_old(x))`, permanently unrecoverable."
  [conn table column encrypt-bytes-fn]
  (run! (fn [{:keys [id value]}]
          (when (some? value)
            (let [decrypted (try
                              (encryption/maybe-decrypt-bytes-accepting-plaintext (maybe-blob->bytes value))
                              (catch Throwable e
                                (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY")
                                                {:table table, :id id, :column column} e))))]
              (t2/update! :conn conn table {:id id} {column (encrypt-bytes-fn decrypted)}))))
        (t2/reducible-select [table :id [column :value]])))

(defn- do-encryption
  "Encrypt or decrypts the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data.

  The passed make-encrypt-fn is used to generate the encryption/decryption function to use by passing versions of encryption/maybe-encrypt to it."
  [db-type data-source encrypting? make-encrypt-fn]
  (let [encrypt-str-fn (make-encrypt-fn encryption/maybe-encrypt)
        encrypt-bytes-fn (make-encrypt-fn encryption/maybe-encrypt-bytes)]
    (t2/with-transaction [conn {:datasource data-source}]
      (let [check-status (encryption-check-status)]
        (when (= check-status :invalid)
          (throw (ex-info (trs "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains")
                          {})))
        (doseq [[table column] encrypted-string-columns]
          (reencrypt-encrypted-column! conn table column encrypt-str-fn
                                       (and (= check-status :valid)
                                            (contains? clearable-when-undecryptable [table column])))))
      (doseq [[key value] (t2/select-fn->fn :key :value :model/Setting)]
        (case key
          "settings-last-updated" (let [current-timestamp-as-string-honeysql (h2x/cast (if (= db-type :mysql) :char :text)
                                                                                       (h2x/current-datetime-honeysql-form db-type))]
                                    (t2/update! :conn conn :setting {:key key} {:value current-timestamp-as-string-honeysql}))
          "encryption-check" nil
          (t2/update! :conn conn :setting
                      {:key key}
                      {:value (encrypt-str-fn value)})))
      (replace-encryption-check! conn (when encrypting? encrypt-str-fn))
      (doseq [[table column] encrypted-bytes-columns]
        (reencrypt-encrypted-bytes-column! conn table column encrypt-bytes-fn))
      (t2/delete! :conn conn :model/QueryCache))))

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data, and the passed `to-key` to re-encrypt.
  If passed to-key is nil, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value."
  [db-type data-source to-key]
  (when (and (not (nil? to-key)) (empty? to-key))
    (throw (ex-info "Cannot encrypt database with an empty key" {})))
  (when (and (nil? to-key) (not (encryption/default-encryption-enabled?)))
    (throw (ex-info "Cannot encrypt database: MB_ENCRYPTION_SECRET_KEY is not set" {})))
  (do-encryption db-type data-source true (fn [maybe-encrypt-fn]
                                            (if
                                             (nil? to-key) maybe-encrypt-fn
                                             (partial maybe-encrypt-fn (encryption/validate-and-hash-secret-key to-key))))))

(defn decrypt-db
  "Decrypts the database using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data"
  [db-type data-source]
  (do-encryption db-type data-source false (constantly identity)))
