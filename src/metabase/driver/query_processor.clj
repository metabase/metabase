(ns metabase.driver.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific implementations."
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [medley.core :as m]
            [swiss.arrows :refer [<<-]]
            [metabase.db :refer :all]
            [metabase.driver.interface :as i]
            (metabase.driver.query-processor [annotate :as annotate]
                                             [expand :as expand])
            (metabase.models [field :refer [Field], :as field]
                             [foreign-key :refer [ForeignKey]])
            [metabase.util :as u]))

;; # CONSTANTS

(def ^:const max-result-rows
  "Maximum number of rows the QP should ever return."
  10000)

(def ^:const max-result-bare-rows
  "Maximum number of rows the QP should ever return specifically for `rows` type aggregations."
  2000)


;; # DYNAMIC VARS

(def ^:dynamic *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)


;; +----------------------------------------------------------------------------------------------------+
;; |                                     QP INTERNAL IMPLEMENTATION                                     |
;; +----------------------------------------------------------------------------------------------------+

(defn- wrap-catch-exceptions [qp]
  (fn [query]
    (try (qp query)
         (catch Throwable e
           (.printStackTrace e)
           {:status     :failed
            :error      (.getMessage e)
            :stacktrace (u/filtered-stacktrace e)
            :query      (dissoc query :database :driver)
            :expanded-query (try (dissoc (expand/expand query) :database :driver)
                                 (catch Throwable _))}))))


(defn- pre-expand [qp]
  (fn [query]
    (qp (expand/expand query))))


(defn- post-add-row-count-and-status
  "Wrap the results of a successfully processed query in the format expected by the frontend (add `row_count` and `status`)."
  [qp]
  (fn [query]
    (let [results     (qp query)
          num-results (count (:rows results))]
      (cond-> {:row_count num-results
               :status    :completed
               :data      results}
        ;; Add :rows_truncated if we've hit the limit so the UI can let the user know
        (= num-results max-result-rows) (assoc-in [:data :rows_truncated] max-result-rows)))))

(defn- should-add-implicit-fields? [{{:keys [fields breakout], {ag-type :aggregation-type} :aggregation} :query}]
  (and (or (not ag-type)
           (= ag-type :rows))
       (not breakout)
       (not fields)))

