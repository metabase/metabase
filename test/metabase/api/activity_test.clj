(ns metabase.api.activity-test
  "Tests for /api/activity endpoints."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events :as events]
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
  (mt/test-helpers-set-global-values!
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (mt/with-temp [:model/Card      card-1  {:name       "rand-name"
                                               :creator_id (mt/user->id :crowberto)
                                               :display    "table"}
                     :model/Dashboard dash-1  {:name        "rand-name2"
                                               :description "rand-name2"
                                               :creator_id  (mt/user->id :crowberto)}
                     :model/Dashboard dash-2  {:name        "rand-name2"
                                               :description "rand-name2"
                                               :creator_id  (mt/user->id :crowberto)}
                     :model/Dashboard dash-3  {:name        "rand-name2"
                                               :description "rand-name2"
                                               :archived    true
                                               :creator_id  (mt/user->id :crowberto)}
                     :model/Table     table-1 {:name "rand-name"}]
        (mt/with-test-user :crowberto
          (doseq [{:keys [topic event]} [{:topic :event/dashboard-read :event {:object-id (:id dash-1)}}
                                         {:topic :event/dashboard-read :event {:object-id (:id dash-2)}}
                                         {:topic :event/dashboard-read :event {:object-id (:id dash-3)}}
                                         {:topic :event/card-query :event {:card-id (:id card-1)}}
                                         {:topic :event/table-read :event {:object table-1}}]]
            (events/publish-event! topic (assoc event :user-id (mt/user->id :crowberto))))
          (testing "most_recently_viewed_dashboard endpoint shows the current user's most recently viewed non-archived dashboard."
            (is (= (assoc dash-2 :collection nil :view_count 1)
                   (mt/user-http-request :crowberto :get 200 "activity/most_recently_viewed_dashboard")))))
        (mt/with-test-user :rasta
          (testing "If nothing has been viewed, return a 204"
            (is (nil? (mt/user-http-request :rasta :get 204
                                            "activity/most_recently_viewed_dashboard"))))
          (events/publish-event! :event/dashboard-read {:object-id (:id dash-1) :user-id (mt/user->id :rasta)})
          (testing "Only the user's own views are returned."
            (is (= (assoc dash-1 :collection nil :view_count 2)
                   (mt/user-http-request :rasta :get 200
                                         "activity/most_recently_viewed_dashboard"))))
          (events/publish-event! :event/dashboard-read {:object-id (:id dash-1) :user-id (mt/user->id :rasta)})
          (testing "If the user has no permissions for the dashboard, return a 204"
            (mt/with-non-admin-groups-no-root-collection-perms
              (is (nil? (mt/user-http-request :rasta :get 204
                                              "activity/most_recently_viewed_dashboard"))))))))))

(deftest most-recently-viewed-dashboard-views-include-collection-test
  (mt/test-helpers-set-global-values!
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (mt/with-temp [:model/Collection coll   {:name "Analytics"}
                     :model/Dashboard  dash-1 {:collection_id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :crowberto))}
                     :model/Dashboard  dash-2 {:collection_id (:id coll)}]
        (mt/with-model-cleanup [:model/RecentViews]
          (mt/with-test-user :crowberto
            (testing "view a dashboard in a personal collection"
              (events/publish-event! :event/dashboard-read {:object-id (:id dash-1) :user-id (mt/user->id :crowberto)})
              (let [crowberto-personal-coll (t2/select-one :model/Collection :personal_owner_id (mt/user->id :crowberto))]
                (is (= (assoc dash-1 :collection (assoc crowberto-personal-coll :is_personal true) :view_count 1)
                       (mt/user-http-request :crowberto :get 200
                                             "activity/most_recently_viewed_dashboard")))))

            (testing "view a dashboard in a public collection"
              (events/publish-event! :event/dashboard-read {:object-id (:id dash-2) :user-id (mt/user->id :crowberto)})
              (is (= (assoc dash-2 :collection (assoc coll :is_personal false) :view_count 1)
                     (mt/user-http-request :crowberto :get 200
                                           "activity/most_recently_viewed_dashboard"))))))))))

