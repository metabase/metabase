(ns metabase.driver.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific implementations."
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            [metabase.driver.interface :as i]
            [metabase.models.field :refer [Field field->fk-table]]))

(declare add-implicit-breakout-order-by
         get-special-column-info
         preprocess-cumulative-sum
         preprocess-structured
         remove-empty-clauses)

(def ^:dynamic *query* "The structured query we're currently processing, before any preprocessing occurs (i.e. the `:query` part of the API call body)"
  nil)

(def ^:dynamic *disable-qp-logging* "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)


;; # PREPROCESSOR

(defn preprocess [{query-type :type :as query}]
  (case (keyword query-type)
    :query (preprocess-structured query)
    :native query))

(defn preprocess-structured [query]
  (let [pp (update-in query [:query] #(->> %
                                           remove-empty-clauses
                                           add-implicit-breakout-order-by
                                           preprocess-cumulative-sum))]
    (when-not *disable-qp-logging*
      (log/debug (colorize.core/cyan "******************** PREPROCESSED: ********************\n"
                                     (with-out-str (clojure.pprint/pprint pp)) "\n"
                                     "*******************************************************\n")))
    pp))


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


;; ### PREPROCESS-CUMULATIVE-SUM

(defn preprocess-cumulative-sum
  "`cum_sum` queries are a special case, since they're implemented in Clojure-land. Check to see if we're doing a `cum_sum` aggregation,
   and if so, rewrite the query as needed, run it, and do post processing."
  [{aggregation :aggregation, :as query}]
  (match aggregation
    ["cum_sum" field-id] (merge query
                                {:cum_sum true}
                                (if (:breakout query) {:breakout    [field-id]
                                                       :aggregation ["sum" field-id]
                                                       :order_by    (conj (or (vec (:order_by query)) [])
                                                                          [field-id "ascending"])}
                                    {:aggregation ["rows"]
                                     :fields      [field-id]}))
    _                    query))


;; # POSTPROCESSOR

;; ### POST-PROCESS-CUMULATIVE-SUM

(defn post-process-cumulative-sum
  "Cumulative sum the values of the aggregate `Field` in RESULTS."
  {:arglists '([driver query results])}
  [driver {cumulative-sum? :cum_sum, :as query} {data :data, :as results}]
  (if-not cumulative-sum? results
          (let [field-id     (or (first (:fields query))
                                 (second (:aggregation query)))
                _            (assert (integer? field-id))
                ;; Determine the index of the cum_sum field by matching field-id in the result columns
                field-index  (->> (:cols data)
                                  (map-indexed (fn [i column]
                                                 (when (= (:id column) field-id)
                                                   i)))
                                  (filter identity)
                                  first)
                _            (assert (integer? field-index))
                ;; Make a sequence of cumulative sum values for each row
                rows         (:rows data)
                values       (->> rows
                                  (map #(nth % field-index))
                                  (reductions +))]
            ;; Replace the value in each row
            (->> (map (fn [row value]
                        (assoc (vec row) field-index value))
                      rows values)
                 (assoc-in results [:data :rows])))))

(defn post-process [driver query results]
  (case (keyword (:type query))
    :native results
    :query  (let [query (:query query)]
              (->> results
                   (post-process-cumulative-sum driver query)))))


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
                (or (columns column-name)                             ; try to get matching column from the map we build earlier
                    (get-special-column-info query column-name))))))) ; if it's not there then it's a special column like `count`


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

(def ^:dynamic *uncastify-fn* identity) ; default is no-op

;; TODO - since this was moved over from generic SQL some of its functionality should be reworked. And dox updated.
;; (Since castification is basically SQL-specific it would make sense to handle castification / decastification separately)
;; Fix this when it's not a Friday

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
