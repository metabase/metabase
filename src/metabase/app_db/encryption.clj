(ns metabase.app-db.encryption
  "Encrypting, decrypting, and re-keying the application database at rest. Every write goes through
  [[metabase.app-db.db]] as a plain `t2/query` rather than a Toucan DML statement: the cloud-migration guard on Toucan
  DML reads `read-only-mode` through the Setting model first, and while rows are being re-encrypted a setting row can
  be plaintext under a key, or ciphertext under a key not yet in effect, which that model's strict read rejects.

  With envelope encryption (see [[metabase.util.encryption.dek]]) a value is encrypted under a data-encryption key
  (DEK) that lives, wrapped under MB_ENCRYPTION_SECRET_KEY (the KEK), in the `data_encryption_key` table. Rotating the
  key therefore rewraps those few rows, and the walk over the values only rewrites what is still in the legacy
  KEK-direct format."
  (:require
   [metabase.app-db.db :as mdb.db]
   [metabase.app-db.dek-store :as dek-store]
   [metabase.app-db.query :as mdb.query]
   [metabase.app-db.setting :as mdb.setting]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption.dek :as dek]
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

;; All columns whose whole value is encrypted at rest (via `mi/transform-encrypted-json`, or the encrypted-text/JSON
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
               row, or the plaintext \"unencrypted\" marker (written when the database is decrypted; a v53 changeset
               also inserts it on a new database and a v58 one deletes it again) -- an explicit statement of the same
               thing a missing row means

  Read raw, from the legacy `value` column: this runs before migrations, and `value` is the one column every version
  writes the sentinel to."
  []
  (let [raw (u/ignore-exceptions (mdb.db/setting-value encryption-check-key))]
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
            (mdb.db/reducible-column-values table column))
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
    (mdb.db/delete-setting! encryption-check-key)
    (mdb.db/insert-setting! encryption-check-key
                            (cond-> sentinel encrypt-fn encrypt-fn)
                            (cond-> sentinel encrypt-setting-fn (encrypt-setting-fn encryption-check-key)))))

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
    (do
      (log/info "Database encrypted and MB_ENCRYPTION_SECRET_KEY correctly configured")
      ;; which format the sentinel itself is in, as a cheap single-value indication of whether the database has moved
      ;; to the envelope format; the walks below count every value
      (log/infof "Encryption sentinel is in the %s format."
                 (if (encryption/v2-string? (u/ignore-exceptions (mdb.db/setting-value encryption-check-key)))
                   "v2 (envelope)"
                   "legacy")))

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

;;; ------------------------------------------- ciphertext format census -------------------------------------------
;;;
;;; The rotation, deep re-encryption and decryption walks count the ciphertext FORMAT of every value they visit (v2,
;;; legacy, or plaintext) in a `census` atom (a map of format to count) and log the totals at completion, so an
;;; operator can tell at a glance whether an instance has finished moving to the envelope format.

(defn- census-string!
  "Tally the format of a raw string value `v` into `census`."
  [census v]
  (swap! census update
         (cond (encryption/v2-string? v)                 :v2
               (encryption/possibly-encrypted-string? v) :legacy
               :else                                     :plaintext)
         (fnil inc 0)))

(defn- census-bytes!
  "Tally the format of a raw byte value `b` into `census`."
  [census b]
  (swap! census update
         (cond (encryption/v2-bytes? b)                 :v2
               (encryption/possibly-encrypted-bytes? b) :legacy
               :else                                    :plaintext)
         (fnil inc 0)))

(defn- log-format-census!
  "Log the totals tallied in `census` by the `walk` just completed."
  [walk census]
  (let [{:keys [v2 legacy plaintext] :or {v2 0, legacy 0, plaintext 0}} @census]
    (log/infof "Ciphertext format census for this %s walk: %d v2 (envelope), %d legacy, %d plaintext value(s)."
               walk v2 legacy plaintext)))

;;; ----------------------------------------------- value rewriting -----------------------------------------------
;;;
;;; `encrypt-str-fn` / `encrypt-bytes-fn` (re-)encrypt a value once it has been decrypted with the current key. When
;;; encrypting they go through `encryption/maybe-encrypt`, which writes the v2 envelope format whenever a DEK store is
;;; bound; when decrypting they are `identity`, leaving plaintext.
;;;
;;; `already-final?` lets a walk skip a value that is already in its final form. On a key rotation that is every v2
;;; value: it is encrypted under a DEK, not the key, so the key change is absorbed entirely by rewrapping the DEK
;;; table -- which is what makes a second rotation touch only that table.

