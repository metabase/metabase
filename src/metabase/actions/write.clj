(ns metabase.actions.write
  "The full write of an Action: the request checks that are not invariants, then the Action row and its details row."
  (:require
   [metabase.actions.actions :as actions]
   [metabase.actions.db :as actions.db]
   [metabase.actions.models :as actions.models]
   [metabase.actions.schema :as actions.schema]
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Request checks -------------------------------------------------

(defn- check-implicit-actions-supported
  "Throws a 400 when `action` is implicit and its model's query does not support implicit actions."
  [{model-id :model_id, :as action}]
  (when (and (actions.models/implicit? action) model-id)
    (actions.models/check-query-supports-implicit-actions (actions.db/card-query model-id))))

(defn- check-implicit-action-table-pk
  "Throws a 400 when `action` is an implicit action without a model whose Table lacks exactly one usable primary key,
  which the entry points check rather than a hook as a load can bring the table's fields after the action."
  [{model-id :model_id, table-id :table_id, :as action}]
  (when (and (actions.models/implicit? action) (nil? model-id) table-id)
    (let [fields (actions.models/table-action-fields (first (actions.db/tables-with-fields [table-id])))]
      (when-not (= 1 (count (filter #(isa? (:semantic_type %) :type/PK) fields)))
        (throw (ex-info (tru "An implicit action needs a table with exactly one primary key.") {:status-code 400}))))))

(defn- action-database-ids
  "The ids of the Databases `action` runs against: its query's, or for an implicit action its model's or its table's."
  [{model-id :model_id, action-id :id, table-id :table_id, query :dataset_query, :as action}]
  (case (keyword (:type action))
    :implicit [(if model-id
                 (:database_id (actions.db/card-scope-columns model-id))
                 (some-> (or table-id (some-> action-id actions.db/implicit-action-table-id))
                         actions.db/table-database-id))]
    :query    [(:database query)]
    []))

(defn- check-action-databases-enabled
  "Throws a 400 unless actions are enabled on every Database `action` runs against."
  [action]
  (doseq [database-id (action-database-ids action)
          :when       database-id]
    (actions/check-actions-enabled-for-database (actions.db/database database-id))))

;;; ------------------------------------------------- Statements -----------------------------------------------------

(def ^:private action-columns
  "The columns that are common to all Action types."
  [:archived :archived_directly :collection_id :created_at :creator_id :description :entity_id :made_public_by_id :model_id :name
   :parameter_mappings :parameters :public_uuid :public_uuid_prefix :type :updated_at :visualization_settings])

(mu/defn- insert*! :- ::actions.schema/id
  [action-data :- ::actions.schema/action.for-insert]
  (t2/with-transaction [_conn]
    (let [action (actions.db/insert-action! (select-keys action-data action-columns))
          row    (-> (apply dissoc action-data action-columns)
                     (assoc :action_id (:id action))
                     (cond-> (= (:type action) :implicit) (dissoc :database_id)))]
      (case (:type action)
        :query    (actions.db/insert-query-action! row)
        :implicit (actions.db/insert-implicit-action! row))
      (:id action))))

(mu/defn insert! :- ::actions.schema/id
  "Inserts an Action and its details row, returning the action id."
  [action-data :- ::actions.schema/action.for-insert]
  (insert*! (lib/normalize ::actions.schema/action.for-insert action-data)))

(mu/defn- update*!
  [{:keys [id] :as updates} :- ::actions.schema/action.for-update
   existing-action          :- ::actions.schema/action]
  (let [updates (assoc updates :type (or (:type updates) (:type existing-action)))]
    (when (and (contains? updates :model_id) (not= (:model_id updates) (:model_id existing-action)))
      (throw (ex-info (tru "An action''s model can''t be changed.") {:status-code 400})))
    (t2/with-transaction [_conn]
      (when-let [action-row (not-empty (select-keys updates action-columns))]
        (actions.db/update-action! id action-row))
      (when-let [type-row (not-empty (cond-> (apply dissoc updates :id action-columns)
                                       (= (or (:type updates) (:type existing-action))
                                          :implicit)
                                       (dissoc :database_id)))]
        (let [type-row (assoc type-row :action_id id)]
          (if (and (:type updates) (not= (:type updates) (:type existing-action)))
            (do
              (case (:type existing-action)
                :query    (actions.db/delete-query-action! id)
                :implicit (actions.db/delete-implicit-action! id))
              (case (:type updates)
                :query    (actions.db/insert-query-action! type-row)
                :implicit (actions.db/insert-implicit-action! type-row)))
            (case (:type existing-action)
              :query    (actions.db/update-query-action! id type-row)
              :implicit (actions.db/update-implicit-action! id type-row)))))
      (when (and (:archived updates) (not (:archived existing-action)))
        (actions.db/delete-dashcards-for-action! id))
      (actions.db/action id))))

(mu/defn update!
  "Updates an Action and its details row, replacing the row of the old type when the type changes."
  [updates         :- ::actions.schema/action.for-update
   existing-action :- ::actions.schema/action]
  (let [updates (merge (select-keys existing-action [:type]) updates)]
    (update*! (lib/normalize ::actions.schema/action.for-update updates) existing-action)))

;;; --------------------------------------------------- Entry points -------------------------------------------------

(defn create-action!
  "Checks `action`, a new Action of a request, and inserts it, returning the action id."
  [action]
  (check-implicit-actions-supported action)
  (check-implicit-action-table-pk action)
  (check-action-databases-enabled action)
  (insert! action))

(defn update-action!
  "Checks `updates`, a request to change `existing-action`, and applies it."
  [{:keys [id] :as updates} existing-action]
  (when (and (:archived updates) (get updates :model_id (:model_id existing-action)))
    (throw (ex-info (tru "A model''s action can''t be archived. Delete it instead.") {:status-code 400})))
  (when (some #(contains? updates %) [:dataset_query :database_id :type :kind :model_id :table_id])
    (let [merged (merge (actions.models/select-action :id id) updates)]
      (check-implicit-action-table-pk merged)
      (check-action-databases-enabled merged)))
  (update! updates existing-action))
