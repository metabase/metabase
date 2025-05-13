(ns metabase-enterprise.data-editing.scope
  (:require
   [macaw.util :as u]
   [metabase-enterprise.data-editing.types :as types]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;; TODO Perhaps we will prefer the FE just sending this explicitly instead?
;; For now, it is not doing this, so we infer it.
(mu/defn scope-type
  "Classify the scope, useful for switching on in logic and templates."
  [scope :- ::types/scope.raw] :- :keyword
  (condp #(contains? %2 %1) scope
    :dashcard-id :dashcard
    :dashboard-id :dashboard
    :card-id :card
    :webhook-id :webhook
    :table-id :table))

(defn- hydrate-from-dashcard-id* [scope]
  (if (and (contains? scope :card-id) (contains? scope :dashboard-id))
    scope
    (let [{:keys [card_id dashboard_id]} (t2/select-one [:model/DashboardCard :card_id :dashboard_id]
                                                        (:dashcard-id scope))]
      (merge {:card-id card_id, :dashboard-id dashboard_id} scope))))

(defn- hydrate-from-card-id* [scope]
  (if (and (contains? scope :collection-id) (contains? scope :table-id))
    scope
    (let [card         (t2/select-one [:model/Card :dataset_query :collection_id] (:card-id scope))
          source-table (-> card :dataset_query :query :source-table)
          table-id     (when (pos-int? source-table)
                         source-table)]
      (merge {:table-id table-id, :collection-id (:collection_id card)} scope))))

(defn hydrate-scope* [scope]
  (cond-> scope
    (:dashcard-id scope) hydrate-from-dashcard-id*

    (:dashboard-id scope)
    (update :collection-id #(or % (t2/select-one-fn :collection_id
                                                    [:model/Dashboard :collection_id]
                                                    (:dashboard-id scope))))

    (:webhook-id scope) (update :table-id #(or % (t2/select-one-fn :table_id
                                                                   [:table_webhook_token :table_id]
                                                                   (:webhook-id scope))))

    (:card-id scope) hydrate-from-card-id*

    (:table-id scope)
    (update :database-id #(or % (t2/select-one-fn :db_id [:model/Table :db_id] (:table-id scope))))))

(mu/defn hydrate
  "Add the implicit keys that can be derived from the existing ones in a scope. Idempotent."
  [scope :- ::types/scope.raw] :- ::types/scope.hydrated
  (u/strip-nils
   ;; Rerun until it converges.
   (ffirst (filter (partial apply =) (partition 2 1 (iterate hydrate-scope* scope))))))

(mu/defn normalize
  "Remove all the implicit keys that can be derived from others. Useful to form stable keys. Idempotent."
  [scope :- ::types/scope.raw] :- ::types/scope.normalized
  (cond-> scope
    (:table-id scope)     (dissoc :database-id)
    (:card-id scope)      (-> (dissoc :table-id)
                              (dissoc :collection-id))
    (:dashboard-id scope) (dissoc :collection-id)
    (:dashcard-id scope)  (-> (dissoc :card-id)
                              (dissoc :dashboard-id))))
