(ns metabase.metabot.models.metabot-feedback
  "Persist Metabot message feedback"
  (:require
   [metabase.models.interface :as mi]
   [metabase.users.db :as users.db]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotFeedback [_model] :metabot_feedback)

(doto :model/MetabotFeedback
  (derive :metabase/model))

(methodical/defmethod t2/batched-hydrate [:model/MetabotFeedback :user]
  "Batch-hydrate `:user` (id/email/name only) — the feedback submitter."
  [_model k feedbacks]
  (mi/instances-with-hydrated-data
   feedbacks k
   #(users.db/user-summaries-by-id {:user-ids (keep :user_id feedbacks)})
   :user_id {:default nil}))
