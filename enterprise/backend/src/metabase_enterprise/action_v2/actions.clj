(ns metabase-enterprise.action-v2.actions
  (:require
   [metabase-enterprise.action-v2.data-editing :as data-editing]
   [metabase-enterprise.action-v2.models.undo :as undo]
   [metabase-enterprise.action-v2.validation :as validation]
   [metabase.actions.args :as actions.args]
   [metabase.actions.core :as actions]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical])
  (:import
   (clojure.lang ExceptionInfo)))

(derive :data-grid.row/create :data-grid.row/common)
(derive :data-grid.row/update :data-grid.row/common)
(derive :data-grid.row/delete :data-grid.row/common)

(defn- unsupported-dbs-msg [target-dbs unsupported-dbs]
  (cond
    (= 1 (count target-dbs))
    "Data editing isn't supported on the target database."

    (= (count target-dbs) (count unsupported-dbs))
    "Data editing isn't supported on the target databases."

    (= 1 (count unsupported-dbs))
    "Data editing isn't supported on one of the target databases."

    :else
    "Data editing isn't supported on some of the target databases."))

(defmethod actions/validate-inputs! :data-grid.row/common
  [_action inputs]
  (let [target-dbs       (distinct (map :database inputs))
        unsupported-dbs (->> target-dbs
                             (map actions/cached-database)
                             (remove #(driver.u/supports? (:engine %) :actions/data-editing %)))]
    (when (seq unsupported-dbs)
      (throw (ex-info (unsupported-dbs-msg target-dbs unsupported-dbs)
                      {:status-code 400 :unsupported-db-ids (map :id unsupported-dbs)})))))

(defmethod actions/action-arg-map-schema :data-grid.row/common
  [_action]
  ::actions.args/table.common)

(defmethod actions/normalize-action-arg-map :data-grid.row/common
  [_action input]
  (-> (assoc input :database (:id (actions/cached-database-via-table-id (:table-id input))))
      (update :row #(update-keys % u/qualified-name))))

(defmethod actions/action-arg-map-schema :data-editing/undo [_action] :map)
(defmethod actions/action-arg-map-schema :data-editing/redo [_action] :map)

(defmethod actions/normalize-action-arg-map :data-editing/undo [_action _input] {})
(defmethod actions/normalize-action-arg-map :data-editing/redo [_action _input] {})

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

(defn- validate-inputs!
  [inputs]
  (let [table-id->inputs (group-by :table-id inputs)
        errors (not-empty
                (u/for-map [[table-id inputs] table-id->inputs
                            :let [errors (seq (validation/validate-inputs table-id (map :row inputs)))]
                            :when errors]
                  [table-id errors]))]
    (when errors
      (throw (ex-info "Failed validation" {:errors      errors
                                           :status-code 400
                                           :error-code  ::invalid-input})))))

(defn- coerce-inputs [inputs]
  (let [table-id->inputs (group-by :table-id inputs)
        input->coerced   (u/for-map [[table-id inputs] table-id->inputs
                                     :let [coerced (data-editing/apply-coercions table-id (map :row inputs))]
                                     input+row (map vector inputs coerced)]
                           input+row)]
    (for [input inputs]
      (u/prog1 (assoc input :row (input->coerced input))
        (log/tracef "coerce row %s => %s" (:row input) (:row <>))))))

(defn- perform-data-grid-action! [action-kw context inputs]
  (let [next-inputs (coerce-inputs inputs)]
    (validate-inputs! next-inputs)
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

(defn- translate-undo-error [e]
  (case (:error (ex-data e))
    :undo/none (ex-info (tru "Nothing to do") {:status-code 204} e)
    :undo/cannot-undelete (ex-info (tru "You cannot undo your previous change.") {:status-code 405} e)
    :undo/cannot-undo (ex-info (tru "Your previous change cannot be undone") {:status-code 405} e)
    :undo/conflict (ex-info (tru "Your previous change has a conflict with another edit") {:status-code 409} e)
    e))

(methodical/defmethod actions/perform-action!* [:sql-jdbc :data-editing/undo]
  [_action context _inputs]
  (try
    {:context context
     :outputs (undo/undo! context (:user-id context) (:scope context))}
    (catch ExceptionInfo e
      (throw (translate-undo-error e)))))

(methodical/defmethod actions/perform-action!* [:sql-jdbc :data-editing/redo]
  [_action context _inputs]
  (try
    {:context context
     :outputs (undo/redo! context (:user-id context) (:scope context))}
    (catch ExceptionInfo e
      (throw (translate-undo-error e)))))
