(ns metabase.lib.join
  "Functions related to manipulating EXPLICIT joins in MBQL."
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join.alias :as lib.join.alias]
   [metabase.lib.join.common :as lib.join.common]
   [metabase.lib.join.conditions :as lib.join.conditions]
   [metabase.lib.join.fields :as lib.join.fields]
   [metabase.lib.join.metadata :as lib.join.metadata]
   [metabase.lib.join.strategy :as lib.join.strategy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.namespaces :as shared.ns]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(comment lib.join.alias/keep-me
         lib.join.common/keep-me
         lib.join.conditions/keep-me
         lib.join.fields/keep-me
         lib.join.metadata/keep-me
         lib.join.strategy/keep-me)

(defmulti ^:private join-clause-method
  "Convert something to a join clause."
  {:arglists '([joinable])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

;; TODO -- should the default implementation call [[metabase.lib.query/query]]? That way if we implement a method to
;; create an MBQL query from a `Table`, then we'd also get [[join]] support for free?

(defmethod join-clause-method :mbql/join
  [a-join-clause]
  a-join-clause)

;;; TODO -- this probably ought to live in [[metabase.lib.query]]
(defmethod join-clause-method :mbql/query
  [another-query]
  (-> {:lib/type :mbql/join
       :stages   (:stages (lib.util/pipeline another-query))}
      lib.options/ensure-uuid))

;;; TODO -- this probably ought to live in [[metabase.lib.stage]]
(defmethod join-clause-method :mbql.stage/mbql
  [mbql-stage]
  (-> {:lib/type :mbql/join
       :stages   [mbql-stage]}
      lib.options/ensure-uuid))

(defmethod join-clause-method :metadata/card
  [card]
  (-> {:lib/type :mbql/join
       :stages [{:source-card (:id card)
                 :lib/type :mbql.stage/mbql}]}
      lib.options/ensure-uuid))

(defmethod join-clause-method :metadata/table
  [{::keys [join-alias join-fields], :as table-metadata}]
  (cond-> (join-clause-method {:lib/type     :mbql.stage/mbql
                               :lib/options  {:lib/uuid (str (random-uuid))}
                               :source-table (:id table-metadata)})
    join-alias  (lib.join.alias/with-join-alias join-alias)
    join-fields (lib.join.fields/with-join-fields join-fields)))

(mu/defn join-clause :- lib.join.common/PartialJoin
  "Create an MBQL join map from something that can conceptually be joined against. A `Table`? An MBQL or native query? A
  Saved Question? You should be able to join anything, and this should return a sensible MBQL join map."
  ([joinable]
   (-> (join-clause-method joinable)
       (u/assoc-default :fields :all)))

  ([joinable conditions]
   (-> (join-clause joinable)
       (lib.join.conditions/with-join-conditions conditions))))

(mu/defn join :- ::lib.schema/query
  "Add a join clause to a `query`."
  ([query a-join]
   (join query -1 a-join))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    a-join       :- [:or lib.join.common/PartialJoin lib.join.common/Joinable]]
   (let [a-join              (join-clause a-join)
         a-join              (lib.join.alias/add-default-alias query stage-number a-join)
         suggested-condition (when (empty? (lib.join.conditions/join-conditions a-join))
                               (lib.join.conditions/suggested-join-condition query stage-number (lib.join.common/joined-thing query a-join)))
         a-join              (cond-> a-join
                               suggested-condition (lib.join.conditions/with-join-conditions [suggested-condition]))]
     (lib.util/update-query-stage query stage-number update :joins (fn [existing-joins]
                                                                     (conj (vec existing-joins) a-join))))))

(shared.ns/import-fns
 [lib.join.alias
  add-default-alias
  current-join-alias
  implicit-join-name
  joined-field-desired-alias
  with-join-alias]

 [lib.join.common
  joined-thing
  joins
  resolve-join]

 [lib.join.conditions
  join-condition-lhs-columns
  join-condition-operators
  join-condition-rhs-columns
  join-condition-update-temporal-bucketing
  join-conditions
  suggested-join-condition
  with-join-conditions]

 [lib.join.fields
  join-fields
  with-join-fields]

 [lib.join.metadata
  all-joins-expected-columns
  all-joins-visible-columns
  join-lhs-display-name
  joinable-columns]

 [lib.join.strategy
  available-join-strategies
  join-strategy
  raw-join-strategy
  with-join-strategy])