(defn- reencrypt-encrypted-column!
  "Re-encrypt `column` for every row in `table` using `encrypt-str-fn`. See `encrypted-string-columns`. Streams the
  rows so a large column does not have to be held in memory all at once.

  When `clear-undecryptable?` is true, a value that cannot be decrypted with the current key is reset to an empty
  JSON object (with a warning) instead of aborting. Only pass true when the current key is known to be correct for
  this database (see `encryption-check-status`) and the column can legitimately hold values written with some other
  key (see `clearable-when-undecryptable`): such values are equally unreadable at runtime, so clearing them loses
  nothing that was usable.

  A value `already-final?` accepts is left untouched; every value's format is tallied in `census`."
  [census table column encrypt-str-fn clear-undecryptable? already-final?]
  (run! (fn [{:keys [id value]}]
          (when (some? value)
            (census-string! census value)
            (when-not (already-final? value)
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
                (mdb.db/update-column-value! table column id (encrypt-str-fn decrypted))))))
        (mdb.db/reducible-column-values table column)))

(defn- reencrypt-encrypted-bytes-column!
  "Re-encrypt a `^bytes` `column` for every row in `table` using `encrypt-bytes-fn`. See `encrypted-bytes-columns`.
  Streams the rows so a large column (e.g. `stored_result.result_data`) does not have to be held in memory all at
  once. A value that cannot be decrypted with the current key aborts rather than being re-encrypted: re-encrypting it
  would produce `encrypt_new(encrypt_old(x))`, permanently unrecoverable. A value `already-final?` accepts is left
  untouched; every value's format is tallied in `census`."
  [census table column encrypt-bytes-fn already-final?]
  (run! (fn [{:keys [id value]}]
          (when (some? value)
            (let [b (maybe-blob->bytes value)]
              (census-bytes! census b)
              (when-not (already-final? b)
                (let [decrypted (try
                                  (encryption/maybe-decrypt-bytes-accepting-plaintext b)
                                  (catch Throwable e
                                    (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY")
                                                    {:table table, :id id, :column column} e))))]
                  (mdb.db/update-column-value! table column id (encrypt-bytes-fn decrypted)))))))
        (mdb.db/reducible-column-values table column)))

(defn- legacy-unencrypted-string?
  "Whether `value`, read from an encrypted-at-rest string column, is legacy plaintext: MB_ENCRYPTION_SECRET_KEY is set
  and `value` is a string that does not decrypt with it (under `opts`, e.g. `:aad`), so a previous version of Metabase
  must have stored it unencrypted."
  ([value]
   (legacy-unencrypted-string? value nil))
  ([value opts]
   (and (encryption/default-encryption-enabled?)
        (string? value)
        (not (encryption/decryptable-string? value opts)))))

(defn legacy-startup-encryption-disabled?
  "Whether `MB_DISABLE_LEGACY_STARTUP_ENCRYPTION` is set to true. By default startup encrypts, with a warning, any
  value that a previous version of Metabase stored unencrypted in an encrypted-at-rest column; when disabled, finding
  such a value is an error and startup refuses to run instead."
  []
  (boolean (config/config-bool :mb-disable-legacy-startup-encryption)))

(defn- handle-legacy-unencrypted-values!
  "What happens when legacy values that a previous version of Metabase stored unencrypted are found in `location` (a
  `table.column`), before they are encrypted: a warning, or an error when [[legacy-startup-encryption-disabled?]]."
  [location]
  (if (legacy-startup-encryption-disabled?)
    (throw (ex-info (format (str "Found legacy values in %s that a previous version of Metabase stored unencrypted, "
                                 "and MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is set. Unset it to let Metabase encrypt "
                                 "them on startup.")
                            location)
                    {:location location}))
    (log/warnf "Encrypting legacy values in %s that a previous version of Metabase stored unencrypted." location)))

