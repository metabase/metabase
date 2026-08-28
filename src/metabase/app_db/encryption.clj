(ns metabase.app-db.encryption
  (:require
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
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

(defn encryption-check-status
  "Whether the current MB_ENCRYPTION_SECRET_KEY is the right key for this database, according to the
  `encryption-check` sentinel setting -- a random UUID encrypted under the key, present iff the database is encrypted:

    :valid   - a key is set and the sentinel decrypts to a UUID with it, so the key is correct
    :invalid - the sentinel exists but does not decrypt (wrong or unset key, tampering), or the database cannot be
               read at all (no `setting` table) -- not a normal state either way
    :absent  - no sentinel: the database is not encrypted (or predates the sentinel)"
  []
  (try
    (let [raw (t2/select-one-fn :value :setting :key encryption-check-key)]
      (cond
        (nil? raw)
        :absent

        (and (encryption/default-encryption-enabled?)
             (string/valid-uuid? (encryption/maybe-decrypt raw)))
        :valid

        :else
        :invalid))
    (catch Throwable e
      (log/warnf "Could not determine encryption status, treating as invalid: %s" (ex-message e))
      :invalid)))

(defn- column-exists?
  "Whether `table`.`column` exists, per JDBC metadata. Identifiers are matched as stored and upper-cased, since H2
  upper-cases unquoted names."
  [table column]
  (t2/with-connection [^java.sql.Connection conn]
    (let [metadata (.getMetaData conn)]
      (boolean (some (fn [[t c]]
                       (with-open [rs (.getColumns metadata nil nil t c)]
                         (.next rs)))
                     [[(name table) (name column)]
                      [(u/upper-case-en (name table)) (u/upper-case-en (name column))]])))))

(defn- column-has-values?
  "Whether `table`.`column` holds any non-null value. A table or column that does not exist yet (this runs before
  migrations, on a fresh or old database) counts as empty; any other failure to read it propagates, since answering
  \"empty\" wrongly would mark an unencrypted database as encrypted."
  [table column]
  (try
    (boolean (t2/query-one {:select [:id], :from [table], :where [:is-not column nil], :limit 1}))
    (catch Exception e
      (if (column-exists? table column)
        (throw e)
        false))))

(defn encrypted-content-exists?
  "Whether any encrypted-at-rest column holds a value at all. With MB_ENCRYPTION_SECRET_KEY set and no
  `encryption-check` sentinel, the database must be one that has never held such content (a fresh install); anything
  else -- plaintext waiting for `enable-encryption`, or an encrypted database whose sentinel was removed -- means the
  instance cannot be marked encrypted on its own. Settings are not counted: they are tolerated as plaintext at rest."
  []
  (boolean (some (fn [[table column]] (column-has-values? table column))
                 (concat encrypted-string-columns encrypted-bytes-columns))))

(defn- replace-encryption-check!
  "Replace the `encryption-check` sentinel on `conn`: with a fresh UUID encrypted by `encrypt-fn`, or with nothing when
  `encrypt-fn` is nil (the database is being decrypted)."
  [conn encrypt-fn]
  (t2/delete! :conn conn :setting :key encryption-check-key)
  (when encrypt-fn
    (t2/insert! :conn conn :setting {:key encryption-check-key, :value (encrypt-fn (str (random-uuid)))})))

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
      ;; Read the settings raw (via `:setting`, not `:model/Setting`) to bypass the model's strict decrypt-on-read:
      ;; a setting that is plaintext at rest while a key is configured (e.g. one newly designated encrypted but not yet
      ;; re-encrypted) is exactly what this operation exists to fix, so we decrypt it leniently here rather than reject
      ;; it. A value that looks encrypted but can't be decrypted with the current key still aborts.
      (doseq [[key value] (t2/select-fn->fn :key :value :setting)]
        (case key
          "settings-last-updated" (let [current-timestamp-as-string-honeysql (h2x/cast (if (= db-type :mysql) :char :text)
                                                                                       (h2x/current-datetime-honeysql-form db-type))]
                                    (t2/update! :conn conn :setting {:key key} {:value current-timestamp-as-string-honeysql}))
          "encryption-check" nil
          (t2/update! :conn conn :setting
                      {:key key}
                      {:value (encrypt-str-fn (encryption/maybe-decrypt-accepting-plaintext value))})))
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
