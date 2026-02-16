(ns metabase.actions.scope
  (:require
   [metabase.actions.types :as types]
   [metabase.lib.core :as lib]
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
    :model-id     :model
    :table-id     :table
    :unknown))

(def ^:private missing-id -1)

(defn- hydrate-from-dashcard [scope]
  (if (and (contains? scope :card-id) (contains? scope :dashboard-id))
    scope
    (let [{:keys [dashboard_id]} (t2/select-one [:model/DashboardCard :dashboard_id] (:dashcard-id scope))]
      (merge {:dashboard-id (or dashboard_id missing-id)} scope))))

(defn- hydrate-from-card [scope card-id]
  (if (and (contains? scope :collection-id) (contains? scope :table-id) (contains? scope :database-id))
    scope
    (let [card         (t2/select-one [:model/Card :dataset_query :collection_id :database_id :display] card-id)
          table-id     (lib/source-table-id (:dataset_query card))]
      (merge {:table-id      table-id
              :collection-id (:collection_id card missing-id)
              :database-id   (:database_id card missing-id)}
             scope))))

(defn- hydrate-scope* [scope]
  (cond-> scope
    (:dashcard-id scope) hydrate-from-dashcard

    (:dashboard-id scope)
    (update :collection-id #(or % (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] (:dashboard-id scope)) missing-id))

    (:model-id scope) (hydrate-from-card (:model-id scope))

    (:table-id scope)
    (update :database-id #(or % (t2/select-one-fn :db_id [:model/Table :db_id] (:table-id scope)) missing-id))))

(defn- strip-nils
  "Remove any keys corresponding to nil values from the given map."
  [m]
  (into {} (filter (comp some? val) m)))

(mu/defn hydrate-scope :- ::types/scope.hydrated
  "Add the implicit keys that can be derived from the existing ones in a scope. Idempotent."
  [scope :- ::types/scope.raw]
  ;; Infer type if FE is not passing it (yet)
  (let [scope-type (or (:type scope) (scope-type scope))]
    (assoc (strip-nils
            ;; Rerun until it converges.
            (ffirst (filter (partial apply =) (partition 2 1 (iterate hydrate-scope* scope)))))
           :type scope-type)))

(mu/defn normalize-scope :- ::types/scope.normalized
  "Remove all the implicit keys that can be derived from others. Useful to form stable keys. Idempotent."
  [scope :- ::types/scope.raw]
  (cond-> (update scope :type #(or % (scope-type scope)))
    (:table-id scope)     (dissoc :database-id)
    (:model-id scope)     (-> (dissoc :table-id)
                              (dissoc :collection-id)
                              (dissoc :database-id))
    (:dashboard-id scope) (dissoc :collection-id)
    (:dashcard-id scope)  (dissoc :dashboard-id)))
