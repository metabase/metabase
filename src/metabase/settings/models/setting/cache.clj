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
  Pass it to the functions here that take one, so that a series of reads and writes uses one cache even if the app DB
  this thread sees changes midway.
  It holds the cache only: the database those functions read and write is still the one this thread sees."
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
  ([setting-name new-value]
   (update-cache! (current-state) setting-name new-value))
  ([state setting-name ^String new-value]
   (if (seq new-value)
     (swap! (cache* state) assoc  setting-name new-value)
     (swap! (cache* state) dissoc setting-name))))

;; CACHE SYNCHRONIZATION
;;
;; When running multiple Metabase instances (horizontal scaling), it is of course possible for one instance to update
;; a Setting, and, since Settings are cached (to avoid tons of DB calls), for the other instances to then have an
;; out-of-date cache. Thus we need a way for instances to know when their caches are out of date, so they can update
;; them accordingly. Here is our solution:
;;
;; We will record the last time *any* Setting was updated in a special Setting called `settings-last-updated`.
;;
;; Since `settings-last-updated` itself is a Setting, it will get fetched as part of each instance's local cache; we
;; can then periodically compare the locally cached value of `settings-last-updated` with the value in the DB. If our
;; locally cached value is older than the one in the DB, we will flush our cache. When the cache is fetched again, it
;; will have the up-to-date value.
;;
;; Because different machines can have out-of-sync clocks, we'll rely entirely on the application DB for calculating
;; and comparing values of `settings-last-updated`. Because the Setting table itself only stores text values, we'll
;; need to cast it between TEXT and TIMESTAMP SQL types as needed.

(def ^String settings-last-updated-key
  "Internal key used to store the last updated timestamp for Settings."
  "settings-last-updated")

(defn update-settings-last-updated!
  "Update the value of `settings-last-updated` in the DB; if the row does not exist, insert one."
  ([] (update-settings-last-updated! (current-state)))
  ([state]
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
   ;; Now that we updated the value in the DB, go ahead and update our cached value as well, because we know about the
   ;; changes
   (swap! (cache* state) assoc settings-last-updated-key (settings.db/setting-value settings-last-updated-key))))

(defn cache-last-updated-at
  "Fetch the value of `settings-last-updated`, indicating the timestamp of the settings cache. Possibly null.
  Reads the cache in `state`, by default the one for the application DB this thread sees."
  ([] (cache-last-updated-at (current-state)))
  ([state]
   (core/get (cache state) settings-last-updated-key)))

(defn- cache-out-of-date?
  "Check whether our Settings cache is out of date. We know the cache is out of date if either of the following
  conditions is true:

   *  The cache is empty (the `(cache*` atom is `nil`), which of course means it needs to be updated
   *  There is a value of `settings-last-updated` in the cache, and it is older than the value of in the DB. (There
      will be no value until the first time a normal Setting is updated; thus if it is not yet set, we do not yet need
      to invalidate our cache.)

  Reads the cache in `state`, by default the one for the application DB this thread sees."
  ([] (cache-out-of-date? (current-state)))
  ([state]
   (log/debug "Checking whether settings cache is out of date (requires DB call)...")
   (let [current-cache (cache state)]
     (boolean
      (or
       ;; is the cache empty?
       (not current-cache)
       ;; if not, get the cached value of `settings-last-updated`, and if it exists...
       (when-let [last-known-update (cache-last-updated-at state)]
         ;; compare it to the value in the DB. This is done be seeing whether a row exists
         ;; WHERE value > <local-value>
         ;; compared here rather than in SQL: what is stored is ciphertext, so only the decrypted timestamps can be ordered
         (u/prog1 (when-let [db-value (settings.db/setting-value settings-last-updated-key)]
                    (when (pos? (compare db-value last-known-update))
                      db-value))
           (log/trace "last known Settings update: " (pr-str last-known-update))
           (log/trace "actual last Settings update:" (pr-str <>))
           (when <>
             (log/info (u/format-color :red "Settings have been changed on another instance, and will be reloaded here."))))))))))

(def ^:const cache-update-check-interval-ms
  "How often we should check whether the Settings cache is out of date (which requires a DB call)?"
  (u/minutes->ms 1))

(defn- time-for-another-update-check?
  "Has it been more than a minute since `last-update-check` was last set?"
  [^AtomicLong last-update-check]
  (> (quot (- (System/nanoTime) (.get last-update-check)) 1000000)
     cache-update-check-interval-ms))

(defn restore-cache!
  "Populate cache with the latest hotness from the db"
  ([] (restore-cache! (current-state)))
  ([state]
   (log/debug "Refreshing Settings cache...")
   (reset! (cache* state) (settings.db/setting-values-by-key))))

(defn restore-cache-if-needed!
  "Check whether the settings cache is out of date by reading the DB value of `settings-last-updated`, and reload the
  cache if so. Called on every Setting read, so the check is throttled to run at most once per
  `cache-update-check-interval-ms`; pass `:force-check? true` to skip that throttle and check now. Returns truthy when
  a reload happened."
  [& {:keys [force-check?]}]
  (let [{:keys [^AtomicLong last-update-check ^ReentrantLock restore-lock] :as state} (current-state)]
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
