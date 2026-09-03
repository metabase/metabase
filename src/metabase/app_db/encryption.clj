(ns metabase.app-db.encryption
  "Encrypting, decrypting, and re-keying the application database at rest. Every write here is a plain `t2/query`
  rather than a Toucan DML statement: the cloud-migration guard on Toucan DML reads `read-only-mode` through the
  Setting model first, and while rows are being re-encrypted a setting row can be plaintext under a key, or ciphertext
  under a key not yet in effect, which that model's strict read rejects."
  (:require
   [metabase.app-db.query :as mdb.query]
   [metabase.app-db.setting :as mdb.setting]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
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
               the database is decrypted) -- an explicit statement of the same thing a missing row means

  Read raw, from the legacy `value` column: this runs before migrations, and `value` is the one column every version
  writes the sentinel to."
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
  therefore never read as `:decryptable`. The `setting` table is not counted: whether a setting's legacy `value` is
  encrypted at rest is decided per setting, and `value_with_aad` only decrypts under each row's own AAD."
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
  "Replace the `encryption-check` sentinel: with a fresh UUID encrypted by `encrypt-fn` -- and, in
  `value_with_aad`, by `encrypt-setting-fn`, a function of a string and the setting key -- or with the plaintext
  \"unencrypted\" marker in both columns when they are nil (the database is being decrypted). Written to
  `value_with_aad` and to the legacy `value` both, so that a version predating `value_with_aad` reads the same answer
  from the same database."
  [encrypt-fn encrypt-setting-fn]
  (let [sentinel (if encrypt-fn (str (random-uuid)) "unencrypted")]
    (t2/query {:delete-from :setting, :where [:= :key encryption-check-key]})
    (t2/query {:insert-into :setting
               :values      [{:key            encryption-check-key
                              :value          (cond-> sentinel encrypt-fn encrypt-fn)
                              :value_with_aad (cond-> sentinel encrypt-setting-fn (encrypt-setting-fn encryption-check-key))}]})))

(defn- encrypt-setting
  "A function of a string and a setting key that encrypts the string the way `setting.value_with_aad` holds it: under
  that setting's AAD, and under `secret-key` when given, the current MB_ENCRYPTION_SECRET_KEY otherwise."
  [secret-key]
  (fn [s setting-key]
    (encryption/maybe-encrypt s {:secret-key secret-key, :aad (mdb.setting/setting-aad setting-key)})))

(defn- write-encryption-check!
  "Record that the database is encrypted under the current MB_ENCRYPTION_SECRET_KEY by replacing the `encryption-check`
  sentinel with a fresh UUID encrypted under it. Only ever writes the sentinel -- never touches any other row."
  []
  (t2/with-transaction [_conn]
    (replace-encryption-check! encryption/encrypt (encrypt-setting nil))))

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
  [table column encrypt-str-fn clear-undecryptable?]
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
              (t2/query {:update table, :set {column (encrypt-str-fn decrypted)}, :where [:= :id id]}))))
        (t2/reducible-select [table :id [column :value]])))

(defn- reencrypt-encrypted-bytes-column!
  "Re-encrypt a `^bytes` `column` for every row in `table` using `encrypt-bytes-fn`. See `encrypted-bytes-columns`.
  Streams the rows so a large column (e.g. `stored_result.result_data`) does not have to be held in memory all at
  once. A value that cannot be decrypted with the current key aborts rather than being re-encrypted: re-encrypting it
  would produce `encrypt_new(encrypt_old(x))`, permanently unrecoverable."
  [table column encrypt-bytes-fn]
  (run! (fn [{:keys [id value]}]
          (when (some? value)
            (let [decrypted (try
                              (encryption/maybe-decrypt-bytes-accepting-plaintext (maybe-blob->bytes value))
                              (catch Throwable e
                                (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY")
                                                {:table table, :id id, :column column} e))))]
              (t2/query {:update table, :set {column (encrypt-bytes-fn decrypted)}, :where [:= :id id]}))))
        (t2/reducible-select [table :id [column :value]])))

(defn legacy-unencrypted-value?
  "Whether `value`, read from an encrypted-at-rest string column, is legacy plaintext: MB_ENCRYPTION_SECRET_KEY is set
  and `value` is a string that does not decrypt with it (under `opts`, e.g. `:aad`), so a previous version of Metabase
  must have stored it unencrypted."
  ([value]
   (legacy-unencrypted-value? value nil))
  ([value opts]
   (and (encryption/default-encryption-enabled?)
        (string? value)
        (not (encryption/decryptable-string? value opts)))))

(defn legacy-unencrypted-bytes?
  "[[legacy-unencrypted-value?]] for a `^bytes` column."
  [^bytes value]
  (and (encryption/default-encryption-enabled?)
       (some? value)
       (not (encryption/possibly-encrypted-bytes? value))))

(defn- handle-legacy-unencrypted-values!
  "What happens when `n` legacy values that a previous version of Metabase stored unencrypted are found in `where` (a
  `table.column` or a migration name), before they are encrypted: for now a warning."
  [where n]
  (log/warnf "Encrypting %d legacy value(s) in %s that a previous version of Metabase stored unencrypted." n where))

