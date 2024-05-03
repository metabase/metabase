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

      (is (= {:id 1,
              :name "Query log",
              :display "table",
              :model :card,
              :can_write false,
              :timestamp String
              :parent_collection {:id 1, :name "Metabase analytics", :authority_level nil}}
             (update (first (recent-views/get-list (mt/user->id :rasta))) :timestamp type)))

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

(deftest test-recent-views
  (mt/with-temp [:model/Database a-db {}
                 :model/Table a-table {:db_id (:id a-db)}
                 :model/Collection a-coll {}
                 :model/Card a-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card a-model {:type "model" :table_id (mt/id :reviews)}
                 :model/Dashboard a-dash {}
                 :model/RecentViews _rv0  {:id 1337013, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-card),  :timestamp #t "1983-10-01T00:00Z"}
                 :model/RecentViews rv1  {:id 1337012, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-card),  :timestamp #t "1982-01-01T00:00Z"}
                 :model/RecentViews _rv2  {:id 1337011, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1981-01-01T05:59:59.999+06:00"}
                 :model/RecentViews rv3  {:id 1337010, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1980-01-01T00:00Z"}
                 :model/RecentViews rv4  {:id 1337009, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1979-01-01T04:59:59.998+05:00"}
                 :model/RecentViews rv5  {:id 1337008, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1978-01-01T01:00:00.001+01:00"}
                 :model/RecentViews rv6  {:id 1337007, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1977-01-01T09:00+09:00"}
                 :model/RecentViews rv7  {:id 1337006, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1976-01-01T06:29:59.999+06:30"}
                 :model/RecentViews _rv8  {:id 1337005, :user_id (mt/user->id :rasta), :model "collection", :model_id (:id a-coll),  :timestamp #t "1975-01-01T06:22:59.999+06:30"}
                 :model/RecentViews rv9  {:id 1337004, :user_id (mt/user->id :rasta), :model "collection", :model_id (:id a-coll),  :timestamp #t "1974-01-01T06:22:59.999+06:30"}
                 :model/RecentViews _rv10 {:id 1337003, :user_id (mt/user->id :rasta), :model "dashboard",  :model_id (:id a-dash),  :timestamp #t "1973-01-01T01:01:00.003+01:00"}
                 :model/RecentViews rv11 {:id 1337002, :user_id (mt/user->id :rasta), :model "dashboard",  :model_id (:id a-dash),  :timestamp #t "1972-11-31T18:02:00.001-06:00"}
                 :model/RecentViews rv12 {:id 1337001, :user_id (mt/user->id :rasta), :model "dashboard",  :model_id (:id a-dash),  :timestamp #t "1971-01-01T08:03+08:00"}
                 :model/RecentViews _rv13 {:id 1337000, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-model), :timestamp #t "1971-01-01T08:02+08:00"}
                 :model/RecentViews rv14 {:id 1336999, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-model), :timestamp #t "1971-01-01T08:01+08:00"}
                 :model/RecentViews rv15 {:id 1336998, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-model), :timestamp #t "1971-01-01T08:00+08:00"}]
    (let [query-result (#'recent-views/do-query (mt/user->id :rasta))]
      (is (apply t/after? (map :timestamp query-result))))
    (let [ids-to-prune (#'recent-views/duplicate-model-ids)]
      (is (= #{(:id rv1)                                         ;; dupe cards
               (:id rv3) (:id rv4) (:id rv5) (:id rv6) (:id rv7) ;; dupe tables
               (:id rv9)                                         ;; dupe collections
               (:id rv11) (:id rv12)                             ;; dupe dashboards
               (:id rv14) (:id rv15)}                            ;; dupe models
             ids-to-prune)))))


(deftest test-recent-views-garbage-collection
  (mt/with-temp [:model/Card a-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card b-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card c-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card d-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card e-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card f-card {:type "question" :table_id (mt/id :reviews)}
                 :model/RecentViews _ {:id 1337000 :user_id (mt/user->id :rasta), :model "card", :model_id (:id a-card),  :timestamp #t "1983-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337001 :user_id (mt/user->id :rasta), :model "card", :model_id (:id b-card),  :timestamp #t "1983-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337002 :user_id (mt/user->id :rasta), :model "card", :model_id (:id c-card),  :timestamp #t "1983-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337003 :user_id (mt/user->id :rasta), :model "card", :model_id (:id d-card),  :timestamp #t "1983-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337004 :user_id (mt/user->id :rasta), :model "card", :model_id (:id e-card),  :timestamp #t "1983-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337005 :user_id (mt/user->id :rasta), :model "card", :model_id (:id f-card),  :timestamp #t "1983-10-01T00:00Z"}]
    (doseq [[ids bucket-size] [[#{1337000 1337002 1337004 1337005 1337003 1337001} 0] ;; delete them all!
                               [#{1337002 1337004 1337005 1337003 1337001} 1]
                               [#{1337002 1337004 1337005 1337003} 2]
                               [#{1337004 1337005 1337003} 3]
                               [#{1337004 1337005} 4]
                               [#{1337005} 5]
                               [#{} 6]
                               [#{} 7]]]
      (binding [recent-views/*recent-views-stored-per-user-per-model* bucket-size]
        (is (= ids (#'recent-views/ids-to-prune (mt/user->id :rasta))))))))
