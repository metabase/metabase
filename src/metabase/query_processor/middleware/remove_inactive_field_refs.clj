(ns metabase.query-processor.middleware.remove-inactive-field-refs
  (:require
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defn- collect-fields-clauses
  [query]
  (let [clauses (volatile! (transient {}))
        visitor (fn [_query _path-type path stage-or-join]
                  (let [fields (:fields stage-or-join)]
                    (when (and (seqable? fields) (seq fields))
                      (vswap! clauses assoc! path fields))
                    nil))]
    (lib.walk/walk query visitor)
    (persistent! @clauses)))

(defn- next-path
  [query stage-path]
  (let [type-index (- (count stage-path) 2)
        parent-stage-path (subvec stage-path 0 type-index)
        next-stage-path   (update stage-path (dec (count stage-path)) inc)]
    (cond
      (= (get stage-path type-index) :joins)
      ;; the stage this join is in
      parent-stage-path

      (some? (get-in query next-stage-path))
      next-stage-path

      (pos? type-index)
      ;; the join this stage is in
      parent-stage-path)))

(defn- source-metadata->stage-metadata
  [source-metadata-column]
  (-> source-metadata-column
      (update-keys u/->kebab-case-en)
      (assoc :lib/type :metadata/column)))

(defn- column-metadata
  [query stage-path]
  (or (not-empty (get-in query (into stage-path [:lib/stage-metadata :columns])))
      (not-empty (into [] (map source-metadata->stage-metadata) (get-in query (conj stage-path :source-metadata))))
      (when (> (count stage-path) 2)
        (column-metadata query (subvec stage-path 0 (- (count stage-path) 2))))))

(defn- resolve-refs
  [columns removed-field-refs default-alias]
  (let [columns-with-deafult-alias (delay (into [] (map #(assoc % :source-alias default-alias)) columns))]
    (mapv #(or (lib.equality/find-matching-column % columns)
               (when default-alias
                 (lib.equality/find-matching-column % @columns-with-deafult-alias)))
          removed-field-refs)))

(defn- propagate-removal
  [query stage-path removed-field-refs]
  (if-let [next-stage-path (next-path query stage-path)]
    (if-not (-> query (get-in next-stage-path) :fields)
      (recur query next-stage-path removed-field-refs)
      (let [columns (column-metadata query stage-path)
            removed-columns (when (seq columns)
                              (resolve-refs columns removed-field-refs (:alias (get-in query stage-path))))
            next-fields-path (conj next-stage-path :fields)
            next-stage-fields (get-in query next-fields-path)
            removed-field-refs (when (seq next-stage-fields)
                                 (into #{}
                                       (keep #(lib.equality/find-matching-ref % next-stage-fields))
                                       removed-columns))]
        (if-not (seq removed-field-refs)
          query
          (-> query
              (assoc-in next-fields-path (into [] (remove removed-field-refs) next-stage-fields))
              (recur next-stage-path removed-field-refs)))))
    query))

(defn- filter-fields-clause
  [query stage-path fields active-field-ids]
  (let [removed-field-refs (into #{}
                                 (filter (fn [field]
                                           (and (lib.util/field-clause? field)
                                                (let [id (get field 2)]
                                                  (and (integer? id)
                                                       (not (active-field-ids id)))))))
                                 fields)]
    (if-not (seq removed-field-refs)
      query
      (-> query
          (assoc-in (conj stage-path :fields) (into [] (remove removed-field-refs) fields))
          (propagate-removal stage-path removed-field-refs)))))

(defn- keep-active-fields
  [query fields-clauses active-field-ids]
  (reduce-kv #(filter-fields-clause %1 %2 %3 active-field-ids) query fields-clauses))

(mu/defn remove-inactive-field-refs :- ::lib.schema/query
  "Remove any references to fields that are not active.
  This might result in a broken query, but the original query would break at run time too because of the
  references to columns that do not exist in the database.
  This middleware can fix queries that contain references that are not used other than being returned."
  [query :- ::lib.schema/query]
  (let [fields-clauses (collect-fields-clauses query)
        field-ids (into #{}
                        (comp cat
                              (filter lib.util/field-clause?)
                              (map #(get % 2))
                              (filter integer?))
                        (vals fields-clauses))
        active-field-ids (if (seq field-ids)
                           (into #{}
                                 (comp (filter :active)
                                       (map :id))
                                 (lib.metadata/bulk-metadata query :metadata/column field-ids))
                           #{})]
    (cond-> query
      (not= field-ids active-field-ids)
      (keep-active-fields fields-clauses active-field-ids))))