(deftest recent-views-test
  (clear-recent-views-for-user :crowberto)
  (clear-recent-views-for-user :rasta)
  (mt/with-temp [:model/Card      card1     {:name                   "rand-name"
                                             :creator_id             (mt/user->id :crowberto)
                                             :display                "table"
                                             :visualization_settings {}}
                 :model/Card      archived  {:name                   "archived-card"
                                             :creator_id             (mt/user->id :crowberto)
                                             :display                "table"
                                             :archived               true
                                             :visualization_settings {}}
                 :model/Dashboard dash {:name        "rand-name2"
                                        :description "rand-name2"
                                        :creator_id  (mt/user->id :crowberto)}
                 :model/Table     table1 {:name "rand-name"}
                 :model/Table     hidden-table {:name            "hidden table"
                                                :visibility_type "hidden"}
                 :model/Card      dataset {:name                   "rand-name"
                                           :type                   :model
                                           :creator_id             (mt/user->id :crowberto)
                                           :display                "table"
                                           :visualization_settings {}}
                 :model/Card      metric  {:name                   "rand-metric-name"
                                           :type                   :metric
                                           :creator_id             (mt/user->id :crowberto)
                                           :display                "table"
                                           :visualization_settings {}}]
    (testing "recent_views endpoint shows the current user's recently viewed items."
      (mt/with-model-cleanup [:model/RecentViews]
        (mt/with-test-user :crowberto
          (doseq [[topic event] [[:event/card-query     {:card-id (:id dataset)}]
                                 [:event/card-query     {:card-id (:id dataset)}]
                                 [:event/card-query     {:card-id (:id card1)}]
                                 [:event/card-query     {:card-id (:id card1)}]
                                 [:event/card-query     {:card-id (:id card1)}]
                                 [:event/dashboard-read {:object-id (:id dash)}]
                                 [:event/card-query     {:card-id (:id card1)}]
                                 [:event/dashboard-read {:object-id (:id dash)}]
                                 [:event/table-read     {:object table1}]
                                 [:event/card-query     {:card-id (:id archived)}]
                                 [:event/table-read     {:object hidden-table}]
                                 [:event/card-query     {:card-id (:id metric)}]]]
            (events/publish-event! topic (assoc event :user-id (mt/user->id :crowberto))))
          (testing "No duplicates or archived items are returned."
            (let [expected [{:model "metric" :id (u/the-id metric) :name "rand-metric-name"}
                            {:model "table" :id (u/the-id table1) :name "rand-name"}
                            {:model "dashboard" :id (u/the-id dash) :name "rand-name2"}
                            {:model "card" :id (u/the-id card1) :name "rand-name"}
                            {:model "dataset" :id (u/the-id dataset) :name "rand-name"}]
                  recent-views (:recent_views (mt/user-http-request :crowberto :get 200 "activity/recent_views"))
                  recent-views-2 (:recents (mt/user-http-request :crowberto :get 200 "activity/recents?context=views"))]
              (is (= expected (map #(select-keys % [:model :id :name]) recent-views)))
              (is (= expected (map #(select-keys % [:model :id :name]) recent-views-2))))))
        (mt/with-test-user :rasta
          (events/publish-event! :event/card-query {:card-id (:id dataset) :user-id (mt/user->id :rasta)})
          (events/publish-event! :event/card-query {:card-id (:id card1) :user-id (mt/user->id :crowberto)})
          (testing "Only the user's own views are returned."
            (let [recent-views (:recent_views (mt/user-http-request :rasta :get 200 "activity/recent_views"))]
              (is (partial=
                   [{:model "dataset" :id (u/the-id dataset)}]
                   (reverse recent-views))))))))))

(deftest recent-card-read-views-test
  (clear-recent-views-for-user :crowberto)
  (mt/with-test-user :crowberto
    (mt/with-model-cleanup [:model/ViewLog :model/RecentViews]
      (mt/with-temp [:model/Database  {db-id :id} {}
                     :model/Card      card1     {:name                   "rand-name"
                                                 :creator_id             (mt/user->id :crowberto)
                                                 :display                "table"
                                                 :visualization_settings {}
                                                 :database_id            db-id}
                     :model/Card      archived  {:name                   "archived-card"
                                                 :creator_id             (mt/user->id :crowberto)
                                                 :display                "table"
                                                 :archived               true
                                                 :visualization_settings {}
                                                 :database_id            db-id}
                     :model/Dashboard dash {:name        "rand-name2"
                                            :description "rand-name2"
                                            :creator_id  (mt/user->id :crowberto)}
                     :model/Table     table1 {:name "rand-name"}
                     :model/Table     hidden-table {:name            "hidden table"
                                                    :visibility_type "hidden"}
                     :model/Card      dataset {:name                   "rand-name"
                                               :type                   :model
                                               :creator_id             (mt/user->id :crowberto)
                                               :display                "table"
                                               :visualization_settings {}
                                               :database_id            db-id}
                     :model/Card      metric  {:name                   "rand-metric-name"
                                               :type                   :metric
                                               :creator_id             (mt/user->id :crowberto)
                                               :display                "table"
                                               :visualization_settings {}
                                               :database_id            db-id}]
        (testing "recent_views endpoint shows the current user's recently viewed items."
          (clear-recent-views-for-user :crowberto)
          (testing (str "> EVENT: " :event/card-read " does create recent views.")
            (doseq [[topic event] [[:event/card-read      {:user-id (mt/user->id :crowberto) :object-id (u/the-id dataset) :context :question}]
                                   [:event/card-read      {:user-id (mt/user->id :crowberto) :object-id (u/the-id dataset) :context :question}]
                                   [:event/card-read      {:user-id (mt/user->id :crowberto) :object-id (u/the-id card1) :context :question}]
                                   [:event/card-read      {:user-id (mt/user->id :crowberto) :object-id (u/the-id card1) :context :question}]
                                   [:event/dashboard-read {:user-id (mt/user->id :crowberto) :object-id (u/the-id dash)}]
                                   [:event/card-read      {:user-id (mt/user->id :crowberto) :object-id (u/the-id card1) :context :question}]
                                   [:event/dashboard-read {:user-id (mt/user->id :crowberto) :object-id (u/the-id dash)}]
                                   [:event/table-read     {:user-id (mt/user->id :crowberto) :object table1}]
                                   [:event/card-read      {:user-id (mt/user->id :crowberto) :object-id (u/the-id archived) :context :question}]
                                   [:event/table-read     {:user-id (mt/user->id :crowberto) :object hidden-table}]
                                   [:event/card-read      {:user-id (mt/user->id :crowberto) :object-id (u/the-id metric) :context :question}]]]
              (events/publish-event! topic (assoc event :user-id (mt/user->id :crowberto))))
            (let [recent-views (:recents (mt/user-http-request :crowberto :get 200 "activity/recents?context=views"))]
              (is (= [{:model "metric" :id (u/the-id metric) :name "rand-metric-name"}
                      {:model "table" :id (u/the-id table1) :name "rand-name"}
                      {:model "dashboard" :id (u/the-id dash) :name "rand-name2"}
                      {:model "card" :id (u/the-id card1) :name "rand-name" :dashboard nil}
                      {:model "dataset" :id (u/the-id dataset) :name "rand-name"}]
                     (map #(select-keys % [:model :id :name :dashboard]) recent-views))))))))))

(deftest recent-card-read-views-have-dashboard-info-for-dashboard-questions
  (clear-recent-views-for-user :crowberto)
  (mt/with-test-user :crowberto
    (mt/with-model-cleanup [:model/ViewLog :model/RecentViews]
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "the dashboard name"}
                     :model/Card      {card-id :id} {:name "dashboard question card"
                                                     :dashboard_id dash-id}]
        (testing "recent_views endpoint shows the current user's recently viewed items."
          (clear-recent-views-for-user :crowberto)
          (testing (str "> EVENT: " :event/card-read " does create recent views.")
            (doseq [[topic event] [[:event/card-read      {:user-id (mt/user->id :crowberto) :object-id card-id :context :question}]]]
              (events/publish-event! topic (assoc event :user-id (mt/user->id :crowberto))))
            (let [recent-views (:recents (mt/user-http-request :crowberto :get 200 "activity/recents?context=views"))]
              (is (= [{:model "card" :id card-id :name "dashboard question card" :dashboard {:name "the dashboard name"
                                                                                             :id   dash-id}}]
                     (map #(select-keys % [:model :id :name :dashboard]) recent-views))))))))))

(deftest recent-card-query-views-test
  (clear-recent-views-for-user :crowberto)
  (mt/with-test-user :crowberto
    (mt/with-model-cleanup [:model/ViewLog :model/RecentViews]
      (mt/with-temp [:model/Database  {db-id :id} {}
                     :model/Card      card1     {:name                   "rand-name"
                                                 :creator_id             (mt/user->id :crowberto)
                                                 :display                "table"
                                                 :visualization_settings {}
                                                 :database_id            db-id}
                     :model/Card      archived  {:name                   "archived-card"
                                                 :creator_id             (mt/user->id :crowberto)
                                                 :display                "table"
                                                 :archived               true
                                                 :visualization_settings {}
                                                 :database_id            db-id}
                     :model/Dashboard dash {:name        "rand-name2"
                                            :description "rand-name2"
                                            :creator_id  (mt/user->id :crowberto)}
                     :model/Table     table1 {:name "rand-name"}
                     :model/Table     hidden-table {:name            "hidden table"
                                                    :visibility_type "hidden"}
                     :model/Card      dataset {:name                   "rand-name"
                                               :type                   :model
                                               :creator_id             (mt/user->id :crowberto)
                                               :display                "table"
                                               :visualization_settings {}
                                               :database_id            db-id}
                     :model/Card      metric  {:name                   "rand-metric-name"
                                               :type                   :metric
                                               :creator_id             (mt/user->id :crowberto)
                                               :display                "table"
                                               :visualization_settings {}
                                               :database_id            db-id}]
        (testing "recent_views endpoint shows the current user's recently viewed items."
          (clear-recent-views-for-user :crowberto)
          (testing (str "> EVENT: " :event/card-query " does create recent views.")
            (doseq [[topic event] [[:event/card-query     {:user-id (mt/user->id :crowberto) :card-id (u/the-id dataset)}]
                                   [:event/card-query     {:user-id (mt/user->id :crowberto) :card-id (u/the-id dataset)}]
                                   [:event/card-query     {:user-id (mt/user->id :crowberto) :card-id (u/the-id card1)}]
                                   [:event/card-query     {:user-id (mt/user->id :crowberto) :card-id (u/the-id card1)}]
                                   [:event/dashboard-read {:user-id (mt/user->id :crowberto) :object-id (u/the-id dash)}]
                                   [:event/card-query     {:user-id (mt/user->id :crowberto) :card-id (u/the-id card1)}]
                                   [:event/dashboard-read {:user-id (mt/user->id :crowberto) :object-id (u/the-id dash)}]
                                   [:event/table-read     {:user-id (mt/user->id :crowberto) :object table1}]
                                   [:event/card-query     {:user-id (mt/user->id :crowberto) :card-id (u/the-id archived)}]
                                   [:event/table-read     {:user-id (mt/user->id :crowberto) :object hidden-table}]
                                   [:event/card-query     {:user-id (mt/user->id :crowberto) :card-id (u/the-id metric)}]]]
              (events/publish-event! topic (assoc event :user-id (mt/user->id :crowberto))))
            (let [recent-views (:recents (mt/user-http-request :crowberto :get 200 "activity/recents?context=views"))]
              (is (= [{:model "metric" :id (u/the-id metric) :name "rand-metric-name"}
                      {:model "table" :id (u/the-id table1) :name "rand-name"}
                      {:model "dashboard" :id (u/the-id dash) :name "rand-name2"}
                      {:model "card" :id (u/the-id card1) :name "rand-name"}
                      {:model "dataset" :id (u/the-id dataset) :name "rand-name"}]
                     (map #(select-keys % [:model :id :name]) recent-views))))))))))

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
    (t2/insert! :model/RecentViews (:other views))
    (t2/insert! :model/QueryExecution (:card views))))

(deftest popular-items-test
  ;; Clear out recent views & query execution log so that test doesn't read stale state
  (t2/delete! :model/RecentViews)
  (t2/delete! :model/QueryExecution)
  (mt/with-temp [:model/Card      card1 {:name                   "rand-name"
                                         :creator_id             (mt/user->id :crowberto)
                                         :display                "table"
                                         :visualization_settings {}}
                 :model/Card      archived  {:name                   "archived-card"
                                             :creator_id             (mt/user->id :crowberto)
                                             :display                "table"
                                             :archived               true
                                             :visualization_settings {}}
                 :model/Dashboard dash1 {:name        "rand-name"
                                         :description "rand-name"
                                         :creator_id  (mt/user->id :crowberto)
                                         :view_count  10}
                 :model/Dashboard dash2 {:name        "other-dashboard"
                                         :description "just another dashboard"
                                         :creator_id  (mt/user->id :crowberto)
                                         :view_count  5}
                 :model/Table     table1 {:name "rand-name"}
                 :model/Table     hidden-table {:name            "hidden table"
                                                :visibility_type "hidden"}
                 :model/Card      dataset {:name                   "rand-name"
                                           :type                   :model
                                           :creator_id             (mt/user->id :crowberto)
                                           :display                "table"
                                           :visualization_settings {}}
                 :model/Card      metric  {:name                   "rand-name"
                                           :type                   :metric
                                           :creator_id             (mt/user->id :crowberto)
                                           :display                "table"
                                           :visualization_settings {}}]
    (let [test-ids (set (map :id [card1 archived dash1 dash2 table1 hidden-table dataset metric]))]
      (testing "Items viewed by multiple users are never duplicated in the popular items list."
        (mt/with-model-cleanup [:model/RecentViews :model/QueryExecution]
          (create-views! [[(mt/user->id :rasta)     "dashboard" (:id dash1)]
                          [(mt/user->id :crowberto) "dashboard" (:id dash1)]
                          [(mt/user->id :rasta)     "card"      (:id card1)]
                          [(mt/user->id :crowberto) "card"      (:id card1)]])
          (is (= [["dashboard" (u/the-id dash1)]
                  ["card" (u/the-id card1)]]
                 ;; all views are from :rasta, but :crowberto can still see popular items
                 (->> (mt/user-http-request :crowberto :get 200 "activity/popular_items")
                      :popular_items
                      (filter (comp test-ids u/the-id))
                      (map (juxt :model :id)))))))
      (testing "Items viewed by other users can still show up in popular items."
        (mt/with-model-cleanup [:model/RecentViews :model/QueryExecution]
          (create-views! [[(mt/user->id :rasta) "dashboard" (:id dash1)]
                          [(mt/user->id :rasta) "card"      (:id card1)]
                          [(mt/user->id :rasta) "table"     (:id table1)]
                          [(mt/user->id :rasta) "card"      (:id metric)]])
          (is (= [["dashboard" (:id dash1)]
                  ["card" (:id card1)]
                  ["metric" (:id metric)]
                  ["table" (:id table1)]]
                 ;; all views are from :rasta, but :crowberto can still see popular items
                 (->> (mt/user-http-request :crowberto :get 200 "activity/popular_items")
                      :popular_items
                      (filter #(test-ids (:id %)))
                      (map (juxt :model :id)))))))
      (testing "Items with more views show up sooner in popular items."
        (mt/with-model-cleanup [:model/RecentViews :model/QueryExecution]
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
                      :popular_items
                      (filter #(test-ids (:id %)))
                      (map (juxt :model :id))))))))))

(deftest recents-endpoint-context-test
  (testing "Context query param is required"
    (is (= {:context "vector of enum of :selections, :views"}
           (:errors (mt/user-http-request :crowberto :get 400 "activity/recents")))))
  (testing "recent_views endpoint remains unchanged"
    (is (= {:recent_views []}
           (mt/user-http-request :crowberto :get 200 "activity/recent_views"))))
  (testing "Context query param controls return values: views"
    (is (= {:recents []}
           (mt/user-http-request :crowberto :get 200 "activity/recents?context=views"))))
  (testing "Context query param controls return values: selections"
    (is (= {:recents []}
           (mt/user-http-request :crowberto :get 200 "activity/recents?context=selections")))))