(defn encrypt-plaintext-columns!
  "Encrypt at rest any plaintext value in the encrypted-at-rest string columns. Runs on every startup, and is the only
  backfill of these columns -- the one-shot `Encrypt*` migrations are no-ops, since a migration cannot be relied on to
  do this: run without MB_ENCRYPTION_SECRET_KEY (the `migrate` command does not check the key) it is recorded as
  executed while doing nothing, a boot of an older version re-writes these columns through its own plaintext-era
  transforms (e.g. notification seeding re-creates `notification_recipient.details` rows every boot), and
  `load-from-h2` copies a decrypted dump's values verbatim. A value that decrypts with the current key is left
  byte-identical; whether a value is encrypted is decided by [[encryption/decryptable-string?]] (actually decrypting),
  never by shape. Streams each column, warning once per column before its first row is encrypted -- or refusing to
  encrypt at all when [[legacy-startup-encryption-disabled?]]. The `^bytes`
  columns are not scanned: every shipped version writes those encrypted, so they cannot regress this way. No-op when
  MB_ENCRYPTION_SECRET_KEY is not set."
  []
  (when (encryption/default-encryption-enabled?)
    (t2/with-transaction [_conn]
      (letfn [(encrypt-legacy-values! [location legacy? encrypt-row! rows]
                (reduce (fn [handled? row]
                          (if (legacy? row)
                            (do (when-not handled?
                                  (handle-legacy-unencrypted-values! location))
                                (encrypt-row! row)
                                true)
                            handled?))
                        false
                        rows))]
        (doseq [[table column] encrypted-string-columns]
          (encrypt-legacy-values! (str (name table) "." (name column))
                                  (comp legacy-unencrypted-string? :value)
                                  (fn [{:keys [id value]}]
                                    (mdb.db/update-column-value! table column id (encryption/encrypt value)))
                                  (mdb.db/reducible-column-values table column)))
        ;; `setting.value_with_aad` is bound to its row, so it is checked and encrypted under each row's own AAD
        (let [encrypt-setting-fn (encrypt-setting nil)]
          (encrypt-legacy-values! "setting.value_with_aad"
                                  (fn [{:keys [key value_with_aad]}]
                                    (legacy-unencrypted-string? value_with_aad {:aad (mdb.setting/setting-aad key)}))
                                  (fn [{:keys [key value_with_aad]}]
                                    (mdb.db/update-setting-values! key {:value_with_aad (encrypt-setting-fn value_with_aad key)}))
                                  (mdb.db/reducible-setting-values-with-aad)))))))

;;; ------------------------------------------------- the walks -------------------------------------------------

(defn- final-value-predicates
  "A pair of predicates, for strings and for byte arrays, accepting a raw value that is already in its final form for a
  walk: a v2 value whose DEK generation is one of `generation-ids` -- when `generation-ids` is given, only one of
  those; otherwise any generation the DEK store has. A legacy value whose random bytes happen to start with the v2
  magic (about one in 2^24) names a generation the store does not have, so it is not skipped but decrypted and
  re-encrypted like any other legacy value. Without a DEK store bound nothing is final: the walk writes the legacy
  format, and a v2 value could not be read anyway."
  [& [generation-ids]]
  (if-let [store (dek/store)]
    (let [known (set (or generation-ids (dek/generation-ids store)))]
      [(fn [v] (and (encryption/v2-string? v) (contains? known (encryption/v2-generation-id-of-string v))))
       (fn [^bytes b] (and (encryption/v2-bytes? b) (contains? known (encryption/v2-generation-id-of-bytes b))))])
    [(constantly false) (constantly false)]))

