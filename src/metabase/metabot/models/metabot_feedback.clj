(ns metabase.metabot.models.metabot-feedback
  "Persist Metabot message feedback"
  (:require
   [metabase.metabot.db :as metabot.db]
   [metabase.models.interface :as mi]
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/MetabotFeedback [_model] :metabot_feedback)

(doto :model/MetabotFeedback
  (derive :metabase/model))

(t2/define-batched-hydrate [:model/MetabotFeedback :user]
  "Batch-hydrate `:user` (id/email/name only) — the feedback submitter."
  [_model k feedbacks]
  (mi/instances-with-hydrated-data
   feedbacks k
   #(metabot.db/user-summaries-by-id (keep :user_id feedbacks))
   :user_id {:default nil}))
