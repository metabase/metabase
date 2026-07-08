(ns metabase.metabot.task.metabot-conversation-trimmer-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.metabot.task.metabot-conversation-trimmer :as metabot-conversation-trimmer]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn- conversation-attrs
  [user-id created-at]
  {:id         (str (random-uuid))
   :user_id    user-id
   :created_at created-at})

(defn- message-attrs
  [conversation-id created-at]
  {:conversation_id conversation-id
   :role            "user"
   :profile_id      "trimmer-test"
   :total_tokens    0
   :data            []
   :external_id     (str (random-uuid))
   :created_at      created-at})

(deftest trims-conversations-older-than-default-retention-test
  (testing "with default retention (180 days), only conversations older than 180 days are deleted"
    (let [user-id (mt/user->id :crowberto)
          now     (t/offset-date-time)]
      (mt/with-temp
        [:model/MetabotConversation {recent-id :id} (conversation-attrs user-id now)
         :model/MetabotConversation {old-id :id}    (conversation-attrs user-id (t/minus now (t/days 200)))]
        (#'metabot-conversation-trimmer/trim-old-conversations!)
        (is (= #{recent-id}
               (t2/select-fn-set :id :model/MetabotConversation
                                 {:where [:in :id [recent-id old-id]]})))))))

(deftest trims-conversations-older-than-custom-retention-test
  (testing "with retention set to 30 days, conversations older than 30 days are deleted"
    (let [user-id (mt/user->id :crowberto)
          now     (t/offset-date-time)]
      (mt/with-temp
        [:model/MetabotConversation {recent-id :id}   (conversation-attrs user-id now)
         :model/MetabotConversation {boundary-id :id} (conversation-attrs user-id (t/minus now (t/days 31)))
         :model/MetabotConversation {old-id :id}      (conversation-attrs user-id (t/minus now (t/days 200)))]
        (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 30]
          (#'metabot-conversation-trimmer/trim-old-conversations!)
          (is (= #{recent-id}
                 (t2/select-fn-set :id :model/MetabotConversation
                                   {:where [:in :id [recent-id boundary-id old-id]]}))))))))

(deftest skips-deletion-when-retention-is-infinite-test
  (testing "when retention is set to 0 (infinite), nothing is deleted"
    (let [user-id (mt/user->id :crowberto)
          now     (t/offset-date-time)]
      (mt/with-temp
        [:model/MetabotConversation {recent-id :id} (conversation-attrs user-id now)
         :model/MetabotConversation {old-id :id}    (conversation-attrs user-id (t/minus now (t/years 5)))]
        (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 0]
          (#'metabot-conversation-trimmer/trim-old-conversations!)
          (is (= #{recent-id old-id}
                 (t2/select-fn-set :id :model/MetabotConversation
                                   {:where [:in :id [recent-id old-id]]}))))))))

(deftest cascades-to-messages-test
  (testing "deleting an old conversation cascades to its messages via ON DELETE CASCADE"
    (let [user-id (mt/user->id :crowberto)
          now     (t/offset-date-time)]
      (mt/with-temp
        [:model/MetabotConversation {old-id :id} (conversation-attrs user-id (t/minus now (t/days 200)))
         :model/MetabotMessage      {msg-id :id} (message-attrs old-id (t/minus now (t/days 200)))]
        (#'metabot-conversation-trimmer/trim-old-conversations!)
        (is (empty? (t2/select-fn-set :id :model/MetabotConversation :id old-id))
            "expired conversation deleted")
        (is (empty? (t2/select-fn-set :id :model/MetabotMessage :id msg-id))
            "messages of expired conversation cascaded away")))))

(deftest mixed-age-messages-in-old-conversation-test
  (testing "an expired conversation is deleted along with all its messages — even fresh ones — because the cascade follows the parent"
    (let [user-id (mt/user->id :crowberto)
          now     (t/offset-date-time)]
      (mt/with-temp
        [:model/MetabotConversation {old-id :id}      (conversation-attrs user-id (t/minus now (t/days 200)))
         :model/MetabotMessage      {old-msg :id}     (message-attrs old-id (t/minus now (t/days 200)))
         :model/MetabotMessage      {fresh-msg :id}   (message-attrs old-id now)]
        (#'metabot-conversation-trimmer/trim-old-conversations!)
        (is (empty? (t2/select-fn-set :id :model/MetabotConversation :id old-id)))
        (is (empty? (t2/select-fn-set :id :model/MetabotMessage
                                      {:where [:in :id [old-msg fresh-msg]]})))))))
