(ns metabase.models.recent-views-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.collection :as collection]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.interface :as mi]
   [metabase.models.recent-views :as recent-views]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- clear-test-user-recent-views
  []
  (log/infof "Clearing %s's recent views" (pr-str :rasta))
  (t2/delete! :model/RecentViews :user_id (mt/user->id :rasta)))

(use-fixtures
  :each (fn [f]
          (clear-test-user-recent-views)
          (f)))

(defn fixup [list-item]
  (-> list-item
      (update :parent_collection #(into {} %))
      (update :timestamp type)))

(defn recent-views
  ([user-id] (recent-views user-id [:views]))
  ([user-id context] (:recents (recent-views/get-recents user-id context))))

(deftest simple-get-list-card-test
  (mt/with-temp
    [:model/Collection {coll-id :id} {:name "my coll"}
     :model/Card       {card-id         :id} {:type "question" :name "name" :display "display" :collection_id coll-id}]
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id :view)
    (is (= [{:description nil,
             :can_write true,
             :name "name",
             :parent_collection {:id coll-id, :name "my coll", :authority_level nil}
             :moderated_status nil,
             :id card-id,
             :display "display",
             :timestamp String
             :model :card}]
           (mt/with-test-user :rasta
             (mapv fixup
                   (recent-views (mt/user->id :rasta))))))))

(deftest simple-get-list-dataset-test
  (mt/with-temp
    [:model/Collection {coll-id :id} {:name "my coll"}
     :model/Card       {card-id         :id} {:type "model" :name "name" :display "display" :collection_id coll-id}]
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id :view)
    (is (= [{:description nil,
             :can_write true,
             :name "name",
             :parent_collection {:id coll-id, :name "my coll", :authority_level nil}
             :moderated_status nil,
             :id card-id,
             :timestamp String
             :model :dataset}]
           (mt/with-test-user :rasta
             (mapv fixup
                   (recent-views (mt/user->id :rasta))))))))

(deftest simple-get-list-dashboard-test
  (mt/with-temp
    [:model/Collection {coll-id :id} {:name "my coll"}
     :model/Dashboard {dash-id         :id} {:name "name" :collection_id coll-id}]
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id :view)
    (is (= [{:description nil,
             :can_write true,
             :name "name",
             :parent_collection {:id coll-id, :name "my coll", :authority_level nil}
             :id dash-id,
             :timestamp String
             :model :dashboard}]
           (mt/with-test-user :rasta
             (mapv fixup
                   (recent-views (mt/user->id :rasta))))))))

(defn- ->location
  "Helper to turn some strings into a collection location path:"
  [& parents]
  (str/join "/" (concat [""] parents [""])))

(deftest simple-get-list-collection-test
  (mt/with-temp
    [:model/Collection {coll-id :id} {:name "parent coll"}
     :model/Collection {my-coll-id :id} {:name "name" :location (->location coll-id)}]
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Collection my-coll-id :view)
    (is (= [{:description nil
             :can_write true
             :name "name"
             :effective_location (->location coll-id)
             :parent_collection {:id coll-id, :name "parent coll", :authority_level nil}
             :id my-coll-id
             :timestamp String
             :authority_level nil
             :model :collection}]
           (mt/with-test-user :rasta
             (mapv fixup
                   (recent-views (mt/user->id :rasta))))))))

(deftest nested-collections-get-list-collection-test
  (mt/with-temp
    [:model/Collection {coll-id-a :id} {:name "great grandparent coll"}
     :model/Collection {coll-id-b :id} {:name "grandparent coll" :location (->location coll-id-a)}
     :model/Collection {coll-id-c :id} {:name "parent coll" :location (->location coll-id-a coll-id-b) :authority_level :official}
     :model/Collection {coll-id-d :id} {:name "record scratch, yep that's me coll" :location (->location coll-id-a coll-id-b coll-id-c)}]
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Collection coll-id-d :view)
    (is (= [{:id coll-id-d
             :description nil
             :can_write true
             :name "record scratch, yep that's me coll"
             :effective_location (->location coll-id-a coll-id-b coll-id-c)
             :parent_collection {:id coll-id-c, :name "parent coll", :authority_level :official}
             :timestamp String
             :authority_level nil
             :model :collection}]
           (mt/with-test-user :rasta
             (mapv fixup
                   (recent-views (mt/user->id :rasta))))))))

