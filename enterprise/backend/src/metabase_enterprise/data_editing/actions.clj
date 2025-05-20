(ns metabase-enterprise.data-editing.actions
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [metabase-enterprise.data-editing.undo :as undo]
   [metabase.actions.core :as actions]
   [metabase.lib.schema.actions :as lib.schema.actions]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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
          :outputs
          xform-outputs))

(defn- post-process [outputs]
  (for [[table-id diffs] (u/group-by :table-id identity outputs)
        :let [pretty-rows (data-editing/invalidate-and-present! table-id (map :row diffs))]
        [op pretty-row] (map vector (map :op diffs) pretty-rows)]
    {:table-id table-id, :op op, :row pretty-row}))

(defn- perform! [action-kw context inputs]
  ;; We could enhance this in future to work more richly with multi-table editable models.
  (let [table-id     (scope->table-id context)
        next-inputs  (map-inputs table-id inputs)]
    (perform-table-row-action! action-kw context next-inputs post-process)))

(mu/defmethod actions/perform-action!* [:sql-jdbc :data-grid/create]
  [_action context inputs :- [:sequential ::lib.schema.actions/row]]
  (perform! :table.row/create context inputs))

(mu/defmethod actions/perform-action!* [:sql-jdbc :data-grid/update]
  [_action context inputs :- [:sequential ::lib.schema.actions/row]]
  (perform! :table.row/update context inputs))

(mu/defmethod actions/perform-action!* [:sql-jdbc :data-grid/delete]
  [_action context inputs :- [:sequential ::lib.schema.actions/row]]
  (perform! :table.row/delete context inputs))

;; undo

(s/def :actions.args/none map?)

(defmethod actions/action-arg-map-spec :data-editing/undo [_action] :actions.args/none)
(defmethod actions/action-arg-map-spec :data-editing/redo [_action] :actions.args/none)

(defmethod actions/normalize-action-arg-map :data-editing/undo [_action _input] {})
(defmethod actions/normalize-action-arg-map :data-editing/redo [_action _input] {})

(mr/def ::lib.schema.actions/nothing [:map {:closed true}])

(mu/defmethod actions/perform-action!* [:sql-jdbc :data-editing/undo]
  [_action context _inputs :- [:sequential ::lib.schema.actions/nothing]]
  {:context context
   :outputs (undo/undo! context (:user-id context) (:scope context))})

(mu/defmethod actions/perform-action!* [:sql-jdbc :data-editing/redo]
  [_action context _inputs :- [:sequential ::lib.schema.actions/nothing]]
  {:context context
   :outputs (undo/redo! context (:user-id context) (:scope context))})
