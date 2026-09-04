(ns metabase.queries.db
  "Application-database reads for the queries module. Toucan calls live here so the check and
   endpoint namespaces stay pure decision logic."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn dashboard-collection-id
  "The `collection_id` of the Dashboard with `dashboard-id`, or nil when there is no such Dashboard."
  [dashboard-id]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] dashboard-id))

(defn card-dashboards
  "The Dashboards `card` appears in, hydrating `:in_dashboards` unless it is already present."
  [card]
  (or (:in_dashboards card)
      (:in_dashboards (t2/hydrate card :in_dashboards))))
