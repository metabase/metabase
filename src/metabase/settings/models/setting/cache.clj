(ns metabase.settings.models.setting.cache
  "Settings cache. Cache is a 1:1 mapping of what's in the DB. Cached lookup time is ~60µs, compared to ~1800µs for DB
  lookup."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.app-db.core :as mdb]
   [metabase.mq.core :as mq]
   [metabase.startup.core :as startup]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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

(defn cache
  "Fetch the current contents of the Settings cache, a map of key (string) -> value (string)."
  []
  @(cache*))

(defn update-cache!
  "Update the String value of a Setting in the Settings cache."
  [setting-name, ^String new-value]
  (if (seq new-value)
    (swap! (cache*) assoc  setting-name new-value)
    (swap! (cache*) dissoc setting-name)))

(def ^String settings-last-updated-key
  "Internal key used to store the last updated timestamp for Settings."
  "settings-last-updated")

(defn- update-settings-last-updated-in-db!
  "Update the value of `settings-last-updated` in the DB; if the row does not exist, insert one."
  []
  (log/debug "Updating value of settings-last-updated in DB...")
  ;; for MySQL, cast(current_timestamp AS char); for H2 & Postgres, cast(current_timestamp AS text)
  (let [current-timestamp-as-string-honeysql (h2x/cast (if (= (mdb/db-type) :mysql) :char :text)
                                                       [:raw "current_timestamp"])]
    ;; attempt to UPDATE the existing row. If no row exists, `t2/update!` will return 0...
    (or (pos? (t2/update! :setting  {:key settings-last-updated-key} {:value current-timestamp-as-string-honeysql}))
        ;; ...at which point we will try to INSERT a new row. Note that it is entirely possible two instances can both
        ;; try to INSERT it at the same time; one instance would fail because it would violate the PK constraint on
        ;; `key`, and throw a SQLException. As long as one instance updates the value, we are fine, so we can go ahead
        ;; and ignore that Exception if one is thrown.
        (try
          ;; Use `simple-insert!` because we do *not* want to trigger pre-insert behavior, such as encrypting `:value`
          (t2/insert! (t2/table-name (t2/resolve-model :model/Setting)) :key settings-last-updated-key, :value current-timestamp-as-string-honeysql)
          (catch java.sql.SQLException e
            ;; go ahead and log the Exception anyway on the off chance that it *wasn't* just a race condition issue
            (log/errorf "Error updating Settings last updated value: %s"
                        (with-out-str (jdbc/print-sql-exception-chain e)))))))
  ;; Now that we updated the value in the DB, go ahead and update our cached value as well, because we know about the
  ;; changes
  (swap! (cache*) assoc settings-last-updated-key (t2/select-one-fn :value :model/Setting :key settings-last-updated-key)))

(defn broadcast-cache-invalidation!
  "Update the `settings-last-updated` timestamp in the DB and broadcast a cache invalidation signal to all nodes."
  []
  (update-settings-last-updated-in-db!)
  (mq/with-topic :topic/settings-cache-invalidated [t]
    (mq/put t {:invalidated-at (System/currentTimeMillis)})))

(defn cache-last-updated-at
  "Fetch the value of `settings-last-updated`, indicating the timestamp of the settings cache. Possibly null."
  []
  (get (cache) settings-last-updated-key))

(defn restore-cache!
  "Populate cache with the latest hotness from the db"
  []
  (log/debug "Refreshing Settings cache...")
  (reset! (cache*) (t2/select-fn->fn :key :value :model/Setting)))

(defmethod startup/def-startup-logic! ::CacheInvalidationSubscription [_]
  (mq/listen!
   :topic/settings-cache-invalidated
   {}
   (fn [_msg]
     (log/debug "Received settings cache invalidation signal")
     (restore-cache!))))
