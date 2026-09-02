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

;; Setting cache is unique to the application DB; if it's swapped out for tests or mocking or whatever then use a new
;; cache.
(def ^:private ^{:arglists '([])} cache*
  (mdb/memoize-for-application-db
   (fn []
     (doto (atom nil)
       (add-watch :call-on-change (fn [_key _ref old new]
                                    (call-on-change old new)))))))

;; The sysadmin cache mirrors `setting.value_sysadmin` the way `cache*` mirrors `setting.value`. Kept as a second map
;; rather than a richer value in the first so the shape every existing reader of `cache` relies on stays the same.
(def ^:private ^{:arglists '([])} sysadmin-cache*
  (mdb/memoize-for-application-db
   (fn []
     (doto (atom nil)
       (add-watch :call-on-change (fn [_key _ref old new]
                                    (call-on-change old new)))))))

(defn cache
  "Fetch the current contents of the Settings cache, a map of key (string) -> value (string)."
  []
  @(cache*))

(defn sysadmin-cache
  "Fetch the current contents of the sysadmin Settings cache, a map of key (string) -> `value_sysadmin` (string). Only
  rows with a sysadmin value are present."
  []
  @(sysadmin-cache*))

(defn update-cache!
  "Update the String value of a Setting in the Settings cache."
  [setting-name, ^String new-value]
  (if (seq new-value)
    (swap! (cache*) assoc  setting-name new-value)
    (swap! (cache*) dissoc setting-name)))

(defn update-sysadmin-cache!
  "Update the String `value_sysadmin` of a Setting in the sysadmin Settings cache."
  [setting-name, ^String new-value]
  (if (seq new-value)
    (swap! (sysadmin-cache*) assoc  setting-name new-value)
    (swap! (sysadmin-cache*) dissoc setting-name)))

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
  []
  (log/debug "Updating value of settings-last-updated in DB...")
  ;; Written raw, not through `:model/Setting`, so that `value` gets the plaintext timestamp a version predating
  ;; `value_with_aad` compares in SQL. `value_with_aad` is encrypted under the marker's AAD like any other setting's.
  (let [value          (mdb/current-timestamp-string (mdb/db-type))
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
  (swap! (cache*) assoc settings-last-updated-key (settings.db/setting-value settings-last-updated-key)))

(defn cache-last-updated-at
  "Fetch the value of `settings-last-updated`, indicating the timestamp of the settings cache. Possibly null."
  []
  (let [current-cache (cache)]
    (core/get current-cache settings-last-updated-key)))

(defn- cache-out-of-date?
  "Check whether our Settings cache is out of date. We know the cache is out of date if either of the following
  conditions is true:

   *  The cache is empty (the `(cache*` atom is `nil`), which of course means it needs to be updated
   *  There is a value of `settings-last-updated` in the cache, and it is older than the value of in the DB. (There
      will be no value until the first time a normal Setting is updated; thus if it is not yet set, we do not yet need
      to invalidate our cache.)"
  []
  (log/debug "Checking whether settings cache is out of date (requires DB call)...")
  (let [current-cache (cache)]
    (boolean
     (or
      ;; is the cache empty?
      (not current-cache)
      ;; if not, get the cached value of `settings-last-updated`, and if it exists...
      (when-let [last-known-update (cache-last-updated-at)]
        ;; compare it to the value in the DB. This is done be seeing whether a row exists
        ;; WHERE value > <local-value>
        ;; compared here rather than in SQL: what is stored is ciphertext, so only the decrypted timestamps can be ordered
        (u/prog1 (when-let [db-value (settings.db/setting-value settings-last-updated-key)]
                   (when (pos? (compare db-value last-known-update))
                     db-value))
          (log/trace "last known Settings update: " (pr-str last-known-update))
          (log/trace "actual last Settings update:" (pr-str <>))
          (when <>
            (log/info (u/format-color :red "Settings have been changed on another instance, and will be reloaded here.")))))))))

(def ^:const cache-update-check-interval-ms
  "How often we should check whether the Settings cache is out of date (which requires a DB call)?"
  (u/minutes->ms 1))

(defonce ^:private ^AtomicLong last-update-check (AtomicLong. 0))

(defn- time-for-another-update-check?
  "Has it has been more than a minute since the last time we checked for updates?"
  []
  (> (quot (- (System/nanoTime) (.get last-update-check)) 1000000)
     cache-update-check-interval-ms))

(defn restore-cache!
  "Populate cache with the latest hotness from the db"
  []
  (log/debug "Refreshing Settings cache...")
  (reset! (cache*) (settings.db/setting-values-by-key))
  (reset! (sysadmin-cache*) (settings.db/sysadmin-setting-values-by-key)))

(defonce ^:private ^ReentrantLock restore-cache-lock (ReentrantLock.))

(defn restore-cache-if-needed!
  "Check whether the settings cache is out of date by reading the DB value of `settings-last-updated`, and reload the
  cache if so. Called on every Setting read, so the check is throttled to run at most once per
  `cache-update-check-interval-ms`; pass `:force-check? true` to skip that throttle and check now. Returns truthy when
  a reload happened."
  [& {:keys [force-check?]}]
  (when (or force-check? (time-for-another-update-check?))
    ;; There's a potential race condition here where two threads both call this at the exact same moment, and both get
    ;; `true` from `cache-out-of-date?`, and then both simultaneously try to update the cache. Better to just add a
    ;; quick lock here so only one of them does it, since waiting for the other thread to finish the task in progress
    ;; is certainly quicker than starting the task ourselves from scratch.
    (when-not (.isLocked restore-cache-lock)
      (when (.tryLock restore-cache-lock)
        (try
          (.set last-update-check (System/nanoTime))
          (when (cache-out-of-date?)
            (restore-cache!)
            true)
          (finally
            (.unlock restore-cache-lock)))))))
