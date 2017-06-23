(ns metabase.models.raw-column
  (:require [metabase.util :as u]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel RawColumn :raw_column)

(defn- pre-insert [table]
  (let [defaults {:active  true
                  :is_pk   false
                  :details {}}]
    (merge defaults table)))

(defn- pre-delete [{:keys [id]}]
  (db/delete! RawColumn :fk_target_column_id id))

(u/strict-extend (class RawColumn)
  models/IModel (merge models/IModelDefaults
                   {:hydration-keys (constantly [:columns])
                    :types          (constantly {:base_type :keyword, :details :json})
                    :properties     (constantly {:timestamped? true})
                    :pre-insert     pre-insert
                    :pre-delete     pre-delete}))
