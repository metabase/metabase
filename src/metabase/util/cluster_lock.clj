(ns metabase.util.cluster-lock
  "Utility for taking a cluster wide lock using the application database"
  (:require
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.util.malli :as mu]
   [metabase.util.retry :as retry]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection PreparedStatement)))

(set! *warn-on-reflection* true)

(def ^:private cluster-lock-timeout-seconds 1)

(defn- is-canceled-statement?
  [e]
  (driver/query-canceled? (mdb/db-type) e))

(def ^:private default-retry-config
  {:max-attempts 5
   :multiplier 1.0
   :randomization-factor 0.1
   :initial-interval-millis 1000
   :max-interval-millis 1000
   :retry-on-exception-pred is-canceled-statement?})

(defn prepare-statement
  "Create a prepared statement to query cache"
  ^PreparedStatement [^Connection conn lock-name-str timeout]
  (let [stmt (.prepareStatement conn ^String (first (mdb.query/compile {:select [:lock.lock_name]
                                                                        :from [[:metabase_cluster_lock :lock]]
                                                                        :where [:= :lock.lock_name [:raw "?"]]
                                                                        :for :update})))]
    (try
      (doto stmt
        (.setQueryTimeout timeout)
        (.setString 1 lock-name-str)
        (.setMaxRows 1))
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(defn- do-with-cluster-lock*
  [lock-name-str timeout-seconds thunk]
  (t2/with-transaction [conn]
    (with-open [stmt (prepare-statement conn lock-name-str timeout-seconds)
                result-set (.executeQuery stmt)]
      (when-not (.next result-set)
        (t2/query-one {:insert-into [:metabase_cluster_lock]
                       :columns [:lock_name]
                       :values [[lock-name-str]]})))
    (thunk)))

(mu/defn do-with-cluster-lock
  "Impl for `with-cluster-lock`.

  Call `thunk` after first synchronizing with the metabase cluster by taking a lock in the appdb."
  [opts :- [:or :keyword
            [:map
             [:lock-name                     :keyword]
             [:timeout-seconds   {:optional true} :int]
             [:retry-config      {:optional true} [:ref ::retry/retry-overrides]]]]
   thunk :- ifn?]
  (cond
    (= (mdb/db-type) :h2) (thunk) ;; h2 does not respect the query timeout when taking
    (keyword? opts) (do-with-cluster-lock {:lock-name opts} thunk)
    :else (let [{:keys [timeout-seconds retry-config lock-name] :or {timeout-seconds cluster-lock-timeout-seconds}} opts
                lock-name-str (str (namespace lock-name) "/" (name lock-name))
                do-with-cluster-lock** (fn [] (do-with-cluster-lock* lock-name-str timeout-seconds thunk))
                config (merge default-retry-config retry-config)
                retrier (retry/make config)]
            (try
              (retrier do-with-cluster-lock**)
              (catch Throwable e
                (if (is-canceled-statement? e)
                  (throw (ex-info "Failed to run statement with cluster lock"
                                  {:retries (:max-attempts config)}
                                  e))
                  (throw e)))))))

(defmacro with-cluster-lock
  "Run `body` in a tranactions that tries to take a lock from the metabase_cluster_lock table of
  the specified name to coordinate concurrency with other metabase instances sharing the appdb."
  ([lock-options & body]
   `(do-with-cluster-lock ~lock-options (fn [] ~@body))))

(def card-statistics-lock
  "A shared keyword that any method doing a batch update of card statistics can use for the cluster lock"
  ::statistics-lock)