(deftest simple-get-list-table-test
  (mt/with-temp
    [:model/Database {db-id :id} {:name "test-data"}
     :model/Table {table-id :id} {:name "name" :db_id db-id}]
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Table table-id :view)
    (doseq [[read? write? expected] [[false true []]
                                     [false false []]
                                     [true false [{:description nil,
                                                   :can_write false,
                                                   :name "name",
                                                   :parent_collection {},
                                                   :id table-id,
                                                   :database {:id db-id, :name "test-data", :initial_sync_status "incomplete"},
                                                   :timestamp String,
                                                   :display_name "Name",
                                                   :model :table}]]
                                     [true true [{:description nil,
                                                  :can_write true,
                                                  :name "name",
                                                  :parent_collection {},
                                                  :id table-id,
                                                  :database {:id db-id, :name "test-data", :initial_sync_status "incomplete"},
                                                  :timestamp String,
                                                  :display_name "Name",
                                                  :model :table}]]]]
      (with-redefs [mi/can-read? (constantly read?)
                    mi/can-write? (constantly write?)]
        (is (= expected
               (mapv fixup
                     (mt/with-test-user :rasta
                       (recent-views (mt/user->id :rasta))))))))))


(deftest update-users-recent-views!-duplicates-test
  (testing "`update-users-recent-views!` prunes duplicates of a certain model.`"
    (mt/with-temp [:model/Card {card-id :id} {:type "question"}]
      ;; twenty five views
      (dotimes [_ 25] (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id :view))
      (is (= 0 (count (filter (comp #{:dataset} :model) (mt/with-test-user :rasta
                                                          (recent-views (mt/user->id :rasta)))))))
      (is (= 1 (count (filter (comp #{:card} :model)    (mt/with-test-user :rasta
                                                          (recent-views (mt/user->id :rasta))))))))))

