(ns metabase.lib.convert
  (:require
   [clojure.set :as set]
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
  lib.dispatch/dispatch-value)

(defn- lib-key? [x]
  (and (qualified-keyword? x)
       (= (namespace x) "lib")))

(defn- disqualify [x]
  (->> x
       keys
       (remove lib-key?)
       (select-keys x)))

(defn- aggregation->legacy-MBQL [[tag options & args]]
  (let [inner (into [tag] (map ->legacy-MBQL args))]
    (if-let [aggregation-opts (not-empty (disqualify options))]
      [:aggregation-options inner aggregation-opts]
      inner)))

(defn- clause-with-options->legacy-MBQL [[k options & args]]
  (if (map? options)
    (into [k] (concat (map ->legacy-MBQL args)
                      (when-let [options (not-empty (disqualify options))]
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

(doseq [clause [;; Aggregations
                :count :avg :count-where :distinct
                :max :median :min :percentile
                :share :stddev :sum :sum-where

                ;; Expressions
                :+ :- :* :/
                :case :coalesce
                :abs :log :exp :sqrt :ceil :floor :round :power :interval
                :relative-datetime :time :absolute-datetime :now :convert-timezone
                :get-week :get-year :get-month :get-day :get-hour
                :get-minute :get-second :get-quarter
                :datetime-add :datetime-subtract
                :concat :substring :replace :regexextract :length
                :trim :ltrim :rtrim :upper :lower]]
  (defmethod ->legacy-MBQL clause [input]
    (aggregation->legacy-MBQL input)))

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
                      stage-metadata (assoc :source-metadata (mapv ->legacy-MBQL (:columns stage-metadata))))
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

(defmethod ->legacy-MBQL :mbql.stage/mbql [stage]
  (reduce #(m/update-existing %1 %2 ->legacy-MBQL)
          (-> stage
              disqualify
              (m/update-existing :aggregation #(mapv aggregation->legacy-MBQL %)))
          (remove #{:aggregation} stage-keys)))

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
