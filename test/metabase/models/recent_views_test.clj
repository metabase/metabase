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
  (testing "`user-recent-views` dedupes items, and returns them in chronological order, most recent first"
    (clear-test-user-recent-views :rasta)
    ;; insert some duplicates, they should get ignored:
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card 1)
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card 2)
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card 2)
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card 1)
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard 3)
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card 2)
    ;; card 2 was latest, so it comes first in the list:
    (is (= [[:dataset 2] [:dashboard 3] [:dataset 1]]
           (mapv (juxt :model :id) (recent-views/get-list (mt/user->id :rasta)))))

    (is (= [:dataset 2] (-> (recent-views/get-list (mt/user->id :rasta)) first ((juxt :model :id)))))))

(deftest most-recently-viewed-dashboard-id-test
  (testing "`most-recently-viewed-dashboard-id` returns the ID of the most recently viewed dashboard in the last 24 hours"
    (clear-test-user-recent-views :rasta)
    (t2.with-temp/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Dashboard {dash-id-2 :id} {}
                   :model/Dashboard {dash-id-3 :id} {}]

      (is (nil? (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta))))

      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id)
      (is (= dash-id (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta))))

      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id-2)
      (is (= dash-id-2 (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta))))

      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id-3)
      (is (= dash-id-3 (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta)))))))

;; for a card model:
;; a card:
;; [:model/Card {card-id :id} {:type "question"}]
;; a dataset:
;; [:model/Card {card-id :id} {:type "model"}]



