(ns metabase.api.activity-test
  "Tests for /api/activity endpoints."
  (:require
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.api.activity :as api.activity]
   [metabase.events.view-log :as view-log]
   [metabase.models.activity :refer [Activity]]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
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

;; GET /

;; Things we are testing for:
;;  1. ordered by timestamp DESC
;;  2. :user and :model_exists are hydrated

(def ^:private activity-defaults
  {:model_exists false
   :database_id  nil
   :database     nil
   :table_id     nil
   :table        nil
   :custom_id    nil})

(defn- activity-user-info [user-kw]
  (merge
   {:id (mt/user->id user-kw)}
   (select-keys
    (mt/fetch-user user-kw)
    [:common_name :date_joined :email :first_name :is_qbnewb :is_superuser :last_login :last_name :locale])))

;; NOTE: timestamp matching was being a real PITA so I cheated a bit.  ideally we'd fix that
(deftest activity-list-test
  (testing "GET /api/activity"
    (mt/with-temp* [Activity [activity1 {:topic     "install"
                                         :details   {}
                                         :timestamp #t "2015-09-09T12:13:14.888Z[UTC]"}]
                    Activity [activity2 {:topic     "dashboard-create"
                                         :user_id   (mt/user->id :crowberto)
                                         :model     "dashboard"
                                         :model_id  1234
                                         :details   {:description "Because I can!"
                                                     :name        "Bwahahaha"}
                                         :timestamp #t "2015-09-10T18:53:01.632Z[UTC]"}]
                    Activity [activity3 {:topic     "user-joined"
                                         :user_id   (mt/user->id :rasta)
                                         :model     "user"
                                         :details   {}
                                         :timestamp #t "2015-09-10T05:33:43.641Z[UTC]"}]]
      (letfn [(fetch-activity [activity]
                (merge
                 activity-defaults
                 (t2/select-one [Activity :id :user_id :details :model :model_id] :id (u/the-id activity))))]
        (is (= [(merge
                 (fetch-activity activity2)
                 {:topic "dashboard-create"
                  :user  (activity-user-info :crowberto)})
                (merge
                 (fetch-activity activity3)
                 {:topic "user-joined"
                  :user  (activity-user-info :rasta)})
                (merge
                 (fetch-activity activity1)
                 {:topic   "install"
                  :user_id nil
                  :user    nil})]
               ;; remove other activities from the API response just in case -- we're not interested in those
               (let [these-activity-ids (set (map u/the-id [activity1 activity2 activity3]))]
                 (for [activity (mt/user-http-request :crowberto :get 200 "activity")
                       :when    (contains? these-activity-ids (u/the-id activity))]
                   (dissoc activity :timestamp)))))))))

(deftest recent-views-test
  (mt/with-temp* [Card      [card1 {:name                   "rand-name"
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]
                  Card      [archived  {:name                   "archived-card"
                                        :creator_id             (mt/user->id :crowberto)
                                        :display                "table"
                                        :archived               true
                                        :visualization_settings {}}]
                  Dashboard [dash {:name        "rand-name2"
                                   :description "rand-name2"
                                   :creator_id  (mt/user->id :crowberto)}]
                  Table     [table1 {:name "rand-name"}]
                  Table     [hidden-table {:name            "hidden table"
                                           :visibility_type "hidden"}]
                  Card      [dataset {:name                   "rand-name"
                                      :dataset                true
                                      :creator_id             (mt/user->id :crowberto)
                                      :display                "table"
                                      :visualization_settings {}}]]
    (testing "recent_views endpoint shows the current user's recently viewed items."
      (mt/with-model-cleanup [ViewLog]
        (mt/with-test-user :crowberto
          (mt/with-temporary-setting-values [user-recent-views []]
            (doseq [event [{:topic :card-query :item dataset}
                           {:topic :card-query :item dataset}
                           {:topic :card-query :item card1}
                           {:topic :card-query :item card1}
                           {:topic :card-query :item card1}
                           {:topic :dashboard-read :item dash}
                           {:topic :card-query :item card1}
                           {:topic :dashboard-read :item dash}
                           {:topic :table-read :item table1}
                           {:topic :card-query :item archived}
                           {:topic :table-read :item hidden-table}]]
              (view-log/handle-view-event!
               ;; view log entries look for the `:actor_id` in the item being viewed to set that view's :user_id
               (assoc-in event [:item :actor_id] (mt/user->id :crowberto))))
            (testing "No duplicates or archived items are returned."
              (let [recent-views (mt/user-http-request :crowberto :get 200 "activity/recent_views")]
                (is (partial=
                     [{:model "table" :model_id (u/the-id table1)}
                      {:model "dashboard" :model_id (u/the-id dash)}
                      {:model "card" :model_id (u/the-id card1)}
                      {:model "dataset" :model_id (u/the-id dataset)}]
                     recent-views))))))
        (mt/with-test-user :rasta
          (mt/with-temporary-setting-values [user-recent-views []]
            (view-log/handle-view-event! {:topic :card-query :item (assoc dataset :actor_id (mt/user->id :rasta))})
            (view-log/handle-view-event! {:topic :card-query :item (assoc card1 :actor_id (mt/user->id :crowberto))})
            (testing "Only the user's own views are returned."
              (let [recent-views (mt/user-http-request :rasta :get 200 "activity/recent_views")]
                (is (partial=
                     [{:model "dataset" :model_id (u/the-id dataset)}]
                     (reverse recent-views)))))))))))

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
  (mt/with-temp* [Card      [card1 {:name                   "rand-name"
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]
                  Card      [_archived  {:name                   "archived-card"
                                         :creator_id             (mt/user->id :crowberto)
                                         :display                "table"
                                         :archived               true
                                         :visualization_settings {}}]
                  Dashboard [dash1 {:name        "rand-name"
                                    :description "rand-name"
                                    :creator_id  (mt/user->id :crowberto)}]
                  Dashboard [dash2 {:name        "other-dashboard"
                                    :description "just another dashboard"
                                    :creator_id  (mt/user->id :crowberto)}]
                  Table     [table1 {:name "rand-name"}]
                  Table     [_hidden-table {:name            "hidden table"
                                            :visibility_type "hidden"}]
                  Card      [dataset {:name                   "rand-name"
                                      :dataset                true
                                      :creator_id             (mt/user->id :crowberto)
                                      :display                "table"
                                      :visualization_settings {}}]]
    (testing "Items viewed by multiple users are not duplicated in the popular items list."
      (mt/with-model-cleanup [ViewLog QueryExecution]
        (create-views! [[(mt/user->id :rasta)     "dashboard" (:id dash1)]
                        [(mt/user->id :crowberto) "dashboard" (:id dash1)]
                        [(mt/user->id :rasta)     "card"      (:id card1)]
                        [(mt/user->id :crowberto) "card"      (:id card1)]])
        (is (= [["dashboard" (:id dash1)]
                ["card" (:id card1)]]
               ;; all views are from :rasta, but :crowberto can still see popular items
               (for [popular-item (mt/user-http-request :crowberto :get 200 "activity/popular_items")]
                 ((juxt :model :model_id) popular-item))))))
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
               (for [popular-item (mt/user-http-request :crowberto :get 200 "activity/popular_items")]
                 ((juxt :model :model_id) popular-item))))))
    (testing "Items with more views show up sooner in popular items."
      (mt/with-model-cleanup [ViewLog QueryExecution]
        (create-views! (concat
                        ;; one item with many views is considered more popular
                        (repeat 10 [(mt/user->id :rasta) "dashboard" (:id dash1)])
                        [[(mt/user->id :rasta) "dashboard" (:id dash2)]
                         [(mt/user->id :rasta) "card"      (:id dataset)]
                         [(mt/user->id :rasta) "table"     (:id table1)]
                         [(mt/user->id :rasta) "card"      (:id card1)]]))
        (is (partial= [{:model "dashboard" :model_id (:id dash1)}
                       {:model "dashboard" :model_id (:id dash2)}
                       {:model "card"      :model_id (:id card1)}
                       {:model "dataset"   :model_id (:id dataset)}
                       {:model "table"     :model_id (:id table1)}]
                      ;; all views are from :rasta, but :crowberto can still see popular items
                      (mt/user-http-request :crowberto :get 200 "activity/popular_items")))))))

;;; activities->referenced-objects, referenced-objects->existing-objects, add-model-exists-info

(def ^:private fake-activities
  [{:model "dashboard", :model_id  43, :topic :dashboard-create,    :details {}}
   {:model "dashboard", :model_id  42, :topic :dashboard-create,    :details {}}
   {:model "card",      :model_id 114, :topic :card-create,         :details {}}
   {:model "card",      :model_id 113, :topic :card-create,         :details {}}
   {:model "card",      :model_id 112, :topic :card-create,         :details {}}
   {:model "card",      :model_id 111, :topic :card-create,         :details {}}
   {:model "dashboard", :model_id  41, :topic :dashboard-add-cards, :details {:dashcards [{:card_id 109}]}}
   {:model "card",      :model_id 109, :topic :card-create,         :details {}}
   {:model "dashboard", :model_id  41, :topic :dashboard-add-cards, :details {:dashcards [{:card_id 108}]}}
   {:model "dashboard", :model_id  41, :topic :dashboard-create,    :details {}}
   {:model "card",      :model_id 108, :topic :card-create,         :details {}}
   {:model "user",      :model_id  90, :topic :user-joined,         :details {}}
   {:model nil,         :model_id nil, :topic :install,             :details {}}])

(deftest activities->referenced-objects-test
  (is (= {"dashboard" #{41 43 42}
          "card"      #{113 108 109 111 112 114}
          "user"      #{90}}
         (#'api.activity/activities->referenced-objects fake-activities))))

(deftest referenced-objects->existing-objects-test
  (mt/with-temp Dashboard [{dashboard-id :id}]
    (is (= {"dashboard" #{dashboard-id}}
           (#'api.activity/referenced-objects->existing-objects {"dashboard" #{dashboard-id 0}
                                                                 "card"      #{0}})))))
(deftest add-model-exists-info-test
  (mt/with-temp* [Dashboard [{dashboard-id :id}]
                  Card      [{card-id :id}]
                  Card      [{dataset-id :id} {:dataset true}]]
    (is (= [{:model "dashboard", :model_id dashboard-id, :model_exists true}
            {:model "card", :model_id 0, :model_exists false}
            {:model "dataset", :model_id dataset-id, :model_exists true}
            {:model        "dashboard"
             :model_id     0
             :model_exists false
             :topic        :dashboard-remove-cards
             :details      {:dashcards [{:card_id card-id, :exists true}
                                        {:card_id 0, :exists false}
                                        {:card_id dataset-id, :exists true}]}}]
           (#'api.activity/add-model-exists-info [{:model "dashboard", :model_id dashboard-id}
                                                  {:model "card", :model_id 0}
                                                  {:model "card", :model_id dataset-id}
                                                  {:model    "dashboard"
                                                   :model_id 0
                                                   :topic    :dashboard-remove-cards
                                                   :details  {:dashcards [{:card_id card-id}
                                                                          {:card_id 0}
                                                                          {:card_id dataset-id}]}}])))))

(deftest activity-visibility-test
  (mt/with-temp Activity [activity {:topic     "user-joined"
                                    :details   {}
                                    :timestamp (java.time.ZonedDateTime/now)}]
    (letfn [(activity-topics [user]
              (into #{} (map :topic)
                    (mt/user-http-request user :get 200 "activity")))]
      (testing "Only admins should get to see user-joined activities"
        (testing "admin should see `:user-joined` activities"
          (testing "Sanity check: admin should be able to read the activity"
            (mt/with-test-user :crowberto
              (is (mi/can-read? activity))))
          (is (contains? (activity-topics :crowberto) "user-joined")))
        (testing "non-admin should *not* see `:user-joined` activities"
          (testing "Sanity check: non-admin should *not* be able to read the activity"
            (mt/with-test-user :rasta
              (is (not (mi/can-read? activity)))))
          (is (not (contains? (activity-topics :rasta) "user-joined"))))))))
