(ns metabase.app-db.encryption
  (:require
   [metabase.app-db.dek-store :as dek-store]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption.dek :as dek]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; All columns encrypted via `mi/transform-encrypted-json`. The on-disk format of such a column is
;; `encrypt(json-string)`, so rotating the key only requires decrypting the raw value with the current key and
;; re-encrypting the resulting string. We list raw table names (not models) so this also works for enterprise models
;; that aren't loaded in every edition.
(def ^:private encrypted-json-columns
  [[:metabase_database :details]
   [:metabase_database :settings]
   [:metabase_database :write_data_details]
   [:metabase_database :admin_details]
   [:core_user :settings]
   [:channel :details]
   [:auth_identity :credentials]])

;; Older versions of dump-to-h2 and key rotation only processed `metabase_database.details` (plus settings and
;; secrets), skipping every other encrypted JSON column. A dump or rotation from such a version left the skipped
;; columns encrypted with the source instance's key, so on databases that have been through one they can hold values
;; the current (otherwise correct) key cannot decrypt. Only the columns listed here — the ones confirmed affected in
;; production — may be cleared when undecryptable; everything else still aborts, so that legitimately decryptable
;; data can never be cleared by mistake.
(def ^:private clearable-when-undecryptable
  #{[:core_user :settings]})

(def ^:private dek-table :model/DataEncryptionKey)

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

;;; ------------------------------------------------ value rewriting ------------------------------------------------
;;;
;;; `encrypt-str-fn` / `encrypt-bytes-fn` are the functions used to (re-)encrypt a value once it has been decrypted
;;; with the current key. When encrypting they produce v2 (once the DEK store is initialized) via
;;; `encryption/maybe-encrypt`; when decrypting they are `identity`, leaving plaintext.
;;;
;;; `already-final?` lets us skip rewriting a value that is already in its final form: on a KEK rotation, values are
;;; encrypted under DEKs (v2), not the KEK, so once a value is v2 it needs no rewrite — the KEK change is absorbed
;;; entirely by rewrapping the DEK table. This is what makes a second rotation touch only the DEK table.

;;; ------------------------------------------- ciphertext format census -------------------------------------------
;;;
;;; The rotation/deep-reencrypt/remove walks log which ciphertext FORMAT generations are present, so an operator can
;;; tell at a glance whether an instance has finished moving to the envelope format. We tally
;;; every stored value we walk into `*format-census*` (v2 vs legacy vs plaintext) and log the totals at completion.

(def ^:private ^:dynamic *format-census* nil)

(defn- census-string!
  "Tally the format of a raw string value `v` into `*format-census*` (a v2 string, a legacy-looking string, or
  plaintext)."
  [v]
  (when *format-census*
    (swap! *format-census* update
           (cond (encryption/v2-string? v)                 :v2
                 (encryption/possibly-encrypted-string? v) :legacy
                 :else                                      :plaintext)
           (fnil inc 0))))

(defn- census-bytes!
  "Tally the format of a raw byte value `b` into `*format-census*`."
  [b]
  (when *format-census*
    (swap! *format-census* update
           (cond (encryption/v2-bytes? b)                 :v2
                 (encryption/possibly-encrypted-bytes? b) :legacy
                 :else                                     :plaintext)
           (fnil inc 0))))

(defn- reencrypt-encrypted-json-column!
  "Re-encrypt `column` for every row in `table` using `encrypt-str-fn`. See `encrypted-json-columns`.

  When `clear-undecryptable?` is true, a value that cannot be decrypted with the current key is reset to an empty
  JSON object (with a warning) instead of aborting. Only pass true when the current key is known to be correct for
  this database (see `encryption-check-status`) and the column can legitimately hold values written with some other
  key (see `clearable-when-undecryptable`): such values are equally unreadable at runtime, so clearing them loses
  nothing that was usable.

  When `already-final?` returns true for a raw value, the row is left untouched."
  [conn table column encrypt-str-fn clear-undecryptable? already-final?]
  (doseq [{:keys [id value]} (t2/select [table :id [column :value]])]
    (when (some? value)
      (census-string! value)
      (if (already-final? value)
        nil ; already in final form (v2) - a KEK rotation does not touch it
        (let [decrypted (encryption/maybe-decrypt value)]
          (if (encryption/possibly-encrypted-string? decrypted)
            (if clear-undecryptable?
              (do
                (log/warnf "Can't decrypt %s.%s for id %s with MB_ENCRYPTION_SECRET_KEY even though the key is correct for this database; resetting the value to {}. It was likely written with a different key and has been unreadable at runtime."
                           (name table) (name column) id)
                (t2/update! :conn conn table {:id id} {column (encrypt-str-fn "{}")}))
              (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY")
                              {:table table, :id id, :column column})))
            (t2/update! :conn conn table {:id id} {column (encrypt-str-fn decrypted)})))))))

