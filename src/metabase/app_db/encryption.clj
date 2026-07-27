(ns metabase.app-db.encryption
  (:require
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; All columns encrypted via `mi/transform-encrypted-json`. The on-disk format of such a column is
;; `encrypt(json-string)`, so rotating the key only requires decrypting the raw value with the current key and
;; re-encrypting the resulting string. We list raw table names (not models) so this also works for enterprise models
;; (e.g. WorkspaceDatabase) that aren't loaded in every edition.
(def ^:private encrypted-json-columns
  [[:metabase_database :details]
   [:metabase_database :settings]
   [:metabase_database :write_data_details]
   [:metabase_database :admin_details]
   [:core_user :settings]
   [:channel :details]
   [:workspace_database :database_details]])

;; Older versions of dump-to-h2 and key rotation only processed `metabase_database.details` (plus settings and
;; secrets), skipping every other encrypted JSON column. A dump or rotation from such a version left the skipped
;; columns encrypted with the source instance's key, so on databases that have been through one they can hold values
;; the current (otherwise correct) key cannot decrypt. Only the columns listed here — the ones confirmed affected in
;; production — may be cleared when undecryptable; everything else still aborts, so that legitimately decryptable
;; data can never be cleared by mistake.
(def ^:private clearable-when-undecryptable
  #{[:core_user :settings]})

(defn- encryption-check-status
  "Whether the current MB_ENCRYPTION_SECRET_KEY is the right key for this database, according to the
  `encryption-check` sentinel setting (a random UUID stored encrypted whenever the database is encrypted):

    :valid   - the sentinel decrypts to a UUID, so the key is correct
    :invalid - the sentinel exists but does not decrypt, so the key is wrong (or unset) for this database
    :unknown - no sentinel (database predates it), or the database is marked unencrypted"
  []
  (let [raw (t2/select-one-fn :value :setting :key "encryption-check")]
    (cond
      (or (nil? raw) (= raw "unencrypted"))               :unknown
      (string/valid-uuid? (encryption/maybe-decrypt raw)) :valid
      :else                                               :invalid)))

(defn- reencrypt-encrypted-json-column!
  "Re-encrypt `column` for every row in `table` using `encrypt-str-fn`. See `encrypted-json-columns`.

  When `clear-undecryptable?` is true, a value that cannot be decrypted with the current key is reset to an empty
  JSON object (with a warning) instead of aborting. Only pass true when the current key is known to be correct for
  this database (see `encryption-check-status`) and the column can legitimately hold values written with some other
  key (see `clearable-when-undecryptable`): such values are equally unreadable at runtime, so clearing them loses
  nothing that was usable."
  [conn table column encrypt-str-fn clear-undecryptable?]
  (doseq [{:keys [id value]} (t2/select [table :id [column :value]])]
    (when (some? value)
      (let [decrypted (encryption/maybe-decrypt value)]
        (if (encryption/possibly-encrypted-string? decrypted)
          (if clear-undecryptable?
            (do
              (log/warnf "Can't decrypt %s.%s for id %s with MB_ENCRYPTION_SECRET_KEY even though the key is correct for this database; resetting the value to {}. It was likely written with a different key and has been unreadable at runtime."
                         (name table) (name column) id)
              (t2/update! :conn conn table {:id id} {column (encrypt-str-fn "{}")}))
            (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY")
                            {:table table, :id id, :column column})))
          (t2/update! :conn conn table {:id id} {column (encrypt-str-fn decrypted)}))))))

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
        (doseq [[table column] encrypted-json-columns]
          (reencrypt-encrypted-json-column! conn table column encrypt-str-fn
                                            (and (= check-status :valid)
                                                 (contains? clearable-when-undecryptable [table column])))))
      (doseq [[key value] (t2/select-fn->fn :key :value :model/Setting)]
        (case key
          "settings-last-updated" (let [current-timestamp-as-string-honeysql (h2x/cast (if (= db-type :mysql) :char :text)
                                                                                       [:raw "current_timestamp"])]
                                    (t2/update! :conn conn :setting {:key key} {:value current-timestamp-as-string-honeysql}))
          "encryption-check" (t2/update! :conn conn :setting {:key key} {:value (if encrypting? (encrypt-str-fn (str (random-uuid))) "unencrypted")})
          (t2/update! :conn conn :setting
                      {:key key}
                      {:value (encrypt-str-fn value)})))
      ;; update all secret values according to the new encryption key
      ;; fortunately, we don't need to fetch the latest secret instance per ID, as we would need to in order to update
      ;; a secret value through the regular database save API path; instead, ALL secret values in the app DB (regardless
      ;; of whether they are the "current version" or not), should be updated with the new key
      (doseq [[id value] (t2/select-pk->fn :value :model/Secret)]
        (when (encryption/possibly-encrypted-string? value)
          (throw (ex-info (trs "Can''t decrypt secret value with MB_ENCRYPTION_SECRET_KEY") {:secret-id id})))
        (t2/update! :conn conn :secret
                    {:id id}
                    {:value (encrypt-bytes-fn value)}))
      (t2/delete! :conn conn :model/QueryCache))))

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data, and the passed `to-key` to re-encrypt.
  If passed to-key is nil, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value."
  [db-type data-source to-key]
  (when (and (not (nil? to-key)) (empty? to-key))
    (throw (ex-info "Cannot encrypt database with an empty key" {})))
  (do-encryption db-type data-source true (fn [maybe-encrypt-fn]
                                            (if
                                             (nil? to-key) maybe-encrypt-fn
                                             (partial maybe-encrypt-fn (encryption/validate-and-hash-secret-key to-key))))))

(defn decrypt-db
  "Decrypts the database using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data"
  [db-type data-source]
  (do-encryption db-type data-source false (constantly identity)))
