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
   #(metabot.db/user-summaries-by-id (keep :user_id feedbacks))
   :user_id {:default nil}))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn upsert-metabot-source-feedback!
  "Insert or update the MetabotSourceFeedback of the User with `submitter-user-id` on the source with `source-id` and
  `source-type` of the MetabotMessage with `message-id`; `update-fn` receives the existing row, or nil, and returns
  the columns to write."
  [message-id        :- ms/PositiveInt
   submitter-user-id :- ::lib.schema.id/user
   source-id         :- ms/PositiveInt
   source-type       :- [:enum "table" "card" "model" "dashboard"]
   update-fn         :- fn?]
  (metabot.db/upsert-source-feedback! message-id submitter-user-id source-id source-type update-fn))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotSourceFeedback [_model]
  {:skip? false})