(defn- rewrite-settings!
  "Rewrite every setting row with `rewrite-str-fn` (a function of a plaintext string) in both its columns: `value`
  because a version predating `value_with_aad` reads it, so a rollback must not land on ciphertext under the old key,
  and `value_with_aad` under each row's own AAD with `rewrite-setting-fn` (a function of a plaintext string and the
  setting key). A column value `already-final?` accepts is left as it is; every row's format is tallied in `census`.

  Read raw (via `:setting`, not `:model/Setting`) to bypass the model's strict decrypt-on-read: a setting that is
  plaintext at rest while a key is configured (e.g. one newly designated encrypted but not yet re-encrypted) is exactly
  what a walk exists to fix, so it is decrypted leniently here rather than rejected. A value that looks encrypted but
  can't be decrypted with the current key still aborts. The `settings-last-updated` marker is reset to the current
  time (plaintext in `value`); the `encryption-check` sentinel is the caller's to replace."
  [census db-type rewrite-str-fn rewrite-setting-fn already-final?]
  (doseq [{:keys [key value value_with_aad]} (mdb.db/settings)]
    (case key
      "settings-last-updated" (let [now (mdb.query/current-timestamp-string db-type)]
                                (mdb.db/update-setting-values! key {:value now, :value_with_aad (rewrite-setting-fn now key)}))
      "encryption-check"      nil
      (let [aad-opts {:aad (mdb.setting/setting-aad key)}
            changes  (cond-> {}
                       (and (seq value) (not (already-final? value)))
                       (assoc :value (rewrite-str-fn (encryption/maybe-decrypt-accepting-plaintext value)))

                       (and (seq value_with_aad) (not (already-final? value_with_aad)))
                       (assoc :value_with_aad (rewrite-setting-fn (encryption/maybe-decrypt-accepting-plaintext value_with_aad aad-opts) key)))]
        (census-string! census (if (seq value_with_aad) value_with_aad value))
        (when (seq changes)
          (mdb.db/update-setting-values! key changes))))))

(defn- rewrap-deks!
  "Rewrap every DEK row from `old-kek` to `new-kek`, returning the number of rows rewrapped. A wrong `old-kek` fails
  deterministically on the GCM unwrap. No-op (0) when either key is nil, no DEK store is bound, or there are no rows."
  [old-kek new-kek]
  (if (and old-kek new-kek (dek/store-initialized?) (seq (dek/generation-ids (dek/store))))
    (let [n (dek/rewrap-all! (dek/store) old-kek new-kek)]
      (log/infof "Rewrapped %d DEK generation(s) under the new MB_ENCRYPTION_SECRET_KEY." n)
      n)
    0))

