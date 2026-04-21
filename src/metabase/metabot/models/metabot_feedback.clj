(ns metabase.metabot.models.metabot-feedback
  "User-submitted feedback (thumbs up/down plus optional issue category and
   freeform comment) for a single `MetabotMessage`. 1:1 extension: the PK is
   also the FK to [[metabase.metabot.models.metabot-message]]."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotFeedback [_model] :metabot_feedback)

(methodical/defmethod t2/primary-keys :model/MetabotFeedback [_model] [:message_id])

(doto :model/MetabotFeedback
  (derive :metabase/model))
