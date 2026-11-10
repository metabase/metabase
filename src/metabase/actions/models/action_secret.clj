(ns metabase.actions.models.action-secret
  "The ActionSecret model: a named secret that HTTP actions send only to its allowed hosts."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.default-fields :as t2.default-fields]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ActionSecret [_model] :action_secret)

(doto :model/ActionSecret
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/ActionSecret
  {:value         (mi/transform-encrypted-text "action_secret.value")
   :allowed_hosts mi/transform-json})

(t2.default-fields/define-default-fields :model/ActionSecret
  [:id :name :allowed_hosts :creator_id :created_at :updated_at])
