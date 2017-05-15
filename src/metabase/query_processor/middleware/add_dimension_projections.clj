(ns metabase.query-processor.middleware.add-dimension-projections
  "Middleware for adding remapping and other dimension related projections"
  (:require (metabase.query-processor [interface :as i]
                                      [util :as qputil])
            [metabase.models.field :refer [with-dimensions with-values]])
  (:import [metabase.query_processor.interface RemapExpression]))

(defn create-expression-col [alias remapped-from]
  {:description nil,
   :id nil,
   :table_id nil,
   :expression-name alias,
   :source :fields,
   :name alias,
   :display_name alias,
   :target nil,
   :extra_info {}
   :remapped_from remapped-from
   :remapped_to nil})

(defn row-map-fn [dim-seq]
  (fn [row]
    (into row (map (fn [{:keys [col-index xform-fn]}]
                     (xform-fn (get row col-index)))
                   dim-seq))))

(defn assoc-remapped-to [from->to]
  (fn [col]
    (let [remapped-to (from->to (:name col))]
      (assoc col
        :remapped_to remapped-to
        :remapped_from nil))))

(defn add-inline-remaps
  [qp]
  (fn [query]
    (let [results (qp query)
          indexed-dims (keep-indexed (fn [idx col]
                                       (when (seq (:dimensions col))
                                         (let [from (:name col)
                                               to (get-in col [:dimensions :name])]
                                           {:col-index idx
                                            :from from
                                            :to to
                                            :xform-fn (zipmap (get-in col [:values :values])
                                                              (get-in col [:values :human_readable_values]))
                                            :new-column (create-expression-col to from)})))
                                     (:cols results))
          remap-fn (row-map-fn indexed-dims)
          from->to (reduce (fn [acc {:keys [from to]}]
                             (assoc acc from to)) {} indexed-dims)]
      (-> results
          (update :columns into (map :to indexed-dims))
          (update :cols (fn [cols]
                          (into (mapv (comp #(dissoc % :dimensions :values)
                                            (assoc-remapped-to from->to))
                                      cols)
                                (map :new-column indexed-dims))))
          (update :rows #(map remap-fn %))))))
