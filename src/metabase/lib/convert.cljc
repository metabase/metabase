(ns metabase.lib.convert
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.lib.clean :as lib.clean]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

(def ^:private ^:dynamic *pMBQL-uuid->legacy-index*
  {})

(def ^:private ^:dynamic *legacy-index->pMBQL-uuid*
  {})

(def ^:private stage-keys
  #{:aggregation :breakout :expressions :fields :filters :order-by :joins})

(defmulti ->pMBQL
  "Coerce something to pMBQL (the version of MBQL manipulated by Metabase Lib v2) if it's not already pMBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defn- default-MBQL-clause->pMBQL [mbql-clause]
  (let [last-elem (peek mbql-clause)
        last-elem-option? (map? last-elem)
        [clause-type & args] (cond-> mbql-clause
                               last-elem-option? pop)
        options (if last-elem-option?
                  last-elem
                  {})]
    (lib.options/ensure-uuid (into [clause-type options] (map ->pMBQL) args))))

(defmethod ->pMBQL :default
  [x]
  (if (and (vector? x)
           (keyword? (first x)))
    (default-MBQL-clause->pMBQL x)
    x))

(defmethod ->pMBQL :mbql/query
  [query]
  query)

(defmethod ->pMBQL :mbql.stage/mbql
  [stage]
  (let [aggregations (->pMBQL (:aggregation stage))]
    (binding [*legacy-index->pMBQL-uuid* (into {}
                                               (map-indexed (fn [idx [_tag {ag-uuid :lib/uuid}]]
                                                              [idx ag-uuid]))
                                               aggregations)]
      (reduce
        (fn [stage k]
          (if-not (get stage k)
            stage
            (update stage k ->pMBQL)))
        (m/assoc-some stage :aggregation aggregations)
        (disj stage-keys :aggregation)))))

(defmethod ->pMBQL :mbql/join
  [join]
  (let [join (-> join
                 (update :conditions ->pMBQL)
                 (update :stages ->pMBQL))]
    (cond-> join
      (:fields join) (update :fields (fn [fields]
                                       (if (seqable? fields)
                                         (mapv ->pMBQL fields)
                                         (keyword fields)))))))

(defmethod ->pMBQL :dispatch-type/sequential
  [xs]
  (mapv ->pMBQL xs))

(defmethod ->pMBQL :dispatch-type/map
  [m]
  (if (:type m)
    (-> (lib.util/pipeline m)
        (update :stages (fn [stages]
                          (mapv ->pMBQL stages)))
        lib.clean/clean)
    (update-vals m ->pMBQL)))

(defmethod ->pMBQL :field
  [[_tag x y]]
  (let [[id-or-name options] (if (map? x)
                               [y x]
                               [x y])]
    (lib.options/ensure-uuid [:field options id-or-name])))

(defmethod ->pMBQL :value
  [[_tag value opts]]
  ;; `:value` uses `:snake_case` keys in legacy MBQL for some insane reason (actually this was to match the shape of
  ;; the keys in Field metadata), at least for the three type keys enumerated below.
  ;; See [[metabase.mbql.schema/ValueTypeInfo]].
  (let [opts (set/rename-keys opts {:base_type     :base-type
                                    :semantic_type :semantic-type
                                    :database_type :database-type})
        ;; in pMBQL, `:effective-type` is a required key for `:value`. `:value` SHOULD have always had `:base-type`,
        ;; but on the off chance it did not give this `:type/*` so the schema doesn't fail entirely.
        opts (assoc opts :effective-type (or (:effective-type opts)
                                             (:base-type opts)
                                             :type/*))]
    (lib.options/ensure-uuid [:value opts value])))

(defmethod ->pMBQL :case
  [[_tag pred-expr-pairs options]]
  (let [default (:default options)]
    (cond-> [:case (dissoc options :default) (mapv ->pMBQL pred-expr-pairs)]
      :always lib.options/ensure-uuid
      default (conj (->pMBQL default)))))

(defmethod ->pMBQL :expression
  [[tag value opts]]
  (lib.options/ensure-uuid [tag opts value]))

(defn- get-or-throw!
  [m k]
  (let [result (get m k ::not-found)]
    (if-not (= result ::not-found)
      result
      (throw (ex-info (str "Unable to find " (pr-str k) " in map.")
                      {:m m
                       :k k})))))

(defmethod ->pMBQL :aggregation
  [[tag value opts]]
  (lib.options/ensure-uuid [tag opts (get-or-throw! *legacy-index->pMBQL-uuid* value)]))

(defmethod ->pMBQL :aggregation-options
  [[_tag aggregation options]]
  (let [[tag opts & args] (->pMBQL aggregation)]
    (into [tag (merge opts options)] args)))

(defn legacy-query-from-inner-query
  "Convert a legacy 'inner query' to a full legacy 'outer query' so you can pass it to stuff
  like [[metabase.mbql.normalize/normalize]], and then probably to [[->pMBQL]]."
  [database-id inner-query]
  (merge {:database database-id, :type :query}
         (if (:native inner-query)
           {:native (set/rename-keys inner-query {:native :query})}
           {:query inner-query})))

(defmulti ->legacy-MBQL
  "Coerce something to legacy MBQL (the version of MBQL understood by the query processor and Metabase Lib v1) if it's
  not already legacy MBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defn- disqualify
  "Remove any keys starting with the `:lib/` namespace from map `m`.

  No args = return transducer to remove `:lib/` keys from a map. One arg = update a map `m`."
  ([]
   (remove (fn [[k _v]]
             (and (qualified-keyword? k)
                  (= (namespace k) "lib")))))
  ([m]
   (into {} (disqualify) m)))

(defn- options->legacy-MBQL
  "Convert an options map in an MBQL clause to the equivalent shape for legacy MBQL. Remove `:lib/*` keys and
  `:effective-type`, which is not used in options maps in legacy MBQL."
  [m]
  (not-empty
   (into {}
         (comp (disqualify)
               (remove (fn [[k _v]]
                         (= k :effective-type))))
         m)))

(defn- aggregation->legacy-MBQL [[tag options & args]]
  (let [inner (into [tag] (map ->legacy-MBQL) args)
        ;; the default value of the :case expression is in the options
        ;; in legacy MBQL
        inner (if (and (= tag :case) (next args))
                (conj (pop inner) {:default (peek inner)})
                inner)]
    (if-let [aggregation-opts (not-empty (options->legacy-MBQL options))]
      [:aggregation-options inner aggregation-opts]
      inner)))

(defn- clause-with-options->legacy-MBQL [[k options & args]]
  (if (map? options)
    (into [k] (concat (map ->legacy-MBQL args)
                      (when-let [options (options->legacy-MBQL options)]
                        [options])))
    (into [k] (map ->legacy-MBQL (cons options args)))))

(defmethod ->legacy-MBQL :default
  [x]
  (cond
    (and (vector? x)
         (keyword? (first x))) (clause-with-options->legacy-MBQL x)
    (map? x)                   (-> x
                                   disqualify
                                   (update-vals ->legacy-MBQL))
    :else x))

(doseq [tag [::aggregation ::expression]]
  (lib.hierarchy/derive tag ::aggregation-or-expression))

(doseq [tag [:count :avg :count-where :distinct
             :max :median :min :percentile
             :share :stddev :sum :sum-where]]
  (lib.hierarchy/derive tag ::aggregation))

(doseq [tag [:+ :- :* :/
             :case :coalesce
             :abs :log :exp :sqrt :ceil :floor :round :power :interval
             :relative-datetime :time :absolute-datetime :now :convert-timezone
             :get-week :get-year :get-month :get-day :get-hour
             :get-minute :get-second :get-quarter
             :datetime-add :datetime-subtract
             :concat :substring :replace :regexextract :length
             :trim :ltrim :rtrim :upper :lower]]
  (lib.hierarchy/derive tag ::expression))

(defmethod ->legacy-MBQL ::aggregation-or-expression
  [input]
  (aggregation->legacy-MBQL input))

(defn- stage-metadata->legacy-metadata [stage-metadata]
  (into []
        (comp (map #(update-keys % u/->snake_case_en))
              (map ->legacy-MBQL))
        (:columns stage-metadata)))

(defn- chain-stages [{:keys [stages]}]
  ;; :source-metadata aka :lib/stage-metadata is handled differently in the two formats.
  ;; In legacy, an inner query might have both :source-query, and :source-metadata giving the metadata for that nested
  ;; :source-query.
  ;; In pMBQL, the :lib/stage-metadata is attached to the same stage it applies to.
  ;; So when chaining pMBQL stages back into legacy form, if stage n has :lib/stage-metadata, stage n+1 needs
  ;; :source-metadata attached.
  (let [inner-query (first (reduce (fn [[inner stage-metadata] stage]
                                     [(cond-> (->legacy-MBQL stage)
                                        inner          (assoc :source-query inner)
                                        stage-metadata (assoc :source-metadata (stage-metadata->legacy-metadata stage-metadata)))
                                      ;; Get the :lib/stage-metadata off the original pMBQL stage, not the converted one.
                                      (:lib/stage-metadata stage)])
                                   nil
                                   stages))]
    (cond-> inner-query
      ;; If this is a native query, inner query will be used like: `{:type :native :native #_inner-query {:query ...}}`
      (:native inner-query) (set/rename-keys {:native :query}))))

(defmethod ->legacy-MBQL :dispatch-type/map [m]
  (into {}
        (comp (disqualify)
              (map (fn [[k v]]
                     [k (->legacy-MBQL v)])))
        m))

(defmethod ->legacy-MBQL :aggregation [[_ opts agg-uuid :as ag]]
  (if (map? opts)
    (let [opts (options->legacy-MBQL opts)]
      (cond-> [:aggregation (get-or-throw! *pMBQL-uuid->legacy-index* agg-uuid)]
        opts (conj opts)))
    ;; Our conversion is a bit too aggressive and we're hitting legacy refs like [:aggregation 0] inside source_metadata that are only used for legacy and thus can be ignored
    ag))

(defmethod ->legacy-MBQL :dispatch-type/sequential [xs]
  (mapv ->legacy-MBQL xs))

(defmethod ->legacy-MBQL :field [[_ opts id]]
  ;; Fields are not like the normal clauses - they need that options field even if it's null.
  ;; TODO: Sometimes the given field is in the legacy order - that seems wrong.
  (let [[opts id] (if (or (nil? opts) (map? opts))
                    [opts id]
                    [id opts])]
    [:field
     (->legacy-MBQL id)
     (not-empty (disqualify opts))]))

(defmethod ->legacy-MBQL :value
  [[_tag opts value]]
  (let [opts (-> opts
                 ;; as mentioned above, `:value` in legacy MBQL expects `snake_case` keys for type info keys.
                 (set/rename-keys  {:base-type     :base_type
                                    :semantic-type :semantic_type
                                    :database-type :database_type})
                 options->legacy-MBQL)]
    ;; in legacy MBQL, `:value` has to be three args; `opts` has to be present, but it should can be `nil` if it is
    ;; empty.
    [:value value opts]))

(defn- update-list->legacy-boolean-expression
  [m pMBQL-key legacy-key]
  (cond-> m
    (= (count (get m pMBQL-key)) 1) (m/update-existing pMBQL-key (comp ->legacy-MBQL first))
    (> (count (get m pMBQL-key)) 1) (m/update-existing pMBQL-key #(into [:and] (map ->legacy-MBQL) %))
    :always (set/rename-keys {pMBQL-key legacy-key})))

(defmethod ->legacy-MBQL :mbql/join [join]
  (let [base (disqualify join)]
    (merge (-> base
               (dissoc :stages :conditions)
               (update-vals ->legacy-MBQL))
           (-> base
               (select-keys [:conditions])
               (update-list->legacy-boolean-expression :conditions :condition))
           (chain-stages base))))

(defmethod ->legacy-MBQL :mbql.stage/mbql [stage]
  (binding [*pMBQL-uuid->legacy-index* (into {}
                                             (map-indexed (fn [idx [_tag {ag-uuid :lib/uuid}]]
                                                            [ag-uuid idx]))
                                             (:aggregation stage))]
    (reduce #(m/update-existing %1 %2 ->legacy-MBQL)
            (-> stage
                disqualify
                (m/update-existing :aggregation #(mapv aggregation->legacy-MBQL %))
                (update-list->legacy-boolean-expression :filters :filter))
            (disj stage-keys :aggregation :filters))))

(defmethod ->legacy-MBQL :mbql.stage/native [stage]
  (-> stage
      disqualify
      (update-vals ->legacy-MBQL)))

(defmethod ->legacy-MBQL :mbql/query [query]
  (let [base        (disqualify query)
        parameters  (:parameters base)
        inner-query (chain-stages base)
        query-type  (if (-> query :stages last :lib/type (= :mbql.stage/native))
                      :native
                      :query)]
    (merge (-> base
               (dissoc :stages :parameters)
               (update-vals ->legacy-MBQL))
           (cond-> {:type query-type query-type inner-query}
             (seq parameters) (assoc :parameters parameters)))))
