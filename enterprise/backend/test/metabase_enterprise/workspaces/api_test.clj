(ns metabase-enterprise.workspaces.api-test
  "Tests for workspaces v2: `/api/ee/workspace` CRUD + enter/exit, and the
   transparent remapping of the *normal* API endpoints (cards, /dataset) while a
   user is working inside a workspace."
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

(defn- do-inside-workspace
  "Enter `workspace-id` as :crowberto, run `thunk`, always exit again."
  [workspace-id thunk]
  (mt/user-http-request :crowberto :post 200 (format "ee/workspace/%d/enter" workspace-id))
  (try
    (thunk)
    (finally
      (mt/user-http-request :crowberto :post 200 "ee/workspace/exit"))))

(defmacro ^:private inside-workspace [workspace-id & body]
  `(do-inside-workspace ~workspace-id (fn [] ~@body)))

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

(deftest enter-exit-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Workspace ws {:name (mt/random-name)}]
      (testing "enter sets the user's workspace_id"
        (mt/user-http-request :crowberto :post 200 (format "ee/workspace/%d/enter" (:id ws)))
        (is (= (:id ws) (t2/select-one-fn :workspace_id :model/User :id (mt/user->id :crowberto)))))
      (testing "exit clears it"
        (mt/user-http-request :crowberto :post 200 "ee/workspace/exit")
        (is (nil? (t2/select-one-fn :workspace_id :model/User :id (mt/user->id :crowberto)))))
      (testing "entering a nonexistent workspace 404s"
        (mt/user-http-request :crowberto :post 404 "ee/workspace/999999999/enter")))))

(deftest card-copy-on-write-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Workspace ws {:name (mt/random-name)}
                     :model/Card card-a  {:name          "A"
                                          :dataset_query (count-query :venues)}]
        (let [card-url (str "card/" (:id card-a))]
          (inside-workspace (:id ws)
                            (testing "PUT inside a workspace clones the card and presents the clone under the source id"
                              (let [updated (mt/user-http-request :crowberto :put 200 card-url {:name "A (workspace)"})]
                                (is (= (:id card-a) (:id updated)))
                                (is (not= (:id card-a) (:workspace_target_id updated)))
                                (is (= "A (workspace)" (:name updated)))))
                            (testing "the production card is untouched"
                              (is (= "A" (t2/select-one-fn :name :model/Card :id (:id card-a)))))
                            (testing "GET inside the workspace shows the copy under the source id"
                              (let [fetched (mt/user-http-request :crowberto :get 200 card-url)]
                                (is (= (:id card-a) (:id fetched)))
                                (is (= "A (workspace)" (:name fetched)))))
                            (testing "another user outside the workspace still sees production"
                              (is (= "A" (:name (mt/user-http-request :rasta :get 200 card-url))))))
          (testing "after exiting, the same user sees production again"
            (is (= "A" (:name (mt/user-http-request :crowberto :get 200 card-url))))
            (testing "and PUT hits production directly"
              (mt/user-http-request :crowberto :put 200 card-url {:name "A v2"})
              (is (= "A v2" (t2/select-one-fn :name :model/Card :id (:id card-a)))))))))))

(deftest transparent-query-remapping-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Workspace ws {:name (mt/random-name)}
                     :model/Card card-a  {:name          "A"
                                          :dataset_query (count-query :venues)}
                     :model/Card card-b  {:name          "B"
                                          :dataset_query (source-card-query (:id card-a))}]
        (let [b-query-url (format "card/%d/query" (:id card-b))
              run-b       (fn [user] (-> (mt/user-http-request user :post 202 b-query-url)
                                         mt/rows first first))]
          (testing "baseline: B counts venues through A"
            (is (= 100 (run-b :crowberto))))
          (inside-workspace (:id ws)
                            (testing "editing A inside the workspace changes what B sees there"
                              (mt/user-http-request :crowberto :put 200 (str "card/" (:id card-a))
                                                    {:dataset_query (count-query :categories)})
                              (is (= 75 (run-b :crowberto))
                                  "in-workspace user: B resolves A to its workspace copy")
                              (is (= 100 (run-b :rasta))
                                  "user outside the workspace still sees production A"))
                            (testing "ad-hoc /dataset queries remap for the in-workspace user too"
                              (is (= 75 (-> (mt/user-http-request :crowberto :post 202 "dataset"
                                                                  (source-card-query (:id card-a)))
                                            mt/rows first first)))))
          (testing "after exiting the workspace everything is production again"
            (is (= 100 (run-b :crowberto)))))))))
