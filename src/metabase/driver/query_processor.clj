(ns metabase.driver.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific implementations."
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            [metabase.driver.interface :as i]
            [metabase.models.field :refer [Field field->fk-table]]
            [metabase.util :as u])
  (:import [metabase.driver.interface QPField QPValue]))

(declare get-special-column-info
         query-dict->Query)

;; # ---------------------------------------- CONSTANTS + DYNAMIC VARS ----------------------------------------

(def ^:const empty-response
  "An empty response dictionary to return when there's no query to run."
  {:rows [], :columns [], :cols []})

(def ^:const max-result-rows
  "Maximum number of rows the QP should ever return."
  10000)

(def ^:deprecated ^:dynamic *query*
  "The query we're currently processing (i.e., the body of the query API call)."
  nil)

(def ^:dynamic *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)


;; # ---------------------------------------- PIPELINE ----------------------------------------

;; ## Pipeline Protocol Definitions

(defprotocol IPreprocessQuery
  (preprocess [query]))

(defprotocol ICreateQueryProcessor
  (create-qp [query ^IQueryProcessorFactory driver, ^Integer database-id]))

(defprotocol IProcessQuery
  (process [query qp]))

(defprotocol IAnnotateQueryResults
  (annotate-results [query qp results]))

(defprotocol IPostProcessQuery
  (post-process [query results]))

;; ## Process-Query

(defn process-query [driver {database-id :database :as query-dict}]
  {:pre [(integer? database-id)]}
  (let [query  (->> (query-dict->Query query-dict)  ; [1]
                    preprocess)                     ; [2]
        qp     (create-qp query driver database-id)]
    (->> (process query qp)                         ; [3]
         (annotate-results query qp)                ; [4]
         (post-process query))))                    ; [5]


;; # ---------------------------------------- CONVERT QUERY DICT TO TYPED QUERY [1] ----------------------------------------

(defrecord StructuredQuery [])
(defrecord NativeQuery     [])

(defn query-dict->Query [query-dict]
  (case (keyword (:type query-dict))
    :query  (map->StructuredQuery query-dict)
    :native (map->NativeQuery     query-dict)))


;; # ---------------------------------------- PREPROCESS [2] ----------------------------------------

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
  "Add an implicit limit clause to queries with `rows` aggregations."
  [{:keys [limit aggregation] :as query}]
  (if (and (= aggregation ["rows"])
           (not limit))
    (assoc query :limit max-result-rows)
    query))


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

;; ## PREPROCESS

(extend-protocol IPreprocessQuery
  NativeQuery
  (preprocess [query]
    query)

  StructuredQuery
  (preprocess [this]
    (->> (:query this)
         remove-empty-clauses
         add-implicit-breakout-order-by
         add-implicit-limit
         preprocess-cumulative-sum
         map->StructuredQuery)))


;; # ---------------------------------------- PROCESS [3] ----------------------------------------

;; ## CREATE-QP

(extend-protocol ICreateQueryProcessor
  StructuredQuery
  (create-qp [{source-table-id :source_table, :as query} driver database-id]
    {:pre [(integer? source-table-id)
           (integer? database-id)]}
    (i/create-structured-query-processor driver database-id source-table-id query))

  NativeQuery
  (create-qp [{{raw-query :query} :native} driver database-id]
    {:pre [(string? raw-query)
           (integer? database-id)]}
    (i/create-native-query-processor driver database-id raw-query)))


;; ## Structured Query Processor

(defn- resolve-field ^QPField [^Integer field-id]
  (let [field (sel :one :fields [Field :name :base_type] :id field-id)]
    (i/->QPField field-id (:name field) (:base_type field))))