(defn- do-encryption
  "Encrypt or decrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data.

  - `current-kek` is the (hashed) key the existing data is readable under: MB_ENCRYPTION_SECRET_KEY, or nil when it is
    not set.
  - When `new-kek` is non-nil this is a key rotation -- or an initial encryption, when `current-kek` is nil or the
    same key -- every value is written back encrypted and the DEK table is rewrapped `current-kek` -> `new-kek`. With
    a DEK store bound the values are written in the v2 envelope format, under the active DEK, and a value already in
    that form is left alone: the key change is absorbed entirely by the rewrap, which is what makes a second rotation
    touch only the DEK table. Without a store they are written in the legacy KEK-direct format.
  - When `new-kek` is nil this is a decryption: every value, v2 or legacy, is written back as plaintext, the DEK table
    is emptied, and the sentinel is set to \"unencrypted\"."
  [db-type data-source new-kek current-kek]
  (let [encrypting?        (some? new-kek)
        ;; The key v2 values are written under during the walk. The DEK rows stay wrapped under `current-kek` until
        ;; the final rewrap, so writing under it, and letting the rewrap absorb the key change, is what leaves the
        ;; already-v2 rows untouched. On an initial encryption of an unencrypted database `current-kek` is nil
        ;; (nothing to read, no DEK rows yet), so the first DEK is minted, and everything written, directly under
        ;; `new-kek`, and the rewrap is a no-op. Passed explicitly rather than left to the default key: with
        ;; MB_ENCRYPTION_SECRET_KEY unset the default key is nil, and every write would silently produce plaintext.
        write-kek          (when encrypting? (or current-kek new-kek))
        encrypt-str-fn     (if encrypting? #(encryption/maybe-encrypt % {:secret-key write-kek}) identity)
        encrypt-bytes-fn   (if encrypting? #(encryption/maybe-encrypt-bytes % {:secret-key write-kek}) identity)
        encrypt-setting-fn (if encrypting? (encrypt-setting write-kek) (fn [s _setting-key] s))
        census             (atom {})]
    (t2/with-transaction [_conn {:datasource data-source}]
      (let [check-status (encryption-check-status)]
        (when (= check-status :invalid)
          (throw (ex-info (trs "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains")
                          {})))
        ;; With a DEK store bound and no generation yet (a legacy-encrypted or an unencrypted database), mint the
        ;; first one under `write-kek`, so that the values can be written in the v2 format. Without a store (the
        ;; initial encryption from `enable-encryption` binds none) they stay in the legacy format, and the first
        ;; explicit rotation upgrades them.
        (when (and encrypting? (dek/store-initialized?) (empty? (dek/generation-ids (dek/store))))
          (dek/mint-generation! (dek/store) write-kek))
        (let [[final-str? final-bytes?] (if encrypting?
                                          (final-value-predicates)
                                          [(constantly false) (constantly false)])]
          (doseq [[table column] encrypted-string-columns]
            (reencrypt-encrypted-column! census table column encrypt-str-fn
                                         (and (= check-status :valid)
                                              (contains? clearable-when-undecryptable [table column]))
                                         final-str?))
          (rewrite-settings! census db-type encrypt-str-fn encrypt-setting-fn final-str?)
          (replace-encryption-check! (when encrypting? encrypt-str-fn) (when encrypting? encrypt-setting-fn))
          (doseq [[table column] encrypted-bytes-columns]
            (reencrypt-encrypted-bytes-column! census table column encrypt-bytes-fn final-bytes?))))
      ;; rewrap or empty the DEK table
      (if encrypting?
        (rewrap-deks! current-kek new-kek)
        (mdb.db/delete-data-encryption-keys!))
      (mdb.db/delete-query-cache!))
    (log-format-census! (if encrypting? "encrypt/rotate" "decrypt") census)
    ;; Drop all cached unwrapped DEK material: after a rewrap the old key must no longer unwrap anything, and after a
    ;; decrypt there are no DEKs at all. Cached entries are keyed by key fingerprint, so leaving stale ones would let
    ;; a read under the pre-rotation key succeed against the cache instead of failing on the (rewrapped) DEK row.
    (dek/clear-cache!)
    (dek/log-generations (dek/store))))

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data, and the passed `to-key` to re-encrypt.
  If passed to-key is nil, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value.

  With envelope encryption a rotation to `to-key` (a) upgrades any remaining legacy-format values to v2 under the
  active DEK, and (b) rewraps every DEK row from the current key to `to-key`. The wrong-key sentinel check guards the
  whole operation."
  [db-type data-source to-key]
  (when (and (not (nil? to-key)) (empty? to-key))
    (throw (ex-info "Cannot encrypt database with an empty key" {})))
  (when (and (nil? to-key) (not (encryption/default-encryption-enabled?)))
    (throw (ex-info "Cannot encrypt database: MB_ENCRYPTION_SECRET_KEY is not set" {})))
  (dek-store/install-resolver!)
  ;; An explicit key rotation (`to-key` given) is a v2 walk. The database may not self-report as encrypted yet (an
  ;; initial encryption of a plaintext database mints its first DEK mid-transaction), so the app-DB store is bound
  ;; explicitly for the operation rather than left to the derived resolver.
  ;;
  ;; An initial encryption under the current key (`to-key` nil: `enable-encryption`, `load-from-h2`) stays on the
  ;; legacy KEK-direct path, exactly as before envelope encryption, by binding `dek/none`: the walk writes the
  ;; sentinel mid-transaction, and without the explicit "no store" the resolver could begin deriving "encrypted"
  ;; part-way through, mixing formats and minting stray DEKs. Keeping it legacy is also what keeps dump-to-h2 / copy
  ;; targets from minting mismatched DEKs mid-migration. v2 then arrives on the first explicit rotation.
  (let [current-kek (encryption/current-secret-key)
        new-kek     (if (nil? to-key) current-kek (encryption/validate-and-hash-secret-key to-key))]
    (binding [dek/*store* (if (some? to-key) (dek-store/app-db-store) dek/none)]
      (do-encryption db-type data-source new-kek current-kek)))
  ;; the database's encrypted state (possibly) changed: the next resolver call must re-derive it from the database
  (dek-store/invalidate-activation-cache!))

(defn decrypt-db
  "Decrypts the database using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data. Handles both legacy and
  v2 values, empties the DEK table, and marks the database unencrypted via the sentinel."
  [db-type data-source]
  (dek-store/install-resolver!)
  ;; The walk must keep reading v2 values after it flips the sentinel to "unencrypted" mid-transaction, so the derived
  ;; resolver cannot be trusted for its duration: bind the store explicitly. Afterwards the database is plaintext and
  ;; the resolver derives "no store" on its own.
  (binding [dek/*store* (dek-store/app-db-store)]
    (do-encryption db-type data-source nil (encryption/current-secret-key)))
  (dek-store/invalidate-activation-cache!))

;;; --------------------------------------------- DEK generation commands ---------------------------------------------

(defn- ensure-encrypted!
  "Guard for the DEK commands (`mint-new-dek!`, `deep-reencrypt-db!`): the database must be encrypted with the correct
  key before a DEK is minted or anything re-encrypted. The sentinel status has to be exactly `:valid`: an `:absent`
  one (no sentinel, or the database is marked unencrypted) would let these commands mint stray DEKs against a
  plaintext database, or perform an implicit initial encryption, which is what `enable-encryption` is for. Callers
  must have a DEK store bound: a v2 sentinel only decrypts through one."
  []
  (when-not (encryption/default-encryption-enabled?)
    (throw (ex-info (trs "MB_ENCRYPTION_SECRET_KEY is not set; there is no key to mint DEKs under.") {})))
  (case (encryption-check-status)
    :valid   nil
    :invalid (throw (ex-info (trs "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains")
                             {}))
    :absent  (throw (ex-info (trs "This database is not encrypted; run enable-encryption to encrypt it before minting or re-encrypting DEKs.")
                             {}))))

(defn mint-new-dek!
  "Mint a brand-new active DEK generation under the current `MB_ENCRYPTION_SECRET_KEY`. Instant: existing values keep
  decrypting under their own (older) generations, and only new writes use the new generation. Returns the new
  generation id."
  [_db-type _data-source]
  (dek-store/install-resolver!)
  ;; The DEK commands operate on the current application database's DEK table: its store is bound explicitly for the
  ;; whole operation, both so `ensure-encrypted!` can decrypt a (possibly v2) sentinel and so the mint targets exactly
  ;; this database whatever the resolver would derive mid-operation.
  (binding [dek/*store* (dek-store/app-db-store)]
    (ensure-encrypted!)
    (let [{:keys [generation-id]} (dek/mint-generation! (dek/store) (encryption/current-secret-key))]
      (log/infof "Minted new active DEK generation %d. Older generations remain readable." generation-id)
      (dek/log-generations (dek/store))
      generation-id)))

(defn- do-deep-reencrypt!
  "Impl for [[deep-reencrypt-db!]]; runs with the app-DB store already bound."
  [db-type data-source]
  (ensure-encrypted!)
  (let [current-kek        (encryption/current-secret-key)
        ;; `active-generation` mints the first generation on a legacy-encrypted database that has none yet
        active-gen         (:generation-id (dek/active-generation (dek/store) current-kek))
        encrypt-setting-fn (encrypt-setting nil)
        census             (atom {})]
    (t2/with-transaction [_conn {:datasource data-source}]
      ;; a value is final only when it is v2 AND already under the active generation; everything else is rewritten
      (let [[under-active-str? under-active-bytes?] (final-value-predicates [active-gen])]
        (doseq [[table column] encrypted-string-columns]
          (reencrypt-encrypted-column! census table column encryption/maybe-encrypt false under-active-str?))
        (rewrite-settings! census db-type encryption/maybe-encrypt encrypt-setting-fn under-active-str?)
        (let [{:keys [value value_with_aad]} (mdb.db/setting encryption-check-key)]
          (when-not (and (under-active-str? value) (under-active-str? value_with_aad))
            (replace-encryption-check! encryption/maybe-encrypt encrypt-setting-fn)))
        (doseq [[table column] encrypted-bytes-columns]
          (reencrypt-encrypted-bytes-column! census table column encryption/maybe-encrypt-bytes under-active-bytes?)))
      ;; every value is now under the active generation: delete all older DEK rows
      (mdb.db/delete-data-encryption-keys! active-gen)
      (mdb.db/delete-query-cache!))
    (log-format-census! "deep re-encrypt" census)
    (dek/clear-cache!)
    (log/info "Deep re-encryption complete; all values under the newest DEK generation and retired generations deleted.")
    (dek/log-generations (dek/store))))

(defn deep-reencrypt-db!
  "Rewrite every encrypted value under the newest DEK generation and the v2 format, then delete every retired DEK row
  so old key material is fully gone. Use when policy requires retiring old generations entirely. This walks all
  encrypted data (like a rotation) but touches no key."
  [db-type data-source]
  (dek-store/install-resolver!)
  ;; see `mint-new-dek!` for why the store is bound explicitly
  (binding [dek/*store* (dek-store/app-db-store)]
    (do-deep-reencrypt! db-type data-source)))
