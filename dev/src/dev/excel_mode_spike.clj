(ns dev.excel-mode-spike
  "Local engine experiment for unsaved dataset calculations; not an API or UI implementation."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.ast.plan :as ast.plan]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor :as qp]
   [metabase.request.core :as request]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- query-result! [query]
  (let [result (qp/process-query query)]
    (when-not (= :completed (:status result))
      (throw (ex-info "Sample query failed" (select-keys result [:status :error]))))
    result))

(defn- rows [result]
  (vec (sort (get-in result [:data :rows]))))

(defn- expression [operator children]
  {:node/type :expression/arithmetic :operator operator :children children})

(defn- computed-rows [expr results]
  (:rows (ast.plan/join-and-compute expr results 1)))

(defn- check! [label expected actual]
  (when-not (= expected actual)
    (throw (ex-info label {:expected expected :actual actual})))
  {:check label :passed true})

(defn- mapping-for-field [measure field-id]
  (or (some #(when (= field-id (last (:target %))) %) (:dimension-mappings measure))
      (throw (ex-info "Measure has no mapping for the selected field" {:field-id field-id}))))

(defn- saved-definition [provider measure mapping]
  (-> (lib-metric/from-measure-metadata provider measure)
      (assoc :expression [:measure {:lib/uuid "saved"} (:id measure)])
      (assoc :projections [{:type :measure :id (:id measure) :lib/uuid "saved"
                            :projection [[:dimension {} (:dimension-id mapping)]]}])))

(defn- calculation-input [query dimension]
  ;; This is the proposed adapter boundary: an unsaved query plus explicit grouping metadata.
  ;; The existing HTTP schema does not accept this input.
  {:query query
   :leaf {:node/type :expression/leaf
          :uuid "dataset"
          :ast {:dimensions [{:id (:id dimension) :effective-type (:effective-type dimension)}]
                :group-by [{:dimension-id (:id dimension)}]}}})

(defn- incompatible-grouping-rejected? [dataset-leaf saved-leaf]
  (try
    (ast.plan/validate-arithmetic-ast!
     (expression :+ [(assoc-in dataset-leaf [:ast :dimensions 0 :effective-type] :type/DateTime)
                     saved-leaf]))
    false
    (catch clojure.lang.ExceptionInfo e
      (= 400 (:status-code (ex-data e))))))

(defn run-spike!
  "Run sample-data queries and return formula results and checks without creating saved objects."
  [{:keys [user-id database-id table-id category-field-id measure-id]}]
  (request/with-current-user user-id
    (let [provider    (lib-be/application-database-metadata-provider database-id)
          category    (lib.metadata/field provider category-field-id)
          query       (-> (lib/query provider (lib.metadata/table provider table-id))
                          (lib/aggregate (lib/count))
                          (lib/breakout category))
          metric-mp   (lib-metric/metadata-provider)
          measure     (first (lib.metadata.protocols/metadatas metric-mp
                                                               {:lib/type :metadata/measure :id #{measure-id}}))
          mapping     (mapping-for-field measure category-field-id)
          definition  (saved-definition metric-mp measure mapping)
          saved-ast   (lib-metric.definition/->ast definition)
          saved-leaf  (:expression saved-ast)
          dimension   {:id (str (random-uuid))
                       :effective-type (or (:effective-type category) (:base-type category))}
          input       (calculation-input query dimension)
          leaf        (:leaf input)
          doubled     (expression :* [leaf {:node/type :expression/constant :value 2}])
          mixed       (expression :+ [leaf saved-leaf])
          _           (ast.plan/validate-arithmetic-ast! mixed)
          source      (query-result! (:query input))
          saved       (query-result! (:plan/mbql (lib-metric/->query-plan definition)))
          filtered    (query-result! (lib/filter query (lib/= category "Widget")))
          both        {"dataset" source "saved" saved}
          baseline    [["Doohickey" 42] ["Gadget" 53] ["Gizmo" 51] ["Widget" 54]]
          twice       [["Doohickey" 84] ["Gadget" 106] ["Gizmo" 102] ["Widget" 108]]
          checks      [(check! "Unsaved Count by Category" baseline (rows source))
                       (check! "Existing saved measure agrees" baseline (rows saved))
                       (check! "Unsaved Count multiplied by 2" twice (computed-rows doubled {"dataset" source}))
                       (check! "Unsaved Count plus saved Product count" twice (computed-rows mixed both))
                       (check! "Dataset-only filter" [["Widget" 54]] (rows filtered))
                       (check! "Missing groups use existing inner-join behavior" [["Widget" 108]]
                               (computed-rows mixed {"dataset" filtered "saved" saved}))
                       (check! "Incompatible grouping rejected" true (incompatible-grouping-rejected? leaf saved-leaf))
                       (check! "Public expression schema rejects inline queries" false
                               (mr/validate ::lib-metric.schema/metric-math-expression
                                            [:query {:lib/uuid "dataset"} query]))]]
      {:checks checks
       :dataset (rows source)
       :doubled (computed-rows doubled {"dataset" source})
       :mixed (computed-rows mixed both)
       :filtered-dataset (rows filtered)
       :filtered-mixed (computed-rows mixed {"dataset" filtered "saved" saved})
       :saved-measure (rows saved)})))
