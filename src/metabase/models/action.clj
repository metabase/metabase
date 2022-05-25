(ns metabase.models.action
  (:require [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel QueryAction :query_action)
(models/defmodel Action :action)

(u/strict-extend (class Action)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:action])
          :types          (constantly {:type :keyword})
          :properties     (constantly {:timestamped? true})}))
