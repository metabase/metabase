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

(defn create-fk-remap-col [fk-field-id dest-field-id remapped-from field-display-name]
  (i/map->FieldPlaceholder {:fk-field-id fk-field-id
                            :field-id dest-field-id
                            :remapped-from remapped-from
                            :remapped-to nil
                            :field-display-name field-display-name}))

(defn row-map-fn [dim-seq]
  (fn [row]
    (concat row (map (fn [{:keys [col-index xform-fn]}]
                       (xform-fn (nth row col-index)))
                     dim-seq))))

(defn assoc-remapped-to [from->to]
  (fn [col]
    (-> col
        (update :remapped_to #(or % (from->to (:name col))))
        (update :remapped_from #(or % nil)))))

(defn add-fk-remaps
  [query]
  (update-in query [:query :fields]
             (fn [fields]
               (concat fields
                       (for [{{:keys [field_id human_readable_field_id type name]} :dimensions, :keys [field-name]} fields
                             :when (= "external" type)]
                         (create-fk-remap-col field_id
                                              human_readable_field_id
                                              field-name
                                              name))))))

(defn col->dim-map
  [idx {{remap-to :name remap-type :type field-id :field_id} :dimensions :as col}]
  (when field-id
    (let [remap-from (:name col)]
      {:col-index idx
       :from remap-from
       :to remap-to
       :xform-fn (zipmap (get-in col [:values :values])
                         (get-in col [:values :human_readable_values]))
       :new-column (create-expression-col remap-to remap-from)
       :type remap-type})))

(defn remap-results
  [results]
  (let [indexed-dims (keep-indexed col->dim-map (:cols results))
        internal-only-dims (filter #(= "internal" (:type %)) indexed-dims)
        remap-fn (row-map-fn internal-only-dims)
        columns (concat (:cols results)
                        (map :new-column internal-only-dims))
        from->to (reduce (fn [acc {:keys [remapped_from name]}]
                           (if remapped_from
                             (assoc acc remapped_from name)
                             acc))
                         {} columns)]
    (-> results
        (update :columns into (map :to internal-only-dims))
        (update :cols (fn [cols]
                        (mapv (comp #(dissoc % :dimensions :values)
                                    (assoc-remapped-to from->to))
                              columns)))
        (update :rows #(map remap-fn %)))))

(defn add-remapping [qp]
  (fn [query]
    (-> query
        add-fk-remaps
        qp
        remap-results)))
