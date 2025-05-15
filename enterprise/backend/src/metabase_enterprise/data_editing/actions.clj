(ns metabase-enterprise.data-editing.actions
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [metabase.actions.core :as actions]
   [metabase.lib.schema.actions :as lib.schema.actions]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(derive :data-grid/create :data-grid/common)
(derive :data-grid/update :data-grid/common)
(derive :data-grid/delete :data-grid/common)

(s/def :actions.args.data-grid/common
  :actions.args.crud.table/row)

(defmethod actions/action-arg-map-spec :data-grid/common
  [_action]
  :actions.args.data-grid/common)

(defmethod actions/normalize-action-arg-map :data-grid/common
  [_action input]
  (update-keys input u/qualified-name))

(defn- scope->table-id [context]
  (u/prog1 (-> context :scope :table-id)
    (when-not <>
      (throw (ex-info "Cannot perform data-grid actions without a table in scope."
                      {:error :data-grid/unknown-table})))))

(defn- map-inputs [table-id inputs]
  (for [row (data-editing/apply-coercions table-id inputs)]
    {:table-id table-id :row row}))

(defn- perform-table-row-action!
  "Perform an action directly, skipping permissions checks etc, and generate outputs based on the table modifications."
  [action-kw context inputs xform-outputs]
  (update (actions/perform-nested-action! action-kw context inputs)
          :outputs xform-outputs))

(defn- perform! [action-kw context inputs]
  ;; We could enhance this in future to work more richly with multi-table editable models.
  (let [table-id     (scope->table-id context)
        next-inputs  (map-inputs table-id inputs)
        rows->output (partial data-editing/invalidate-and-present! table-id)]
    (perform-table-row-action! action-kw context next-inputs rows->output)))

(mu/defmethod actions/perform-action!* [:sql-jdbc :data-grid/create]
  [_action context inputs :- [:sequential ::lib.schema.actions/row]]
  (perform! :table.row/create context inputs))

(mu/defmethod actions/perform-action!* [:sql-jdbc :data-grid/update]
  [_action context inputs :- [:sequential ::lib.schema.actions/row]]
  (perform! :table.row/update context inputs))

(mu/defmethod actions/perform-action!* [:sql-jdbc :data-grid/delete]
  [_action context inputs :- [:sequential ::lib.schema.actions/row]]
  (perform! :table.row/delete context inputs))
