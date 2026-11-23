(ns metabase.metabot.models.metabot-feedback
  "Persist Metabot message feedback"
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.db :as metabot.db]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/MetabotFeedback [_model] :metabot_feedback)

(doto :model/MetabotFeedback
  (derive :metabase/model))

(methodical/defmethod t2/batched-hydrate [:model/MetabotFeedback :user]
  "Batch-hydrate `:user` (id/email/name only) — the feedback submitter."
  [_model k feedbacks]
  (mi/instances-with-hydrated-data
   feedbacks k
   #(metabot.db/user-summaries-by-id (keep :user_id feedbacks))
   :user_id {:default nil}))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn upsert-metabot-feedback!
  "Insert or update the MetabotFeedback of the User with `submitter-user-id` on the MetabotMessage with `message-id`
  with the `columns`, stamping `:updated_at`, and return its ID."
  [message-id        :- ms/PositiveInt
   submitter-user-id :- ::lib.schema.id/user
   columns           :- [:map {:closed true}
                         [:positive          {:optional true} [:maybe :boolean]]
                         [:issue_type        {:optional true} [:maybe [:or :keyword :string]]]
                         [:freeform_feedback {:optional true} [:maybe :string]]]]
  (metabot.db/upsert-feedback! message-id submitter-user-id (assoc columns :updated_at (java.time.OffsetDateTime/now))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotFeedback [_model]
  {:skip? false})
