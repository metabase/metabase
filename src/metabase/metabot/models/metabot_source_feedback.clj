(ns metabase.metabot.models.metabot-source-feedback
  "Persist Metabot source feedback"
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotSourceFeedback [_model] :metabot_source_feedback)

(doto :model/MetabotSourceFeedback
  (derive :metabase/model))

(def ^:private valid-source-types
  #{"table" "card" "model"})

(defn- validate-source-type
  [{:keys [source_type]}]
  (mi/assert-enum valid-source-types source_type))

(t2/define-before-insert :model/MetabotSourceFeedback
  [feedback]
  (validate-source-type feedback)
  feedback)

(t2/define-before-update :model/MetabotSourceFeedback
  [feedback]
  (when (contains? (t2/changes feedback) :source_type)
    (validate-source-type feedback))
  feedback)

(methodical/defmethod t2/batched-hydrate [:model/MetabotSourceFeedback :user]
  "Batch-hydrate `:user` (id/email/name only) — the feedback submitter."
  [_model k feedbacks]
  (mi/instances-with-hydrated-data
   feedbacks k
   #(t2/select-pk->fn (fn [u] (select-keys u [:id :email :first_name :last_name]))
                      [:model/User :id :email :first_name :last_name]
                      :id (keep :user_id feedbacks))
   :user_id {:default nil}))
