(ns metabase.api.activity-test
  "Tests for /api/activity endpoints."
  (:require
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.models.table :refer [Table]]
   [metabase.models.view-log :refer [ViewLog]]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan.db :as db]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; GET /recent_views

;; Things we are testing for:
;;  1. ordering is sorted by most recent
;;  2. results are filtered to current user
;;  3. `:model_object` is hydrated in each result
;;  4. we filter out entries where `:model_object` is nil (object doesn't exist)

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
    (db/insert-many! ViewLog (:other views))
    (db/insert-many! QueryExecution (:card views))))

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
    (mt/with-model-cleanup [ViewLog QueryExecution]
      (create-views! [[(mt/user->id :crowberto) "card"      (:id dataset)]
                      [(mt/user->id :crowberto) "card"      (:id card1)]
                      [(mt/user->id :crowberto) "card"      36478]
                      [(mt/user->id :crowberto) "dashboard" (:id dash)]
                      [(mt/user->id :crowberto) "table"     (:id table1)]
                      ;; most recent for crowberto are archived card and hidden table
                      [(mt/user->id :crowberto) "card"      (:id archived)]
                      [(mt/user->id :crowberto) "table"     (:id hidden-table)]
                      [(mt/user->id :rasta)     "card"      (:id card1)]])
      (let [recent-views (mt/user-http-request :crowberto :get 200 "activity/recent_views")]
        (is (partial= [{:model "table"     :model_id (:id table1)}
                       {:model "dashboard" :model_id (:id dash)}
                       {:model "card"      :model_id (:id card1)}
                       {:model "dataset"   :model_id (:id dataset)}]
                      recent-views))))))

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