(defn encrypt-plaintext-columns!
  "Encrypt at rest any plaintext value in the encrypted-at-rest string columns. Runs on every startup: the one-shot
  encryption backfill migrations cannot be relied on to have done this -- run without MB_ENCRYPTION_SECRET_KEY (the
  `migrate` command does not check the key) they are recorded as executed while doing nothing, a boot of an older
  version re-writes these columns through its own plaintext-era transforms (e.g. notification seeding re-creates
  `notification_recipient.details` rows every boot), and `load-from-h2` copies a decrypted dump's values verbatim.
  A value that decrypts with the current key is left byte-identical; whether a value is encrypted is
  decided by [[encryption/decryptable-string?]] (actually decrypting), never by shape. The `^bytes` columns are not
  scanned: every shipped version writes those encrypted, so they cannot regress this way. No-op when
  MB_ENCRYPTION_SECRET_KEY is not set."
  []
  (when (encryption/default-encryption-enabled?)
    (t2/with-transaction [_conn]
      (doseq [[table column] encrypted-string-columns]
        (let [plaintext (filterv (comp legacy-unencrypted-value? :value)
                                 (t2/select [table :id [column :value]] {:where [:!= column nil]}))]
          (when (seq plaintext)
            (handle-legacy-unencrypted-values! (str (name table) "." (name column)) (count plaintext))
            (doseq [{:keys [id value]} plaintext]
              (t2/query {:update table, :set {column (encryption/encrypt value)}, :where [:= :id id]})))))
      ;; `setting.value_with_aad` is bound to its row, so it is checked and encrypted under each row's own AAD
      (let [encrypt-setting-fn (encrypt-setting nil)
            plaintext          (filterv (fn [{:keys [key value_with_aad]}]
                                          (legacy-unencrypted-value? value_with_aad
                                                                     {:aad (mdb.setting/setting-aad key)}))
                                        (t2/select [:setting :key :value_with_aad]
                                                   {:where [:!= :value_with_aad nil]}))]
        (when (seq plaintext)
          (handle-legacy-unencrypted-values! "setting.value_with_aad" (count plaintext))
          (doseq [{:keys [key value_with_aad]} plaintext]
            (t2/query {:update :setting
                       :set    {:value_with_aad (encrypt-setting-fn value_with_aad key)}
                       :where  [:= :key key]})))))))

(defn- do-encryption
  "Encrypt or decrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data.

  When `encrypting?`, every value is re-encrypted under `to-key` (already hashed), or under the current
  MB_ENCRYPTION_SECRET_KEY when that is nil; otherwise every value is written back decrypted."
  [db-type data-source encrypting? to-key]
  (let [encrypt-str-fn     (if encrypting? #(encryption/maybe-encrypt % {:secret-key to-key}) identity)
        encrypt-bytes-fn   (if encrypting? #(encryption/maybe-encrypt-bytes % {:secret-key to-key}) identity)
        encrypt-setting-fn (if encrypting? (encrypt-setting to-key) (fn [s _setting-key] s))]
    (t2/with-transaction [_conn {:datasource data-source}]
      (let [check-status (encryption-check-status)]
        (when (= check-status :invalid)
          (throw (ex-info (trs "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains")
                          {})))
        (doseq [[table column] encrypted-string-columns]
          (reencrypt-encrypted-column! table column encrypt-str-fn
                                       (and (= check-status :valid)
                                            (contains? clearable-when-undecryptable [table column])))))
      ;; Read the settings raw (via `:setting`, not `:model/Setting`) to bypass the model's strict decrypt-on-read:
      ;; a setting that is plaintext at rest while a key is configured (e.g. one newly designated encrypted but not yet
      ;; re-encrypted) is exactly what this operation exists to fix, so we decrypt it leniently here rather than reject
      ;; it. A value that looks encrypted but can't be decrypted with the current key still aborts.
      ;;
      ;; Both columns are re-encrypted: `value_with_aad` under each row's own AAD, and `value` because a version
      ;; predating that column reads it, so a rollback must not land on ciphertext under the old key.
      (doseq [{:keys [key value value_with_aad]} (t2/select :setting)]
        (case key
          "settings-last-updated" (let [now (mdb.query/current-timestamp-string db-type)]
                                    (t2/query {:update :setting
                                               :set    {:value          now
                                                        :value_with_aad (encrypt-setting-fn now key)}
                                               :where  [:= :key key]}))
          "encryption-check" nil
          (let [aad-opts {:aad (mdb.setting/setting-aad key)}
                changes  (cond-> {}
                           (seq value)          (assoc :value (encrypt-str-fn (encryption/maybe-decrypt-accepting-plaintext value)))
                           (seq value_with_aad) (assoc :value_with_aad (encrypt-setting-fn (encryption/maybe-decrypt-accepting-plaintext value_with_aad aad-opts) key)))]
            (when (seq changes)
              (t2/query {:update :setting, :set changes, :where [:= :key key]})))))
      (replace-encryption-check! (when encrypting? encrypt-str-fn) (when encrypting? encrypt-setting-fn))
      (doseq [[table column] encrypted-bytes-columns]
        (reencrypt-encrypted-bytes-column! table column encrypt-bytes-fn))
      (t2/query {:delete-from :query_cache}))))

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data, and the passed `to-key` to re-encrypt.
  If passed to-key is nil, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value."
  [db-type data-source to-key]
  (when (and (not (nil? to-key)) (empty? to-key))
    (throw (ex-info "Cannot encrypt database with an empty key" {})))
  (when (and (nil? to-key) (not (encryption/default-encryption-enabled?)))
    (throw (ex-info "Cannot encrypt database: MB_ENCRYPTION_SECRET_KEY is not set" {})))
  (do-encryption db-type data-source true (some-> to-key encryption/validate-and-hash-secret-key)))

(defn decrypt-db
  "Decrypts the database using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data"
  [db-type data-source]
  (do-encryption db-type data-source false nil))
