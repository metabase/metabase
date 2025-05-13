(ns metabase-enterprise.data-editing.scope
  (:require
   [metabase-enterprise.data-editing.types :as types]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;; TODO Perhaps we will prefer the FE just sending this explicitly instead?
;; For now, it is not doing this, so we infer it.
(mu/defn scope-type
  "Classify the scope, useful for switching on in logic and templates."
  [scope :- ::types/scope.raw] :- :keyword
  (condp contains? scope
    :dashcard-id :dashcard
    :dashboard-id :dashboard
    :card-id :card
    :table-id :table
    :webhook-id :webhook))

(defn- hydrate-from-card-id* [scope]
  (if (and (contains? scope :collection-id) (contains? scope :table-id))
    scope
    (let [card         (t2/select-one [:model/Card :dataset_query :collection_id] (:card-id scope))
          source-table (-> card :dataset_query :query :source-table)
          table-id     (when (pos-int? source-table)
                         source-table)]
      (-> scope
          (update :table-id #(or % table-id))
          (update :collection-id #(or % (:collection_id card)))))))

(defn hydrate-scope* [scope]
  (cond-> scope
    (:dashcard-id scope)
    (update :dashboard-id #(or % (t2/select-one-fn :dashboard_id
                                                   [:model/DashboardCard :dashboard_id]
                                                   (:dashcard-id scope))))

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

(mu/defn hydrate-scope
  "Add the implicit keys that can be derived from the existing ones in a scope. Idempotent."
  [scope :- ::types/scope.raw] :- ::types/scope.hydrated
  ;; Rerun until it converges.
  (ffirst (filter (partial apply =) (partition 2 1 (iterate hydrate-scope* scope)))))

(mu/defn normalize-scope
  "Remove all the implicit keys that can be derived from others. Useful to form stable keys. Idempotent."
  [scope :- ::types/scope.raw] :- ::types/scope.normalized
  (cond-> scope
    (:table-id scope)     (dissoc :database-id)
    (:card-id scope)      (-> (dissoc :table-id)
                              (dissoc :collection-id))
    (:dashcard-id scope)  (-> (dissoc :card-id)
                              (dissoc :dashboard-id))
    (:dashboard_id scope) (dissoc :collection-id)))

(comment
  (hydrate-scope {:dashcard-id 1})
  (hydrate-scope {:card-id 1})

  (normalize-scope (hydrate-scope {:dashcard-id 1}))

  (normalize-scope {:dashboard-id 1})
  (normalize-scope {:dashboard-id 1 :dashcard-id 2 :card-id 3 :table-id 4 :database-id 5})
  (normalize-scope {:card-id 3 :table-id 4 :database-id 5})
  (normalize-scope {:table-id 4 :database-id 5}))
