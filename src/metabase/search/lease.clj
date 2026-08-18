(ns metabase.search.lease
  "A short-transaction, app-db-backed lease for full search reindexes.

  Unlike a cluster lock, no transaction or connection is held while the reindex runs. Each lease is scoped to an
  engine/index-version/locale coordinate and guarded by a unique owner token, so an expired lease can be reclaimed
  without letting the previous owner renew or release the replacement owner's lease."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection SQLException Savepoint)))

(set! *warn-on-reflection* true)

(def ^:dynamic *lease-duration*
  "How long a lease remains valid without a successful heartbeat."
  (t/minutes 10))

(def ^:dynamic *heartbeat-interval-ms*
  "How often an acquired lease is renewed while its reindex is running."
  60000)

(def ^:dynamic *lease-context*
  "The claim and local lost flag for the reindex running on this thread. Nil outside a leased reindex."
  nil)

(defn coordinates
  "The serialization coordinate for `engine` at the current search specification and site locale."
  [engine]
  {:engine    (name engine)
   :version   (search.spec/index-version-hash)
   :lang-code (i18n/site-locale-string)})

(defn- app-db-now []
  ;; Base expiry calculations on the app DB's clock. This avoids allowing clock skew between Metabase nodes to make
  ;; one node's lease appear prematurely stale to another.
  (-> (t2/query-one {:select [[[:raw "current_timestamp"] :now]]})
      :now
      t/offset-date-time))

(defn- expires-at [now]
  (t/plus now *lease-duration*))

(defn- where-coordinate [{:keys [engine version lang-code lang_code]}]
  ;; Public coordinates use kebab-case; persisted claims use the raw column key so they can be inserted directly.
  {:engine engine, :version version, :lang_code (or lang-code lang_code)})

(defn- duplicate-key-violation?
  [error]
  (loop [error error]
    (cond
      (nil? error)
      false

      (and (instance? SQLException error)
           (some-> ^SQLException error .getSQLState (str/starts-with? "23")))
      true

      :else
      (recur (ex-cause error)))))

(defn- do-in-short-transaction
  "Run `f` on a fresh app-db connection and commit before returning.

  This deliberately does not join an ambient Toucan transaction: callers of search reindex can themselves be inside
  one, but lease ownership must become visible to the rest of the cluster before the long-running work begins."
  [f]
  (t2/with-connection [^Connection conn (mdb/app-db)]
    (let [auto-commit? (.getAutoCommit conn)]
      (try
        (.setAutoCommit conn false)
        (let [result (f conn)]
          (.commit conn)
          result)
        (catch Throwable e
          (try
            (.rollback conn)
            (catch Throwable rollback-error
              (log/warnf "Failed to roll back a search lease transaction: %s" (ex-message rollback-error))))
          (throw e))
        (finally
          (.setAutoCommit conn auto-commit?))))))

(defn- try-insert-claim!
  "Insert `claim`, rolling back only the INSERT if another contender won the primary-key race.

  PostgreSQL aborts a transaction after a constraint violation, so the savepoint is required before the caller can
  safely commit the losing acquisition attempt."
  [^Connection conn claim]
  (let [^Savepoint savepoint (.setSavepoint conn)]
    (try
      (t2/insert! :search_index_lease claim)
      (.releaseSavepoint conn savepoint)
      true
      (catch Exception e
        (if (duplicate-key-violation? e)
          (do
            (.rollback conn savepoint)
            false)
          (throw e))))))

(defn try-acquire!
  "Try to acquire the lease for `coordinate` and return its claim, or nil when a live owner already holds it.

  Acquisition first atomically steals an expired row. If no row exists, it inserts one; the coordinate's primary key
  elects a single winner between concurrent inserters. Both paths commit before this function returns."
  [coordinate]
  (do-in-short-transaction
   (fn [conn]
     (let [now        (app-db-now)
           owner      (str (random-uuid))
           coordinate (where-coordinate coordinate)
           claim      (assoc coordinate
                             :owner owner
                             :acquired_at now
                             :last_renewed_at now
                             :expires_at (expires-at now))
           stolen?    (pos? (t2/update! :search_index_lease
                                        (assoc coordinate :expires_at [:<= now])
                                        (select-keys claim [:owner :acquired_at :last_renewed_at :expires_at])))
           ;; Crashed owners normally disappear through takeover. This also bounds rows for coordinates that will never
           ;; be requested again after an index-version or locale change.
           _           (t2/delete! :search_index_lease :expires_at [:<= now] :owner [:!= owner])]
       (cond
         stolen?
         (assoc claim :taken-over? true)

         (try-insert-claim! conn claim)
         claim

         :else
         nil)))))

(defn- renew-on-current-connection!
  [{:keys [owner] :as claim}]
  (let [now        (app-db-now)
        coordinate (where-coordinate claim)]
    (pos? (t2/update! :search_index_lease
                      (assoc coordinate :owner owner :expires_at [:> now])
                      {:last_renewed_at now, :expires_at (expires-at now)}))))

(defn renew!
  "Renew `claim` if it is still live and still belongs to this owner. Returns true on success.

  An already-expired claim is not revived: another node is entitled to take it once its TTL passes, even if that node
  has not done so yet."
  [claim]
  (do-in-short-transaction (fn [_conn] (renew-on-current-connection! claim))))

(defn release!
  "Release `claim` only if the persisted lease still belongs to its owner. Returns true when a row was deleted."
  [{:keys [owner] :as claim}]
  (do-in-short-transaction
   (fn [_conn]
     (let [{:keys [engine version lang_code]} (where-coordinate claim)]
       (pos? (t2/delete! :search_index_lease
                         :engine engine :version version :lang_code lang_code :owner owner))))))

(defn- labels [claim event]
  {:engine (:engine claim), :event event})

(defn- record-event! [claim event]
  (analytics/inc! :metabase-search/reindex-lease-events (labels claim event)))

(defn- mark-lost!
  [{:keys [claim lost?]}]
  (when (compare-and-set! lost? false true)
    (record-event! claim :lost)))

(defn- lost-ex
  ([claim]
   (lost-ex claim nil))
  ([claim cause]
   (ex-info "Search reindex lease was lost; refusing to continue"
            {:type ::lease-lost
             :lease (select-keys claim [:engine :version :lang_code :owner])}
            cause)))

(defn throw-if-lost!
  "Abort the current leased operation if a heartbeat has established that ownership was lost. No-op outside a lease."
  []
  (when (some-> *lease-context* :lost? deref)
    (throw (lost-ex (:claim *lease-context*)))))

(defn assert-coordinate-current!
  "Abort if the site locale changed after the current lease was acquired. No-op outside a lease.

  Locale is part of the lease key, so a locale-change rebuild can run alongside the old coordinate. The old worker
  must not subsequently publish its index or overwrite process-local tracking for the new locale."
  []
  (when-let [{:keys [claim]} *lease-context*]
    (let [current-locale (binding [i18n/*site-locale-override* nil]
                           (i18n/site-locale-string))]
      (when-not (= (:lang_code claim) current-locale)
        (record-event! claim :coordinate-obsolete)
        (throw (ex-info "Search reindex coordinate became obsolete after the site locale changed"
                        {:type ::coordinate-obsolete
                         :lease-locale (:lang_code claim)
                         :site-locale current-locale})))))
  true)

(defn assert-current-in-transaction!
  "Fence a commit or promotion by proving ownership on the caller's current app-db transaction.

  The guarded renewal locks the lease row until the surrounding transaction commits. A stale owner therefore cannot
  promote after a replacement owner has acquired the lease, and a contender cannot take over between this check and
  that commit. No-op when low-level engine code is invoked outside [[do-with-lease]]."
  []
  (when-let [{:keys [claim] :as context} *lease-context*]
    (throw-if-lost!)
    (assert-coordinate-current!)
    (try
      (when-not (renew-on-current-connection! claim)
        (mark-lost! context)
        (throw (lost-ex claim)))
      (catch Throwable e
        (mark-lost! context)
        (if (= ::lease-lost (:type (ex-data e)))
          (throw e)
          (throw (lost-ex claim e))))))
  true)

(defn assert-current!
  "Prove that the current operation still owns its lease in a new short transaction. No-op outside a lease."
  []
  (if *lease-context*
    (do-in-short-transaction (fn [_conn] (assert-current-in-transaction!)))
    true))

(defn- heartbeat-loop!
  [context stopped]
  (let [{:keys [claim]} context]
    (loop []
      (when-not (deref stopped *heartbeat-interval-ms* false)
        (let [continue?
              (try
                (if (renew! claim)
                  true
                  (do
                    (mark-lost! context)
                    (log/errorf "Search reindex lease expired or was lost for %s"
                                (select-keys claim [:engine :version :lang_code]))
                    false))
                (catch Throwable e
                  ;; A transient heartbeat failure does not immediately abandon a still-live lease. Keep trying until its
                  ;; TTL; if the outage lasts beyond that, a later renewal fails the owner/expiry guard and stops this loop.
                  (record-event! claim :heartbeat-error)
                  (log/warnf "Failed to heartbeat search reindex lease for %s: %s"
                             (select-keys claim [:engine :version :lang_code])
                             (ex-message e))
                  true))]
          (when continue?
            (recur)))))))

(defn do-with-lease
  "Acquire `coordinate`, run `thunk` with a heartbeat, and release afterward.

  Returns `{:acquired? true :result ...}` when this caller owned the lease, or `{:acquired? false}` without invoking
  `thunk` when another owner has a live lease. Release is best-effort because expiry already provides crash recovery."
  [coordinate thunk]
  (if-let [claim (try-acquire! coordinate)]
    (let [stopped   (promise)
          context   {:claim claim, :lost? (atom false)}
          timer     (u/start-timer)
          heartbeat (future (heartbeat-loop! context stopped))]
      (record-event! claim (if (:taken-over? claim) :taken-over :acquired))
      (try
        {:acquired? true
         :result    (binding [*lease-context* context
                              ;; Hold the coordinate stable if site-locale changes while a rebuild is in flight.
                              i18n/*site-locale-override* (:lang_code claim)]
                      (thunk))}
        (finally
          (deliver stopped true)
          (future-cancel heartbeat)
          (analytics/observe! :metabase-search/reindex-lease-held-duration-ms
                              {:engine (:engine claim)}
                              (u/since-ms timer))
          (try
            (release! claim)
            (catch Throwable e
              (record-event! claim :release-error)
              (log/warnf "Failed to release search reindex lease for %s; it will expire at %s: %s"
                         (select-keys claim [:engine :version :lang_code])
                         (:expires_at claim)
                         (ex-message e)))))))
    (do
      (record-event! (where-coordinate coordinate) :busy)
      {:acquired? false})))
