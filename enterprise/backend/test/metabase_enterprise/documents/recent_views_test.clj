(ns metabase-enterprise.documents.recent-views-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- most-recent-view
  [user-id model-id model-type]
  (t2/select-one [:model/RecentViews :user_id :model :model_id]
                 :user_id  user-id
                 :model_id model-id
                 :model    model-type
                 {:order-by [[:id :desc]]}))

(deftest card-query-test
  (mt/with-test-user :rasta
    (testing "document cards should not be counted"
      (mt/with-temp [:model/Document {doc-id :id} {}
                     :model/Card card-3 {:creator_id (mt/user->id :rasta)
                                         :document_id doc-id}]
        (events/publish-event! :event/card-query {:card-id (:id card-3)
                                                  :user-id (mt/user->id :rasta)
                                                  :context :question})
        (is (nil? (most-recent-view (mt/user->id :rasta) (:id card-3) "card")))))))

(deftest legacy-card-read-test
  (testing "in_document cards should not be counted even with context :question"
    (mt/with-temp [:model/Document {doc-id :id} {}
                   :model/Card card {:creator_id (mt/user->id :rasta)
                                     :document_id doc-id}]
      (mt/with-test-user :rasta
        (events/publish-event! :event/card-read {:object-id (:id card)
                                                 :user-id (mt/user->id :rasta)
                                                 :context :question})
        (is (nil? (most-recent-view (mt/user->id :rasta) (:id card) "card")))))))
