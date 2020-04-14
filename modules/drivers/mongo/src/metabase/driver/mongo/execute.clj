(ns metabase.driver.mongo.execute
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.driver.mongo
             [query-processor :as mongo.qp]
             [util :refer [*mongo-connection*]]]
            [metabase.query-processor
             [context :as context]
             [error-type :as error-type]
             [reducible :as qp.reducible]]
            [metabase.util
             [date-2 :as u.date]
             [i18n :as ui18n :refer [tru]]]
            [monger
             [conversion :as m.conversion]
             [util :as m.util]]
            [schema.core :as s])
  (:import [com.mongodb AggregationOptions AggregationOptions$OutputMode Cursor DB DBObject]
           java.util.concurrent.TimeUnit))

;;; ---------------------------------------------------- Metadata ----------------------------------------------------

;; projections will be something like `[:_id :date~~~default :user_id :venue_id]`
(s/defn ^:private result-columns-unescape-map :- {s/Str s/Str}
  "Returns a map of column name in result row -> unescaped column name to return in metadata e.g.

    {\"date_field~~~month\" \"date_field\"}"
  [projections :- mongo.qp/Projections]
  (into
   {}
   (for [k     projections
         :let  [unescaped (-> k
                              (str/replace #"___" ".")
                              (str/replace #"~~~(.+)$" ""))]
         :when (not (= k unescaped))]
     [k unescaped])))

(defn check-columns
  "Make sure there are no columns coming back from `results` that we weren't expecting. If there are, we did something
  wrong here and the query we generated is off."
  [columns first-row-col-names]
  {:pre [(every? string? columns) (every? string? first-row-col-names)]}
  (when (seq first-row-col-names)
    (let [expected-cols   (set columns)
          actual-cols     (set first-row-col-names)
          not-in-expected (set/difference actual-cols expected-cols)]
      (when (seq not-in-expected)
        (throw (ex-info (tru "Unexpected columns in results: {0}" (sort not-in-expected))
                        {:type     error-type/driver
                         :actual   actual-cols
                         :expected expected-cols}))))))

(s/defn ^:private result-col-names :- {:row [s/Str], :unescaped [s/Str]}
  "Return column names we can expect in each `:row` of the results, and the `:unescaped` versions we should return in
  thr query result metadata."
  [{:keys [mbql? projections]} first-row-col-names]
  ;; some of the columns may or may not come back in every row, because of course with mongo some key can be missing.
  ;; That's ok, the logic below where we call `(mapv row columns)` will end up adding `nil` results for those columns.
  (if-not mbql?
    (zipmap [:row :unescaped] (repeat 2 (into [] first-row-col-names)))
    (do
      ;; ...but, on the other hand, if columns come back that we weren't expecting, our code is broken.
      ;; Check to make sure that didn't happen.
      (check-columns projections first-row-col-names)
      {:row       (vec projections)
       :unescaped (let [unescape-map (result-columns-unescape-map projections)]
                    (vec (for [k projections]
                           (get unescape-map k k))))})))

(defn- result-metadata [unescaped-col-names]
  {:cols (vec (for [col-name unescaped-col-names]
                {:name col-name}))})


;;; ------------------------------------------------------ Rows ------------------------------------------------------

(defn- row->vec [row-col-names]
  (fn [^DBObject row]
    (mapv (fn [^String col-name]
            (let [val (.get row col-name)]
              (m.conversion/from-db-object val :keywordize)))
          row-col-names)))

(defn- unstringify-dates
  "Convert string dates, which we wrap in dictionaries like `{:___date <str>}`, back to `Timestamps`.
  This can't be done within the Mongo aggregation framework itself."
  [row]
  (mapv (fn [v]
          (if (and (map? v)
                   (contains? v :___date))
            (u.date/parse (:___date v))
            v))
        row))

(defn- post-process-row [{:keys [mbql?]} row-col-names]
  ;; if we formed the query using MBQL then we apply a couple post processing functions
  (if mbql?
    (comp unstringify-dates
          (row->vec row-col-names))
    (row->vec row-col-names)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Run                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- row-keys [^DBObject row]
  (when row
    (.keySet row)))

(defn- aggregation-options ^AggregationOptions [timeout-ms]
  ;; see https://mongodb.github.io/mongo-java-driver/3.7/javadoc/com/mongodb/AggregationOptions.Builder.html
  (.build (doto (AggregationOptions/builder)
            (.allowDiskUse true)
            (.outputMode AggregationOptions$OutputMode/CURSOR)
            ;; TODO - consider what the best batch size option is here. Not sure what the default is.
            (.batchSize (int 100))
            (.maxTime (int timeout-ms) TimeUnit/MILLISECONDS))))

(defn- aggregate
  "Execute a MongoDB aggregation query."
  ^Cursor [^DB db ^String coll stages timeout-ms]
  (let [coll     (.getCollection db coll)
        agg-opts (aggregation-options timeout-ms)
        pipe     (m.util/into-array-list (m.conversion/to-db-object stages))]
    (.aggregate coll pipe agg-opts)))

(defn- reducible-rows [context ^Cursor cursor first-row post-process]
  {:pre [(fn? post-process)]}
  (let [has-returned-first-row? (volatile! false)]
    (letfn [(first-row-thunk []
              (post-process first-row))
            (remaining-rows-thunk []
              (when (.hasNext cursor)
                (post-process (.next cursor))))
            (row-thunk []
              (if-not @has-returned-first-row?
                (do (vreset! has-returned-first-row? true)
                    (first-row-thunk))
                (remaining-rows-thunk)))]
      (qp.reducible/reducible-rows row-thunk (context/canceled-chan context)))))

(defn- reduce-results [native-query context ^Cursor cursor respond]
  (try
    (let [first-row                        (when (.hasNext cursor)
                                             (.next cursor))
          {row-col-names       :row
           unescaped-col-names :unescaped} (result-col-names native-query (row-keys first-row))]
      (log/tracef "Renaming columns in results %s -> %s" (pr-str row-col-names) (pr-str unescaped-col-names))
      (respond (result-metadata unescaped-col-names)
               (if-not first-row
                 []
                 (reducible-rows context cursor first-row (post-process-row native-query row-col-names)))))
    (finally
      (.close cursor))))

(defn- parse-query-string
  "Parse a serialized native query. Like a normal JSON parse, but handles BSON/MongoDB extended JSON forms."
  [^String s]
  (try
    (for [^org.bson.BsonValue v (org.bson.BsonArray/parse s)]
      (com.mongodb.BasicDBObject. (.asDocument v)))
    (catch Throwable e
      (throw (ex-info (tru "Unable to parse query: {0}" (.getMessage e))
               {:type  error-type/invalid-query
                :query s}
               e)))))

(defn execute-reducible-query
  "Process and run a native MongoDB query."
  [{{:keys [collection query], :as native-query} :native} context respond]
  {:pre [(string? collection) (fn? respond)]}
  (let [query  (cond-> query
                 (string? query) parse-query-string)
        cursor (aggregate *mongo-connection* collection query (context/timeout context))]
    (a/go
      (when (a/<! (context/canceled-chan context))
        (.close cursor)))
    (reduce-results native-query context cursor respond)))
