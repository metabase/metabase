(ns metabase-enterprise.workspaces.api-test
  "Tests for the workspaces v2 `/api/ee/workspace` API: workspace CRUD, card
   copy-on-write, and query execution with entity remapping."
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

(deftest workspace-crud-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                     {:name (mt/random-name)})]
        (testing "create + get"
          (is (pos-int? (:id ws)))
          (is (= (:id ws) (:id (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" (:id ws)))))))
        (testing "list"
          (is (some #(= (:id ws) (:id %))
                    (mt/user-http-request :crowberto :get 200 "ee/workspace"))))
        (testing "update"
          (is (= "renamed" (:name (mt/user-http-request :crowberto :put 200 (str "ee/workspace/" (:id ws))
                                                        {:name "renamed"})))))
        (testing "non-admins are refused"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "ee/workspace"))))
        (testing "delete"
          (mt/user-http-request :crowberto :delete 204 (str "ee/workspace/" (:id ws)))
          (is (nil? (t2/select-one :model/Workspace :id (:id ws)))))))))

(deftest card-copy-on-write-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Workspace ws   {:name (mt/random-name)}
                     :model/Card card-a    {:name          "A"
                                            :dataset_query (count-query :venues)}]
        (let [ws-url #(format "ee/workspace/%d/card/%d" (:id ws) (:id card-a))]
          (testing "GET with no shadow returns the production card under its own id"
            (let [fetched (mt/user-http-request :crowberto :get 200 (ws-url))]
              (is (= (:id card-a) (:id fetched)))
              (is (= (:id card-a) (:workspace_target_id fetched)))))
          (testing "PUT clones the card (copy-on-write) and presents the clone under the source id"
            (let [updated (mt/user-http-request :crowberto :put 200 (ws-url)
                                                {:name "A (workspace)"})]
              (is (= (:id card-a) (:id updated)))
              (is (not= (:id card-a) (:workspace_target_id updated)))
              (is (= "A (workspace)" (:name updated)))))
          (testing "the production card is untouched"
            (is (= "A" (t2/select-one-fn :name :model/Card :id (:id card-a)))))
          (testing "the workspace card listing shows the shadow under the source id"
            (let [[card :as cards] (mt/user-http-request :crowberto :get 200
                                                         (format "ee/workspace/%d/card" (:id ws)))]
              (is (= 1 (count cards)))
              (is (= (:id card-a) (:id card)))
              (is (= "A (workspace)" (:name card)))))
          (testing "DELETE drops the shadow, GET falls back to the production card"
            (let [clone-id (:workspace_target_id (mt/user-http-request :crowberto :get 200 (ws-url)))]
              (mt/user-http-request :crowberto :delete 204 (ws-url))
              (is (nil? (t2/select-one :model/Card :id clone-id)))
              (is (= "A" (:name (mt/user-http-request :crowberto :get 200 (ws-url)))))))
          (testing "DELETE without a shadow 404s — production cards are untouchable"
            (mt/user-http-request :crowberto :delete 404 (ws-url))))))))

(deftest workspace-query-remapping-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Workspace ws {:name (mt/random-name)}
                     :model/Card card-a  {:name          "A"
                                          :dataset_query (count-query :venues)}
                     :model/Card card-b  {:name          "B"
                                          :dataset_query (source-card-query (:id card-a))}]
        (let [ws-id     (:id ws)
              run-b     (fn [url] (-> (mt/user-http-request :crowberto :post 202 url)
                                      mt/rows first first))]
          (testing "baseline: B counts venues through A"
            (is (= 100 (run-b (format "card/%d/query" (:id card-b)))))
            (is (= 100 (run-b (format "ee/workspace/%d/card/%d/query" ws-id (:id card-b))))))
          (testing "shadowing A inside the workspace changes what B sees there"
            (mt/user-http-request :crowberto :put 200 (format "ee/workspace/%d/card/%d" ws-id (:id card-a))
                                  {:dataset_query (count-query :categories)})
            (is (= 75 (run-b (format "ee/workspace/%d/card/%d/query" ws-id (:id card-b))))
                "inside the workspace, B resolves A to its shadow")
            (is (= 100 (run-b (format "card/%d/query" (:id card-b))))
                "outside the workspace, B still sees the production A"))
          (testing "ad-hoc queries via /dataset run in the workspace context too"
            (is (= 75 (-> (mt/user-http-request :crowberto :post 202
                                                (format "ee/workspace/%d/dataset" ws-id)
                                                (source-card-query (:id card-a)))
                          mt/rows first first)))
            (is (= 100 (-> (mt/user-http-request :crowberto :post 202 "dataset"
                                                 (source-card-query (:id card-a)))
                           mt/rows first first))))
          (testing "dropping the shadow restores the production behavior in the workspace"
            (mt/user-http-request :crowberto :delete 204 (format "ee/workspace/%d/card/%d" ws-id (:id card-a)))
            (is (= 100 (run-b (format "ee/workspace/%d/card/%d/query" ws-id (:id card-b)))))))))))
