(ns metabase.api.activity-test
  "Tests for /api/activity endpoints."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events :as events]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.models.table :refer [Table]]
   [metabase.models.view-log :refer [ViewLog]]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- clear-recent-views-for-user
  [test-user]
  (t2/delete! :model/RecentViews :user_id (mt/user->id test-user)))

(deftest most-recently-viewed-dashboard-views-test
  (clear-recent-views-for-user :crowberto)
  (clear-recent-views-for-user :rasta)
  (mt/with-temp [Card      card-1  {:name       "rand-name"
                                    :creator_id (mt/user->id :crowberto)
                                    :display    "table"}
                 Dashboard dash-1  {:name        "rand-name2"
                                    :description "rand-name2"
                                    :creator_id  (mt/user->id :crowberto)}
                 Dashboard dash-2  {:name        "rand-name2"
                                    :description "rand-name2"
                                    :creator_id  (mt/user->id :crowberto)}
                 Dashboard dash-3  {:name        "rand-name2"
                                    :description "rand-name2"
                                    :archived    true
                                    :creator_id  (mt/user->id :crowberto)}
                 Table     table-1 {:name "rand-name"}]
    (mt/with-test-user :crowberto
      (doseq [{:keys [topic event]} [{:topic :event/dashboard-read :event {:object dash-1}}
                                     {:topic :event/dashboard-read :event {:object dash-2}}
                                     {:topic :event/dashboard-read :event {:object dash-3}}
                                     {:topic :event/card-query :event {:card-id (:id card-1)}}
                                     {:topic :event/table-read :event {:object table-1}}]]
        (events/publish-event! topic (assoc event :user-id (mt/user->id :crowberto))))
      (testing "most_recently_viewed_dashboard endpoint shows the current user's most recently viewed dashboard."
        (is (= (assoc dash-3 :collection nil) #_dash-2 ;; TODO: this should be dash-2, because dash-3 is archived
               (mt/user-http-request :crowberto :get 200 "activity/most_recently_viewed_dashboard")))))
    (mt/with-test-user :rasta
      (testing "If nothing has been viewed, return a 204"
        (is (nil? (mt/user-http-request :rasta :get 204
                                        "activity/most_recently_viewed_dashboard"))))
      (events/publish-event! :event/dashboard-read {:object dash-1 :user-id (mt/user->id :rasta)})
      (testing "Only the user's own views are returned."
        (is (= (assoc dash-1 :collection nil)
               (mt/user-http-request :rasta :get 200
                                     "activity/most_recently_viewed_dashboard"))))
      (events/publish-event! :event/dashboard-read {:object dash-1 :user-id (mt/user->id :rasta)})
      (testing "If the user has no permissions for the dashboard, return a 204"
        (mt/with-non-admin-groups-no-root-collection-perms
          (is (nil? (mt/user-http-request :rasta :get 204
                                          "activity/most_recently_viewed_dashboard"))))))))

(deftest most-recently-viewed-dashboard-views-include-colllection-test
  (mt/with-temp [:model/Collection coll   {:name "Analytics"}
                 :model/Dashboard  dash-1 {:collection_id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :crowberto))}
                 :model/Dashboard  dash-2 {:collection_id (:id coll)}]
    (mt/with-model-cleanup [ViewLog]
      (mt/with-test-user :crowberto
        (testing "view a dashboard in a personal collection"
          (events/publish-event! :event/dashboard-read {:object dash-1 :user-id (mt/user->id :crowberto)})
          (let [crowberto-personal-coll (t2/select-one :model/Collection :personal_owner_id (mt/user->id :crowberto))]
            (is (= (assoc dash-1 :collection (assoc crowberto-personal-coll :is_personal true))
                   (mt/user-http-request :crowberto :get 200
                                         "activity/most_recently_viewed_dashboard")))))

        (testing "view a dashboard in a public collection"
          (events/publish-event! :event/dashboard-read {:object dash-2 :user-id (mt/user->id :crowberto)})
          (is (= (assoc dash-2 :collection (assoc coll :is_personal false))
                 (mt/user-http-request :crowberto :get 200
                                       "activity/most_recently_viewed_dashboard"))))))))

