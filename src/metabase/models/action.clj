(ns metabase.models.action
  (:require
   [toucan.db :as db]
   [toucan.models :as models]
   [metabase.util :as u]))

(models/defmodel QueryAction :query_action)
(models/defmodel Action :action)

(u/strict-extend (class Action)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:action])
          :types          (constantly {:type :keyword})
          :properties     (constantly {:timestamped? true})}))

