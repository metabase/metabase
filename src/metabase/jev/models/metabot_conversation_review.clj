(ns metabase.jev.models.metabot-conversation-review
  "The automatic quality judgment of a Metabot conversation: a headline label, issue slugs, and the raw
  judgments they were derived from. Written by [[metabase.jev.apps.conversations]]."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotConversationReview [_model] :metabot_conversation_review)

(methodical/defmethod t2/primary-keys :model/MetabotConversationReview [_model] [:conversation_id])

(doto :model/MetabotConversationReview
  (derive :metabase/model))

(t2/deftransforms :model/MetabotConversationReview
  {:issues  mi/transform-json
   :answers mi/transform-json})
