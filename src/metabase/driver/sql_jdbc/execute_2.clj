(ns metabase.driver.sql-jdbc.execute-2
  (:require [clojure.core.async :as a]
            [clojure.string :as str]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor
             [interface :as qp.i]
             [store :as qp.store]
             [util :as qp.util]])
  (:import [java.sql Connection PreparedStatement ResultSet ResultSetMetaData Types]
           [java.time LocalDate LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           javax.sql.DataSource))

;;; --------------------------------------------------- SET PARAMS ---------------------------------------------------

(defmulti set-parameter
  {:arglists '([driver prepared-statement i object])}
  (fn [driver _ _ object]
    [(driver/dispatch-on-initialized-driver driver) (class object)])
  :hierarchy #'driver/hierarchy)

(defn set-object [^PreparedStatement prepared-statement, ^Integer index, object]
  (.setObject prepared-statement index object))

(defmethod set-parameter :default
  [_ prepared-statement i object]
  (set-object prepared-statement i object))

(defmethod set-parameter [::driver/driver ZonedDateTime]
  [driver prepared-statement i t]
  (set-parameter driver prepared-statement i (t/offset-date-time t)))


;;; ------------------------------------------------------ READ ------------------------------------------------------

(defmulti read-value
  {:arglists '([driver column-type result-set result-set-metadata i])}
  (fn [driver column-type _ _ _]
    [(driver/dispatch-on-initialized-driver driver) column-type])
  :hierarchy #'driver/hierarchy)

(defmethod read-value :default
  [driver column-type ^ResultSet rs _ ^Integer i]
  #_(println (list 'read-value driver (type-num->name column-type) 'rs 'rsmeta i)) ; NOCOMMIT
  (.getObject rs i))

#_(def ^:private ^java.util.Calendar utc-calendar
  (java.util.Calendar/getInstance (java.util.TimeZone/getTimeZone "UTC")))

(defn get-object-of-class [^ResultSet result-set, ^Integer index, ^Class klass]
  #_(println (list 'get-object-of-class 'rs index klass)) ; NOCOMMIT
  (.getObject result-set index klass))

(defmethod read-value [::driver/driver Types/TIMESTAMP]
  [_ _ ^ResultSet rs ^ResultSetMetaData rsmeta i]
  #_(println "(.getColumnType (.getMetaData rs) i):" (type-num->name (.getColumnType (.getMetaData rs) i))) ; NOCOMMIT
  (get-object-of-class rs i OffsetDateTime #_LocalDateTime))

(defmethod read-value [::driver/driver Types/TIMESTAMP_WITH_TIMEZONE]
  [_ _ rs _ i]
  (get-object-of-class rs i OffsetDateTime))

(defmethod read-value [::driver/driver Types/DATE]
  [_ _ rs _ i]
  (get-object-of-class rs i LocalDate))

(defmethod read-value [::driver/driver Types/TIME]
  [_ _ rs _ i]
  (get-object-of-class rs i LocalTime))

(defmethod read-value [::driver/driver Types/TIME_WITH_TIMEZONE]
  [_ _ rs _ i]
  (get-object-of-class rs i OffsetTime))


;;; ---------------------------------------------------- EXECUTE -----------------------------------------------------

(defn- connection
  ^Connection [^DataSource datasource]
  (let [connection (.getConnection datasource)]
    (u/ignore-exceptions
      (.setTransactionIsolation connection Connection/TRANSACTION_READ_UNCOMMITTED))
    (.setReadOnly connection true)
    connection))

(defn set-params [driver prepared-statement params]
  (doseq [[i param] (map-indexed vector params)]
    (set-parameter driver prepared-statement (inc i) param)))

(defn- prepared-statement
  ^PreparedStatement [driver, ^Connection connection, [^String sql & params] {:keys [max-rows]}]
  (let [prepared-statement (.prepareStatement connection sql ResultSet/TYPE_FORWARD_ONLY ResultSet/CONCUR_READ_ONLY)]
    (set-params driver prepared-statement params)
    (.setMaxRows prepared-statement (or max-rows qp.i/absolute-max-results))
    prepared-statement))

(defn- column-names [^ResultSetMetaData result-set-metadata]
  (vec (for [i (range 1 (inc (.getColumnCount result-set-metadata)))]
         (.getColumnLabel result-set-metadata i))))

(defn- column-readers [driver, ^ResultSetMetaData result-set-metadata]
  (for [i    (range 1 (inc (.getColumnCount result-set-metadata)))
        :let [column-type (.getColumnType result-set-metadata i)
              method      (get-method read-value [driver column-type])]]
    (do
      #_(printf "method for %s column %s of type %s is %s\n" driver i (type-num->name column-type) method) ; NOCOMMIT
      (fn [result-set]
        (method driver column-type result-set result-set-metadata i)))))

(defn- read-result-rows [^ResultSet result-set readers {:keys [row-xform results-xform]
                                                        :or   {row-xform     vec
                                                               results-xform vec}}]
  (letfn [(results []
            (lazy-seq
             (when (.next result-set)
               (cons
                (row-xform (map #(% result-set) readers))
                (results)))))]
    (results-xform (results))))

(defn- read-results [driver, ^ResultSet result-set, options]
  (let [result-set-metadata (.getMetaData result-set)
        column-names        (column-names result-set-metadata)
        column-readers      (column-readers driver result-set-metadata)]
    {:rows    (read-result-rows result-set column-readers options)
     :columns (vec column-names)}))

(defn- execute [driver datasource sql-params options]

  (with-open [conn               (connection datasource)
              prepared-statement (prepared-statement driver conn sql-params options)
              result-set         (.executeQuery prepared-statement)]
    (read-results driver result-set options)))


(defn- datasource []
  (:datasource (sql-jdbc.conn/db->pooled-connection-spec (qp.store/database))))

(defn- query->sql-params [{{sql :query, :keys [params]} :native, :as  query}]
  (let [remark (qp.util/query->remark query)
        sql    (if remark
                 (str "-- " remark "\n" sql)
                 sql)]
    (cons sql params)))

(defn execute-query [driver query options]
  (execute
   driver
   (datasource)
   (query->sql-params query)
   (merge
    {:max-rows (mbql.u/query->max-rows-limit query)}
    options)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Alternate Async Impl                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn read-result-rows-async [^ResultSet result-set readers chan]
  (loop []
    (if (.next result-set)
      (let [row (mapv #(% result-set) readers)]
        (when (a/>!! chan row)
          (recur)))
      (a/close! chan))))

(defn- read-results-async [driver, ^ResultSet result-set, chan]
  (let [result-set-metadata (.getMetaData result-set)
        column-names        (column-names result-set-metadata)
        column-readers      (column-readers driver result-set-metadata)]
    {:rows    (read-result-rows-async result-set column-readers chan)
     :columns (vec column-names)}))

(defn- execute-async [driver datasource sql-params chan options]
  (with-open [conn               (connection datasource)
              prepared-statement (prepared-statement driver conn sql-params options)
              result-set         (.executeQuery prepared-statement)]
    (read-results driver result-set chan)))

(defn- execute-query-async [driver query options]
  (let [chan (a/chan 100)]
    (execute-async
     driver
     (datasource)
     (query->sql-params query)
     chan
     (merge
      {:max-rows (mbql.u/query->max-rows-limit query)}
      options))
    (loop [results []]
      (let [row (a/<!! chan)]
        (println "ROW = " row)
        (if row
          (recur (conj results row))
          results)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    NOCOMMIT                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; NOCOMMIT
(def ^:private sql-types
  (into {} (for [^java.lang.reflect.Field f (.getFields java.sql.Types)]
             [(keyword (str/lower-case (str/replace (.getName f) #"_" "-")))
              (.get f nil)])))

;; NOCOMMIT
(def ^:private type-num->name
  (zipmap (vals sql-types) (keys sql-types)))

;; NOCOMMIT
(defn db []
  (toucan.db/select-one 'Database :name "test-data-with-timezones", :engine "postgres"))

;; NOCOMMIT
(defn spec []
  #_(sql-jdbc.conn/notify-database-updated :postgres (toucan.db/select-one 'Database :id 89))
  (sql-jdbc.conn/db->pooled-connection-spec (db)))

;; NOCOMMIT
(defn datasource* ^javax.sql.DataSource []
  (:datasource (spec)))

;; NOCOMMIT
(defn y []
  (execute
   :postgres
   (datasource*)
   ["SELECT * FROM users LIMIT 5"]
   {:row-xform     vec
    :results-xform (fn [results]
                     (vec (take 3 results)))
    :max-rows 100}))

(defn y2k []
  )