(defn- rewrap-deks!
  "Rewrap every DEK row from `old-kek` to `new-kek`. Returns the number of rows rewrapped. A wrong `old-kek` fails
  deterministically on the GCM unwrap. No-op (0) when there are no DEK rows."
  [old-kek new-kek]
  (if (and old-kek new-kek (dek/store-initialized?) (seq (dek/generation-ids (dek/store))))
    (let [n (dek/rewrap-all! (dek/store) old-kek new-kek)]
      (log/infof "Rewrapped %d DEK generation(s) under the new MB_ENCRYPTION_SECRET_KEY." n)
      n)
    0))

(defn- do-encryption
  "Encrypt or decrypt the app DB.

  - `current-kek` is the KEK the existing data is readable under (from the environment).
  - When `new-kek` is non-nil this is a KEK rotation (or initial encryption when `new-kek` = `current-kek`): remaining
    legacy values are upgraded to v2 under the active DEK, and the DEK table is rewrapped `current-kek` -> `new-kek`.
  - When `new-kek` is nil this is a decryption: all values (v2 and legacy) are decrypted to plaintext, the DEK table
    is emptied, and the sentinel is set to \"unencrypted\"."
  [db-type data-source new-kek current-kek]
  (let [encrypting?    (some? new-kek)
        ;; The KEK under which v2 values are (re-)written during the walk. On a rotation of already-encrypted data the
        ;; DEK rows are wrapped under `current-kek`, so we write under `current-kek` and let the final rewrap
        ;; (`current-kek` -> `new-kek`) absorb the KEK change without rewriting any value rows. On an *initial*
        ;; encryption of an unencrypted DB `current-kek` is nil (there is nothing to read and no DEK rows yet), so we
        ;; mint and write directly under `new-kek`; the rewrap step is then a no-op. Crucially this is passed
        ;; *explicitly* rather than relying on the 1-arity `maybe-encrypt` (which reads the env KEK): with the env var
        ;; unset, the env KEK is nil and every write would silently produce plaintext.
        write-kek      (when encrypting? (or current-kek new-kek))
        encrypt-str-fn (if encrypting? #(encryption/maybe-encrypt write-kek %) identity)
        encrypt-bytes-fn (if encrypting? #(encryption/maybe-encrypt-bytes write-kek %) identity)
        ;; A value is already in final form iff we're encrypting AND it is already v2 AND its DEK generation actually
        ;; exists in the store. The generation check closes a stranding hole: a legacy value whose random bytes happen
        ;; to start with the v2 magic (~2^-24) would otherwise be treated as "already v2" and skipped forever, never
        ;; upgraded and never rewrapped. Such a value names a generation the store does not have, so it fails this
        ;; check and flows through the normal decrypt-and-reencrypt path.
        final-str?     (fn [v] (and encrypting?
                                    (encryption/v2-string? v)
                                    (dek/generation-exists? (dek/store) (encryption/v2-generation-id-of-string v))))
        final-bytes?   (fn [v] (let [b (dek/->bytes v)]
                                 (and encrypting?
                                      (encryption/v2-bytes? b)
                                      (dek/generation-exists? (dek/store) (encryption/v2-generation-id-of-bytes b)))))]
    (binding [*format-census* (atom {})]
     (t2/with-transaction [conn {:datasource data-source}]
      (let [check-status (encryption-check-status)]
        (when (= check-status :invalid)
          (throw (ex-info (trs "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains")
                          {})))
        ;; When a DEK store is bound and there are no DEK generations yet (a legacy or fresh DB), mint the first one
        ;; under `write-kek` so legacy/plaintext values can be upgraded to v2. `write-kek` (not `current-kek`) matters
        ;; when encrypting a previously-unencrypted DB with the env var unset: `current-kek` is nil there, so we mint
        ;; under `new-kek`. When no store is bound (the initial auto-encrypt of a fresh DB binds `dek/none`),
        ;; encryption stays on the legacy KEK-direct path and no DEKs are minted -- v2 adoption then happens on the
        ;; first explicit rotation.
        (when (and encrypting? (dek/store-initialized?) (empty? (dek/generation-ids (dek/store))))
          (dek/mint-generation! (dek/store) write-kek))
        (doseq [[table column] encrypted-json-columns]
          (reencrypt-encrypted-json-column! conn table column encrypt-str-fn
                                            (and (= check-status :valid)
                                                 (contains? clearable-when-undecryptable [table column]))
                                            final-str?)))
      ;; Read RAW setting values (via the `:setting` table, not the decrypting `:model/Setting`) so we can skip rows
      ;; that are already in their final v2 form -- that is what lets a second KEK rotation touch only the DEK table.
      (doseq [{:keys [key value]} (t2/select [:setting :key :value])]
        (case key
          "settings-last-updated" (let [current-timestamp-as-string-honeysql (h2x/cast (if (= db-type :mysql) :char :text)
                                                                                       (h2x/current-datetime-honeysql-form db-type))]
                                    (t2/update! :conn conn :setting {:key key} {:value current-timestamp-as-string-honeysql}))
          "encryption-check" (t2/update! :conn conn :setting {:key key} {:value (if encrypting? (encrypt-str-fn (str (random-uuid))) "unencrypted")})
          (do
            (census-string! value)
            (when-not (final-str? value)
              (t2/update! :conn conn :setting
                          {:key key}
                          {:value (encrypt-str-fn (encryption/maybe-decrypt value))})))))
      ;; update all secret values according to the new encryption key
      ;; fortunately, we don't need to fetch the latest secret instance per ID, as we would need to in order to update
      ;; a secret value through the regular database save API path; instead, ALL secret values in the app DB (regardless
      ;; of whether they are the "current version" or not), should be updated with the new key. We read RAW values (via
      ;; the `:secret` table) so already-v2 secrets can be skipped on a KEK rotation.
      (doseq [{:keys [id value]} (t2/select [:secret :id :value])]
        (let [raw-bytes (dek/->bytes value)]
          (census-bytes! raw-bytes)
          (when-not (final-bytes? raw-bytes)
            (let [decrypted (encryption/maybe-decrypt raw-bytes)]
              (when (encryption/possibly-encrypted-string? decrypted)
                (throw (ex-info (trs "Can''t decrypt secret value with MB_ENCRYPTION_SECRET_KEY") {:secret-id id})))
              (t2/update! :conn conn :secret
                          {:id id}
                          {:value (encrypt-bytes-fn decrypted)})))))
      ;; Rewrap or empty the DEK table.
      (if encrypting?
        (rewrap-deks! current-kek new-kek)
        (t2/delete! :conn conn dek-table))
      (t2/delete! :conn conn :model/QueryCache))
     ;; Report the census of ciphertext formats encountered during the walk.
     (let [{:keys [v2 legacy plaintext] :or {v2 0 legacy 0 plaintext 0}} @*format-census*]
       (log/infof "Ciphertext format census for this %s walk: %d v2 (envelope), %d legacy, %d plaintext value(s)."
                  (if (some? new-kek) "encrypt/rotate" "decrypt") v2 legacy plaintext)))
    ;; Drop all cached unwrapped DEK material: after a rewrap the old KEK must no longer unwrap anything, and after a
    ;; decrypt there are no DEKs at all. Cached entries are keyed by KEK fingerprint, so leaving stale ones would let a
    ;; read under the pre-rotation KEK succeed against the cache instead of failing on the (rewrapped) DEK row.
    (dek/clear-cache!)
    (dek/log-generations (dek/store))))

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data, and the passed `to-key` to
  re-encrypt. If `to-key` is nil, it (re-)encrypts under the current MB_ENCRYPTION_SECRET_KEY value (initial
  encryption / same-key noop).

  With envelope encryption this: (a) upgrades any remaining legacy-format values to v2 under the active DEK, and
  (b) rewraps every DEK row from the current KEK to the new KEK. The wrong-key sentinel check guards the whole
  operation."
  [db-type data-source to-key]
  (when (and (not (nil? to-key)) (empty? to-key))
    (throw (ex-info "Cannot encrypt database with an empty key" {})))
  (dek-store/install-resolver!)
  ;; An explicit key rotation (`to-key` given) is a v2 walk: it upgrades any remaining legacy values to the envelope
  ;; format and rewraps the DEK table. The DB may not self-report as encrypted yet (an initial encryption of a
  ;; plaintext DB mints its first DEK mid-transaction), so we bind the app-DB store explicitly for the operation scope
  ;; rather than relying on the derived resolver.
  ;;
  ;; Initial encryption of a not-yet-encrypted DB (`to-key` nil, from app-DB setup's auto-encrypt) stays on the legacy
  ;; KEK-direct path -- exactly as before envelope encryption -- so we bind `dek/none`: the walk itself writes the
  ;; sentinel mid-transaction, and without the explicit "no store" the resolver could begin deriving "encrypted"
  ;; part-way through, mixing formats and minting stray DEKs. v2 then arrives on the first explicit rotation.
  ;; Keeping fresh-DB encryption legacy is also what keeps `dump-to-h2` / copy targets from minting mismatched
  ;; DEKs mid-migration.
  (let [current-kek (encryption/current-secret-key)
        new-kek     (if (nil? to-key) current-kek (encryption/validate-and-hash-secret-key to-key))]
    (binding [dek/*store* (if (some? to-key) (dek-store/app-db-store) dek/none)]
      (do-encryption db-type data-source new-kek current-kek)))
  ;; the DB's encrypted state (possibly) changed: the next resolver call must re-derive it from the DB
  (dek-store/invalidate-activation-cache!))

(defn decrypt-db
  "Decrypts the database using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data. Handles both legacy and
  v2 values, empties the DEK table, and marks the database unencrypted via the sentinel."
  [db-type data-source]
  ;; The walk must keep reading v2 values even after it flips the sentinel to "unencrypted" mid-transaction (settings
  ;; are walked before secrets), so the derived resolver cannot be trusted for its duration: bind the store
  ;; explicitly. Afterwards the DB is plaintext and the resolver derives "no store" on its own.
  (binding [dek/*store* (dek-store/app-db-store)]
    (do-encryption db-type data-source nil (encryption/current-secret-key)))
  (dek-store/invalidate-activation-cache!))

(defn- ensure-encrypted!
  "Guard for the data-key commands (mint-new-dek, deep-reencrypt): the DB must be *genuinely* envelope-encrypted with
  the correct key before we mint DEKs or deep-reencrypt. We require the sentinel status to be exactly `:valid`; a
  `:unknown` status (no sentinel, or the DB is marked unencrypted) would let these commands mint stray DEKs against a
  plaintext DB or perform an implicit initial encryption, which is not what they are for -- initial encryption is the
  job of `rotate-encryption-key`. Callers must have a DEK store bound: a v2 sentinel only decrypts through one."
  []
  (when-not (encryption/default-encryption-enabled?)
    (throw (ex-info (trs "MB_ENCRYPTION_SECRET_KEY is not set; there is no key to mint DEKs under.") {})))
  (case (encryption-check-status)
    :valid   nil
    :invalid (throw (ex-info (trs "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains")
                             {}))
    (throw (ex-info (trs "This database is not encrypted; run rotate-encryption-key to encrypt it before minting or re-encrypting DEKs.")
                    {}))))

(defn mint-new-dek!
  "Mint a brand-new active DEK generation under the current `MB_ENCRYPTION_SECRET_KEY`. Instant: existing values keep
  decrypting under their own (older) generations, and only new writes use the new generation. Returns the new
  generation id."
  [_db-type _data-source]
  ;; These commands operate on the current application DB's DEK table: bind its store explicitly for the whole
  ;; operation, both so `ensure-encrypted!` can decrypt a (possibly v2) sentinel and so the mint targets exactly this
  ;; DB regardless of what the resolver would derive mid-operation.
  (binding [dek/*store* (dek-store/app-db-store)]
    (ensure-encrypted!)
    (let [{:keys [generation-id]} (dek/mint-generation! (dek/store) (encryption/current-secret-key))]
      (log/infof "Minted new active DEK generation %d. Older generations remain readable." generation-id)
      (dek/log-generations (dek/store))
      generation-id)))

(defn- do-deep-reencrypt!
  "Impl for [[deep-reencrypt-db!]]; runs with the app-DB store already bound."
  [data-source]
  (ensure-encrypted!)
  (let [current-kek (encryption/current-secret-key)]
    ;; Ensure there is an active generation, then force every value onto it.
    (dek/active-generation (dek/store) current-kek)
    (let [active-gen (:generation-id (dek/active-generation (dek/store) current-kek))]
      (t2/with-transaction [conn {:datasource data-source}]
        ;; A value is "final" only when it is v2 AND already under the active generation; otherwise rewrite it.
        (let [str-under-active?   (fn [v] (and (encryption/v2-string? v)
                                               (= active-gen (encryption/v2-generation-id-of-string v))))
              bytes-under-active? (fn [v] (let [b (dek/->bytes v)]
                                            (and (encryption/v2-bytes? b)
                                                 (= active-gen (encryption/v2-generation-id-of-bytes b)))))]
          (doseq [[table column] encrypted-json-columns]
            (reencrypt-encrypted-json-column! conn table column encryption/maybe-encrypt false str-under-active?))
          ;; Read RAW setting/secret values (via the `:setting`/`:secret` tables, not the decrypting models) so the
          ;; "already under the active generation" guard can actually short-circuit rows that need no rewrite.
          (doseq [{:keys [key value]} (t2/select [:setting :key :value])]
            (case key
              "settings-last-updated" nil
              "encryption-check"      (when-not (str-under-active? value)
                                        (t2/update! :conn conn :setting {:key key}
                                                    {:value (encryption/maybe-encrypt (str (random-uuid)))}))
              (when-not (str-under-active? value)
                (t2/update! :conn conn :setting {:key key} {:value (encryption/maybe-encrypt (encryption/maybe-decrypt value))}))))
          (doseq [{:keys [id value]} (t2/select [:secret :id :value])]
            (let [raw-bytes (dek/->bytes value)]
              (when-not (bytes-under-active? raw-bytes)
                (t2/update! :conn conn :secret {:id id}
                            {:value (encryption/maybe-encrypt-bytes (encryption/maybe-decrypt raw-bytes))}))))
          ;; every value is now under the active generation: delete all older DEK rows
          (doseq [gen-id (dek/generation-ids (dek/store))
                  :when  (not= gen-id active-gen)]
            (t2/delete! :conn conn dek-table :id gen-id))
          (dek/clear-cache!)
          (t2/delete! :conn conn :model/QueryCache))))
    (log/info "Deep re-encryption complete; all values under the newest DEK generation and retired generations deleted.")
    (dek/log-generations (dek/store))))

(defn deep-reencrypt-db!
  "Rewrite every encrypted value under the newest DEK generation and the v2 format, then delete every retired DEK row
  so old key material is fully gone. Use when policy requires retiring old generations entirely. This walks all
  encrypted data (like a rotation) but touches no KEK."
  [_db-type data-source]
  ;; see `mint-new-dek!` for why the store is bound explicitly
  (binding [dek/*store* (dek-store/app-db-store)]
    (do-deep-reencrypt! data-source)))
