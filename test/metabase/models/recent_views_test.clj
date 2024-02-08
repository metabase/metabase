(ns metabase.models.recent-views-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.recent-views :as recent-views]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- clear-test-user-recent-views
  [test-user]
  (t2/delete! :model/RecentViews :user_id (mt/user->id test-user)))

(deftest user-recent-views-test
  (testing "`user-recent-views` dedupes items, and returns them in reverse chronological order"
    (clear-test-user-recent-views :rasta)
    (t2.with-temp/with-temp [:model/RecentViews _ {:model "card" :model_id 1 :user_id (mt/user->id :rasta)}
                             :model/RecentViews _ {:model "card" :model_id 2 :user_id (mt/user->id :rasta)}
                             :model/RecentViews _ {:model "card" :model_id 2 :user_id (mt/user->id :rasta)}
                             :model/RecentViews _ {:model "card" :model_id 1 :user_id (mt/user->id :rasta)}
                             :model/RecentViews _ {:model "dashboard" :model_id 3 :user_id (mt/user->id :rasta)}
                             :model/RecentViews _ {:model "card" :model_id 2 :user_id (mt/user->id :rasta)}]
      (is (= [{:model "card" :model_id 2}
              {:model "dashboard" :model_id 3}
              {:model "card" :model_id 1}]
             (recent-views/user-recent-views (mt/user->id :rasta))))

      (is (= [{:model "card" :model_id 2}]
             (recent-views/user-recent-views (mt/user->id :rasta) 1))))))

(deftest most-recently-viewed-dashboard-id-test
  (testing "`most-recently-viewed-dashboard-id` returns the ID of the most recently viewed dashboard in the last 24 hours"
    (clear-test-user-recent-views :rasta)
    (t2.with-temp/with-temp [:model/RecentViews _ {:model "dashboard"
                                                   :model_id 1
                                                   :user_id (mt/user->id :rasta)
                                                   :timestamp (t/minus (t/zoned-date-time) (t/days 2))}]
      (is (nil? (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta))))

      (t2.with-temp/with-temp [:model/RecentViews _ {:model "dashboard" :model_id 2 :user_id (mt/user->id :rasta)}
                               :model/RecentViews _ {:model "dashboard" :model_id 3 :user_id (mt/user->id :rasta)}]
        (is (= 3 (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta))))))))

(deftest update-users-recent-views!-test
  (clear-test-user-recent-views :rasta)
  (binding [recent-views/*recent-views-stored-per-user* 3]
    (let [user-id (mt/user->id :rasta)]
      (testing "`update-users-recent-views!` prunes views after the threshold of `*recent-views-stored-per-user*`"
        (recent-views/update-users-recent-views! user-id :model/Card 1)
        (is (= [{:model "card" :model_id 1}]
               (recent-views/user-recent-views user-id)))

        (recent-views/update-users-recent-views! user-id :model/Card 2)
        (is (= [{:model "card" :model_id 2} {:model "card" :model_id 1}]
               (recent-views/user-recent-views user-id)))

        (recent-views/update-users-recent-views! user-id :model/Card 3)
        (is (= [{:model "card" :model_id 3} {:model "card" :model_id 2} {:model "card" :model_id 1}]
               (recent-views/user-recent-views user-id)))

        ;; Still only 3 items
        (recent-views/update-users-recent-views! user-id :model/Card 4)
        (is (= [{:model "card" :model_id 4} {:model "card" :model_id 3} {:model "card" :model_id 2}]
               (recent-views/user-recent-views user-id))))

      (testing "The most recent dashboard view is not pruned"
        (recent-views/update-users-recent-views! user-id :model/Dashboard 1)
        (recent-views/update-users-recent-views! user-id :model/Card 5)
        (recent-views/update-users-recent-views! user-id :model/Card 6)
        (recent-views/update-users-recent-views! user-id :model/Card 7)
        (recent-views/update-users-recent-views! user-id :model/Card 8)
        (recent-views/update-users-recent-views! user-id :model/Card 9)
        (is (= [{:model "card" :model_id 9} {:model "card" :model_id 8} {:model "dashboard" :model_id 1}]
               (recent-views/user-recent-views user-id))))

      (testing "If another dashboard view occurs, the old one can be pruned"
        (recent-views/update-users-recent-views! user-id :model/Dashboard 2)
        (is (= [{:model "dashboard" :model_id 2} {:model "card" :model_id 9} {:model "card" :model_id 8}]
               (recent-views/user-recent-views user-id))))

      (testing "If `*recent-views-stored-per-user*` changes, the table expands or shrinks appropriately"
        (binding [recent-views/*recent-views-stored-per-user* 4]
          (recent-views/update-users-recent-views! user-id :model/Table 1)
          (is (= [{:model "table"     :model_id 1}
                  {:model "dashboard" :model_id 2}
                  {:model "card"      :model_id 9}
                  {:model "card"      :model_id 8}]
                 (recent-views/user-recent-views user-id))))

        (binding [recent-views/*recent-views-stored-per-user* 2]
          (recent-views/update-users-recent-views! user-id :model/Table 2)
          (is (= [{:model "table" :model_id 2} {:model "dashboard" :model_id 2}]
                 (recent-views/user-recent-views user-id))))))))
