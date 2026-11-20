(ns metabase.metabot.models.metabot-feedback-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private stale-timestamp
  (t/offset-date-time 2020 1 1 0 0 0 0 (t/zone-offset 0)))

(defn- refreshed?
  "Whether `timestamp` is later than [[stale-timestamp]]."
  [timestamp]
  (t/after? (t/offset-date-time timestamp) stale-timestamp))

(deftest feedback-update-refreshes-updated-at-test
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {}
                 :model/MetabotMessage      {message-id :id}      {:conversation_id conversation-id}]
    (let [id (t2/insert-returning-pk! :model/MetabotFeedback {:message_id message-id
                                                              :user_id    (mt/user->id :rasta)
                                                              :positive   true
                                                              :created_at stale-timestamp
                                                              :updated_at stale-timestamp})]
      (t2/update! :model/MetabotFeedback :id id {:positive false})
      (is (=? {:positive false :updated_at refreshed?}
              (t2/select-one :model/MetabotFeedback :id id))))))

(deftest source-feedback-update-refreshes-updated-at-test
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {}
                 :model/MetabotMessage      {message-id :id}      {:conversation_id conversation-id}]
    (let [id (t2/insert-returning-pk! :model/MetabotSourceFeedback {:message_id  message-id
                                                                    :user_id     (mt/user->id :rasta)
                                                                    :source_id   1
                                                                    :source_type "table"
                                                                    :positive    true
                                                                    :created_at  stale-timestamp
                                                                    :updated_at  stale-timestamp})]
      (t2/update! :model/MetabotSourceFeedback :id id {:positive false})
      (is (=? {:positive false :updated_at refreshed?}
              (t2/select-one :model/MetabotSourceFeedback :id id))))))
