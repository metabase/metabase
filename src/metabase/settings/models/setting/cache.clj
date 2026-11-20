(ns metabase.settings.models.setting.cache
  "Settings cache. Cache is a 1:1 mapping of what's in the DB. Cached lookup time is ~60µs, compared to ~1800µs for DB
  lookup."
  (:require
   [clojure.core :as core]
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.setting :as mdb.setting]
   [metabase.settings.db :as settings.db]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent.atomic AtomicLong)
   (java.util.concurrent.locks ReentrantLock)))

(set! *warn-on-reflection* true)

(defmulti call-on-change
  "Whenever something changes in the Settings cache it will invoke

    (call-on-change old-cache new-cache

  Actual implementation is provided in [[metabase.settings.models.setting]] rather than here (to prevent
  circular references)."
  {:arglists '([old new])}
  (constantly :default))

(defn- new-state
  "A fresh settings cache state: an empty cache, an update-check clock that is due, and a restore lock."
  []
  {:cache             (doto (atom nil)
                        (add-watch :call-on-change (fn [_key _ref old new]
                                                     (call-on-change old new))))
   :last-update-check (AtomicLong. 0)
   :restore-lock      (ReentrantLock.)})

;; Each application DB has its own cache, with its own update-check clock and restore lock, so a test that binds
;; another app DB gets fresh state, and so does a bump from [[mdb/increment-app-db-unique-indentifier!]].
;; Keyed on the app DB's id, like every other per-app-DB cache, and never evicted.
(def ^:private ^{:arglists '([])} per-app-db
  (mdb/memoize-for-application-db new-state))

(defn current-state
  "The settings cache state for the application DB this thread sees.
  Pass it to the functions here that take one, so that a series of reads and writes uses one cache.
  The state carries no database identity: those functions read and write the app DB this thread sees, so the caller
  must keep the same app DB for the whole series."
  []
  (per-app-db))

(defn- cache*
  "The settings cache atom in `state`, by default the one for the application DB this thread sees."
  ([] (cache* (current-state)))
  ([state] (:cache state)))

(defn cache
  "Fetch the current contents of the Settings cache, a map of key (string) -> value (string)."
  ([] (cache (current-state)))
  ([state] @(cache* state)))

(defn update-cache!
  "Update the String value of a Setting in the Settings cache."
  [setting-name, ^String new-value]
  ;; A cache not loaded yet stays nil, so the next read restores all of it rather than trusting a partial map. A write
  ;; could reach one if the app DB got a new id partway through, as the testing API's snapshot restore gives it.
  (swap! (cache*) (fn [cache]
                    (when cache
                      (if (seq new-value)
                        (assoc cache setting-name new-value)
                        (dissoc cache setting-name))))))

;; CACHE SYNCHRONIZATION
;;
;; Several Metabase instances can share one application DB, and each caches every Setting. Every write of a Setting
;; also stores a new value of the Setting `settings-last-updated`, the marker: the app DB's current timestamp as text.
;; The marker is cached with the other Settings, and an instance whose cached marker differs from the stored one
;; reloads its cache.
;;
;; Markers are compared for equality, never ordered. Their text depends on the session time zone of the connection
;; that wrote them, and on Postgres and H2 a transaction's `now()` is the time it began, so a later write can store a
;; marker that sorts lower. A cache takes its marker only from the read that loads its values, so that it never holds
;; the marker of a write whose value it lacks.
;;
;; The cache is shared by every thread, so it never takes a marker from inside a transaction: another thread's check
;; would read the committed marker, see that it differs, and reload the committed values, firing their `:on-change`
;; handlers. Once the transaction commits, the next check reloads.

(def ^String settings-last-updated-key
  "Internal key used to store the last updated timestamp for Settings."
  "settings-last-updated")

(defn restore-cache!
  "Load every setting into the cache in `state`, on this thread's connection. Inside a transaction the cache keeps the
  marker it holds, since the one this connection reads may never commit."
  ([] (restore-cache! (current-state)))
  ([state]
   (log/debug "Refreshing Settings cache...")
   (let [loaded (settings.db/setting-values-by-key)]
     (if (mdb/in-transaction?)
       (swap! (cache* state) (fn [cache]
                               (if-let [marker (core/get cache settings-last-updated-key)]
                                 (assoc loaded settings-last-updated-key marker)
                                 (dissoc loaded settings-last-updated-key))))
       (reset! (cache* state) loaded)))))

(defn update-settings-last-updated!
  "Store a new `settings-last-updated` marker, inserting its row if there is none. Then reload the cache for the
  application DB this thread sees, on this thread's connection: the cache holds every write that connection sees, and
  the new marker unless the caller is in a transaction."
  []
  (log/debug "Updating value of settings-last-updated in DB...")
  ;; Written raw, not through `:model/Setting`, so that `value` gets the plaintext timestamp a version predating
  ;; `value_with_aad` compares in SQL. `value_with_aad` is encrypted under the marker's AAD like any other setting's.
  (let [value          (settings.db/current-timestamp-string)
        value-with-aad (encryption/maybe-encrypt value {:aad (mdb.setting/setting-aad settings-last-updated-key)})]
    ;; attempt to UPDATE the existing row. If no row exists, `t2/update!` will return 0...
    (or (pos? (settings.db/update-raw-setting-row! settings-last-updated-key value value-with-aad))
        ;; ...at which point we will try to INSERT a new row. Note that it is entirely possible two instances can both
        ;; try to INSERT it at the same time; one instance would fail because it would violate the PK constraint on
        ;; `key`, and throw a SQLException. As long as one instance updates the value, we are fine, so we can go ahead
        ;; and ignore that Exception if one is thrown.
        (try
          (settings.db/insert-raw-setting-row! settings-last-updated-key value value-with-aad)
          (catch java.sql.SQLException e
            ;; go ahead and log the whole SQLException message chain anyway on the off chance that it *wasn't* just a
            ;; race condition issue
            (log/errorf "Error updating Settings last updated value: %s"
                        (str/join "; " (keep ex-message (take-while some? (iterate #(.getNextException ^java.sql.SQLException %) e)))))))))
  ;; The whole cache, not just the marker: the write above replaced the marker of any instance that committed since
  ;; this cache was loaded, so this cache would otherwise miss that instance's values until the marker next changes.
  (let [state (current-state)]
    (restore-cache! state)
    ;; Inside a transaction the cache kept its committed marker, so make the next check due once the new one commits.
    (when (mdb/in-transaction?)
      (mdb/do-after-commit #(.set ^AtomicLong (:last-update-check state) 0)))))

(defn cached-marker
  "The `settings-last-updated` marker that the cache in `state` (by default, the state for the application DB this
  thread sees) was loaded with. Nil when the cache is not loaded or holds no marker."
  ([] (cached-marker (current-state)))
  ([state]
   (core/get (cache state) settings-last-updated-key)))

(defn- cache-out-of-date?
  "Whether the cache in `state` (by default, the state for the application DB this thread sees) needs a reload: it is
  not loaded, or the stored `settings-last-updated` marker differs from the cached one. An absent marker differs
  from a present one."
  ([] (cache-out-of-date? (current-state)))
  ([state]
   (log/debug "Checking whether settings cache is out of date (requires DB call)...")
   (let [current-cache (cache state)]
     (boolean
      (or
       (not current-cache)
       (let [cached   (core/get current-cache settings-last-updated-key)
             stored   (settings.db/setting-value settings-last-updated-key)
             changed? (not= stored cached)]
         (log/trace "cached Settings marker:" (pr-str cached))
         (log/trace "stored Settings marker:" (pr-str stored))
         (when changed?
           (log/info (u/format-color :red "Settings have changed since this cache was loaded and will be reloaded.")))
         changed?))))))

(def ^:const cache-update-check-interval-ms
  "How often we should check whether the Settings cache is out of date (which requires a DB call)?"
  (u/minutes->ms 1))

(defn- time-for-another-update-check?
  "Has it been more than a minute since `last-update-check` was last set?"
  [^AtomicLong last-update-check]
  (> (quot (- (System/nanoTime) (.get last-update-check)) 1000000)
     cache-update-check-interval-ms))

(defn restore-cache-if-needed!
  "Check whether the settings cache is out of date by reading the DB value of `settings-last-updated`, and reload the
  cache if so. Called on every Setting read, so the check is throttled to run at most once per
  `cache-update-check-interval-ms`; pass `:force-check? true` to skip that throttle and check now. Returns truthy when
  a reload happened.
  Pass `:state` to check a state the caller already holds, instead of the one for the application DB this thread sees."
  [& {:keys [force-check? state]}]
  (let [{:keys [^AtomicLong last-update-check ^ReentrantLock restore-lock] :as state} (or state (current-state))]
    (when (or force-check? (time-for-another-update-check? last-update-check))
      ;; There's a potential race condition here where two threads both call this at the exact same moment, and both
      ;; get `true` from `cache-out-of-date?`, and then both simultaneously try to update the cache. Better to just add
      ;; a quick lock here so only one of them does it, since waiting for the other thread to finish the task in
      ;; progress is certainly quicker than starting the task ourselves from scratch.
      (when-not (.isLocked restore-lock)
        (when (.tryLock restore-lock)
          (try
            (.set last-update-check (System/nanoTime))
            (when (cache-out-of-date? state)
              (restore-cache! state)
              true)
            (finally
              (.unlock restore-lock))))))))
