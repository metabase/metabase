(ns metabase.query-processor.middleware.add-dimension-projections
  "Middleware for adding remapping and other dimension related projections"
  (:require [metabase.models.field :refer [with-dimensions with-values]]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]))

(defn- create-remapped-col [col-name remapped-from]
  {:description nil,
   :id nil,
   :table_id nil,
   :expression-name col-name,
   :source :fields,
   :name col-name,
   :display_name col-name,
   :target nil,
   :extra_info {}
   :remapped_from remapped-from
   :remapped_to nil})

(defn- create-fk-remap-col [fk-field-id dest-field-id remapped-from field-display-name]
  (i/map->FieldPlaceholder {:fk-field-id fk-field-id
                            :field-id dest-field-id
                            :remapped-from remapped-from
                            :remapped-to nil
                            :field-display-name field-display-name}))

(defn- row-map-fn [dim-seq]
  (fn [row]
    (concat row (map (fn [{:keys [col-index xform-fn]}]
                       (xform-fn (nth row col-index)))
                     dim-seq))))

(defn- assoc-remapped-to [from->to]
  (fn [col]
    (-> col
        (update :remapped_to #(or % (from->to (:name col))))
        (update :remapped_from #(or % nil)))))

(defn- col->dim-map
  [idx {{remap-to :dimension-name remap-type :dimension-type field-id :field-id} :dimensions :as col}]
  (when field-id
    (let [remap-from (:name col)]
      {:col-index idx
       :from remap-from
       :to remap-to
       :xform-fn (zipmap (get-in col [:values :values])
                         (get-in col [:values :human-readable-values]))
       :new-column (create-remapped-col remap-to remap-from)
       :dimension-type remap-type})))

(defn- add-fk-remaps
  "Function that will include FK references needed for external
  remappings. This will then flow through to the resolver to get the
  new tables included in the join."
  [query]
  (update-in query [:query :fields]
             (fn [fields]
               (concat fields
                       (for [{{:keys [field-id human-readable-field-id dimension-type dimension-name]} :dimensions,
                              :keys [field-name]} fields
                             :when (= :external dimension-type)]
                         (create-fk-remap-col field-id
                                              human-readable-field-id
                                              field-name
                                              dimension-name))))))

(defn- remap-results
  "Munges results for remapping after the query has been executed. For
  internal remappings, a new column needs to be added and each row
  flowing through needs to include the remapped data for the new
  column. For external remappings, the column information needs to be
  updated with what it's being remapped from and the user specified
  name for the remapped column."
  [results]
  (let [indexed-dims (keep-indexed col->dim-map (:cols results))
        internal-only-dims (filter #(= :internal (:dimension-type %)) indexed-dims)
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

(defn add-remapping
  "Query processor middleware. `QP` is the query processor, returns a
  function that works on a `QUERY` map. Delgates to `add-fk-remaps`
  for making remapping changes to the query (before executing the
  query). Then delegates to `remap-results` to munge the results after
  query execution."
  [qp]
  (fn [query]
    (-> query
        add-fk-remaps
        qp
        remap-results)))
