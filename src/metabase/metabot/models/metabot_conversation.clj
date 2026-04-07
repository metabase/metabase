(ns metabase.metabot.models.metabot-conversation
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotConversation [_model] :metabot_conversation)

(doto :model/MetabotConversation
  (derive :metabase/model))

(t2/deftransforms :model/MetabotConversation
  {:state mi/transform-json})

(methodical/defmethod t2/batched-hydrate [:model/MetabotConversation :user]
  "Batch-hydrate `:user` (id/email/name only) onto a seq of MetabotConversation instances by `:user_id`."
  [_model k conversations]
  (mi/instances-with-hydrated-data
   conversations k
   #(t2/select-pk->fn (fn [u] (select-keys u [:id :email :first_name :last_name]))
                      [:model/User :id :email :first_name :last_name]
                      :id (keep :user_id conversations))
   :user_id {:default nil}))
