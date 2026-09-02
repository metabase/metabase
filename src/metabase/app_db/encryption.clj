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

(def ^:private boot-healed-columns
  "Encrypted-at-rest string columns whose legacy plaintext rows [[encrypt-plaintext-columns!]] converts on startup."
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

(def ^:private migration-converted-columns
  "Warehouse-derived columns, encrypted at rest since v64, whose legacy rows `EncryptDwhDerivedColumns` converts.
  Kept off the boot path: `result_metadata` is non-null on nearly every card, and the heal decrypts each row to
  decide. `metabase_field.fingerprint` and `metabase_fieldvalues` are not encrypted at all, being far too many rows
  to rewrite synchronously (see #80081)."
  [[:report_card :result_metadata]
   [:user_parameter_value :value]
   [:transform :last_checkpoint_value]])

;; All columns whose whole value is encrypted at rest (via `mi/transform-encrypted-json`, `mi/transform-encrypted`, or
;; the encrypted-text/EDN transforms in explorations). The on-disk format is `encrypt(string)`, so rotating the key
;; only requires decrypting the raw value with the current key and re-encrypting the resulting string. We list raw
;; table names (not models) so this also works for enterprise models that aren't loaded in every edition.
;; Split only by who converts legacy rows; every consumer but the boot heal wants all of them.
(def ^:private encrypted-string-columns
  (into boot-healed-columns migration-converted-columns))

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

(mu/defn- column-content-status :- [:enum :none :decryptable :not-decryptable]
  "Whether `table`.`column` holds no values, only values `decryptable?` accepts, or at least one value it does not.
  Streams the column and stops at the first value that does not decrypt. A table or column that does not exist yet
  (this runs before migrations, on a fresh or old database) counts as empty; any other failure to read it propagates,
  since answering \"empty\" wrongly could mark an unencrypted database as encrypted."
  [table        :- :keyword
   column       :- :keyword
   decryptable? :- fn?]
  (try
    (reduce (fn [acc {:keys [value]}]
              (cond
                (nil? value)         acc
                (decryptable? value) :decryptable
                :else                (reduced :not-decryptable)))
            :none
            (t2/reducible-select [table [column :value]]))
    (catch Exception e
      (if (column-exists? table column)
        (throw e)
        :none))))

(mu/defn- encrypted-content-status :- [:enum :none :decryptable :not-decryptable]
  "Whether the encrypted-at-rest columns hold content, and whether all of it was encrypted under the current key:

    :none            - no encrypted-at-rest column holds any value: a database that has never held such content
    :decryptable     - every value in every encrypted-at-rest column decrypts with the current key, which only a
                       database encrypted under exactly this key can produce
    :not-decryptable - some value does not decrypt: plaintext waiting for `enable-encryption`, ciphertext under some
                       other key, or a mix

  This only runs in the one-shot \"no sentinel but content exists\" state, so it can afford to stream every column
  fully (stopping at the first value that does not decrypt) rather than sampling; a partially encrypted column can
  therefore never read as `:decryptable`. The `setting` table is not counted: whether a given setting is encrypted at
  rest is decided per setting, so its values prove nothing about the database."
  []
  (reduce (fn [acc [table column decryptable?]]
            (case (column-content-status table column decryptable?)
              :not-decryptable (reduced :not-decryptable)
              :decryptable     :decryptable
              :none            acc))
          :none
          (concat (map #(conj % encryption/decryptable-string?) encrypted-string-columns)
                  (map #(conj % (comp encryption/decryptable-bytes? maybe-blob->bytes)) encrypted-bytes-columns))))

(defn- replace-encryption-check!
  "Replace the `encryption-check` sentinel on `conn`: with a fresh UUID encrypted by `encrypt-fn`, or with the
  plaintext \"unencrypted\" marker when `encrypt-fn` is nil (the database is being decrypted)."
  [conn encrypt-fn]
  (t2/delete! :conn conn :setting :key encryption-check-key)
  (t2/insert! :conn conn :setting {:key   encryption-check-key
                                   :value (if encrypt-fn
                                            (encrypt-fn (str (random-uuid)))
                                            "unencrypted")}))

(defn- write-encryption-check!
  "Record that the database is encrypted under the current MB_ENCRYPTION_SECRET_KEY by replacing the `encryption-check`
  sentinel with a fresh UUID encrypted under it. Only ever writes the sentinel -- never touches any other row."
  []
  (t2/with-transaction [conn]
    (replace-encryption-check! conn encryption/encrypt)))

(def ^:private EncryptionState
  [:enum :encrypted :unencrypted :fresh :pre-sentinel :missing-key :wrong-key :not-decryptable])

(mu/defn encryption-state :- EncryptionState
  "The encryption state of the database, judged from MB_ENCRYPTION_SECRET_KEY, the `encryption-check` sentinel
  setting (a random UUID encrypted under the key, present if and only if the database is encrypted, read and written
  raw rather than through `defsetting` -- see [[encryption-check-status]]), and the encrypted-at-rest content itself.
  Never throws:

    :encrypted     - the key is set and the sentinel decrypts with it
    :unencrypted   - no key and no sentinel
    :fresh         - the key is set, no sentinel, and the database has never held encrypted-at-rest content
    :pre-sentinel  - the key is set, no sentinel, and every encrypted-at-rest value already decrypts with the key --
                     a state only a database encrypted under exactly this key can produce, e.g. one from before the
                     sentinel existed
    :missing-key   - the sentinel is present but no key is set
    :wrong-key     - the key is set but the sentinel does not decrypt with it
    :not-decryptable - the key is set, no sentinel, and some content does not decrypt: plaintext waiting for
                     `enable-encryption`, ciphertext under some other key, or a mix"
  []
  (let [status (encryption-check-status)]
    (if-not (encryption/default-encryption-enabled?)
      (if (= status :absent) :unencrypted :missing-key)
      (case status
        :valid   :encrypted
        :invalid :wrong-key
        :absent  (case (encrypted-content-status)
                   :none            :fresh
                   :decryptable     :pre-sentinel
                   :not-decryptable :not-decryptable)))))

(mu/defn check-encryption :- :nil
  "Refuse to run with a `db-state` MB_ENCRYPTION_SECRET_KEY cannot work with. This runs before migrations, which
  encrypt whatever they write or backfill with the current key: none of these states may reach them -- in particular
  a wrong key would re-encrypt existing ciphertext, irreversibly.

  Startup never encrypts existing data: content the key does not decrypt (`:not-decryptable`) refuses to run, and the
  admin has to run `enable-encryption` deliberately (or fix the key). The strict reads rely on existing rows only
  ever being encrypted by that deliberate command."
  [db-state :- EncryptionState]
  (case db-state
    :encrypted
    (log/info "Database encrypted and MB_ENCRYPTION_SECRET_KEY correctly configured")

    :unencrypted
    (log/info "Database not encrypted and MB_ENCRYPTION_SECRET_KEY env variable not set.")

    (:fresh :pre-sentinel)
    nil

    :missing-key
    (throw (ex-info "Database is encrypted but the MB_ENCRYPTION_SECRET_KEY environment variable was NOT set" {}))

    :wrong-key
    (throw (ex-info (str "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY "
                         "environment contains")
                    {}))

    :not-decryptable
    (throw (ex-info (str "MB_ENCRYPTION_SECRET_KEY is set but the database is not marked as encrypted and already "
                         "contains data the key does not decrypt. If you have just added the key to an existing "
                         "instance, stop Metabase and run `enable-encryption` to encrypt the database. If this "
                         "database was already encrypted, it has been modified directly: do NOT run "
                         "`enable-encryption`; check the key or restore from a backup.")
                    {}))))

(mu/defn record-encryption-state!
  "Record post-migrations the state [[encryption-state]] found pre-migrations: for a `:fresh` or `:pre-sentinel`
  database (both provably encrypted under the current key, or holding nothing at all), replace the `encryption-check`
  sentinel with a fresh UUID encrypted under MB_ENCRYPTION_SECRET_KEY; every other state is already recorded
  correctly. Runs after migrations because on a fresh database the `setting` table does not exist before them. Only
  ever writes the sentinel, never another row."
  [db-state :- EncryptionState]
  (when (#{:fresh :pre-sentinel} db-state)
    (write-encryption-check!)
    (log/info (case db-state
                :fresh        "MB_ENCRYPTION_SECRET_KEY set on a new database. Marked database as encrypted."
                :pre-sentinel (str "MB_ENCRYPTION_SECRET_KEY decrypts the existing data but the database "
                                   "predates the encryption sentinel. Marked database as encrypted."))
              (u/emoji "✅"))))

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

(defn encrypt-value
  "Encrypt one already-serialized column value, leaving anything already encrypted alone so a re-run is a no-op.
  An empty string is left as-is: `maybe-encrypt` returns nil for it, which would null the column.

  Decrypts to decide, rather than matching on shape: `last_checkpoint_value` is a raw warehouse watermark, and one
  shaped like base64 (a hex digest, say) would otherwise be mistaken for ciphertext and left in the clear for good."
  [v]
  (if (or (empty? v) (encryption/decryptable-string? v))
    v
    (encryption/maybe-encrypt v)))

(defn rewrite-columns!
  "Apply `f` to every non-null value in `columns` (`[table column]` pairs), writing back only what it changed. Streams
  the rows rather than realizing a column at once, and writes per row, so the enclosing transaction is the only thing
  holding state."
  [columns f]
  (doseq [[table column] columns]
    (run! (fn [{:keys [id value]}]
            (let [v (f value)]
              (when (not= v value)
                (t2/query {:update table :set {column v} :where [:= :id id]}))))
          (t2/reducible-query {:select [:id [column :value]]
                               :from   [table]
                               :where  [:!= column nil]}))))

(defn encrypt-plaintext-columns!
  "Encrypt at rest any plaintext value in the encrypted-at-rest string columns. Runs on every startup: the one-shot
  encryption backfill migrations cannot be relied on to have done this -- run without MB_ENCRYPTION_SECRET_KEY (the
  `migrate` command does not check the key) they are recorded as executed while doing nothing, a boot of an older
  version re-writes these columns through its own plaintext-era transforms (e.g. notification seeding re-creates
  `notification_recipient.details` rows every boot), and `load-from-h2` copies a decrypted dump's values verbatim.
  A value that decrypts with the current key is left byte-identical; whether a value is encrypted is
  decided by [[encryption/decryptable-string?]] (actually decrypting), never by shape. The `^bytes` columns are not
  scanned: every shipped version writes those encrypted, so they cannot regress this way. No-op when
  MB_ENCRYPTION_SECRET_KEY is not set. Walks [[boot-healed-columns]], not every encrypted column: see
  [[migration-converted-columns]]."
  []
  (when (encryption/default-encryption-enabled?)
    (t2/with-transaction [conn]
      (doseq [[table column] boot-healed-columns]
        (run! (fn [{:keys [id value]}]
                (when (and (string? value)
                           (not (encryption/decryptable-string? value)))
                  (t2/update! :conn conn table {:id id} {column (encryption/encrypt value)})))
              (t2/reducible-select [table :id [column :value]] {:where [:!= column nil]}))))))

(defn- do-encryption
  "Encrypt or decrypts the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data.

  The passed make-encrypt-fn is used to generate the encryption/decryption function to use by passing versions of encryption/maybe-encrypt to it.
"
  [db-type data-source encrypting? make-encrypt-fn]
  (let [encrypt-str-fn (make-encrypt-fn encryption/maybe-encrypt)
        encrypt-bytes-fn (make-encrypt-fn encryption/maybe-encrypt-bytes)]
    (t2/with-transaction [conn {:datasource data-source}]
      (let [check-status (encryption-check-status)]
        (when (= check-status :invalid)
          (throw (ex-info (trs "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains")
                          {})))
        ;; every encrypted column, not just the boot-healed ones: a rotation that skipped one would leave it under
        ;; the old key, unreadable once that key is gone
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
