(ns metabase.lib.convert
  (:require
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]))

(defmulti ->pMBQL
  "Coerce something to pMBQL (the version of MBQL manipulated by Metabase Lib v2) if it's not already pMBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defn- default-MBQL-clause->pMBQL [mbql-clause]
  (let [[clause-type options & args] (lib.options/ensure-uuid mbql-clause)]
    (into [clause-type options] (map ->pMBQL) args)))

(defmethod ->pMBQL :default
  [x]
  (if (and (vector? x)
           (keyword? (first x)))
    (default-MBQL-clause->pMBQL x)
    x))

(defmethod ->pMBQL :mbql/query
  [query]
  query)

(def ^:private stage-keys
  [:aggregation :breakout :expressions :fields :filter :order-by :joins])

(defmethod ->pMBQL :mbql.stage/mbql
  [stage]
  (reduce
   (fn [stage k]
     (if-not (get stage k)
       stage
       (update stage k ->pMBQL)))
   stage
   stage-keys))

(defmethod ->pMBQL :mbql/join
  [join]
  (-> join
      (update :condition ->pMBQL)
      (update :stages ->pMBQL)))

(defmethod ->pMBQL :dispatch-type/sequential
  [xs]
  (mapv ->pMBQL xs))

(defmethod ->pMBQL :dispatch-type/map
  [m]
  (if (:type m)
    (-> (lib.util/pipeline m)
        (update :stages (fn [stages]
                          (mapv ->pMBQL stages))))
    (update-vals m ->pMBQL)))

(defmethod ->pMBQL :field
  [[_tag x y]]
  (let [[id-or-name options] (if (map? x)
                               [y x]
                               [x y])
        options              (cond-> options
                               (not (:lib/uuid options))
                               (assoc :lib/uuid (str (random-uuid))))]
    [:field options id-or-name]))

(defmethod ->pMBQL :aggregation-options
  [[_tag aggregation options]]
  (let [[tag opts & args] (->pMBQL aggregation)]
    (into [tag (merge opts options)] args)))

(defmulti ->legacy-MBQL
  "Coerce something to legacy MBQL (the version of MBQL understood by the query processor and Metabase Lib v1) if it's
  not already legacy MBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defn- lib-key? [x]
  (and (qualified-keyword? x)
       (= (namespace x) "lib")))

(defn- disqualify [x]
  (->> x
       keys
       (remove lib-key?)
       (select-keys x)))

(defn- clause-with-options->legacy-MBQL [[k options & args]]
  (if (map? options)
    (into [k] (concat (map ->legacy-MBQL args)
                      (when-let [options (not-empty (disqualify options))]
                        [options])))
    (into [k] (map ->legacy-MBQL (cons options args)))))

(defmethod ->legacy-MBQL :default
  [x]
  (if (and (vector? x)
           (keyword? (first x)))
    (clause-with-options->legacy-MBQL x)
    (do
      #?(:cljs (when-not (or (nil? x) (string? x) (number? x) (boolean? x) (keyword? x))
                 (throw (ex-info "undefined ->legacy-MBQL" {:dispatch-value (lib.dispatch/dispatch-value x)
                                                            :value x}))))
      x)))

(defn- chain-stages [{:keys [stages]}]
  ;; :source-metadata aka :lib/stage-metadata is handled differently in the two formats.
  ;; In legacy, an inner query might have both :source-query, and :source-metadata giving the metadata for that nested
  ;; :source-query.
  ;; In pMBQL, the :lib/stage-metadata is attached to the same stage it applies to.
  ;; So when chaining pMBQL stages back into legacy form, if stage n has :lib/stage-metadata, stage n+1 needs
  ;; :source-metadata attached.
  (first (reduce (fn [[inner stage-metadata] stage]
                   [(cond-> (->legacy-MBQL stage)
                      inner          (assoc :source-query inner)
                      stage-metadata (assoc :source-metadata stage-metadata))
                    ;; Get the :lib/stage-metadata off the original pMBQL stage, not the converted one.
                    (:lib/stage-metadata stage)])
                 nil
                 stages)))

(defmethod ->legacy-MBQL :dispatch-type/map [m]
  (-> m
      disqualify
      (update-vals ->legacy-MBQL)))

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

(defmethod ->legacy-MBQL :mbql/join [join]
  (let [base (disqualify join)]
    (merge (-> base
               (dissoc :stages)
               (update-vals ->legacy-MBQL))
           (chain-stages base))))

(defn- aggregation->legacy-MBQL [input]
  (let [[tag options & args] input
        inner (into [tag] (map ->legacy-MBQL args))]
    (if-let [options (not-empty (disqualify options))]
      [:aggregation-options inner options]
      inner)))

(defmethod ->legacy-MBQL :count [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :avg [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :count-where [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :distinct [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :max [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :median [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :min [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :percentile [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :share [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :stddev [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :sum [x] (aggregation->legacy-MBQL x))
(defmethod ->legacy-MBQL :sum-where [x] (aggregation->legacy-MBQL x))

(defmethod ->legacy-MBQL :mbql.stage/mbql [stage]
  (reduce #(m/update-existing %1 %2 ->legacy-MBQL)
          (disqualify stage)
          stage-keys))

(defmethod ->legacy-MBQL :mbql.stage/native [stage]
  (-> stage
      disqualify
      (update-vals ->legacy-MBQL)))

(defmethod ->legacy-MBQL :mbql/query [query]
  (let [base        (disqualify query)
        inner-query (chain-stages base)
        query-type  (if (-> query :stages last :lib/type (= :mbql.stage/native))
                      :native
                      :query)]
    (merge (-> base
               (dissoc :stages)
               (update-vals ->legacy-MBQL))
           {:type      query-type
            query-type inner-query})))
