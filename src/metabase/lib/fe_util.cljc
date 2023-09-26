(ns metabase.lib.fe-util
  (:require
   [metabase.lib.common :as lib.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.ref :as ref]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(def ^:private ExpressionParts
  [:map
   [:lib/type [:= :mbql/expression-parts]]
   [:operator [:or :keyword :string]]
   [:options ::lib.schema.common/options]
   [:args [:sequential :any]]])

(mu/defn expression-parts :- ExpressionParts
  "Return the parts of the filter clause `expression-clause` in query `query` at stage `stage-number`."
  ([query expression-clause]
   (expression-parts query -1 expression-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    expression-clause :- ::lib.schema.expression/expression]
   (let [[op options & args] expression-clause
         stage            (lib.util/query-stage query stage-number)
         columns          (lib.metadata.calculation/visible-columns query stage-number stage)
         ->maybe-col      #(when (lib.hierarchy/isa? (first %) ::ref/ref)
                             (when-let [col (lib.equality/find-matching-column % columns)]
                               (lib.filter/add-column-operators
                                 (lib.field/extend-column-metadata-from-ref query stage-number col %))))]
     {:lib/type :mbql/expression-parts
      :operator op
      :options  options
      :args     (mapv (fn [arg]
                        (if (lib.util/clause? arg)
                          (if-let [col (->maybe-col arg)]
                            col
                            (expression-parts query stage-number arg))
                          arg))
                      args)})))

(defmethod lib.common/->op-arg :mbql/expression-parts
  [{:keys [operator options args] :or {options {}}}]
  (lib.common/->op-arg (lib.options/ensure-uuid (into [(keyword operator) options]
                                                      (map lib.common/->op-arg)
                                                      args))))

(mu/defn expression-clause :- ::lib.schema.expression/expression
  "Returns a standalone clause for an `operator`, `options`, and arguments."
  [operator :- [:or :keyword :string]
   options  :- :map
   args     :- [:sequential :any]]
  (let [tag (keyword operator)]
    (lib.options/ensure-uuid (into [tag options]
                                   (map lib.common/->op-arg args)))))
