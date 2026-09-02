(ns metabase.app-db.dek-store
  "Application-database implementation of `metabase.util.encryption.dek/DEKStore`.

  DEK generations live in the `data_encryption_key` table (see the Liquibase migration): one row per generation
  (`id`, KEK-wrapped `key_material`, `created_at`). This namespace is a thin adapter that reads and writes those rows
  and delegates all cryptography to `metabase.util.encryption.dek`. Unwrapped DEK material is cached in process memory
  (keyed by the application DB's [[mdb.connection/unique-identifier]] plus a KEK fingerprint and the generation id) by
  the store seam, so the KEK unwrap happens at most once per generation per app DB per process.

  Activation model. v2 writes must be enabled only for an application database that is *genuinely in the encrypted
  state* -- otherwise a context that merely has `MB_ENCRYPTION_SECRET_KEY` set but whose data is still plaintext (a
  fresh DB, or a dump/copy target mid-migration) would start silently minting DEKs and writing v2 values whose key
  material lives in a different place than the data.

  The derived answer is cached per [[mdb.connection/unique-identifier]], so it costs one sentinel query per app-DB
  instance. The encryption commands flip a database's encrypted state in-process and call
  [[invalidate-activation-cache!]] after doing so. The other in-process flipper is `metabase.cmd.copy/copy!` (a
  dump/load target goes from empty to possibly-encrypted): that path needs no invalidation because it touches the
  target only over raw JDBC inside a single rollback-only transaction -- no resolver-gated reads or writes ever run
  against it mid-copy -- and any `ApplicationDB` later bound over the target is a fresh instance whose fresh unique id
  derives its answer anew. Commands that need v2 behavior *before* the DB self-reports
  encrypted (an initial `encrypt-db` mints its first DEK mid-transaction) or *after* it stops (a decrypt walk flips
  the sentinel to \"unencrypted\" mid-walk but must keep reading v2 values) bind an explicit store for their operation
  scope via [[metabase.util.encryption.dek/*store*]] instead of relying on the resolver."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.util.encryption.dek :as dek]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private table :model/DataEncryptionKey)

;; The process caches (unwrapped DEK material and the active-generation id in `dek`, plus the derived activation
;; answer below) are keyed by the current `ApplicationDB`'s unique id -- the codebase-blessed memoization key for
;; per-app-DB state (see [[metabase.app-db.core/memoize-for-application-db]]). Ids are process-unique and churn
;; whenever the app DB is rebound (setup, dump-to-h2, tests): a fresh id can therefore never see another DB's cached
;; material, and id churn only ever costs a re-derivation (one query, plus one GCM unwrap per DEK generation).
(defn- cache-key []
  [::app-db (mdb.connection/unique-identifier)])

(defn- max-generation-id []
  (t2/select-one-fn :id table {:order-by [[:id :desc]] :limit 1}))

(defn- wrapped-material
  "The wrapped DEK bytes for `generation-id`, materialized to a byte array *while the query's connection is still open*
  (a JDBC `Blob` read after its connection is returned to the pool throws \"object is already closed\"). We apply the
  `->bytes` coercion as the select fn so it runs during result-set reduction, inside the connection scope."
  ^bytes [generation-id]
  (t2/select-one-fn (comp dek/->bytes :key_material) table :id generation-id))

(deftype AppDBDEKStore []
  dek/DEKStore
  (active-generation [store kek]
    ;; Cache the active (max) generation id per app DB so a hot write path does not run `SELECT max(id)` every time.
    ;; The cache is invalidated on mint (a new active id) and cleared on rotation/rewrap/decryption.
    ;;
    ;; Concurrent mints (two instances or threads racing on an empty table) are safe: generation ids are DB-assigned,
    ;; each writer inserts its DEK row before writing any value that references it, and every inserted row stays
    ;; readable forever. The worst case is a harmless extra generation; "active" converges to max(id).
    (if-let [gen-id (dek/cached-active-generation-id (cache-key) max-generation-id)]
      {:generation-id gen-id :dek (dek/dek-by-id store kek gen-id)}
      (dek/mint-generation! store kek)))
  (dek-by-id [_ kek generation-id]
    (dek/cached-dek (cache-key) kek generation-id
                    (fn []
                      (let [wrapped (wrapped-material generation-id)]
                        (when-not wrapped
                          (throw (ex-info "No such DEK generation" {:generation-id generation-id})))
                        (dek/unwrap-dek kek wrapped)))))
  (mint-generation! [_ kek]
    (let [material (dek/random-dek)
          wrapped  (dek/wrap-dek kek material)
          gen-id   (first (t2/insert-returning-pks! table {:key_material wrapped
                                                           :created_at   :%now}))]
      ;; Two separate caches: `cache-put!` stores the new generation's unwrapped key material (so the next read of it
      ;; needn't query + GCM-unwrap again), while `invalidate-active-generation!` clears the cached active-id pointer,
      ;; which this mint just changed (the new row is now the max id).
      (dek/cache-put! (cache-key) kek gen-id material)
      (dek/invalidate-active-generation! (cache-key))
      {:generation-id gen-id :dek material}))
  (rewrap-all! [_ old-kek new-kek]
    ;; Materialize each wrapped blob to bytes during result-set reduction (`select-fn->fn`), before the connection
    ;; closes, to avoid "object is already closed" on the JDBC Blob.
    (let [id->wrapped (t2/select-fn->fn :id (comp dek/->bytes :key_material) table {:order-by [[:id :asc]]})]
      (doseq [[id wrapped] id->wrapped]
        (let [material (dek/unwrap-dek old-kek wrapped)]
          (t2/update! table :id id {:key_material (dek/wrap-dek new-kek material)})))
      ;; the unwrapped material is unchanged by a rewrap, so the process cache stays valid
      (count id->wrapped)))
  (generation-ids [_]
    (vec (sort (t2/select-fn-set :id table)))))

(defn app-db-store
  "A [[dek/DEKStore]] backed by the current application database's `data_encryption_key` table."
  []
  (->AppDBDEKStore))

;; `{:epoch <long> :answers {app-db-unique-id encrypted?}}`: the derived "is this application DB encrypted?" answer,
;; cached per [[mdb.connection/unique-identifier]] so the resolver runs the sentinel query once per app-DB instance
;; rather than on every encrypted read/write. Both `true` and `false` are cached, but only when derived
;; *successfully* -- an answer synthesized from a failed sentinel query is never cached (see [[resolve-store]]).
(defonce ^:private derived-activation-cache (atom {:epoch 0 :answers {}}))

(defn invalidate-activation-cache!
  "Forget every cached derived \"is this application DB encrypted?\" answer, forcing the next resolver call to
  re-derive it from the database itself. Also advances the cache epoch so any in-flight derivation that started
  before this call can no longer cache its (possibly pre-flip) answer. The encryption commands call this after
  changing a database's encryption state (initial encryption, rotation, decryption)."
  []
  (swap! derived-activation-cache (fn [{:keys [epoch]}] {:epoch (inc epoch) :answers {}})))

(defn- db-encrypted?
  "Whether the currently bound application database is encrypted, derived from the database itself: the raw
  `encryption-check` sentinel row exists and is not the literal \"unencrypted\" marker (see
  `metabase.app-db.encryption/encryption-check-status` for the sentinel's full semantics). Deliberately reads the RAW
  value and only sniffs its shape -- deciding \"encrypted?\" by *decrypting* the sentinel would be circular, because
  decrypting a v2 sentinel needs the very store this predicate gates. Wrong-key detection is therefore not this
  function's job; app-DB setup's sentinel check still does that. Throws whatever the sentinel query throws (missing
  table, early boot, broken DB); [[resolve-store]] decides what a failure means."
  []
  (let [raw (t2/select-one-fn :value :setting :key "encryption-check")]
    (and (some? raw) (not= raw "unencrypted"))))

(defn- resolve-store
  "The resolver installed for [[dek/set-store-resolver!]]: return an app-DB store when the currently connected
  application database is encrypted -- derived from its own sentinel (cached per app-DB instance) -- else nil so
  writes fall back to the legacy format. We intentionally do *not* additionally gate on `MB_ENCRYPTION_SECRET_KEY`
  being set: whether the DB is encrypted is a fact about the DB, independent of whether this process holds the
  (correct) key. Key validation is app-DB setup's job, and the encrypt/decrypt entry points already no-op without a
  key before ever consulting the store.

  If the sentinel query itself fails (missing table, early boot, a transient pool blip or failover) the DB is treated
  as NOT encrypted *for this call only* -- v2 writes stay off rather than minting DEKs against a database we cannot
  even read -- but the answer is NOT cached, so the next call re-derives once the DB is reachable again. Only
  successfully derived answers (true or false) are cached, and only if no [[invalidate-activation-cache!]] intervened
  between reading the epoch and finishing the derivation."
  []
  (let [id (mdb.connection/unique-identifier)
        {:keys [epoch answers]} @derived-activation-cache
        encrypted?
        (if-some [hit (get answers id)]
          hit
          (let [answer (try
                         (db-encrypted?)
                         (catch Throwable e
                           (log/warnf "Cannot read the encryption-check sentinel (%s); treating this application DB as not encrypted for this call (answer not cached)."
                                      (ex-message e))
                           ::derivation-failed))]
            (if (= ::derivation-failed answer)
              false
              (do
                ;; cache the answer only if the epoch we observed before deriving is still current: the compare and
                ;; the assoc are one atomic swap, so a concurrent invalidation either bumps the epoch first (we skip
                ;; caching) or runs after us (it clears our entry). Either way no stale answer survives.
                (swap! derived-activation-cache
                       (fn [cache]
                         (cond-> cache
                           (= (:epoch cache) epoch) (assoc-in [:answers id] answer))))
                answer))))]
    (when encrypted?
      (app-db-store))))

(defn install-resolver!
  "Install the app-DB DEK-store resolver into [[dek/store]] (idempotent). Safe to call at namespace load / setup."
  []
  (dek/set-store-resolver! resolve-store))
