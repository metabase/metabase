(ns metabase-enterprise.remote-sync.branching-test
  "Tests for content branching: `branch` column on branchable entities, per-user
   checkout, serdes-round-trip branch materialization, and branch-scoped
   visibility."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each test-helpers/clean-remote-sync-state)

(defmacro ^:private with-branch-sync-setup
  "Remote-sync settings pointing at a mock source whose branch list includes
   \"develop\", so checkout validation passes."
  [& body]
  `(mt/with-temporary-setting-values [~'remote-sync-url    "https://github.com/test/repo.git"
                                      ~'remote-sync-token  "test-token"
                                      ~'remote-sync-branch "main"
                                      ~'remote-sync-type   "read-write"]
     (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly (test-helpers/create-mock-source))]
       ~@body)))

(deftest checkout-materializes-branch-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-model-cleanup [:model/Card :model/Collection]
      (mt/with-temp [:model/Collection coll {:name "Synced" :is_remote_synced true :location "/" :branch "main"}
                     :model/Card card      {:name          "A"
                                            :collection_id (:id coll)
                                            :branch        "main"
                                            :dataset_query (mt/mbql-query venues)}]
        (with-branch-sync-setup
          (try
            (testing "checkout of an empty branch materializes it via a serdes round-trip"
              (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch "develop"})
              (is (= "develop" (t2/select-one-fn :branch :model/User :id (mt/user->id :crowberto))))
              (let [branch-card (t2/select-one :model/Card :entity_id (:entity_id card) :branch "develop")]
                (is (some? branch-card) "the branch has its own row for the same entity_id")
                (is (not= (:id card) (:id branch-card)) "with its own numeric id")
                (is (= "A" (:name branch-card)))
                (testing "the branch row is visible by id on the branch; the main row is not"
                  (is (= "A" (:name (mt/user-http-request :crowberto :get 200 (str "card/" (:id branch-card))))))
                  (mt/user-http-request :crowberto :get 404 (str "card/" (:id card))))
                (testing "editing the branch row leaves main untouched"
                  (mt/user-http-request :crowberto :put 200 (str "card/" (:id branch-card))
                                        {:name "A (develop)"})
                  (is (= "A (develop)" (t2/select-one-fn :name :model/Card :id (:id branch-card))))
                  (is (= "A" (t2/select-one-fn :name :model/Card :id (:id card)))))
                (testing "back on main, the branch row is invisible and main is unchanged"
                  (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch nil})
                  (is (= "A" (:name (mt/user-http-request :crowberto :get 200 (str "card/" (:id card))))))
                  (mt/user-http-request :crowberto :get 404 (str "card/" (:id branch-card))))))
            (finally
              (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch nil}))))))))

(deftest re-checkout-does-not-rematerialize-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-model-cleanup [:model/Card :model/Collection]
      (mt/with-temp [:model/Collection coll {:name "Synced" :is_remote_synced true :location "/" :branch "main"}
                     :model/Card card      {:name          "A"
                                            :collection_id (:id coll)
                                            :branch        "main"
                                            :dataset_query (mt/mbql-query venues)}]
        (with-branch-sync-setup
          (try
            (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch "develop"})
            (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch nil})
            (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch "develop"})
            (is (= 1 (t2/count :model/Card :entity_id (:entity_id card) :branch "develop"))
                "a second checkout reuses the existing branch rows")
            (finally
              (mt/user-http-request :crowberto :post 200 "ee/remote-sync/checkout" {:branch nil}))))))))