(deftest recent-views-content-test
  (binding [recent-views/*recent-views-stored-per-user-per-model* 2]
    (testing "`update-users-recent-views!` prunes duplicates of all models.`"
      (mt/with-full-data-perms-for-all-users!
        (mt/with-temp
          [:model/Collection {parent-coll-id :id} {:name "parent"}
           :model/Card       {card-id :id} {:type "question" :name "my card" :description "this is my card" :collection_id parent-coll-id}
           :model/Card       {model-id :id} {:type "model" :name "my model" :description "this is my model" :collection_id parent-coll-id}

           :model/Dashboard  {dashboard-id :id} {:name "my dash" :description "this is my dash" :collection_id parent-coll-id}

           :model/Collection {collection-id :id} {:name "my collection" :description "this is my collection" :location (->location parent-coll-id)}

           :model/Database   {db-id :id} {:name "My DB"} ;; just needed for these temp tables
           :model/Table      {table-id :id} {:name "tablet" :display_name "I am the table" :db_id db-id, :is_upload true}]
          (doseq [[model model-id] [[:model/Card card-id]
                                    [:model/Card model-id]
                                    [:model/Dashboard dashboard-id]
                                    [:model/Collection collection-id]
                                    [:model/Table table-id]]]
            (recent-views/update-users-recent-views! (mt/user->id :rasta) model model-id :view))
          (is (= [{:id "ID",
                   :name "tablet",
                   :description nil,
                   :model :table,
                   :display_name "I am the table",
                   :can_write true,
                   :database {:id db-id, :name "My DB", :initial_sync_status "incomplete"}}
                  {:id "ID",
                   :name "my collection",
                   :description "this is my collection",
                   :effective_location (->location parent-coll-id)
                   :model :collection,
                   :can_write true,
                   :authority_level nil,
                   :parent_collection {:id "ID", :name "parent", :authority_level nil}}
                  {:id "ID",
                   :name "my dash",
                   :description "this is my dash",
                   :model :dashboard,
                   :can_write true,
                   :parent_collection {:id "ID", :name "parent", :authority_level nil}}
                  {:id "ID",
                   :name "my model",
                   :description "this is my model",
                   :model :dataset,
                   :can_write true,
                   :moderated_status nil,
                   :parent_collection {:id "ID", :name "parent", :authority_level nil}}
                  {:description "this is my card",
                   :can_write true,
                   :name "my card",
                   :parent_collection {:id "ID", :name "parent", :authority_level nil},
                   :moderated_status nil,
                   :id "ID",
                   :display "table",
                   :model :card}]
                 (mt/with-test-user :rasta
                   (with-redefs [mi/can-read? (constantly true)
                                 mi/can-write? (fn ([id] (not= id table-id))
                                                 ([_ _] true))]
                     (->> (recent-views (mt/user->id :rasta))
                          (mapv (fn [rv] (cond-> rv
                                           true                                       (assoc :id "ID")
                                           true                                       (dissoc :timestamp)
                                           (-> rv :database :id)                      (assoc-in [:database :id] db-id)
                                           (some-> rv :parent_collection)             (update :parent_collection #(into {} %))
                                           (some-> rv :parent_collection :id number?) (assoc-in [:parent_collection :id] "ID")))))))))
          "After inserting 2 views of each model, we should have 2 views PER each model.")))))

(deftest most-recent-dashboard-view-test
  (testing "The most recent dashboard view is never pruned"
    (binding [recent-views/*recent-views-stored-per-user-per-model* 1]
      (mt/with-temp
        [:model/Dashboard  {dashboard-id    :id} {}

         :model/Card       {card-id         :id} {:type "question"}
         :model/Card       {card-id-2       :id} {:type "question"}
         :model/Card       {card-id-3       :id} {:type "question"}
         :model/Card       {model-id        :id} {:type "model"}
         :model/Card       {model-id-2      :id} {:type "model"}
         :model/Card       {model-id-3      :id} {:type "model"}
         :model/Collection {collection-id   :id} {}
         :model/Collection {collection-id-2 :id} {}
         :model/Collection {collection-id-3 :id} {}
         :model/Database   {db-id           :id} {} ;; just needed for these temp tables
         :model/Table      {table-id        :id} {:db_id db-id, :is_upload true}
         :model/Table      {table-id-2      :id} {:db_id db-id, :is_upload true}
         :model/Table      {table-id-3      :id} {:db_id db-id, :is_upload true}]
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dashboard-id :view)
        (doseq [[model model-ids] [[:model/Card       [card-id card-id-2 card-id-3]]
                                   [:model/Card       [model-id model-id-2 model-id-3]]
                                   [:model/Collection [collection-id collection-id-2 collection-id-3]]
                                   [:model/Table      [table-id table-id-2 table-id-3]]]]
          (doseq [model-id model-ids]
            (recent-views/update-users-recent-views! (mt/user->id :rasta) model model-id :view)
            (is (= [dashboard-id]
                   (keep #(when ((comp #{:dashboard} :model) %) (:id %))
                         (mt/with-test-user :rasta
                           (recent-views (mt/user->id :rasta))))))))))))

(deftest user-recent-views-dedupe-test
  (testing "The `user-recent-views` table should dedupe views of the same model"
    (t2.with-temp/with-temp [:model/Card      {model-id     :id} {:type "model"}
                             :model/Card      {model-id-2   :id} {:type "model"}
                             :model/Dashboard {dashboard-id :id} {}]
      ;; insert 6
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card model-id :view)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card model-id :view)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card model-id-2 :view)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card model-id-2 :view)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dashboard-id :view)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dashboard-id :view)
      ;; can't read? can't see:
      (is (= 0 (count (recent-views (mt/user->id :rasta)))))

      (is (= 3 (count
                (mt/with-test-user :rasta
                  (recent-views (mt/user->id :rasta)))))))))

(deftest most-recently-viewed-dashboard-id-test
  (testing "`most-recently-viewed-dashboard-id` returns the ID of the most recently viewed dashboard in the last 24 hours"
    (t2.with-temp/with-temp [:model/Dashboard {dash-id :id} {}
                             :model/Dashboard {dash-id-2 :id} {}
                             :model/Dashboard {dash-id-3 :id} {}]

      (is (nil? (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta))))

      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id :view)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id :view)
      (is (= dash-id (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta))))

      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id :view)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id-2 :view)
      (is (= dash-id-2 (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta))))

      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id :view)
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id-3 :view)
      (is (= dash-id-3 (recent-views/most-recently-viewed-dashboard-id (mt/user->id :rasta)))))))

(deftest id-pruning-test
  (mt/with-temp [:model/Database a-db     {}
                 :model/Table a-table     {:db_id (:id a-db)}
                 :model/Collection a-coll {}
                 :model/Card a-card       {:type "question" :table_id (mt/id :reviews)}
                 :model/Card a-model      {:type "model"    :table_id (mt/id :reviews)}
                 :model/Dashboard a-dash  {}

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
    (let [query-result (mt/with-test-user :rasta (recent-views (mt/user->id :rasta)))]
      (is (apply t/after? (map (comp t/zoned-date-time :timestamp) query-result))
          "recent-views/get-list should be in chronological order, newest first:"))
    (let [ids-to-prune (#'recent-views/duplicate-model-ids (mt/user->id :rasta) :view)]
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
                 :model/RecentViews _ {:id 1337000 :user_id (mt/user->id :rasta), :model "card", :model_id (:id a-card), :context "view", :timestamp #t "2000-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337001 :user_id (mt/user->id :rasta), :model "card", :model_id (:id b-card), :context "view", :timestamp #t "2001-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337002 :user_id (mt/user->id :rasta), :model "card", :model_id (:id c-card), :context "view", :timestamp #t "2002-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337003 :user_id (mt/user->id :rasta), :model "card", :model_id (:id d-card), :context "view", :timestamp #t "2003-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337004 :user_id (mt/user->id :rasta), :model "card", :model_id (:id e-card), :context "view", :timestamp #t "2004-10-01T00:00Z"}
                 :model/RecentViews _ {:id 1337005 :user_id (mt/user->id :rasta), :model "card", :model_id (:id f-card), :context "view", :timestamp #t "2005-10-01T00:00Z"}]
    (doseq [{:keys [ids-to-prune bucket-size]} [{:ids-to-prune [0 1 2 3 4 5] :bucket-size 0} ;; delete them all!
                                                {:ids-to-prune [0 1 2 3 4]   :bucket-size 1}
                                                {:ids-to-prune [0 1 2 3]     :bucket-size 2}
                                                {:ids-to-prune [0 1 2]       :bucket-size 3}
                                                {:ids-to-prune [0 1]         :bucket-size 4}
                                                {:ids-to-prune [0]           :bucket-size 5}
                                                {:ids-to-prune []            :bucket-size 6}
                                                {:ids-to-prune []            :bucket-size 7}]]
      (binding [recent-views/*recent-views-stored-per-user-per-model* bucket-size]
        (testing (str "Bucket size: " bucket-size)
          (is (= ids-to-prune
                 (vec (sort (map #(- % 1337000)
                                 (#'recent-views/overflowing-model-buckets (mt/user->id :rasta) :view)))))))))))

(deftest recent-views-for-non-existent-entity-test
  (testing "If a user views a model that doesn't exist, it should not be added to recent views"
    (mt/with-temp [:model/Database   a-db          {}
                   :model/Table      _             {:db_id (:id a-db)}
                   :model/Collection _             {}
                   :model/Dashboard  _             {}
                   :model/Card       {card-id :id} {:type "question"}]
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id :view)
      (let [before-ghosts (recent-views (mt/user->id :rasta))
            missing-card-id (inc (apply max (t2/select-pks-vec :model/Card)))
            missing-dashboard-id (inc (apply max (t2/select-pks-vec :model/Dashboard)))
            missing-collection-id (inc (apply max (t2/select-pks-vec :model/Collection)))
            missing-table-id (inc (apply max (t2/select-pks-vec :model/Table)))]
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card missing-card-id :view)
        (is (= before-ghosts (recent-views (mt/user->id :rasta)))
            "If a user views a model that doesn't exist, it should not be added to recent views")
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard missing-dashboard-id :view)
        (is (= before-ghosts (recent-views (mt/user->id :rasta)))
            "If a user views a model that doesn't exist, it should not be added to recent views")
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Collection missing-collection-id :view)
        (is (= before-ghosts (recent-views (mt/user->id :rasta)))
            "If a user views a model that doesn't exist, it should not be added to recent views")
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Table missing-table-id :view)
        (is (= before-ghosts (recent-views (mt/user->id :rasta)))
            "If a user views a model that doesn't exist, it should not be added to recent views")))))

(deftest update-users-recent-views!-bucket-filling-test
  (binding [recent-views/*recent-views-stored-per-user-per-model* 2]
    (testing "`update-users-recent-views!` prunes duplicates of all models.`"
      (mt/with-temp
        [:model/Card       {card-id         :id} {:type "question"}
         :model/Card       {card-id-2       :id} {:type "question"}
         :model/Card       {card-id-3       :id} {:type "question"}

         :model/Card       {model-id        :id} {:type "model"}
         :model/Card       {model-id-2      :id} {:type "model"}
         :model/Card       {model-id-3      :id} {:type "model"}

         :model/Dashboard  {dashboard-id    :id} {}
         :model/Dashboard  {dashboard-id-2  :id} {}
         :model/Dashboard  {dashboard-id-3  :id} {}

         :model/Collection {collection-id   :id} {}
         :model/Collection {collection-id-2 :id} {}
         :model/Collection {collection-id-3 :id} {}

         :model/Database   {db-id           :id} {} ;; just needed for these temp tables
         :model/Table      {table-id        :id} {:db_id db-id, :is_upload true}
         :model/Table      {table-id-2      :id} {:db_id db-id, :is_upload true}
         :model/Table      {table-id-3      :id} {:db_id db-id, :is_upload true}]
        (doseq [[model out-model model-ids] [[:model/Card :card [card-id card-id-2 card-id-3]]
                                             [:model/Card :dataset [model-id model-id-2 model-id-3]]
                                             [:model/Dashboard :dashboard [dashboard-id dashboard-id-2 dashboard-id-3]]
                                             [:model/Collection :collection [collection-id collection-id-2 collection-id-3]]
                                             [:model/Table :table [table-id table-id-2 table-id-3]]]]
          (doseq [model-id model-ids]
            (recent-views/update-users-recent-views! (mt/user->id :rasta) model model-id :view))
          (testing (format "When user views %s %ss, the latest %s per model are kept. "
                           (count model-ids) model recent-views/*recent-views-stored-per-user-per-model*)
            (is (= 2 (count (filter (comp #{out-model} :model)
                                    (mt/with-test-user :rasta
                                      (with-redefs [data-perms/user-has-permission-for-table? (constantly true)]
                                        (recent-views (mt/user->id :rasta))))))))))
        (is
         (= {:card recent-views/*recent-views-stored-per-user-per-model*,
             :dataset recent-views/*recent-views-stored-per-user-per-model*,
             :dashboard recent-views/*recent-views-stored-per-user-per-model*,
             :collection recent-views/*recent-views-stored-per-user-per-model*,
             :table recent-views/*recent-views-stored-per-user-per-model*}
            (frequencies (map :model
                              (mt/with-test-user :rasta
                                (with-redefs [data-perms/user-has-permission-for-table? (constantly true)]
                                  (recent-views (mt/user->id :rasta)))))))
         "After inserting 3 views of each model, we should have 2 views PER each model.")))))

(deftest table-per-user-size-shrinks-or-grows-test
  (binding [recent-views/*recent-views-stored-per-user-per-model* 30]
    (testing "`update-users-recent-views!` prunes duplicates of all models.`"
      (mt/with-temp
        [:model/Card       {card-id         :id} {:type "question"}
         :model/Card       {card-id-2       :id} {:type "question"}
         :model/Card       {card-id-3       :id} {:type "question"}
         :model/Card       {card-id-4       :id} {:type "question"}

         :model/Card       {model-id        :id} {:type "model"}
         :model/Card       {model-id-2      :id} {:type "model"}
         :model/Card       {model-id-3      :id} {:type "model"}

         :model/Dashboard  {dashboard-id    :id} {}
         :model/Dashboard  {dashboard-id-2  :id} {}
         :model/Dashboard  {dashboard-id-3  :id} {}

         :model/Collection {collection-id   :id} {}
         :model/Collection {collection-id-2 :id} {}
         :model/Collection {collection-id-3 :id} {}

         :model/Database   {db-id           :id} {} ;; just needed for these temp tables
         :model/Table      {table-id        :id} {:db_id db-id, :active true}
         :model/Table      {table-id-2      :id} {:db_id db-id, :active true}
         :model/Table      {table-id-3      :id} {:db_id db-id, :active false}]
        (doseq [[model model-ids] [[:model/Card       [card-id card-id-2 card-id-3]]
                                   [:model/Card       [model-id model-id-2 model-id-3]]
                                   [:model/Dashboard  [dashboard-id dashboard-id-2 dashboard-id-3]]
                                   [:model/Collection [collection-id collection-id-2 collection-id-3]]
                                   [:model/Table      [table-id table-id-2 table-id-3]]]]

          (doseq [model-id model-ids]
            (recent-views/update-users-recent-views! (mt/user->id :rasta) model model-id :view)))
        (with-redefs [mi/can-read?                              (constantly true)
                      data-perms/user-has-permission-for-table? (constantly true)]
          (let [freqs (frequencies (map :model
                                        (with-redefs [data-perms/user-has-permission-for-table? (constantly true)]
                                          (mt/with-test-user :rasta (recent-views (mt/user->id :rasta))))))]
            (is (= 3 (:card freqs)))
            (is (= 3 (:dataset freqs)))
            (is (= 3 (:dashboard freqs)))
            (is (= 3 (:collection freqs)))
            (is (= 2 (:table freqs))))
          (binding [recent-views/*recent-views-stored-per-user-per-model* 2]
            (is (= 5
                   (count (set (recent-views/ids-to-prune (mt/user->id :rasta) :view)))))
            (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id-4 :view)
            (is (= {:card 2, :dataset 2, :dashboard 2, :collection 2, :table 1}
                   ;; The table with :active false should be pruned, but also won't be returned, hence 1 for table.
                   (frequencies (map :model
                                     (mt/with-test-user :rasta
                                       (recent-views (mt/user->id :rasta)))))))))))))

(deftest dedupe-context-test
  (mt/with-temp
    [:model/Card       {card-id         :id} {:type "question"}
     :model/Card       {card-id-2         :id} {:type "question"}]
    (doseq [ctx [:view :selection]]
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id ctx))
    (is (= 1 (count
              (mt/with-test-user :rasta
                (:recents (recent-views/get-recents (mt/user->id :rasta) [:selections :views]))))))
    (doseq [ctx [:view :selection]]
      (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id-2 ctx))
    (is (= 2 (count
              (mt/with-test-user :rasta
                (:recents (recent-views/get-recents (mt/user->id :rasta) [:selections :views]))))))))

(deftest special-collections-are-treated-specially
  (mt/with-temp
    [:model/Collection {instance-analytics-id :id} {:type collection/instance-analytics-collection-type}
     :model/Collection {with-ns-id :id} {:namespace "fluffy"}
     :model/Collection {normal-id :id} {}]
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Collection normal-id :view)
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Collection with-ns-id :view)
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Collection (collection/trash-collection-id) :view)
    (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Collection instance-analytics-id :view)
    (testing "sanity check: all models are in the recent views table"
      (is (= #{instance-analytics-id
               (collection/trash-collection-id)
               with-ns-id
               normal-id}
             (t2/select-fn-set :model_id :model/RecentViews :model "collection" :user_id (mt/user->id :rasta) :context "view"))))
    (testing "only the instance analytics gets included"
      (is (= [{:id instance-analytics-id}
              {:id normal-id}]
             (map #(select-keys % [:id])
                  (mt/with-test-user :rasta
                    (recent-views (mt/user->id :rasta)))))))
    (testing "for selections, instance analytics is excluded"
      (is (= [{:id normal-id}]
             (map #(select-keys % [:id])
                  (mt/with-test-user :rasta
                    (recent-views (mt/user->id :rasta) [:selections :views]))))))))
