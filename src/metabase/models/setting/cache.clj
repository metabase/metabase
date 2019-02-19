(ns metabase.models.setting.cache
  "Settings cache. Cache is a 1:1 mapping of what's in the DB. Cached lookup time is ~60µs, compared to ~1800µs for DB
  lookup."
  (:require [clojure.core :as core]
            [clojure.core.memoize :as memoize]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :as ui18n :refer [trs]]]
            [toucan.db :as db]))

(def ^:private cache*
  "Settings cache. Map of Setting key (string) -> Setting value (string)."
  (atom nil))

(defn cache
  "Fetch the current contents of the Settings cache, a map of key (string) -> value (string)."
  []
  @cache*)

(defn update-cache!
  "Update the String value of a Setting in the Settings cache."
  [setting-name, ^String new-value]
  (if (seq new-value)
    (swap! cache* assoc  setting-name new-value)
    (swap! cache* dissoc setting-name)))

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
;; Because different machines can have out-of-sync clocks, we'll rely entirely on the application DB for caclulating
;; and comparing values of `settings-last-updated`. Because the Setting table itself only stores text values, we'll
;; need to cast it between TEXT and TIMESTAMP SQL types as needed.

(def ^String settings-last-updated-key
  "Internal key used to store the last updated timestamp for Settings."
  "settings-last-updated")

(defn update-settings-last-updated!
  "Update the value of `settings-last-updated` in the DB; if the row does not exist, insert one."
  []
  (log/debug (trs "Updating value of settings-last-updated in DB..."))
  ;; for MySQL, cast(current_timestamp AS char); for H2 & Postgres, cast(current_timestamp AS text)
  (let [current-timestamp-as-string-honeysql (hx/cast (if (= (mdb/db-type) :mysql) :char :text)
                                                      (hsql/raw "current_timestamp"))]
    ;; attempt to UPDATE the existing row. If no row exists, `update-where!` will return false...
    (or (db/update-where! 'Setting {:key settings-last-updated-key} :value current-timestamp-as-string-honeysql)
        ;; ...at which point we will try to INSERT a new row. Note that it is entirely possible two instances can both
        ;; try to INSERT it at the same time; one instance would fail because it would violate the PK constraint on
        ;; `key`, and throw a SQLException. As long as one instance updates the value, we are fine, so we can go ahead
        ;; and ignore that Exception if one is thrown.
        (try
          ;; Use `simple-insert!` because we do *not* want to trigger pre-insert behavior, such as encrypting `:value`
          (db/simple-insert! 'Setting :key settings-last-updated-key, :value current-timestamp-as-string-honeysql)
          (catch java.sql.SQLException e
            ;; go ahead and log the Exception anyway on the off chance that it *wasn't* just a race condition issue
            (log/error (trs "Error inserting a new Setting: {0}"
                            (with-out-str (jdbc/print-sql-exception-chain e))))))))
  ;; Now that we updated the value in the DB, go ahead and update our cached value as well, because we know about the
  ;; changes
  (swap! cache* assoc settings-last-updated-key (db/select-one-field :value 'Setting :key settings-last-updated-key)))

(defn- cache-out-of-date?
  "Check whether our Settings cache is out of date. We know the cache is out of date if either of the following
  conditions is true:

   *  The cache is empty (the `cache*` atom is `nil`), which of course means it needs to be updated
   *  There is a value of `settings-last-updated` in the cache, and it is older than the value of in the DB. (There
      will be no value until the first time a normal Setting is updated; thus if it is not yet set, we do not yet need
      to invalidate our cache.)"
  []
  (log/debug (trs "Checking whether settings cache is out of date (requires DB call)..."))
  (boolean
   (or
    ;; is the cache empty?
    (not @cache*)
    ;; if not, get the cached value of `settings-last-updated`, and if it exists...
    (when-let [last-known-update (core/get @cache* settings-last-updated-key)]
      ;; compare it to the value in the DB. This is done be seeing whether a row exists
      ;; WHERE value > <local-value>
      (u/prog1 (db/select-one 'Setting
                 {:where [:and
                          [:= :key settings-last-updated-key]
                          [:> :value last-known-update]]})
        (when <>
          (log/info (u/format-color 'red
                        (str (trs "Settings have been changed on another instance, and will be reloaded here."))))))))))

(def ^:private cache-update-check-interval-ms
  "How often we should check whether the Settings cache is out of date (which requires a DB call)?"
  ;; once a minute
  (* 60 1000))

(def ^:private ^{:arglists '([])} should-restore-cache?
  "TTL-memoized version of `cache-out-of-date?`. Call this function to see whether we need to repopulate the cache with
  values from the DB."
  (memoize/ttl cache-out-of-date? :ttl/threshold cache-update-check-interval-ms))

(def ^:private restore-cache-if-needed-lock (Object.))

(defn restore-cache-if-needed!
  "Check whether we need to repopulate the cache with fresh values from the DB (because the cache is either empty or
  known to be out-of-date), and do so if needed. This is intended to be called every time a Setting value is
  retrieved, so it should be efficient; thus the calculation (`should-restore-cache?`) is itself TTL-memoized."
  []
  ;; There's a potential race condition here where two threads both call this at the exact same moment, and both get
  ;; `true` when they call `should-restore-cache`, and then both simultaneously try to update the cache (or, one
  ;; updates the cache, but the other calls `should-restore-cache?` and gets `true` before the other calls
  ;; `memo-swap!` (see below))
  ;;
  ;; This is not desirable, since either situation would result in duplicate work. Better to just add a quick lock
  ;; here so only one of them does it, since at any rate waiting for the other thread to finish the task in progress is
  ;; certainly quicker than starting the task ourselves from scratch
  (locking restore-cache-if-needed-lock
    (when (should-restore-cache?)
      (log/debug (trs "Refreshing Settings cache..."))
      (reset! cache* (db/select-field->field :key :value 'Setting))
      ;; Now the cache is up-to-date. That is all good, but if we call `should-restore-cache?` again in a second it
      ;; will still return `true`, because its result is memoized, and we would be on the hook to (again) update the
      ;; cache. So go ahead and clear the memozied results for `should-restore-cache?`. The next time around when
      ;; someone calls this it will cache the latest value (which should be `false`)
      ;;
      ;; NOTE: I tried using `memo-swap!` instead to set the cached response to `false` here, avoiding the extra DB
      ;; call the next fn call would make, but it didn't seem to work correctly (I think it was still discarding the
      ;; new value because of the TTL). So we will just stick with `memo-clear!` for now. (One extra DB call whenever
      ;; the cache gets invalidated shouldn't be a huge deal)
      (memoize/memo-clear! should-restore-cache?))))