(deftest recent-views-test
  (clear-recent-views-for-user :crowberto)
  (clear-recent-views-for-user :rasta)
  (mt/with-temp [Card      card1     {:name                   "rand-name"
                                      :creator_id             (mt/user->id :crowberto)
                                      :display                "table"
                                      :visualization_settings {}}
                 Card      archived  {:name                   "archived-card"
                                      :creator_id             (mt/user->id :crowberto)
                                      :display                "table"
                                      :archived               true
                                      :visualization_settings {}}
                 Dashboard dash {:name        "rand-name2"
                                 :description "rand-name2"
                                 :creator_id  (mt/user->id :crowberto)}
                 Table     table1 {:name "rand-name"}
                 Table     hidden-table {:name            "hidden table"
                                         :visibility_type "hidden"}
                 Card      dataset {:name                   "rand-name"
                                    :type                   :model
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]
    (testing "recent_views endpoint shows the current user's recently viewed items."
      (mt/with-model-cleanup [ViewLog]
        (mt/with-test-user :crowberto
          (doseq [{:keys [topic event]} [{:topic :event/card-query :event {:card-id (:id dataset)}}
                                         {:topic :event/card-query :event {:card-id (:id dataset)}}
                                         {:topic :event/card-query :event {:card-id (:id card1)}}
                                         {:topic :event/card-query :event {:card-id (:id card1)}}
                                         {:topic :event/card-query :event {:card-id (:id card1)}}
                                         {:topic :event/dashboard-read :event {:object dash}}
                                         {:topic :event/card-query :event {:card-id (:id card1)}}
                                         {:topic :event/dashboard-read :event {:object dash}}
                                         {:topic :event/table-read :event {:object table1}}
                                         {:topic :event/card-query :event {:card-id (:id archived)}}
                                         {:topic :event/table-read :event {:object hidden-table}}]]
            (events/publish-event! topic (assoc event :user-id (mt/user->id :crowberto))))
          (testing "No duplicates or archived items are returned."
            (let [recent-views (mt/user-http-request :crowberto :get 200 "activity/recent_views")]
              (is (partial=
                   [{:model "table" :model_id (u/the-id table1)}
                    {:model "dashboard" :model_id (u/the-id dash)}
                    {:model "card" :model_id (u/the-id card1)}
                    {:model "dataset" :model_id (u/the-id dataset)}]
                   recent-views)))))
        (mt/with-test-user :rasta
          (events/publish-event! :event/card-query {:card-id (:id dataset) :user-id (mt/user->id :rasta)})
          (events/publish-event! :event/card-query {:card-id (:id card1) :user-id (mt/user->id :crowberto)})
          (testing "Only the user's own views are returned."
            (let [recent-views (mt/user-http-request :rasta :get 200 "activity/recent_views")]
              (is (partial=
                   [{:model "dataset" :model_id (u/the-id dataset)}]
                   (reverse recent-views))))))))))

(defn- create-views!
  "Insert views [user-id model model-id]. Views are entered a second apart with last view as most recent."
  [views]
  (let [start-time (t/offset-date-time)
        views (->> (map (fn [[user model model-id] seconds-ago]
                          (case model
                            "card" {:executor_id user :card_id model-id
                                    :context :question
                                    :hash (qp.util/query-hash {})
                                    :running_time 1
                                    :result_rows 1
                                    :native false
                                    :started_at (t/plus start-time (t/seconds (- seconds-ago)))}
                            {:user_id user, :model model, :model_id model-id
                             :timestamp (t/plus start-time (t/seconds (- seconds-ago)))}))
                        (reverse views)
                        (range))
                   (group-by #(if (:card_id %) :card :other)))]
    (t2/insert! ViewLog (:other views))
    (t2/insert! QueryExecution (:card views))))

(deftest popular-items-test
  ;; Clear out the view log & query execution log so that test doesn't read stale state
  (t2/delete! :model/ViewLog)
  (t2/delete! :model/QueryExecution)
  (mt/with-temp [Card      card1 {:name                   "rand-name"
                                  :creator_id             (mt/user->id :crowberto)
                                  :display                "table"
                                  :visualization_settings {}}
                 Card      archived  {:name                   "archived-card"
                                      :creator_id             (mt/user->id :crowberto)
                                      :display                "table"
                                      :archived               true
                                      :visualization_settings {}}
                 Dashboard dash1 {:name        "rand-name"
                                  :description "rand-name"
                                  :creator_id  (mt/user->id :crowberto)}
                 Dashboard dash2 {:name        "other-dashboard"
                                  :description "just another dashboard"
                                  :creator_id  (mt/user->id :crowberto)}
                 Table     table1 {:name "rand-name"}
                 Table     hidden-table {:name            "hidden table"
                                         :visibility_type "hidden"}
                 Card      dataset {:name                   "rand-name"
                                    :type                   :model
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]
    (let [test-ids (set (map :id [card1 archived dash1 dash2 table1 hidden-table dataset]))]
      (testing "Items viewed by multiple users are not duplicated in the popular items list."
        (mt/with-model-cleanup [ViewLog QueryExecution]
          (create-views! [[(mt/user->id :rasta)     "dashboard" (:id dash1)]
                          [(mt/user->id :crowberto) "dashboard" (:id dash1)]
                          [(mt/user->id :rasta)     "card"      (:id card1)]
                          [(mt/user->id :crowberto) "card"      (:id card1)]])
          (is (= [["dashboard" (:id dash1)]
                  ["card" (:id card1)]]
                 ;; all views are from :rasta, but :crowberto can still see popular items
                 (->> (mt/user-http-request :crowberto :get 200 "activity/popular_items")
                      (filter #(test-ids (:model_id %)))
                      (map (juxt :model :model_id)))))))
      (testing "Items viewed by other users can still show up in popular items."
        (mt/with-model-cleanup [ViewLog QueryExecution]
          (create-views! [[(mt/user->id :rasta) "dashboard" (:id dash1)]
                          [(mt/user->id :rasta) "card"      (:id card1)]
                          [(mt/user->id :rasta) "table"     (:id table1)]
                          [(mt/user->id :rasta) "card"      (:id dataset)]])
          (is (= [["dashboard" (:id dash1)]
                  ["card" (:id card1)]
                  ["dataset" (:id dataset)]
                  ["table" (:id table1)]]
                 ;; all views are from :rasta, but :crowberto can still see popular items
                 (->> (mt/user-http-request :crowberto :get 200 "activity/popular_items")
                      (filter #(test-ids (:model_id %)))
                      (map (juxt :model :model_id)))))))
      (testing "Items with more views show up sooner in popular items."
        (mt/with-model-cleanup [ViewLog QueryExecution]
          (create-views! (concat
                          ;; one item with many views is considered more popular
                          (repeat 10 [(mt/user->id :rasta) "dashboard" (:id dash1)])
                          [[(mt/user->id :rasta) "dashboard" (:id dash2)]
                           [(mt/user->id :rasta) "card"      (:id dataset)]
                           [(mt/user->id :rasta) "table"     (:id table1)]
                           [(mt/user->id :rasta) "card"      (:id card1)]]))
          (is (= [["dashboard" (:id dash1)]
                  ["dashboard" (:id dash2)]
                  ["card"      (:id card1)]
                  ["dataset"   (:id dataset)]
                  ["table"     (:id table1)]]
                 ;; all views are from :rasta, but :crowberto can still see popular items
                 (->> (mt/user-http-request :crowberto :get 200 "activity/popular_items")
                      (filter #(test-ids (:model_id %)))
                      (map (juxt :model :model_id))))))))))
