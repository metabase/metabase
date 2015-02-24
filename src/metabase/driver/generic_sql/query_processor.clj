(ns metabase.driver.generic-sql.query-processor
  (:require [clojure.core.match :refer [match]]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.generic-sql.query-processor.test-queries :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])))


(defn field-id->kw [field-id]
  (-> (sel :one [Field :name] :id field-id)
      :name
      keyword))

(defmulti apply-form (fn [[k v]] k))

;; valid values to `korma.core/aggregate`: count, sum, avg, min, max, first, last

(defmethod apply-form :aggregation [[_ value]]
  (match value
    ["rows"]  nil                                                  ; don't need to do anything special - `select` selects all rows by default
    ["count"] `(aggregate (~'count :*) :count)
    [_ _]     (let [[ag-type field-id] value
                    _ (println "VALUE: " value)
                    field (field-id->kw field-id)]
                (match ag-type
                  "distinct" `(aggregate (~'count (raw ~(format "DISTINCT(\"%s\")" (name field)))) :count)
                  "sum"      `(aggregate (~'sum ~field) :sum)))))

(defmethod apply-form :breakout [[_ value]]
  nil)

(defmethod apply-form :fields [[_ field-ids]]
  (let [field-names (->> (sel :many [Field :name] :id [in (set field-ids)])
                         (map :name))]
    `(fields ~@field-names)))

(defmethod apply-form :filter [[_ filter-clause]]
  (match filter-clause
    [nil nil]       nil ; empty clause
    ["AND" & forms] `(where ~(->> (rest filter-clause)
                                  (map (fn [[filter-type field-id value]]
                                         {(field-id->kw field-id) [(symbol filter-type) value]}))
                                  (apply merge {})))))

(defmethod apply-form :limit [[_ value]]
  (when value
    `(limit ~value)))

(defmethod apply-form :order_by [[_ fields]]
  (let [fields (->> fields
                    (mapcat (fn [[field-id asc-desc]]
                              [(field-id->kw field-id) (case asc-desc
                                                         "ascending" :ASC
                                                         "descending" :DESC)])))]
    `(order ~@fields)))

(defn table-id->korma-entity [table-id]
  (let [{:keys [korma-entity]} (sel :one Table :id table-id)]
    @korma-entity))

(defn process [{{:keys [source_table] :as query} :query}]
  (let [forms (->> (map apply-form query)
                   (filter identity)
                   (mapcat (fn [form]
                             (if (vector? form) form
                                 [form])))
                   doall)]
    `(-> (table-id->korma-entity ~source_table)
         (select ~@forms))))