(deftest update-users-recent-views!-test
  (clear-test-user-recent-views :rasta)
  (binding [recent-views/*recent-views-stored-per-user-per-model* 2]
    (testing "`update-users-recent-views!` prunes duplicates of a certain model.`"
        (mt/with-temp [:model/Card {card-id :id} {:type "question"}]
          ;; twenty five views
          (dotimes [_ 25] (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id))
          (is (= 0 (count (filter (comp #{:dataset} :model) (recent-views/get-list (mt/user->id :rasta))))))
          (is (= 1 (count (filter (comp #{:card} :model) (recent-views/get-list (mt/user->id :rasta))))))))

      (testing "`update-users-recent-views!` prunes duplicates of all models.`"
        (mt/with-temp
          [:model/Database   {db-id           :id} {} ;; just needed for my temp table

           :model/Card       {card-id         :id} {:type "question"}
           :model/Card       {model-id        :id} {:type "model"}
           :model/Dashboard  {dashboard-id    :id} {}
           :model/Collection {collection-id   :id} {}
           :model/Table      {table-id        :id} {:db_id db-id, :is_upload true}

           :model/Card       {card-id-2       :id} {:type "question"}
           :model/Card       {model-id-2      :id} {:type "model"}
           :model/Dashboard  {dashboard-id-2  :id} {}
           :model/Collection {collection-id-2 :id} {}
           :model/Table      {table-id-2      :id} {:db_id db-id, :is_upload true}

           :model/Card       {card-id-3       :id} {:type "question"}
           :model/Card       {model-id-3      :id} {:type "model"}
           :model/Dashboard  {dashboard-id-3  :id} {}
           :model/Collection {collection-id-3 :id} {}
           :model/Table      {table-id-3      :id} {:db_id db-id, :is_upload true}]
          (doseq [[model out-model model-ids] [[:model/Card :card [card-id card-id-2 card-id-3]]
                                               [:model/Card :dataset [model-id model-id-2 model-id-3]]
                                               [:model/Dashboard :dashboard [dashboard-id dashboard-id-2 dashboard-id-3]]
                                               [:model/Collection :collection [collection-id collection-id-2 collection-id-3]]
                                               [:model/Table :table [table-id table-id-2 table-id-3]]]]
            (doseq [model-id model-ids] (recent-views/update-users-recent-views! (mt/user->id :rasta) model model-id))
            (testing (format "When user views %s %ss, the latest %s per model are kept. "
                             (count model-ids) model recent-views/*recent-views-stored-per-user-per-model*)
              (is (= 2 (count (filter (comp #{out-model} :model) (recent-views/get-list (mt/user->id :rasta))))))))

          ))))



      ;; #_#_#_#_#_#_#_(recent-views/update-users-recent-views! user-id :model/Card 3)
      ;; (is (=  {:id                3,
      ;;          :name              "Content",
      ;;          :model             :dataset,
      ;;          :can_write         false,
      ;;          :timestamp         java.lang.String,
      ;;          :moderated_status  nil,
      ;;          :parent_collection {:id 1, :name "Metabase analytics", :authority_level nil}}
      ;;         (update (first (recent-views/get-list user-id))
      ;;                 :timestamp type)))

      ;; (recent-views/update-users-recent-views! user-id :model/Card 4)
      ;; (is (= [{:can_write         false,
      ;;          :name              "Last queries",
      ;;          :parent_collection {:id 1, :name "Metabase analytics", :authority_level nil},
      ;;          :moderated_status  nil,
      ;;          :id                4,
      ;;          :display           "table",
      ;;          :model             :card}
      ;;         {:id                3,
      ;;          :name              "Content",
      ;;          :model             :dataset,
      ;;          :can_write         false,
      ;;          :moderated_status  nil,
      ;;          :parent_collection {:id 1, :name "Metabase analytics", :authority_level nil},}]
      ;;        (->> (recent-views/get-list user-id)
      ;;             (take 2)
      ;;             (mapv #(dissoc % :timestamp)))))

      ;; (testing "The most recent dashboard view is not pruned"
      ;;   (recent-views/update-users-recent-views! user-id :model/Dashboard 1)
      ;;   (recent-views/update-users-recent-views! user-id :model/Card 5)
      ;;   (recent-views/update-users-recent-views! user-id :model/Card 6)
      ;;   (recent-views/update-users-recent-views! user-id :model/Card 7)
      ;;   (recent-views/update-users-recent-views! user-id :model/Card 8)
      ;;   (recent-views/update-users-recent-views! user-id :model/Card 9)
      ;;   (is (= {:id                1,
      ;;           :name              "Performance overview",
      ;;           :model             :dashboard,
      ;;           :can_write         false,
      ;;           ;;:timestamp "2024-05-09T15:50:55.589867Z",
      ;;           :parent_collection {:id 1, :name "Metabase analytics", :authority_level nil}}
      ;;          (-> (recent-views/get-list user-id)
      ;;              (->> (u/seek (comp #{:dashboard} :model)))
      ;;              (dissoc :timestamp)))))

      ;; (binding [recent-views/*recent-views-stored-per-user-per-model* 1]
      ;;   (testing "If another dashboard view occurs, the old one can be pruned"
      ;;     (recent-views/update-users-recent-views! user-id :model/Dashboard 2)
      ;;     (is (= [{:id                2,
      ;;              :name              "Person overview",
      ;;              :model             :dashboard,
      ;;              :can_write         false,
      ;;              ;; :timestamp "2024-05-09T15:55:32.702813Z",
      ;;              :parent_collection {:id 1, :name "Metabase analytics", :authority_level nil}}]
      ;;            (->> (recent-views/get-list user-id)
      ;;                 (filter (comp #{:dashboard} :model))
      ;;                 (mapv #(dissoc % :timestamp)))))))

      ;; (testing "If `*recent-views-stored-per-user*` changes, the table expands or shrinks appropriately"
      ;;   (binding [recent-views/*recent-views-stored-per-user-per-model* 1]
      ;;     (recent-views/update-users-recent-views! user-id :model/Table 1)
      ;;     (is (= {:table 1, :dashboard 1, :dataset 1, :card 1, :collection 1}
      ;;            (frequencies (map :model (recent-views/get-list user-id))))))

      ;;   (binding [recent-views/*recent-views-stored-per-user-per-model* 2]
      ;;     (recent-views/update-users-recent-views! user-id :model/Table 2)
      ;;     (recent-views/update-users-recent-views! user-id :model/Card 2)
      ;;     (recent-views/update-users-recent-views! user-id :model/Card 1)
      ;;     (recent-views/update-users-recent-views! user-id :model/Card 5)
      ;;     (recent-views/update-users-recent-views! user-id :model/Card 6)
      ;;     (recent-views/update-users-recent-views! user-id :model/Card 7)
      ;;     (recent-views/update-users-recent-views! user-id :model/Card 8)
      ;;     (recent-views/update-users-recent-views! user-id :model/Card 9)
      ;;     (recent-views/update-users-recent-views! user-id :model/Dashboard 2)
      ;;     (recent-views/update-users-recent-views! user-id :model/Dashboard 1)
      ;;     (recent-views/update-users-recent-views! user-id :model/Collection 2)
      ;;     (is (= {:collection 2, :dashboard 2, :dataset 2, :card 2, :table 2}
      ;;            (frequencies (map :model (recent-views/get-list user-id))))))
      ;;)



(deftest id-pruning-test
  (mt/with-temp [:model/Database a-db     {}
                 :model/Table a-table     {:db_id (:id a-db)}
                 :model/Collection a-coll {}
                 :model/Card a-card       {:type "question" :table_id (mt/id :reviews)}
                 :model/Card a-model      {:type "model" :table_id (mt/id :reviews)}
                 :model/Dashboard a-dash  {};;]
                 ;; oldest first:

                 ;;[
                 :model/RecentViews rv15  {:id 1336998, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-model), :timestamp #t "1971-01-01T08:00+08:00"}
                 :model/RecentViews rv14  {:id 1336999, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-model), :timestamp #t "1971-01-01T08:01+08:00"}
                 :model/RecentViews _rv13 {:id 1337000, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-model), :timestamp #t "1971-01-01T08:02+08:00"}
                 :model/RecentViews rv12  {:id 1337001, :user_id (mt/user->id :rasta), :model "dashboard",  :model_id (:id a-dash),  :timestamp #t "1971-01-01T08:03+08:00"}
                 :model/RecentViews rv11  {:id 1337002, :user_id (mt/user->id :rasta), :model "dashboard",  :model_id (:id a-dash),  :timestamp #t "1972-11-31T18:02:00.001-06:00"}
                 :model/RecentViews _rv10 {:id 1337003, :user_id (mt/user->id :rasta), :model "dashboard",  :model_id (:id a-dash),  :timestamp #t "1973-01-01T01:01:00.003+01:00"}
                 :model/RecentViews rv9   {:id 1337004, :user_id (mt/user->id :rasta), :model "collection", :model_id (:id a-coll),  :timestamp #t "1974-01-01T06:22:59.999+06:30"}
                 :model/RecentViews _rv8  {:id 1337005, :user_id (mt/user->id :rasta), :model "collection", :model_id (:id a-coll),  :timestamp #t "1975-01-01T06:22:59.999+06:30"}
                 :model/RecentViews rv7   {:id 1337006, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1976-01-01T06:29:59.999+06:30"}
                 :model/RecentViews rv6   {:id 1337007, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1977-01-01T09:00+09:00"}
                 :model/RecentViews rv5   {:id 1337008, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1978-01-01T01:00:00.001+01:00"}
                 :model/RecentViews rv4   {:id 1337009, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1979-01-01T04:59:59.998+05:00"}
                 :model/RecentViews rv3   {:id 1337010, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1980-01-01T00:00Z"}
                 :model/RecentViews _rv2  {:id 1337011, :user_id (mt/user->id :rasta), :model "table",      :model_id (:id a-table), :timestamp #t "1981-01-01T05:59:59.999+06:00"}
                 :model/RecentViews rv1   {:id 1337012, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-card),  :timestamp #t "1982-01-01T00:00Z"}
                 :model/RecentViews _rv0  {:id 1337013, :user_id (mt/user->id :rasta), :model "card",       :model_id (:id a-card),  :timestamp #t "1983-10-01T00:00Z"}]
    (def card-id-a (:id a-model))
    (def qr (#'recent-views/do-query (mt/user->id :rasta)))
    (let [query-result (recent-views/get-list (mt/user->id :rasta))]
      ;; everything should be in chronological order, newest first:
      (is (apply t/after? (map (comp t/zoned-date-time :timestamp) query-result))))
    (let [ids-to-prune (#'recent-views/duplicate-model-ids (mt/user->id :rasta))]
      (is (= #{(:id rv1)                                         ;; dupe cards
               (:id rv3) (:id rv4) (:id rv5) (:id rv6) (:id rv7) ;; dupe tables
               (:id rv9)                                         ;; dupe collections
               (:id rv11) (:id rv12)                             ;; dupe dashboards
               (:id rv14) (:id rv15)}                            ;; dupe models
             ids-to-prune)))))

(deftest test-recent-views-garbage-collection
  (clear-test-user-recent-views :rasta)
  (mt/with-temp [:model/Card a-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card b-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card c-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card d-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card e-card {:type "question" :table_id (mt/id :reviews)}
                 :model/Card f-card {:type "question" :table_id (mt/id :reviews)}
                 :model/RecentViews _ {:id 1337000 :user_id (mt/user->id :rasta), :model "card", :model_id (:id a-card),  :timestamp #t "2000-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337001 :user_id (mt/user->id :rasta), :model "card", :model_id (:id b-card),  :timestamp #t "2001-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337002 :user_id (mt/user->id :rasta), :model "card", :model_id (:id c-card),  :timestamp #t "2002-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337003 :user_id (mt/user->id :rasta), :model "card", :model_id (:id d-card),  :timestamp #t "2003-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337004 :user_id (mt/user->id :rasta), :model "card", :model_id (:id e-card),  :timestamp #t "2004-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337005 :user_id (mt/user->id :rasta), :model "card", :model_id (:id f-card),  :timestamp #t "2005-10-01T00:00Z"}]
    (doseq [{:keys [ids-to-prune bucket-size]} [{:bucket-size 0 :ids-to-prune [0 1 2 3 4 5]} ;; delete them all!
                                                {:bucket-size 1 :ids-to-prune [0 1 2 3 4]}
                                                {:bucket-size 2 :ids-to-prune [0 1 2 3]}
                                                {:bucket-size 3 :ids-to-prune [0 1 2]}
                                                {:bucket-size 4 :ids-to-prune [0 1]}
                                                {:bucket-size 5 :ids-to-prune [0]}
                                                {:bucket-size 6 :ids-to-prune []}
                                                {:bucket-size 7 :ids-to-prune []}]]
      (binding [recent-views/*recent-views-stored-per-user-per-model* bucket-size]
        (testing (str "Bucket size: " bucket-size)
          (is (= ids-to-prune
                 (vec (sort (map #(- % 1337000)
                                 (#'recent-views/ids-to-prune (mt/user->id :rasta))))))))))))
