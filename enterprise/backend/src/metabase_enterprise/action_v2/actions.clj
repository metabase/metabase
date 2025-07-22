(ns metabase-enterprise.action-v2.actions
  (:require
   [metabase-enterprise.action-v2.data-editing :as data-editing]
   [metabase.actions.args :as actions.args]
   [metabase.actions.core :as actions]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]))

(derive :data-grid.row/create :data-grid.row/common)
(derive :data-grid.row/update :data-grid.row/common)
(derive :data-grid.row/delete :data-grid.row/common)

(defmethod actions/action-arg-map-schema :data-grid.row/common
  [_action]
  ::actions.args/table.common)

(defmethod actions/normalize-action-arg-map :data-grid.row/common
  [_action input]
  (-> (assoc input :database (:id (actions/cached-database-via-table-id (:table-id input))))
      (update :row #(update-keys % u/qualified-name))))

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
    {:op op, :table-id table-id, :row pretty-row}))

(defn- coerce-inputs [inputs]
  (let [input->coerced (u/for-map [[table-id inputs] (group-by :table-id inputs)
                                   :let [coerced (data-editing/apply-coercions table-id (map :row inputs))]
                                   input+row (map vector inputs coerced)]
                         input+row)]
    (for [input inputs]

      (u/prog1 (assoc input :row (input->coerced input))
        (log/tracef "coerce row %s => %s" (:row input) (:row <>))))))

(defn- perform-data-grid-action! [action-kw context inputs]
  (let [next-inputs (coerce-inputs inputs)]
    (perform-table-row-action! action-kw context next-inputs
                               (if (= :table.row/delete action-kw)
                                 identity
                                 post-process))))

(methodical/defmethod actions/perform-action!* [:sql-jdbc :data-grid.row/create]
  [_action context inputs]
  (perform-data-grid-action! :table.row/create context inputs))

(methodical/defmethod actions/perform-action!* [:sql-jdbc :data-grid.row/update]
  [_action context inputs]
  (perform-data-grid-action! :table.row/update context inputs))

(methodical/defmethod actions/perform-action!* [:sql-jdbc :data-grid.row/delete]
  [_action context inputs]
  (perform-data-grid-action! :table.row/delete context inputs))

(mu/defmethod actions/default-mapping :data-grid.row/common
  [_ scope]
  (assoc (select-keys scope [:table-id]) :row :metabase-enterprise.action-v2.api/root))

(mu/defmethod actions/default-mapping :data-grid.row/delete
  [_ scope]
  (assoc (select-keys scope [:table-id])
         ;; TODO yeah, a shorter namespace would be nice, that doesn't require importing from EE
         :row :metabase-enterprise.action-v2.api/input
         :delete-children [:metabase-enterprise.action-v2.api/param :delete-children]))
