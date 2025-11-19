(ns metabase.lib.portable
  (:require
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defprotocol QueryVisitor
  (visit-database-id [this mp context database-id])
  (visit-table-id    [this mp context source-table-id])
  (visit-card-id     [this mp context source-card-id])
  (visit-field-id    [this mp context field-id]))

(defn query-visitor?
  "Does x implement the QueryVisitor protocol?"
  [x]
  #?(:clj  (extends? QueryVisitor (class x))
     :cljs (satisfies? QueryVisitor x)))

(mr/def ::query-visitor
  "Schema for things that satisfy the [[metabase.lib.portable/QueryVisitor]] protocol."
  [:fn
   {:error/message "Valid QueryVisitor"}
   #'query-visitor?])

(defn- update-field [mp k f]
  (m/assoc-some mp k (some-> (get mp k) f)))

(defn- walk-database [query context visitor]
  (let [mp (lib.metadata/->metadata-provider query)]
    (update-field query :database (partial visit-database-id visitor mp context))))

(defn- walk-stages [query context visitor]
  (let [mp (lib.metadata/->metadata-provider query)
        st (partial visit-table-id visitor mp context)
        sc (partial visit-card-id  visitor mp context)]
    (mu/disable-enforcement
      (lib.walk/walk-stages
       query
       (fn [_q _pt stage]
         (-> stage
             (update-field :source-table st)
             (update-field :source-card  sc)))))))

(defn- walk-clauses [query context visitor]
  (let [mp (lib.metadata/->metadata-provider query)]
    (mu/disable-enforcement
      (lib.walk/walk-clauses
       query
       (fn [_q _pt _sjp clause]
         (lib.util.match/match-lite clause
           [:field opts id]
           (when-some [field-ref (visit-field-id visitor mp context id)]
             [:field opts field-ref])))))))

(mu/defn export-walk
  "Walk a query, replacing database ids, source-table ids, source card ids, and field ids using the QueryVisitor protocol. The QueryVisitor methods should take an id and return the exported form (or nil to do nothing)."
  [query :- ::lib.schema/query
   export-visitor :- ::query-visitor
   context :- :any]
  (-> query
      (walk-database context export-visitor)
      (walk-stages   context export-visitor)
      (walk-clauses  context export-visitor)))

(mu/defn import-walk :- ::lib.schema/query
  "Walk a query, replacing database refs, table refds, card refs, and field refs using the QueryVisitor protocol. The QueryVisitor methods should take whatever was exported and return the appropriate id. This function does not check the query schema on input (it won't pass), but does check the schema of the return value, so make sure it gets patched up right!"
  [query :- :any ;; something similar to a query with bits changed
   import-visitor :- ::query-visitor
   context :- :any]
  (-> query
      (walk-database context import-visitor)
      (walk-stages   context import-visitor)
      (walk-clauses  context import-visitor)))
