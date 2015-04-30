(ns metabase.driver.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific implementations."
  (:require [metabase.db :refer :all]
            [metabase.models.field :refer [Field field->fk-table]]))

(declare add-implicit-breakout-order-by
         get-special-column-info
         preprocess-structured
         remove-empty-clauses)

(def ^:dynamic *query* "The structured query we're currently processing, before any preprocessing occurs (i.e. the `:query` part of the API call body)"
  nil)

(def ^:dynamic *disable-qp-logging* "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)

(defn preprocess [{query-type :type :as query}]
  (case (keyword query-type)
    :query (preprocess-structured query)
    :native query))

(defn preprocess-structured [query]
  (update-in query [:query] #(->> %
                                  remove-empty-clauses
                                  add-implicit-breakout-order-by)))


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


;; # COMMON ANNOTATION FNS

(defn get-column-info
  "Get extra information about result columns. This is done by looking up matching `Fields` for the `Table` in QUERY or looking up
   information about special columns such as `count` via `get-special-column-info`."
  [query column-names]
  {:pre [(:query query)]}
  (let [table-id (get-in query [:query :source_table])
        columns (->> (sel :many [Field :id :table_id :name :description :base_type :special_type] ; lookup columns with matching names for this Table
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
         (let [aggregation-type  (keyword column-name)                               ; For aggregations of a specific Field (e.g. `sum`)
               field-aggregation? (contains? #{:avg :stddev :sum} aggregation-type)] ; lookup the field we're aggregating and return its
           (if field-aggregation? (sel :one :fields [Field :base_type :special_type] ; type info. (The type info of the aggregate result
                                       :id (-> query :query :aggregation second))    ; will be the same.)
               (case aggregation-type                                                ; Otherwise for general aggregations such as `count`
                 :count {:base_type :IntegerField                                    ; just return hardcoded type info
                         :special_type :number})))))