(defmacro ^:private with-resolved-field [[field-binding field-id] & body]
  `(let [~field-binding (resolve-field ~field-id)
         ~'resolve-value (fn ^QPValue [value#]
                           (i/->QPValue value# (.base_type ~field-binding)))]
     ~@body))


;; ### Aggregation

(defn- process-aggregation [qp clause]
  (match clause
    ["rows"]              (i/aggregation:rows        qp)
    ["count"]             (i/aggregation:rows-count  qp)
    ["avg" field-id]      (i/aggregation:avg         qp (resolve-field field-id))
    ["count" field-id]    (i/aggregation:field-count qp (resolve-field field-id))
    ["distinct" field-id] (i/aggregation:distinct    qp (resolve-field field-id))
    ["stddev" field-id]   (i/aggregation:stddev      qp (resolve-field field-id))
    ["sum" field-id]      (i/aggregation:sum         qp (resolve-field field-id))))

;; ## Breakout

(defn- process-breakout [qp field-ids]
  (i/breakout qp (mapv resolve-field field-ids)))

;; ## Fields

(defn- process-fields [qp field-ids]
  (i/fields-clause qp (mapv resolve-field field-ids)))

;; ### Filter

(defn- process-filter-subclause [qp subclause]
  (match subclause
    ["INSIDE" lat-field-id lon-field-id
     lat-max lon-min lat-min lon-max] (with-resolved-field [lat-field lat-field-id]
                                        (with-resolved-field [lon-field lon-field-id]
                                          (i/filter-subclause:inside qp {:lat     lat-field
                                                                         :lat-min (resolve-value lat-min)
                                                                         :lat-max (resolve-value lat-max)
                                                                         :lon     lon-field
                                                                         :lon-min (resolve-value lon-min)
                                                                         :lon-max (resolve-value lon-max)})))
     ["NOT_NULL" field-id]            (i/filter-subclause:not-null qp (resolve-field field-id))
     ["IS_NULL"  field-id]            (i/filter-subclause:null     qp (resolve-field field-id))
     ["BETWEEN"  field-id min max]    (with-resolved-field [field field-id]
                                        (i/filter-subclause:between qp field (resolve-value min) (resolve-value max)))
     ["="  field-id value]            (with-resolved-field [field field-id]
                                        (i/filter-subclause:=  qp field (resolve-value value)))
     ["!=" field-id value]            (with-resolved-field [field field-id]
                                        (i/filter-subclause:!= qp field (resolve-value value)))
     ["<"  field-id value]            (with-resolved-field [field field-id]
                                        (i/filter-subclause:<  qp field (resolve-value value)))
     [">"  field-id value]            (with-resolved-field [field field-id]
                                        (i/filter-subclause:>  qp field (resolve-value value)))
     ["<=" field-id value]            (with-resolved-field [field field-id]
                                        (i/filter-subclause:<= qp field (resolve-value value)))
     [">=" field-id value]            (with-resolved-field [field field-id]
                                        (i/filter-subclause:>= qp field (resolve-value value)))))

(defn- process-filter [qp clause]
  (match clause
    ["AND" & subclauses] (i/filter:and qp (mapv (partial process-filter-subclause qp)
                                                subclauses))
    ["OR"  & subclauses] (i/filter:or  qp (mapv (partial process-filter-subclause qp)
                                                subclauses))
    subclause            (i/filter:simple qp (process-filter-subclause qp subclause))))

;; ## ORDER_BY

(defn- process-order-by [qp subclauses]
  (i/order-by qp (mapv (fn [[field-id asc-desc]]
                         (with-resolved-field [field field-id]
                           (case asc-desc
                             "ascending"  (i/order-by-subclause:asc  qp field)
                             "descending" (i/order-by-subclause:desc qp field))))
                       subclauses)))

;; ## PAGE

(defn- process-page [qp {:keys [page items]}]
  {:pre [(integer? page)
         (> page 0)
         (integer? items)]}
  (i/limit-clause qp items)
  (i/offset-clause qp (* (- page 1)
                         items)))

;; ## PROCESS

(extend-protocol IProcessQuery
  StructuredQuery
  (process [query qp]
    {:pre [(:aggregation query)]}
    (when-not (zero? (:source_table query))
      (doseq [[clause-name clause-value] query]
        (match clause-name
          :aggregation  (process-aggregation qp clause-value)
          :breakout     (process-breakout    qp clause-value)
          :fields       (process-fields      qp clause-value)
          :filter       (process-filter      qp clause-value)
          :limit        (i/limit-clause      qp clause-value)
          :order_by     (process-order-by    qp clause-value)
          :page         (process-page        qp clause-value)
          :source_table nil))
      (i/eval-structured-query qp)))

  NativeQuery
  (process [_ qp]
    (i/eval-native-query qp)))


;; # ---------------------------------------- ANNOTATE-RESULTS [4] ----------------------------------------

;; ## Annotation Helper Fns

(defn get-column-info
  "Get extra information about result columns. This is done by looking up matching `Fields` for the `Table` in QUERY or looking up
   information about special columns such as `count` via `get-special-column-info`."
  [{table-id :source_table, :as query} column-names]
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
  (merge {:name column-name
          :id nil
          :table_id nil
          :description nil}
         (let [aggregation-type   (keyword column-name)                              ; For aggregations of a specific Field (e.g. `sum`)
               field-aggregation? (contains? #{:avg :stddev :sum} aggregation-type)] ; lookup the field we're aggregating and return its
           (if field-aggregation? (sel :one :fields [Field :base_type :special_type] ; type info. (The type info of the aggregate result
                                       :id (-> query :aggregation second))           ; will be the same.)
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
                                    (sort-by :position))]
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


;; ## ANNOTATE-RESULTS

(extend-protocol IAnnotateQueryResults
  StructuredQuery
  (annotate-results [query qp results]
    {:pre [(not (:query query))]}
    (i/annotate-results qp results))

  NativeQuery
  (annotate-results [query qp results]
    (i/annotate-results qp results)))


;; # ---------------------------------------- POST-PROCESS [5] ----------------------------------------

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

;; ## POST-PROCESS

(extend-protocol IPostProcessQuery
  NativeQuery
  (post-process [_ results]
    (->> results
         limit-max-result-rows
         add-row-count-and-status))

  StructuredQuery
  (post-process [query results]
    (->> results
         limit-max-result-rows
         (post-process-cumulative-sum query)
         add-row-count-and-status)))


;; # ---------------------------------------- TEST DATA ----------------------------------------

(def process-query-2 (u/runtime-resolved-fn 'metabase.driver.query-processor.parse 'process-query-2))

(def test-query {:database 33,
                 :type "query",
                 :query
                 {:source_table 85,
                  :aggregation ["count"],
                  :breakout [],
                  :filter ["AND" ["BETWEEN" 409 "2015-01-01" "2015-05-01"]]}})

(def driver-process-query
  (u/runtime-resolved-fn 'metabase.driver 'process-query))

(defn x []
  (driver-process-query test-query))
