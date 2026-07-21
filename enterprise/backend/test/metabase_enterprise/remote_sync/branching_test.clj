(ns metabase-enterprise.remote-sync.branching-test
  "Tests for content branching: per-user checkout of git branches with transparent
   copy-on-write remapping on the main API endpoints and the QP."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- count-query
  "Legacy-MBQL count aggregation over `table-kw` — 100 rows for :venues, 75
   for :categories in test-data."
  [table-kw]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
        (lib/aggregate (lib/count))
        lib/->legacy-MBQL)))

(defn- source-card-query
  "Legacy-MBQL passthrough query on `card-id` as a source card."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/card mp card-id))
        lib/->legacy-MBQL)))

(defn- do-on-branch
  "Check out `branch` as :crowberto, run `thunk`, always check back out to main."
  [branch thunk]
  (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch branch})
  (try
    (thunk)
    (finally
      (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch nil}))))

(defmacro ^:private on-branch [branch & body]
  `(do-on-branch ~branch (fn [] ~@body)))

(deftest checkout-test
  (mt/with-premium-features #{:remote-sync}
    (testing "checkout sets the user's branch; nil checks back out to main"
      (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch "alex/poc"})
      (is (= "alex/poc" (t2/select-one-fn :branch :model/User :id (mt/user->id :crowberto))))
      (is (= "alex/poc" (:branch (mt/user-http-request :crowberto :get 200 "ee/remote-sync/checkout"))))
      (is (= "alex/poc" (:branch (mt/user-http-request :crowberto :get 200 "user/current"))))
      (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch nil})
      (is (nil? (t2/select-one-fn :branch :model/User :id (mt/user->id :crowberto)))))))

(deftest card-copy-on-write-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-model-cleanup [:model/Card :model/BranchRemapping]
      (mt/with-temp [:model/Card card {:name "A" :dataset_query (count-query :venues)}]
        (let [card-url (str "card/" (:id card))]
          (on-branch "alex/poc"
                     (testing "PUT on a branch clones the card and presents the clone under the main id"
                       (let [updated (mt/user-http-request :crowberto :put 200 card-url {:name "A (branch)"})]
                         (is (= (:id card) (:id updated)))
                         (is (= "A (branch)" (:name updated)))))
                     (testing "main is untouched"
                       (is (= "A" (t2/select-one-fn :name :model/Card :id (:id card)))))
                     (testing "GET on the branch shows the copy under the main id"
                       (is (= "A (branch)" (:name (mt/user-http-request :crowberto :get 200 card-url)))))
                     (testing "another user on main still sees main"
                       (is (= "A" (:name (mt/user-http-request :rasta :get 200 card-url))))))
          (testing "back on main, everything is main again"
            (is (= "A" (:name (mt/user-http-request :crowberto :get 200 card-url))))))))))

(deftest branch-query-remapping-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-model-cleanup [:model/Card :model/BranchRemapping]
      (mt/with-temp [:model/Card card-a {:name "A" :dataset_query (count-query :venues)}
                     :model/Card card-b {:name "B" :dataset_query (source-card-query (:id card-a))}]
        (let [run-b (fn [user] (-> (mt/user-http-request user :post 202 (format "card/%d/query" (:id card-b)))
                                   mt/rows first first))]
          (testing "baseline: B counts venues through A"
            (is (= 100 (run-b :crowberto))))
          (on-branch "alex/poc"
                     (testing "editing A on the branch changes what B sees there"
                       (mt/user-http-request :crowberto :put 200 (str "card/" (:id card-a))
                                             {:dataset_query (count-query :categories)})
                       (is (= 75 (run-b :crowberto)) "on the branch, B resolves A to its branch copy")
                       (is (= 100 (run-b :rasta)) "on main, B still sees the main A"))
                     (testing "ad-hoc /dataset queries remap on the branch too"
                       (is (= 75 (-> (mt/user-http-request :crowberto :post 202 "dataset"
                                                           (source-card-query (:id card-a)))
                                     mt/rows first first)))))
          (testing "back on main everything is main again"
            (is (= 100 (run-b :crowberto)))))))))

(deftest dashboard-copy-on-write-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-model-cleanup [:model/Dashboard :model/BranchRemapping]
      (mt/with-temp [:model/Card card            {:name "C" :dataset_query (count-query :venues)}
                     :model/Dashboard dash       {:name "D"}
                     :model/DashboardTab tab     {:dashboard_id (:id dash) :name "Tab 1" :position 0}
                     :model/DashboardCard _      {:dashboard_id (:id dash) :card_id (:id card)
                                                  :dashboard_tab_id (:id tab)}]
        (let [dash-url (str "dashboard/" (:id dash))]
          (on-branch "alex/poc"
                     (testing "PUT clones the dashboard with tabs + dashcards, presented under the main id"
                       (let [updated (mt/user-http-request :crowberto :put 200 dash-url {:name "D (branch)"})]
                         (is (= (:id dash) (:id updated)))
                         (is (= "D (branch)" (:name updated)))))
                     (testing "the branch copy has its own dashcards, still pointing at the main card"
                       (let [fetched (mt/user-http-request :crowberto :get 200 dash-url)]
                         (is (= "D (branch)" (:name fetched)))
                         (is (= [(:id card)] (map :card_id (:dashcards fetched))))
                         (is (= ["Tab 1"] (map :name (:tabs fetched))))))
                     (testing "main dashboard is untouched"
                       (is (= "D" (t2/select-one-fn :name :model/Dashboard :id (:id dash))))))
          (testing "back on main"
            (is (= "D" (:name (mt/user-http-request :crowberto :get 200 dash-url))))))))))

(deftest create-and-delete-on-branch-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-model-cleanup [:model/Card :model/BranchRemapping]
      (testing "POST on a branch registers the new entity as branch-owned"
        (on-branch "alex/poc"
                   (let [created (mt/user-http-request :crowberto :post 200 "card"
                                                       {:name                   "born on branch"
                                                        :dataset_query          (count-query :venues)
                                                        :display                "table"
                                                        :visualization_settings {}})]
                     (is (=? {:branch           "alex/poc"
                              :source_entity_id (:id created)
                              :target_entity_id (:id created)}
                             (t2/select-one :model/BranchRemapping :entity_type :card :source_entity_id (:id created))))
                     (testing "DELETE on the branch removes the row and its remapping"
                       (mt/user-http-request :crowberto :delete 204 (str "card/" (:id created)))
                       (is (nil? (t2/select-one :model/Card :id (:id created))))
                       (is (nil? (t2/select-one :model/BranchRemapping :entity_type :card :source_entity_id (:id created))))))))
      (testing "DELETE of a shadowed card on a branch deletes the copy, not main"
        (mt/with-temp [:model/Card card {:name "A" :dataset_query (count-query :venues)}]
          (on-branch "alex/poc"
                     (mt/user-http-request :crowberto :put 200 (str "card/" (:id card)) {:name "A (branch)"})
                     (let [copy-id (t2/select-one-fn :target_entity_id :model/BranchRemapping
                                                     :branch "alex/poc" :entity_type :card :source_entity_id (:id card))]
                       (mt/user-http-request :crowberto :delete 204 (str "card/" (:id card)))
                       (is (nil? (t2/select-one :model/Card :id copy-id)) "branch copy is gone")
                       (is (some? (t2/select-one :model/Card :id (:id card))) "main row survives")
                       (is (nil? (t2/select-one :model/BranchRemapping
                                                :branch "alex/poc" :entity_type :card :source_entity_id (:id card)))
                           "remapping row is cleaned up"))))))))

(deftest measure-and-segment-copy-on-write-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-model-cleanup [:model/Segment :model/BranchRemapping]
      (mt/with-temp [:model/Segment segment {:name       "S"
                                             :table_id   (mt/id :venues)
                                             :definition {:filter [:> [:field (mt/id :venues :price) nil] 2]}}]
        (let [segment-url (str "segment/" (:id segment))]
          (on-branch "alex/poc"
                     (testing "segment PUT clones on the branch"
                       (let [updated (mt/user-http-request :crowberto :put 200 segment-url
                                                           {:name "S (branch)" :revision_message "branch edit"})]
                         (is (= (:id segment) (:id updated)))
                         (is (= "S (branch)" (:name updated)))))
                     (is (= "S" (t2/select-one-fn :name :model/Segment :id (:id segment)))
                         "main segment untouched"))
          (testing "back on main"
            (is (= "S" (:name (mt/user-http-request :crowberto :get 200 segment-url))))))))))
