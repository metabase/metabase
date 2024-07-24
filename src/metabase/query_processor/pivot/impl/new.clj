(ns metabase.query-processor.pivot.impl.new
  "'New' implementation of the pivot QP that combines all constituent queries into a single `UNION ALL`-style query and
  runs them all at once against the data warehouse.

  To use this implementation, drivers must implement [[metabase.driver/EXPERIMENTAL-execute-multiple-queries]].

  `EXPERIMENTAL-execute-multiple-queries` is probably not the way we want to support `UNION ALL` in the long run -- it
  should probably be added to MBQL itself at some point. But this will involved lots of QP work, and will probably be
  a lot easier once we complete the MLv2 × QP epc (#30516) and move towards using pMBQL exclusively. So this 'new'
  implementation might be replaced by an new-er implementation in the future once we get that all working."
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.pivot.impl.common :as qp.pivot.impl.common]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- add-null-breakout-expression [query original-breakout]
  (let [null-expression-name (lib.metadata.calculation/column-name query original-breakout)
        original-type        (lib/type-of query original-breakout)
        expression           [:value {:lib/uuid       (str (random-uuid))
                                      :base-type      original-type
                                      :effective-type original-type}
                              nil]
        expression-options   {:add-to-fields? false}]
    (as-> query query
      (lib/expression query -1 null-expression-name expression expression-options)
      (lib/breakout query (lib/expression-ref query null-expression-name)))))

(mu/defn add-order-bys :- ::lib.schema/query
  "Add new order bys to the query in the appropriate order for the non-NULL breakouts (which might be different from the
  order of the breakouts). This will prevent the QP from automatically adding order bys in a different order."
  [query                    :- ::lib.schema/query
   breakout-indexes-to-keep :- [:maybe ::qp.pivot.impl.common/breakout-combination]]
  (let [all-breakouts (lib/breakouts query)]
    (reduce
     (fn [query i]
       (let [breakout (nth all-breakouts i)]
         (lib/order-by query (lib.util/fresh-uuids breakout))))
     query
     breakout-indexes-to-keep)))

(mu/defn replace-breakouts-with-null-expressions :- ::lib.schema/query
  "Keep the breakouts at indexes. Replace other breakouts with expressions that return `NULL`."
  [query                    :- ::lib.schema/query
   breakout-indexes-to-keep :- [:maybe ::qp.pivot.impl.common/breakout-combination]]
  (let [all-breakouts (lib/breakouts query)]
    (as-> query query
      (lib/remove-all-breakouts query)
      (assoc query :qp.pivot/breakout-combination breakout-indexes-to-keep)
      (reduce
       (fn [query i]
         (let [add-breakout (if (contains? (set breakout-indexes-to-keep) i)
                              lib/breakout
                              add-null-breakout-expression)]
           (add-breakout query (nth all-breakouts i))))
       query
       (range 0 (count all-breakouts))))))

(mr/def ::pivot-options
  [:map
   [:pivot-rows {:optional true} [:maybe ::qp.pivot.impl.common/pivot-rows]]
   [:pivot-cols {:optional true} [:maybe ::qp.pivot.impl.common/pivot-cols]]])

(mu/defn ^:private generate-queries :- [:sequential ::lib.schema/query]
  "Generate the additional queries to perform a generic pivot table"
  [query                                               :- ::lib.schema/query
   {:keys [pivot-rows pivot-cols], :as _pivot-options} :- [:maybe ::pivot-options]]
  (try
    (let [all-breakouts (lib/breakouts query)
          all-queries   (for [breakout-indexes (u/prog1 (qp.pivot.impl.common/breakout-combinations
                                                         (count all-breakouts)
                                                         pivot-rows
                                                         pivot-cols)
                                                 (log/tracef "Using breakout combinations: %s" (pr-str <>)))
                              :let             [group-bitmask (qp.pivot.impl.common/group-bitmask
                                                               (count all-breakouts)
                                                               breakout-indexes)]]
                          (-> query
                              qp.pivot.impl.common/remove-non-aggregation-order-bys
                              (replace-breakouts-with-null-expressions breakout-indexes)
                              (qp.pivot.impl.common/add-pivot-group-breakout group-bitmask)
                              (add-order-bys breakout-indexes)))]
      (conj (rest all-queries)
            (assoc-in (first all-queries) [:info :pivot/original-query] query)))
    (catch Throwable e
      (throw (ex-info (tru "Error generating pivot queries")
                      {:type qp.error-type/qp, :query query}
                      e)))))

(mr/def ::compiled-query
  [:map
   [:lib/type [:= :mbql/query]]
   [:database ::lib.schema.id/database]
   [:stages   [:sequential {:min 1, :max 1} ::lib.schema/stage.native]]])

(mu/defn ^:private compile-pmbql-query :- ::compiled-query
  [query :- :map]
  (-> query
      (assoc :stages [(merge {:lib/type :mbql.stage/native}
                             (set/rename-keys (qp.compile/compile query) {:query :native}))])
      (assoc-in [:info :pivot/compiled-from] query)))

(mu/defmethod qp.pivot.impl.common/run-pivot-query :qp.pivot.impl/new :- :some
  "Legacy implementation for running pivot queries."
  [_impl-name :- :keyword
   query      :- ::qp.schema/query
   rff        :- ::qp.schema/rff]
  (qp.setup/with-qp-setup [query query]
    (let [pivot-options (or (get-in query [:middleware :pivot-options])
                            (throw (ex-info "Missing pivot options" {:query query, :type qp.error-type/qp})))
          ;; query         (lib/query (qp.store/metadata-provider) (qp.preprocess/preprocess query))
          queries       (generate-queries query pivot-options)]
      (binding [qp.pipeline/*execute* (fn [driver _query respond]
                                        (let [compiled-queries (mapv compile-pmbql-query queries)]
                                          (driver/EXPERIMENTAL-execute-multiple-queries driver compiled-queries respond)))]
        (try
          (qp/process-query (first queries) rff)
          (catch Throwable e
            (throw (ex-info (ex-message e)
                            {:generated-queries queries}
                            e))))))))
