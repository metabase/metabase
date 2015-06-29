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
            [metabase.driver.query-processor.expand :as expand]
            (metabase.models [field :refer [Field]]
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

(def ^:dynamic *driver*
  "The driver currently being used to process this query."
  (atom nil))


;; +----------------------------------------------------------------------------------------------------+
;; |                                     QP INTERNAL IMPLEMENTATION                                     |
;; +----------------------------------------------------------------------------------------------------+

(defn- wrap-catch-exceptions [qp]
  (fn [query]
    (try (qp query)
         (catch Throwable e
           (.printStackTrace e)
           {:status :failed
            :error  (.getMessage e)}))))


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


(defn- pre-add-implicit-fields
  "Add an implicit `fields` clause to queries with `rows` aggregations."
  [qp]
  (fn [{{:keys [fields breakout source-table], {source-table-id :id} :source-table, {ag-type :aggregation-type} :aggregation} :query, :as query}]
    (qp (if (or (not (= ag-type :rows)) breakout fields) query
            (-> query
                (assoc-in [:query :fields-is-implicit] true)
                (assoc-in [:query :fields] (->> (sel :many [Field :name :base_type :special_type :table_id], :table_id source-table-id, :active true,
                                                     :preview_display true, :field_type [not= "sensitive"], (k/order :position :asc), (k/order :id :desc))
                                                (map expand/rename-mb-field-keys)
                                                (mapv expand/map->Field)))
                (expand/resolve-tables source-table))))))


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
    (let [[cumulative-sum-field query] (pre-cumulative-sum query)
          results                      (qp query)]
      (cond->> (qp query)
        cumulative-sum-field (post-cumulative-sum cumulative-sum-field)))))


(defn- limit
  "Add an implicit `limit` clause to queries with `rows` aggregations, and limit the maximum number of rows that can be returned in post-processing."
  [qp]
  (fn [{{{ag-type :aggregation-type} :aggregation} :query, :as query}]
    (let [query   (cond-> query
                    (= ag-type :rows) (assoc :limit max-result-bare-rows))
          results (qp query)]
      (update-in results [:rows] (partial take max-result-rows)))))


(defn- pre-log-query [qp]
  (fn [query]
    (when-not *disable-qp-logging*
      (log/debug (u/format-color 'magenta "\n\nPREPROCESSED/EXPANDED:\n%s"
                                 ;; obscure DB details when logging
                                 (u/pprint-to-str (assoc-in query [:database :details] "**********")))))
    (qp query)))


;; +----------------------------------------------------------------------------------------------------+
;; |                                             ANNOTATION                                             |
;; +----------------------------------------------------------------------------------------------------+

