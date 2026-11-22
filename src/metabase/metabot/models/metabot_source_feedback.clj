(ns metabase.metabot.models.metabot-source-feedback
  "Persist Metabot source feedback"
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

(methodical/defmethod t2/table-name :model/MetabotSourceFeedback [_model] :metabot_source_feedback)

(doto :model/MetabotSourceFeedback
  (derive :metabase/model))

(methodical/defmethod t2/batched-hydrate [:model/MetabotSourceFeedback :user]
  "Batch-hydrate `:user` (id/email/name only) — the feedback submitter."
  [_model k feedbacks]
  (mi/instances-with-hydrated-data
   feedbacks k
   #(metabot.db/user-summaries-by-id (keep :user_id feedbacks))
   :user_id {:default nil}))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn upsert-metabot-source-feedback!
  "Insert or update the MetabotSourceFeedback of the User with `submitter-user-id` on the source with `source-id` and
  `source-type` of the MetabotMessage with `message-id`, setting its `positive` and stamping `:updated_at`, and return its ID."
  [message-id        :- ms/PositiveInt
   submitter-user-id :- ::lib.schema.id/user
   source-id         :- ms/PositiveInt
   source-type       :- [:enum "table" "card" "model" "dashboard"]
   positive          :- [:maybe :boolean]]
  (metabot.db/upsert-source-feedback! message-id submitter-user-id source-id source-type
                                      {:positive positive :updated_at (java.time.OffsetDateTime/now)}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotSourceFeedback [_model]
  {:skip? false})
