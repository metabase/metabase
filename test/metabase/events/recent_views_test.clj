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
  (mt/with-temp [Card card {:creator_id (mt/user->id :rasta)}]
    (mt/with-test-user :rasta
      (events/publish-event! :event/card-read {:card_id (u/id card) :context "card" :has_access true})
      (is (= {:user_id  (mt/user->id :rasta)
              :model    "card"
              :model_id (:id card)}
             (most-recent-view (mt/user->id :rasta)))))))

(deftest table-read-test
  (mt/with-temp [Table table {}]
    (mt/with-test-user :rasta
     (events/publish-event! :event/table-read table)
     (is (partial=
          {:user_id  (mt/user->id :rasta)
           :model    "table"
           :model_id (:id table)}
          (most-recent-view (mt/user->id :rasta)))))))

(deftest dashboard-read-test
  (mt/with-temp [Dashboard dashboard {:creator_id (mt/user->id :rasta)}]
    (mt/with-test-user :rasta
     (events/publish-event! :event/dashboard-read dashboard)
     (is (partial
           {:user_id  (mt/user->id :rasta)
            :model    "dashboard"
            :model_id (:id dashboard)}
           (most-recent-view (mt/user->id :rasta)))))))

(deftest pinning-card-logs-only-one-view
  (mt/with-temp [Collection {collection-id :id} {:name "Suitcase"}
                 Card       {card-id :id} {:name               "money"
                                           :collection_preview false
                                           :collection_id      collection-id}]
    (mt/with-test-user :rasta
      (mt/user-http-request :rasta :put 200 (format "card/%s" card-id) {:collection_position 1})
      (mt/user-http-request :rasta :get 200 (format "card/%s" card-id))
      (mt/user-http-request :rasta :post 202 (format "card/%s/query" card-id)
                            {:collection_preview true
                             :ignore_cache false
                             :parameters []})
      (mt/user-http-request :rasta :post 202 (format "card/%s/query" card-id)
                            {:collection_preview true
                             :ignore_cache false
                             :parameters []})
      (is (= 1 (t2/count :model/ViewLog))))))