(defn- pre-add-implicit-fields
  "Add an implicit `fields` clause to queries with `rows` aggregations."
  [qp]
  (fn [{{:keys [source-table], {source-table-id :id} :source-table} :query, :as query}]
    (qp (if-not (should-add-implicit-fields? query)
          query
          (let [fields (->> (sel :many :fields [Field :name :base_type :special_type :table_id :id :position :description], :table_id source-table-id, :active true,
                                 :preview_display true, :field_type [not= "sensitive"], :parent_id nil, (k/order :position :asc), (k/order :id :desc))
                            (map expand/rename-mb-field-keys)
                            (map expand/map->Field)
                            (map #(expand/resolve-table % {source-table-id source-table})))]
            (if-not (seq fields)
              (do (log/warn (format "Table '%s' has no Fields associated with it." (:name source-table)))
                  query)
              (-> query
                  (assoc-in [:query :fields-is-implicit] true)
                  (assoc-in [:query :fields] fields))))))))


(defn- pre-add-implicit-breakout-order-by
  "`Fields` specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that field is *explicitly* referenced in `order-by`."
  [qp]
  (fn [{{breakout-fields :breakout, order-by :order-by} :query, :as query}]
    (let [order-by-fields                   (set (map :field order-by))
          implicit-breakout-order-by-fields (filter (partial (complement contains?) order-by-fields)
                                                    breakout-fields)]
      (qp (cond-> query
            (seq implicit-breakout-order-by-fields) (update-in [:query :order-by] concat (for [field implicit-breakout-order-by-fields]
                                                                                           (expand/map->OrderBySubclause {:field     field
                                                                                                                          :direction :ascending}))))))))


(defn- post-convert-unix-timestamps-to-dates
  "Convert the values of Unix timestamps (for `Fields` whose `:special_type` is `:timestamp_seconds` or `:timestamp_milliseconds`) to dates."
  [qp]
  (fn [query]
    (let [{:keys [cols rows], :as results} (qp query)
          timestamp-seconds-col-indecies   (u/indecies-satisfying #(= (:special_type %) :timestamp_seconds)      cols)
          timestamp-millis-col-indecies    (u/indecies-satisfying #(= (:special_type %) :timestamp_milliseconds) cols)]
      (if-not (or (seq timestamp-seconds-col-indecies)
                  (seq timestamp-millis-col-indecies))
        ;; If we don't have any columns whose special type is a seconds or milliseconds timestamp return results as-is
        results
        ;; Otherwise go modify the results of each row
        (update-in results [:rows] #(for [row %]
                                      (for [[i val] (m/indexed row)]
                                        (cond
                                          (instance? java.util.Date val)               val ; already converted to Date as part of preprocessing,
                                          (contains? timestamp-seconds-col-indecies i) (java.sql.Date. (* val 1000)) ; nothing to do here
                                          (contains? timestamp-millis-col-indecies i)  (java.sql.Date. val)
                                          :else                                        val))))))))


(defn- pre-cumulative-sum
  "Rewrite queries containing a cumulative sum (`cum_sum`) aggregation to simply fetch the values of the aggregate field instead.
   (Cumulative sum is a special case; it is implemented in post-processing).

   Return a pair of [`cumulative-sum-field?` `query`]."
  [{{{ag-type :aggregation-type, ag-field :field} :aggregation, breakout-fields :breakout, order-by :order_by} :query, :as query}]
  (let [cum-sum?                    (= ag-type :cumulative-sum)
        cum-sum-with-breakout?      (and cum-sum?
                                         (seq breakout-fields))
        cum-sum-with-same-breakout? (and cum-sum-with-breakout?
                                         (= (count breakout-fields) 1)
                                         (= (first breakout-fields) ag-field))]

    ;; Cumulative sum is only applicable if it has breakout fields
    ;; For these, store the cumulative sum field under the key :cumulative-sum so we know which one to sum later
    ;; Cumulative summing happens in post-processing
    (cond
      ;; If there's only one breakout field that is the same as the cum_sum field, re-write this as a "rows" aggregation
      ;; to just fetch all the values of the field in question.
      cum-sum-with-same-breakout? [ag-field (update-in query [:query] #(-> %
                                                                           (dissoc :breakout)
                                                                           (assoc :aggregation    (expand/map->Aggregation {:aggregation-type :rows})
                                                                                  :fields         [ag-field])))]

      ;; Otherwise if we're breaking out on different fields, rewrite the query as a "sum" aggregation
      cum-sum-with-breakout? [ag-field (-> query
                                           (assoc-in [:query :aggregation]    (expand/map->Aggregation {:aggregation-type :sum, :field ag-field})))]

      ;; Cumulative sum without any breakout fields should just be treated the same way as "sum". Rewrite query as such
      cum-sum? [false (assoc-in query [:query :aggregation] (expand/map->Aggregation {:aggregation-type :sum, :field ag-field}))]

      ;; Otherwise if this isn't a cum_sum query return it as-is
      :else [false query])))


(defn- post-cumulative-sum
  "Cumulative sum the values of the aggregate `Field` in RESULTS."
  [cum-sum-field {rows :rows, cols :cols, :as results}]
  (let [ ;; Determine the index of the field we need to cumulative sum
        cum-sum-field-index (->> cols
                                 (u/indecies-satisfying #(or (= (:name %) "sum")
                                                             (= (:id %) (:field-id cum-sum-field))))
                                 first)
        _                   (assert (integer? cum-sum-field-index))
        ;; Now make a sequence of cumulative sum values for each row
        values              (->> rows
                                 (map #(nth % cum-sum-field-index))
                                 (reductions +))
        ;; Update the values in each row
        rows                (map (fn [row value]
                                   (assoc (vec row) cum-sum-field-index value))
                                 rows values)]
    (assoc results :rows rows)))


(defn- cumulative-sum [qp]
  (fn [query]
    (let [[cumulative-sum-field query] (pre-cumulative-sum query)]
      (cond->> (qp query)
        cumulative-sum-field (post-cumulative-sum cumulative-sum-field)))))


(defn- limit
  "Add an implicit `limit` clause to queries with `rows` aggregations, and limit the maximum number of rows that can be returned in post-processing."
  [qp]
  (fn [{{{ag-type :aggregation-type} :aggregation, :keys [limit page]} :query, :as query}]
    (let [query   (cond-> query
                    (and (not limit)
                         (not page)
                         (= ag-type :rows)) (assoc-in [:query :limit] max-result-bare-rows))
          results (qp query)]
      (update results :rows (partial take max-result-rows)))))


(defn- pre-log-query [qp]
  (fn [query]
    (when-not *disable-qp-logging*
      (log/debug (u/format-color 'magenta "\n\nPREPROCESSED/EXPANDED:\n%s"
                                 ;; obscure DB details when logging
                                 (u/pprint-to-str (-> query
                                                      (assoc-in [:database :details] "**********")
                                                      (update :driver class))))))
    (qp query)))


;; +------------------------------------------------------------------------------------------------------------------------+
;; |                                                     QUERY PROCESSOR                                                    |
;; +------------------------------------------------------------------------------------------------------------------------+


;; The way these functions are applied is actually straight-forward; it matches the middleware pattern used by Compojure.
;;
;; (defn- qp-middleware-fn [qp]
;;   (fn [query]
;;     (do-some-postprocessing (qp (do-some-preprocessing query)))))
;;
;; Each query processor function is passed a single arg, QP, and returns a function that accepts a single arg, QUERY.
;;
;; This returned function *pre-processes* QUERY as needed, and then passes it to QP.
;; The function may then *post-process* the results of (QP QUERY) as neeeded, and returns the results.
;;
;; Many functions do both pre and post-processing; this middleware pattern allows them to return closures that maintain some sort of
;; internal state. For example, cumulative-sum can determine if it needs to perform cumulative summing, and, if so, modify the query
;; before passing it to QP, and modify the results of that call.
;;
;; For the sake of clarity, functions are named with the following convention:
;; *  Ones that only do pre-processing are prefixed with pre-
;; *  Ones that only do post-processing are prefixed with post-
;; *  Ones that do both aren't prefixed
;;
;; The <<- (reverse-threading macro) is used below for clarity.
;; Pre-processing happens from top-to-bottom, i.e. the QUERY passed to the function returned by POST-ADD-ROW-COUNT-AND-STATUS is the
;; query as modified by PRE-EXPAND.
;;
;; Pre-processing then happens in order from bottom-to-top; i.e. POST-ANNOTATE gets to modify the results, then LIMIT, then CUMULATIVE-SUM, etc.

(defn- wrap-guard-multiple-calls
  "Throw an exception if a QP function accidentally calls (QP QUERY) more than once."
  [qp]
  (let [called? (atom false)]
    (fn [query]
      (assert (not @called?) "(QP QUERY) IS BEING CALLED MORE THAN ONCE!")
      (reset! called? true)
      (qp query))))

(defn- process-structured [{:keys [driver], :as query}]
  (let [driver-process-query      (partial i/process-query driver)
        driver-wrap-process-query (partial i/wrap-process-query-middleware driver)]
    ((<<- wrap-catch-exceptions
          pre-expand
          driver-wrap-process-query
          post-add-row-count-and-status
          pre-add-implicit-fields
          pre-add-implicit-breakout-order-by
          post-convert-unix-timestamps-to-dates
          cumulative-sum
          limit
          annotate/post-annotate
          pre-log-query
          wrap-guard-multiple-calls
          driver-process-query) query)))

(defn- process-native [{:keys [driver], :as query}]
  (let [driver-process-query      (partial i/process-query driver)
        driver-wrap-process-query (partial i/wrap-process-query-middleware driver)]
    ((<<- wrap-catch-exceptions
          driver-wrap-process-query
          post-add-row-count-and-status
          post-convert-unix-timestamps-to-dates
          limit
          wrap-guard-multiple-calls
          driver-process-query) query)))

(defn process
  "Process a QUERY and return the results."
  [driver query]
  (when-not *disable-qp-logging*
    (log/debug (u/format-color 'blue "\nQUERY:\n%s" (u/pprint-to-str query))))
  ((case (keyword (:type query))
     :native process-native
     :query  process-structured)
   (assoc query
          :driver driver)))
