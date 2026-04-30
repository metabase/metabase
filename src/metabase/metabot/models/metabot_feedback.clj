(ns metabase.metabot.models.metabot-feedback
  "Persist Metabot message feedback"
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotFeedback [_] :metabot_feedback)

(methodical/defmethod t2/primary-keys :model/MetabotFeedback [_] [:message_id])

(doto :model/MetabotFeedback
  (derive :metabase/model))
