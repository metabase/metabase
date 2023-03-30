(ns metabase.lib.convert
  (:require
   [clojure.set :as set]
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

(defmethod ->pMBQL :mbql.stage/mbql
  [stage]
  (reduce
   (fn [stage k]
     (if-not (get stage k)
       stage
       (update stage k ->pMBQL)))
   stage
   [:aggregation :breakout :expressions :fields :filter :order-by :joins]))

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

(defn- disqualify [x]
  #?(:cljs (when (number? x) (js-debugger)))
  (select-keys x (remove qualified-keyword? (keys x))))

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
                 (js/console.log "undefined ->legacy-MBQL for" (lib.dispatch/dispatch-value x) x)
                 (throw (ex-info "undefined ->legacy-MBQL" {:dispatch-value (lib.dispatch/dispatch-value x)
                                                            :value x}))))
      x)))

(defn- chain-stages [x]
  (let [stages (map ->legacy-MBQL (:stages x))]
    (reduce (fn [inner stage]
              (assoc stage :source-query inner))
            (first stages)
            (rest stages))))

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
  (-> stage
      disqualify
      (update-vals ->legacy-MBQL)))

(defmethod ->legacy-MBQL :mbql.stage/native [stage]
  (-> stage
      disqualify
      (set/rename-keys {:native :query})
      (update-vals ->legacy-MBQL)))

(defmethod ->legacy-MBQL :mbql/query [query]
  (let [base        (disqualify query)
        inner-query (chain-stages base)
        query-type  (if (-> query :stages first :lib/type (= :mbql.stage/native))
                      :native
                      :query)
        result
        (merge (-> base
                   (dissoc :stages)
                   (update-vals ->legacy-MBQL))
               {:type      query-type
                query-type inner-query})]
    #?(:cljs (js/console.log "->legacy-MBQL on query" query result))
    result))

;;; placeholder, feel free to delete @braden.
(defmethod ->legacy-MBQL :count
  [[_tag opts field]]
  (let [clause (if field
                 [:count (->legacy-MBQL field)]
                 [:count])]
    (if-let [aggregation-options-opts (not-empty (select-keys opts [:name :display-name]))]
      [:aggregation-options clause aggregation-options-opts]
      clause)))
