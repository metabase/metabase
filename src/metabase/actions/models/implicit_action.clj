(ns metabase.actions.models.implicit-action
  "The ImplicitAction model: the kind and table of an action of type implicit."
  (:require
   [metabase.actions.db :as actions.db]
   [metabase.actions.schema :as actions.schema]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ImplicitAction [_model] :implicit_action)

(doto :model/ImplicitAction
  (derive :metabase/model)
  (derive :hook/dependencies))

(methodical/defmethod t2/primary-keys :model/ImplicitAction [_model] [:action_id])

(t2/deftransforms :model/ImplicitAction
  {:kind mi/transform-keyword})

(defn- check-implicit-action-table
  "Throws a 400 unless `implicit-action` has a Table exactly when its Action has no model, as an action of a model writes
  to the table its model reads when it runs."
  [{table-id :table_id, action-id :action_id}]
  (if (actions.db/action-model-id action-id)
    (when (some? table-id)
      (throw (ex-info (tru "An action of a model writes to the model''s table, so it can''t be given one.")
                      {:status-code 400})))
    (when (nil? table-id)
      (throw (ex-info (tru "An implicit action needs a table.") {:status-code 400})))))

(t2/define-before-update :model/ImplicitAction
  [implicit-action]
  (u/prog1 implicit-action
    (when (contains? (t2/changes implicit-action) :table_id)
      (check-implicit-action-table implicit-action))))

(t2/define-before-insert :model/ImplicitAction
  [implicit-action]
  (u/prog1 implicit-action
    (check-implicit-action-table implicit-action)))

(defmethod serialization/spec :model/ImplicitAction [_]
  {:schema    ::actions.schema/external-implicit-action
   :identity  [:action_id]
   :primary-key :action_id
   :copy      [:kind]
   :parent    {:model :model/Action :key :action_id}
   :transform {:action_id serialization/import-only-transform
               :table_id serialization/table-transform}})

(defmethod remote-sync/spec :model/ImplicitAction
  [_model]
  {:synced-filter-clause actions.db/synced-action-details-clause})
