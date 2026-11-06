(ns metabase-enterprise.monitor-relay.db
  "Application database queries for the monitor relay. Each function runs queries from
  [[metabase-enterprise.monitor-relay.sql]], so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase.app-db.core :as mdb]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn engine
  "The app DB's engine: `:postgres`, `:mysql` (MySQL and MariaDB) or `:h2`."
  []
  (mdb/db-type))

(defn stream-page
  "The rows of `stream` with an id above `after`, in id order, at most `limit`."
  [stream after limit]
  (t2/query [(relay.sql/stream-page-sql stream) after limit]))

(defn stream-ranges
  "The rows of `stream` with an id in one of `ranges`, a non-empty collection of `[lo hi]`, in id order, at most
  `limit`."
  [stream ranges limit]
  (t2/query (-> [(relay.sql/stream-ranges-sql stream (count ranges))
                 (apply min (map first ranges))
                 (apply max (map second ranges))]
                (into cat ranges)
                (conj limit))))

(defn time-floor
  "The id of the earliest row of `stream` whose time is at or after the instant `since`, or nil when no row is."
  [stream since]
  (:id (t2/query-one [(relay.sql/time-floor-sql stream) since])))

(defn first-row
  "The first row of `stream` with an id at or above `id`, as `{:id n, :after? b}`: `:after?` says whether its time is
  at or after the instant `since`. Nil when no row is."
  [stream id since]
  (when-let [row (t2/query-one [(relay.sql/first-row-sql stream) since id])]
    {:id (:id row), :after? (pos? (:is_after row))}))

(defn- in-time-zone
  "Calls `thunk` on one connection whose MySQL session time zone is `time-zone`, and sets the zone back after."
  [time-zone thunk]
  (t2/with-connection [_conn]
    (let [saved (:time_zone (t2/query-one ["SELECT @@session.time_zone AS time_zone"]))]
      (t2/query ["SET time_zone = ?" time-zone])
      (try
        (thunk)
        (finally
          (t2/query ["SET time_zone = ?" saved]))))))

(defn state-rows
  "The rows of state `kind` that `read` selects: see [[relay.sql/state-query]]."
  [kind read]
  (let [engine (mdb/db-type)
        query  (relay.sql/state-query engine kind read)]
    ;; The user's times are made text in SQL, in the session time zone.
    (if (and (= :mysql engine) (= :user kind))
      (in-time-zone "+00:00" #(t2/query query))
      (t2/query query))))

(defn change-oldest
  "The change log's smallest id, or nil when it is empty."
  []
  (:id (t2/query-one [(relay.sql/change-oldest-sql)])))

(defn recent-row?
  "Whether `table` has a row whose time is after the instant `since`."
  [table since]
  (boolean (seq (t2/query [(relay.sql/recent-row-sql table) since]))))

(defn- postgres-sequence-names*
  "Per stream, the sequence its table draws its ids from: the one its `id` column owns, else the one its default uses.
  A stream whose sequence cannot be found is left out."
  []
  (into {}
        (for [[stream owned] (t2/query-one [(relay.sql/postgres-sequence-names-sql)])
              :let [seq-name (or owned
                                 (:seq (t2/query-one [(relay.sql/postgres-default-sequence-sql
                                                       (relay.sql/stream-table stream))])))]
              :when seq-name]
          [stream seq-name])))

(def ^:private postgres-sequence-names
  ;; A sequence's name changes only with the schema, so it is read once per app DB.
  (mdb/memoize-for-application-db postgres-sequence-names*))

(defn postgres-sequences
  "Per stream of `streams`, the highest id its table's id sequence has given out: 0 before the first. One statement
  reads them all. A stream whose sequence cannot be found is left out, so the receiver never takes 0 for its value."
  [streams]
  (let [seq-names (select-keys (postgres-sequence-names) streams)]
    (into {}
          (when (seq seq-names)
            (for [{:keys [stream last_value is_called]} (t2/query [(relay.sql/postgres-sequences-sql seq-names)])]
              [(keyword stream) (if is_called last_value (dec last_value))])))))

(defn- set-stats-expiry!
  "Sets this session's `information_schema_stats_expiry` to `value`, SQL such as `0` or `DEFAULT`."
  [value]
  (try
    (t2/query [(str "SET SESSION information_schema_stats_expiry = " value)])
    (catch Exception _
      ;; MariaDB has no such variable, and does not cache the value.
      nil)))

(defn mysql-auto-increments
  "The `:table_name` and next `:auto_increment` of the tables of `streams`, read past MySQL's cache of table
  statistics. Then it sets the session back to the default, since the connection goes back to the pool."
  [streams]
  (t2/with-connection [_conn]
    (set-stats-expiry! "0")
    (try
      (t2/query (into [(relay.sql/mysql-auto-increments-sql streams)] (map relay.sql/stream-table) streams))
      (finally
        (set-stats-expiry! "DEFAULT")))))
