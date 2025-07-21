(ns metabase.actions.scope
  (:require
   [macaw.util :as u]
   [metabase.actions.types :as types]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;; TODO Perhaps we will prefer the FE just sending this explicitly instead?
;; For now, it is not doing this, so we infer it.
(mu/defn scope-type :- :keyword
  "Classify the scope, useful for switching on in logic and templates."
  [scope :- ::types/scope.raw]
  (condp #(contains? %2 %1) scope
    :dashcard-id  :dashcard
    :dashboard-id :dashboard
    :card-id      :card
    :model-id     :model
    :webhook-id   :webhook
    :table-id     :table
    :unknown))

(def ^:private missing-id -1)

(defn- hydrate-from-dashcard [scope]
  (if (and (contains? scope :card-id) (contains? scope :dashboard-id))
    scope
    (let [{:keys [card_id dashboard_id]} (t2/select-one [:model/DashboardCard :card_id :dashboard_id]
                                                        (:dashcard-id scope))]
      (merge {:dashboard-id (or dashboard_id missing-id)}
             (when card_id {:card-id card_id})
             scope))))

(defn- hydrate-from-card [scope card-id]
  (if (and (contains? scope :collection-id) (contains? scope :table-id) (contains? scope :database-id))
    scope
    (let [card         (t2/select-one [:model/Card :dataset_query :collection_id :database_id :display] card-id)
          ;; TODO Enable check for-real once we've updated all the tests that rely on row-data
          ;;      (only for an editable do we want to treat the )
          source-table #_(when (and (= :model (:type card)) (= :table-editable (:display card))))
          (-> card :dataset_query :query :source-table)
          table-id     (when (pos-int? source-table)
                         source-table)]
      (merge {:table-id      table-id
              :collection-id (:collection_id card missing-id)
              :database-id   (:database_id card missing-id)}
             scope))))

(defn- hydrate-scope* [scope]
  (cond-> scope
    (:dashcard-id scope) hydrate-from-dashcard

    (:dashboard-id scope)
    (update :collection-id #(or % (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] (:dashboard-id scope)) missing-id))

    (:webhook-id scope)
    (update :table-id #(or % (t2/select-one-fn :table_id [:table_webhook_token :table_id] (:webhook-id scope)) missing-id))

    (:card-id scope) (hydrate-from-card (:card-id scope))

    (:model-id scope) (hydrate-from-card (:model-id scope))

    (:table-id scope)
    (update :database-id #(or % (t2/select-one-fn :db_id [:model/Table :db_id] (:table-id scope)) missing-id))))

(mu/defn hydrate-scope :- ::types/scope.hydrated
  "Add the implicit keys that can be derived from the existing ones in a scope. Idempotent."
  [scope :- ::types/scope.raw]
  ;; Infer type if FE is not passing it (yet)
  (let [scope-type (or (:type scope) (scope-type scope))]
    (assoc (u/strip-nils
            ;; Rerun until it converges.
            (ffirst (filter (partial apply =) (partition 2 1 (iterate hydrate-scope* scope)))))
           :type scope-type)))

(mu/defn normalize-scope :- ::types/scope.normalized
  "Remove all the implicit keys that can be derived from others. Useful to form stable keys. Idempotent."
  [scope :- ::types/scope.raw]
  (cond-> (update scope :type #(or % (scope-type scope)))
    (:table-id scope)     (dissoc :database-id)
    (:card-id scope)      (-> (dissoc :table-id)
                              (dissoc :collection-id)
                              (dissoc :database-id))
    (:model-id scope)     (-> (dissoc :table-id)
                              (dissoc :collection-id)
                              (dissoc :database-id))
    (:dashboard-id scope) (dissoc :collection-id)
    (:dashcard-id scope)  (-> (dissoc :card-id)
                              (dissoc :dashboard-id))
    (:webhook-id scope)   (dissoc :table-id)))
