(ns metabase.metabot.models.metabot-custom-prompt
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotCustomPrompt [_model] :metabot_custom_prompt)

(doto :model/MetabotCustomPrompt
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser))
