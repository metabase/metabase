(ns metabase.model-persistence.events.persisted-model-refresh-error
  "This event gets triggered when there is an error in the [[metabase.model-persistence.task.persist-refresh]] task."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(derive ::event :metabase/event)
(derive :event/persisted-model-refresh-error ::event)

(mr/def :event/persisted-model-refresh-error
  [:map
   {:closed? true}
   [:database-id     pos-int?]
   [:persisted-infos [:sequential
                      {:min 1}
                      [:map
                       {:description "PersistedInfo"}
                       [:error    {:optional true} any?]
                       [:id       pos-int?]
                       [:database [:map
                                   {:description "Database"}
                                   [:id pos-int?]]]
                       [:card     [:map
                                   {:description "Card"}
                                   [:collection {:optional true} [:maybe
                                                                  [:map
                                                                   {:description "Collection"}]]]]]]]]
   [:trigger         [:maybe (ms/InstanceOfClass org.quartz.Trigger)]]])
