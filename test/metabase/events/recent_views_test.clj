(ns metabase.events.recent-views-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models :refer [Card Collection Dashboard Table]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- most-recent-view
  [user-id]
  (t2/select-one [:model/RecentViews :user_id :model :model_id]
                 :user_id user-id
                 {:order-by [[:id :desc]]}))

(deftest card-query-test
  (mt/with-model-cleanup [:model/AuditLog :model/ViewLog]
    (mt/with-temp [Card card {:creator_id (mt/user->id :rasta)}]
      (mt/with-test-user :rasta
        (events/publish-event! :event/card-read {:card_id (u/id card) :context "card" :has_access true})
        (is (= {:user_id  (mt/user->id :rasta)
                :model    "card"
                :model_id (:id card)}
               (most-recent-view (mt/user->id :rasta))))))))

(deftest table-read-test
  (mt/with-model-cleanup [:model/AuditLog :model/ViewLog]
    (mt/with-temp [Table table {}]
      (mt/with-test-user :rasta
        (events/publish-event! :event/table-read table)
        (is (partial=
             {:user_id  (mt/user->id :rasta)
              :model    "table"
              :model_id (:id table)}
             (most-recent-view (mt/user->id :rasta))))))))

(deftest dashboard-read-test
  (mt/with-model-cleanup [:model/AuditLog :model/ViewLog]
    (mt/with-temp [Dashboard dashboard {:creator_id (mt/user->id :rasta)}]
      (mt/with-test-user :rasta
        (events/publish-event! :event/dashboard-read dashboard)
        (is (partial
             {:user_id  (mt/user->id :rasta)
              :model    "dashboard"
              :model_id (:id dashboard)}
             (most-recent-view (mt/user->id :rasta))))))))

(deftest pinning-card-logs-only-one-view
  (mt/with-model-cleanup [:model/AuditLog :model/ViewLog]
    (mt/with-temp [Collection {collection-id :id} {:name "Suitcase"}
                   Card       {card-id :id} {:name               "money"
                                             :collection_preview false
                                             :collection_id      collection-id
                                             ;; need a query here for the post to /card/:id/query to actually trigger a :card-query event
                                             ;; this is because without a query, the QP fails, and
                                             ;; `metabase.query-processor.middleware.process-userland-query/add-and-save-execution-info-xform!`
                                             ;; doesn't get run, which is where the publish-event! actually occurs.
                                             :dataset_query      {:type   :native
                                                                  :native {:query "SELECT 1000000", :template-tags {}}
                                                                  :database 1}}]
      (mt/with-test-user :rasta
        ;; A user pins a card and the first thing that happens is the card is updated to store collection_position.
        (mt/user-http-request :rasta :put 200 (format "card/%s" card-id) {:collection_position 1})
        ;; A pinned card has visualization on by default, so a query for the card's contents is needed.
        (mt/user-http-request :rasta :post 202 (format "card/%s/query" card-id)
                              {:collection_preview true
                               :ignore_cache       false
                               :parameters         []})
        (testing "the audit_log records :card-update and :card-query events when a user pins a card."
          ;; the AuditLog records the :card-update and the :card-query events
          (is (= [:card-update :card-query]
                 (remove #{:setting-update :user-joined} (mapv :topic (t2/select :model/AuditLog))))))
        (testing "the view_log does not record a view when a user pins a card."
          ;; the ViewLog doesn't record the :card-query, which we take to be equivalent to a card-read in this context.
          (is (= 0 (t2/count :model/ViewLog))))
        (testing ":card-read occurs with a GET request to api/card/:id and is recorded as a view in the view_log"
          (mt/user-http-request :rasta :get 200 (format "card/%s" card-id))
          (is (= 1 (t2/count :model/ViewLog))))))))
