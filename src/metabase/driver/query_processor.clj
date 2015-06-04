(ns metabase.driver.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific implementations."
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.interface :as i]
            [metabase.models.field :refer [Field field->fk-table]]))

(declare add-implicit-breakout-order-by
         add-implicit-limit
         add-implicit-fields
         get-special-column-info
         preprocess-cumulative-sum
         preprocess-structured
         remove-empty-clauses)

;; # CONSTANTS

(def ^:const empty-response
  "An empty response dictionary to return when there's no query to run."
  {:rows [], :columns [], :cols []})

(def ^:const max-result-rows
  "Maximum number of rows the QP should ever return."
  10000)


;; # DYNAMIC VARS

(def ^:dynamic *query*
  "The query we're currently processing (i.e., the body of the query API call)."
  nil)

(def ^:dynamic *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)


;; # PREPROCESSOR

(defn preprocess
  "Preprocess QUERY dict, applying various driver-independent transformations to it before it is passed to specific driver query processor implementations."
  [{query-type :type :as query}]
  (case (keyword query-type)
    :query (preprocess-structured query)
    :native query))

(defn preprocess-structured
  "Preprocess a strucuted QUERY dict."
  [query]
  (let [preprocessed-query (update-in query [:query] #(->> %
                                                           remove-empty-clauses
                                                           add-implicit-breakout-order-by
                                                           add-implicit-limit
                                                           add-implicit-fields
                                                           preprocess-cumulative-sum))]
    (when-not *disable-qp-logging*
      (log/debug (colorize.core/cyan "\n******************** PREPROCESSED: ********************\n"
                                     (with-out-str (clojure.pprint/pprint preprocessed-query)) "\n"
                                     "*******************************************************\n")))
    preprocessed-query))


;; ## PREPROCESSOR FNS