;; ## Ordering
;;
;; Fields should be returned in the following order:
;; 1.  Breakout Fields
;;
;; 2.  Aggregation Fields (e.g. sum, count)
;;
;; 3.  Fields clause Fields, if they were added explicitly
;;
;; 4.  All other Fields, sorted by:
;;     A.  :position (ascending)
;;         Users can manually specify default Field ordering for a Table in the Metadata admin. In that case, return Fields in the specified
;;         order; most of the time they'll have the default value of 0, in which case we'll compare...
;;
;;     B.  :special_type "group" -- :id Fields, then :name Fields, then everyting else
;;         Attempt to put the most relevant Fields first. Order the Fields as follows:
;;         1.  :id Fields
;;         2.  :name Fields
;;         3.  all other Fields
;;
;;     C.  Field Name
;;         When two Fields have the same :position and :special_type "group", fall back to sorting Fields alphabetically by name.
;;         This is arbitrary, but it makes the QP deterministic by keeping the results in a consistent order, which makes it testable.
(defn- order-cols
  "Construct a sequence of column keywords that should be used for pulling ordered rows from RESULTS.
   FIELDS should be a sequence of all `Fields` for the `Table` associated with QUERY."
  [{{breakout-fields :breakout, fields-fields :fields, fields-is-implicit :fields-is-implicit} :query} results fields]
  {:post [(= (set %)
             (set (keys (first results))))]}
  (let [;; TODO - This function was written before the advent of the expanded query it is designed to work with Field IDs rather than expanded forms
        ;; Since this logic is delecate I've side-stepped the issue by converting the expanded Fields back to IDs for the time being.
        ;; We should carefully re-work this function to use expanded Fields so we don't need the complicated logic below to fetch their names
        breakout-ids     (map :field-id breakout-fields)
        fields-ids       (map :field-id fields-fields)

        field-id->field  (zipmap (map :id fields) fields)

        ;; Get IDs from Fields clause *if* it was added explicitly and other all other Field IDs for Table.
        fields-ids       (when-not fields-is-implicit fields-ids)
        all-field-ids    (->> fields    ; Sort the Fields.
                              (sort-by (fn [{:keys [position special_type name]}] ; For each field generate a vector of
                                         [position ; [position special-type-group name]
                                          (cond ; and Clojure will take care of the rest.
                                            (= special_type :id)   0
                                            (= special_type :name) 1
                                            :else                  2)
                                          name]))
                              (map :id)) ; Return the sorted IDs

        ;; Concat the Fields clause IDs + the sequence of all Fields ID for the Table.
        ;; Then filter out ones that appear in breakout clause and remove duplicates
        ;; which effectively gives us parts #3 and #4 from above.
        non-breakout-ids (->> (concat fields-ids all-field-ids)
                              (filter (complement (partial contains? (set breakout-ids))))
                              distinct)

        ;; Get all the column name keywords returned by the results
        result-kws       (set (keys (first results)))

        ;; Make a helper function that will take a sequence of Field IDs and convert them to corresponding column name keywords.
        ;; Don't include names that aren't part of RESULT-KWS: we fetch *all* the Fields for a Table regardless of the Query, so
        ;; there are likely some unused ones.
        ids->kws         (fn [field-ids]
                           (some->> (map field-id->field field-ids)
                                    (map :name)
                                    (map keyword)
                                    (filter (partial contains? result-kws))))

        ;; Use fn above to get the keyword column names of breakout clause fields [#1] + fields clause fields / other non-aggregation fields [#3 and #4]
        breakout-kws     (ids->kws breakout-ids)
        non-breakout-kws (ids->kws non-breakout-ids)

        ;; Now get all the keyword column names specific to aggregation, such as :sum or :count [#2].
        ;; Just get all the items in RESULT-KWS that *aren't* part of BREAKOUT-KWS or NON-BREAKOUT-KWS
        ag-kws           (->> result-kws
                              ;; TODO - Currently, this will never be more than a single Field, since we only
                              ;; support a single aggregation clause at this point. When we add support for
                              ;; multiple aggregation clauses, we'll need to add some logic to make sure they're
                              ;; being ordered correctly, e.g. the first aggregate column before the second, etc.
                              (filter (complement (partial contains? (set (concat breakout-kws non-breakout-kws))))))]

    ;; Now combine the breakout [#1] + aggregate [#2] + "non-breakout" [#3 &  #4] column name keywords into a single sequence
    (concat breakout-kws ag-kws non-breakout-kws)))

(defn- add-fields-extra-info
  "Add `:extra_info` about `ForeignKeys` to `Fields` whose `special_type` is `:fk`."
  [fields]
  ;; Get a sequence of add Field IDs that have a :special_type of FK
  (let [fk-field-ids            (->> fields
                                     (filter #(= (:special_type %) :fk))
                                     (map :id)
                                     (filter identity))
        ;; Look up the Foreign keys info if applicable.
        ;; Build a map of FK Field IDs -> Destination Field IDs
        field-id->dest-field-id (when (seq fk-field-ids)
                                  (sel :many :field->field [ForeignKey :origin_id :destination_id], :origin_id [in fk-field-ids]))

        ;; Build a map of Destination Field IDs -> Destination Fields
        dest-field-id->field    (when (seq fk-field-ids)
                                  (sel :many :id->fields [Field :id :name :table_id :description :base_type :special_type], :id [in (vals field-id->dest-field-id)]))]

    ;; Add the :extra_info + :target to every Field. For non-FK Fields, these are just {} and nil, respectively.
    (for [{field-id :id, :as field} fields]
      (let [dest-field (when (seq fk-field-ids)
                         (some->> field-id
                                  field-id->dest-field-id
                                  dest-field-id->field))]
        (assoc field
               :target     dest-field
               :extra_info (if-not dest-field {}
                                   {:target_table_id (:table_id dest-field)}))))))

(defn- get-cols-info
  "Get column info for the `:cols` part of the QP results."
  [{{{ag-type :aggregation-type, ag-field :field} :aggregation} :query} fields ordered-col-kws]
  (let [field-kw->field (zipmap (map #(keyword (:name %)) fields)
                                fields)
        field-id->field (delay (zipmap (map :id fields) ; a delay since we probably won't need it
                                       fields))]
    (->> (for [col-kw ordered-col-kws]
           (or
            ;; If col-kw is a known Field return that
            (field-kw->field col-kw)
            ;; Otherwise it is an aggregation column like :sum, build a map of information to return
            (merge (assert ag-type)
                   {:name        (name col-kw)
                    :id          nil
                    :table_id    nil
                    :description nil}
                   (cond
                     ;; avg, stddev, and sum should inherit the base_type and special_type from the Field they're aggregating
                     (contains? #{:avg :stddev :sum} col-kw) {:base_type    (:base-type ag-field)
                                                              :special_type (:special-type ag-field)}
                     ;; count should always be IntegerField/number
                     (= col-kw :count)                       {:base_type    :IntegerField
                                                              :special_type :number}
                     ;; Otherwise something went wrong !
                     :else                                   (throw (Exception. (format "Annotation failed: don't know what to do with Field '%s'.\nExpected these Fields:\n%s"
                                                                                        col-kw
                                                                                        (u/pprint-to-str field-kw->field))))))))
         ;; Add FK info the the resulting Fields
         add-fields-extra-info)))

(defn- post-annotate
  "Take a sequence of RESULTS of executing QUERY and return the \"annotated\" results we pass to postprocessing -- the map with `:cols`, `:columns`, and `:rows`.
   RESULTS should be a sequence of *maps*, keyed by result column -> value."
  [qp]
  (fn [{{{source-table-id :id} :source-table} :query, :as query}]
    (let [{:keys [results uncastify-fn]} (qp query)
          results                        (if-not uncastify-fn results
                                                 (for [row results]
                                                   (m/map-keys uncastify-fn row)))
          fields                         (sel :many :fields [Field :id :table_id :name :description :base_type :special_type],
                                              :table_id source-table-id, :active true)
          ordered-col-kws                (order-cols query results fields)]
      {:rows    (for [row results]
                  (mapv row ordered-col-kws))                           ; might as well return each row and col info as vecs because we're not worried about making
       :columns (mapv name ordered-col-kws)                             ; making them lazy, and results are easier to play with in the REPL / paste into unit tests
       :cols    (vec (get-cols-info query fields ordered-col-kws))})))  ; as vecs. Make sure :rows stays lazy!


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

(defn- process-structured [driver query]
  (let [driver-process-query (partial i/process-query driver)]
    ((<<- wrap-catch-exceptions
          pre-expand
          post-add-row-count-and-status
          pre-add-implicit-fields
          pre-add-implicit-breakout-order-by
          post-convert-unix-timestamps-to-dates
          cumulative-sum
          limit
          post-annotate
          pre-log-query
          driver-process-query) query)))

(defn- process-native [driver query]
  (let [driver-process-query (partial i/process-query driver)]
    ((<<- wrap-catch-exceptions
          post-add-row-count-and-status
          post-convert-unix-timestamps-to-dates
          limit
          driver-process-query) query)))

(defn process
  "Process a QUERY and return the results."
  [driver query]
  (binding [*driver* driver]
    ((case (keyword (:type query))
       :native process-native
       :query  process-structured)
     driver query)))
