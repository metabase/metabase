(ns metabase.lib.portable
  (:require
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defprotocol ExportVisitor
  (export-database     [this mp context database-id])
  (export-source-table [this mp context source-table-id])
  (export-source-card  [this mp context source-card-id])
  (export-field        [this mp context field-id]))

(defn export-visitor?
  "Does x implement the ExportVisitor protocol?"
  [x]
  #?(:clj  (extends? ExportVisitor (class x))
     :cljs (satisfies? ExportVisitor x)))

(mr/def ::export-visitor
  "Schema for things that satisfy the [[metabase.lib.portable/ExportVisitor]] protocol."
  [:fn
   {:error/message "Valid ExportVisitor"}
   #'export-visitor?])

(defprotocol ImportVisitor
  (import-database     [this mp context database-info])
  (import-source-table [this mp context source-table-info])
  (import-source-card  [this mp context source-card-info])
  (import-field        [this mp context field-info]))

(defn import-visitor?
  "Does x implement the ImportVisitor protocol?"
  [x]
  #?(:clj  (extends? ImportVisitor (class x))
     :cljs (satisfies? ImportVisitor x)))

(mr/def ::import-visitor
  "Schema for things that satisfy the [[metabase.lib.portable/ImportVisitor]] protocol."
  [:fn
   {:error/message "Valid ImportVisitor"}
   #'import-visitor?])

(defn- export-walk-database [query context export-visitor]
  (let [mp (lib.metadata/->metadata-provider query)]
    (m/assoc-some query :database (some->> (:database query)
                                           (export-database export-visitor mp context)))))

(defn- export-walk-stages [query context export-visitor]
  (let [mp (lib.metadata/->metadata-provider query)]
    (mu/disable-enforcement
      (lib.walk/walk-stages
       query
       (fn [_q _pt stage]
         (-> stage
             (m/assoc-some :source-table
                           (some->> (:source-table stage)
                                    (export-source-table export-visitor mp context)))
             (m/assoc-some :source-card
                           (some->> (:source-card stage)
                                    (export-source-card  export-visitor mp context)))))))))

(defn- export-walk-clauses [query context export-visitor]
  (let [mp (lib.metadata/->metadata-provider query)]
    (mu/disable-enforcement
      (lib.walk/walk-clauses
       query
       (fn [_q _pt _sjp clause]
         (lib.util.match/match-lite clause
           [:field opts (id :guard pos-int?)]
           (when-some [field-ref (export-field export-visitor mp context id)]
             [:field opts field-ref])))))))

(mu/defn export-walk
  "Walk a query, replacing database ids, source-table ids, source card ids, and field ids using the export-visitor protocol."
  [query :- ::lib.schema/query
   export-visitor :- ::export-visitor
   context :- :any]
  (-> query
      (export-walk-database context export-visitor)
      (export-walk-stages   context export-visitor)
      (export-walk-clauses  context export-visitor)))

(defn- import-walk-database [query context import-visitor]
  (let [mp (lib.metadata/->metadata-provider query)]
    (m/assoc-some query
                  :database (some->> (:database query)
                                     (import-database import-visitor mp context)))))

(defn- import-walk-stages [query context import-visitor]
  (let [mp (lib.metadata/->metadata-provider query)]
    (mu/disable-enforcement
      (lib.walk/walk-stages
       query
       (fn [_q _pt stage]
         (-> stage
             (m/assoc-some :source-table (some->> (:source-table stage)
                                                  (import-source-table import-visitor mp context)))
             (m/assoc-some :source-card  (some->> (:source-card stage)
                                                  (import-source-card  import-visitor mp context)))))))))

(defn- import-walk-clauses [query context import-visitor]
  (let [mp (lib.metadata/->metadata-provider query)]
    (mu/disable-enforcement
      (lib.walk/walk-clauses
       query
       (fn [_q _pt _sjp clause]
         (lib.util.match/match-lite clause
           [:field opts (info :guard map?)]
           (when-some [field-ref (import-field import-visitor mp context info)]
             [:field opts field-ref])))))))

(mu/defn import-walk :- ::lib.schema/query
  "Walk a query, replacing database ids, source-table ids, source card ids, and field ids using the import-visitor protocol."
  [query :- :any ;; something similar to a query but needs bits changed
   import-visitor :- ::import-visitor
   context :- :any]
  (-> query
      (import-walk-database context import-visitor)
      (import-walk-stages   context import-visitor)
      (import-walk-clauses  context import-visitor)))