;; ### REMOVE-EMPTY-CLAUSES
(def ^:const clause->empty-forms
  "Clause values that should be considered empty and removed during preprocessing."
  {:breakout #{[nil]}
   :filter   #{[nil nil]}})

(defn remove-empty-clauses
  "Remove all QP clauses whose value is:
   1.  is `nil`
   2.  is an empty sequence (e.g. `[]`)
   3.  matches a form in `clause->empty-forms`"
  [query]
  (->> query
       (map (fn [[clause clause-value]]
              (when (and clause-value
                         (or (not (sequential? clause-value))
                             (seq clause-value)))
                (when-not (contains? (clause->empty-forms clause) clause-value)
                  [clause clause-value]))))
       (into {})))


;; ### ADD-IMPLICIT-BREAKOUT-ORDER-BY

(defn add-implicit-breakout-order-by
  "Field IDs specified in `breakout` should add an implicit ascending `order_by` subclause *unless* that field is *explicitly* referenced in `order_by`."
  [{breakout-field-ids :breakout order-by-subclauses :order_by :as query}]
  (let [order-by-field-ids (set (map first order-by-subclauses))
        implicit-breakout-order-by-field-ids (filter (partial (complement contains?) order-by-field-ids)
                                                     breakout-field-ids)]
    (if-not (seq implicit-breakout-order-by-field-ids) query
            (->> implicit-breakout-order-by-field-ids
                 (mapv (fn [field-id]
                         [field-id "ascending"]))
                 (apply conj (or order-by-subclauses []))
                 (assoc query :order_by)))))


;;; ### ADD-IMPLICIT-LIMIT

(defn add-implicit-limit
  "Add an implicit `limit` clause to queries with `rows` aggregations."
  [{:keys [limit aggregation] :as query}]
  (if (and (= aggregation ["rows"])
           (not limit))
    (assoc query :limit max-result-rows)
    query))


;;; ### ADD-IMPLICIT-FIELDS

(defn add-implicit-fields
  "Add an implicit `fields` clause to queries with `rows` aggregations."
  [{:keys [fields aggregation breakout source_table] :as query}]
  (cond-> query
    ;; If we're doing a "rows" aggregation with no breakout or fields clauses add one that will exclude Fields that are supposed to be hidden
    (and (= aggregation ["rows"])
         (not breakout)
         (not fields))            (assoc :fields (sel :many :id Field :table_id source_table, :active true, :preview_display true,
                                                      :field_type [not= "sensitive"], (order :position :asc), (order :id :desc)))))


;; ### PREPROCESS-CUMULATIVE-SUM

(defn preprocess-cumulative-sum
  "Rewrite queries containing a cumulative sum (`cum_sum`) aggregation to simply fetch the values of the aggregate field instead.
   (Cumulative sum is a special case; it is implemented in post-processing)."
  [{[ag-type ag-field :as aggregation] :aggregation, breakout-fields :breakout, order-by :order_by, :as query}]
  (let [cum-sum?                    (= ag-type "cum_sum")
        cum-sum-with-breakout?      (and cum-sum?
                                         (not (empty? breakout-fields)))
        cum-sum-with-same-breakout? (and cum-sum-with-breakout?
                                         (= (count breakout-fields) 1)
                                         (= (first breakout-fields) ag-field))]

    ;; Cumulative sum is only applicable if it has breakout fields
    ;; For these, store the cumulative sum field under the key :cum_sum so we know which one to sum later
    ;; Cumulative summing happens in post-processing
    (cond
      ;; If there's only one breakout field that is the same as the cum_sum field, re-write this as a "rows" aggregation
      ;; to just fetch all the values of the field in question.
      cum-sum-with-same-breakout? (-> query
                                      (dissoc :breakout)
                                      (assoc :cum_sum     ag-field
                                             :aggregation ["rows"]
                                             :fields      [ag-field]))

      ;; Otherwise if we're breaking out on different fields, rewrite the query as a "sum" aggregation
      cum-sum-with-breakout? (assoc query
                                    :cum_sum     ag-field
                                    :aggregation ["sum" ag-field])

      ;; Cumulative sum without any breakout fields should just be treated the same way as "sum". Rewrite query as such
      cum-sum? (assoc query
                      :aggregation ["sum" ag-field])

      ;; Otherwise if this isn't a cum_sum query return it as-is
      :else               query)))


;; # POSTPROCESSOR

;; ### POST-PROCESS-CUMULATIVE-SUM

(defn post-process-cumulative-sum
  "Cumulative sum the values of the aggregate `Field` in RESULTS."
  {:arglists '([query results])}
  [{cum-sum-field :cum_sum, :as query} {rows :rows, cols :cols, :as results}]
  (if-not cum-sum-field results
          (let [ ;; Determine the index of the field we need to cumulative sum
                cum-sum-field-index (->> cols
                                         (map-indexed (fn [i {field-name :name, field-id :id}]
                                                        (when (or (= field-name "sum")
                                                                  (= field-id cum-sum-field))
                                                          i)))
                                         (filter identity)
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
            (assoc results :rows rows))))

;; ### LIMIT-MAX-RESULT-ROWS

(defn limit-max-result-rows
  "Limit the number of rows returned in RESULTS to `max-result-rows`.
  (We want to do this here so we can put a hard limit on native SQL results and other ones where we couldn't add an implicit `:limit` clause)."
  [results]
  {:pre [(map? results)
         (sequential? (:rows results))]}
  (update-in results [:rows] (partial take max-result-rows)))


;; ### ADD-ROW-COUNT-AND-STATUS

(defn add-row-count-and-status
  "Wrap the results of a successfully processed query in the format expected by the frontend (add `row_count` and `status`)."
  [results]
  {:pre [(map? results)
         (sequential? (:columns results))
         (sequential? (:cols results))
         (sequential? (:rows results))]}
  (let [num-results (count (:rows results))]
    (cond-> {:row_count num-results
             :status    :completed
             :data      results}
      (= num-results max-result-rows) (assoc-in [:data :rows_truncated] max-result-rows)))) ; so the front-end can let the user know why they're being arbitarily limited

;; ### POST-PROCESS

(defn post-process
  "Apply post-processing steps to the RESULTS of a QUERY, such as applying cumulative sum."
  [driver query results]
  {:pre [(map? query)
         (map? results)]}
  (->> results
       limit-max-result-rows
       (#(case (keyword (:type query))
           :native %
           :query  (post-process-cumulative-sum (:query query) %)))
       add-row-count-and-status))


;; # COMMON ANNOTATION FNS

(defn get-column-info
  "Get extra information about result columns. This is done by looking up matching `Fields` for the `Table` in QUERY or looking up
   information about special columns such as `count` via `get-special-column-info`."
  [{{table-id :source_table} :query, :as query} column-names]
  {:pre [(integer? table-id)
         (every? string? column-names)]}
  (let [columns (->> (sel :many [Field :id :table_id :name :description :base_type :special_type] ; lookup columns with matching names for this Table
                          :table_id table-id :name [in (set column-names)])
                     (map (fn [{:keys [name] :as column}]                                         ; build map of column-name -> column
                            {name (-> (select-keys column [:id :table_id :name :description :base_type :special_type])
                                      (assoc :extra_info (if-let [fk-table (field->fk-table column)]
                                                           {:target_table_id (:id fk-table)}
                                                           {})))}))
                     (into {}))]
    (->> column-names
         (map (fn [column-name]
                (try
                  (or (columns column-name)                        ; try to get matching column from the map we build earlier
                      (get-special-column-info query column-name)) ; if it's not there then it's a special column like `count`
                  (catch Throwable _                               ; If for some reason column info lookup failed just return empty info map
                    {:name         column-name                     ; TODO - should we log this ? It shouldn't be happening ideally
                     :id           nil
                     :table_id     nil
                     :description  nil
                     :base_type    :UnknownField
                     :special_type nil})))))))


(defn get-special-column-info
  "Get info like `:base_type` and `:special_type` for a special aggregation column like `count` or `sum`."
  [query column-name]
  {:pre [(:query query)]}
  (merge {:name column-name
          :id nil
          :table_id nil
          :description nil}
         (let [aggregation-type   (keyword column-name)                              ; For aggregations of a specific Field (e.g. `sum`)
               field-aggregation? (contains? #{:avg :stddev :sum} aggregation-type)] ; lookup the field we're aggregating and return its
           (if field-aggregation? (sel :one :fields [Field :base_type :special_type] ; type info. (The type info of the aggregate result
                                       :id (-> query :query :aggregation second))    ; will be the same.)
               (case aggregation-type                                                ; Otherwise for general aggregations such as `count`
                 :count {:base_type :IntegerField                                    ; just return hardcoded type info
                         :special_type :number})))))

(def ^:dynamic *uncastify-fn*
  "Function that should be called to transform a column name from the set of results to one that matches a `Field` in the DB.
   The default implementation returns the column name as is; others, such as `generic-sql`, provide implementations that remove
   remove casting statements and the like."
  identity)

;; TODO - since this was moved over from generic SQL some of its functionality should be reworked. And dox updated.
;; (Since castification is basically SQL-specific it would make sense to handle castification / decastification separately)
;; Fix this when I'm not burnt out on driver code

(defn -order-columns
  "Don't use this directly; use `order-columns`.

   This broken out for testability -- it doesn't depend on data from the DB."
  [fields breakout-field-ids field-field-ids castified-field-names]
  ;; Basically we want to convert both BREAKOUT-FIELD-IDS and CASTIFIED-FIELD-NAMES to maps like:
  ;;   {:name      "updated_at"
  ;;    :id        224
  ;;    :castified (keyword "CAST(updated_at AS DATE)")
  ;;    :position  21}
  ;; Then we can order things appropriately and return the castified names.
  (let [uncastified->castified (zipmap (map #(*uncastify-fn* (name %)) castified-field-names) castified-field-names)
        fields                 (map #(assoc % :castified (uncastified->castified (:name %)))
                                    fields)
        id->field              (zipmap (map :id fields) fields)
        castified->field       (zipmap (map :castified fields) fields)
        breakout-fields        (->> breakout-field-ids
                                    (map id->field))
        field-fields           (->> field-field-ids
                                    (map id->field))
        other-fields           (->> castified-field-names
                                    (map (fn [castified-name]
                                           (or (castified->field castified-name)
                                               {:castified castified-name             ; for aggregate fields like 'count' create a fake map
                                                :position 0})))                       ; with position 0 so it is returned ahead of the other fields
                                    (filter #(not (or (contains? (set breakout-field-ids)
                                                                 (:id %))
                                                      (contains? (set field-field-ids)
                                                                 (:id %)))))
                                    (sort-by (fn [{:keys [position id]}]
                                               [position (when id (- id))])))]
    (->> (concat breakout-fields field-fields other-fields)
         (map :castified)
         (filter identity))))

(defn order-columns
  "Return CASTIFIED-FIELD-NAMES in the order we'd like to display them in the output.
   They should be ordered as follows:

   1.  All breakout fields, in the same order as BREAKOUT-FIELD-IDS
   2.  Any aggregate fields like `count`
   3.  Fields included in the `fields` clause
   4.  All other columns in the same order as `Field.position`."
  [{{source-table :source_table, breakout-field-ids :breakout, field-field-ids :fields} :query} castified-field-names]
  {:post [(every? keyword? %)]}
  (try
    (-order-columns (sel :many :fields [Field :id :name :position] :table_id source-table)
                    breakout-field-ids
                    field-field-ids
                    castified-field-names)
    (catch Exception e
      (.printStackTrace e)
      (log/error (.getMessage e)))))
