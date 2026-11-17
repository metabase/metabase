(ns metabase-enterprise.data-testing.action-remote-sync-test
  "Remote sync of action tests: an action test syncs exactly when its action does."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- synced-action-test-ids
  "The ids of the action tests whose documents a push would commit."
  []
  (into #{}
        (keep (fn [{[model id] :row}] (when (= :model/ActionTest model) id)))
        (vals (content/local-documents))))

(deftest action-tests-follow-their-actions-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                   :model/Collection unsynced {:name "Unsynced" :location "/"}]
      (mt/with-actions [_                       {:type :model :dataset_query (data-testing.test-util/categories-query)
                                                 :collection_id (:id synced)}
                        {synced-action :action-id}   {}
                        {archived-action :action-id} {:archived true}]
        (mt/with-actions [_                         {:type :model :dataset_query (data-testing.test-util/categories-query)
                                                     :collection_id (:id unsynced)}
                          {unsynced-action :action-id} {}]
          (mt/with-temp [:model/ActionTest t-synced   {:action_id synced-action}
                         :model/ActionTest t-unsynced {:action_id unsynced-action}
                         :model/ActionTest t-archived {:action_id archived-action}]
            (let [synced-ids (synced-action-test-ids)]
              (testing "a test of an action in a synced collection is synced"
                (is (contains? synced-ids (:id t-synced))))
              (testing "a test of an action in an unsynced collection is not synced"
                (is (not (contains? synced-ids (:id t-unsynced)))))
              (testing "a test of an archived action is not synced"
                (is (not (contains? synced-ids (:id t-archived))))))))))))

(deftest push-writes-action-tests-next-to-their-actions-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}]
        (mt/with-actions [_                   {:type :model :dataset_query (data-testing.test-util/categories-query)
                                               :collection_id (:id synced)}
                          {:keys [action-id]} {:name "Refund"}]
          (mt/with-temp [:model/ActionTest t {:action_id action-id :name "Refunds one order" :parameters {"id" 1}}]
            (is (=? {:status :success} (remote-sync.tu/push! url nil)))
            (testing "a test of a synced action is in the action's directory, under its own name"
              (is (= (str (str/replace (remote-sync.tu/entity-path! url "main" (t2/select-one :model/Action :id action-id))
                                       #"\.yaml$" "")
                          "/refunds_one_order.yaml")
                     (remote-sync.tu/entity-path! url "main" t))))))))))

(deftest dirty-list-shows-action-tests-under-their-actions-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}]
          (mt/with-actions [{model-id :id}      {:type :model :dataset_query (data-testing.test-util/categories-query)
                                                 :name "Synced model" :collection_id (:id synced)}
                            {:keys [action-id]} {:name "Refund"}]
            (mt/with-temp [:model/ActionTest t {:action_id action-id :name "Edited test"}]
              (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                            {:branch "main" :message "Push"})]
                (is (=? {:status "successful"} (remote-sync.tu/wait-for-task! task_id))))
              (t2/update! :model/ActionTest :id (:id t) {:description "changed"})
              (testing "a changed action test is listed with its action, the action's model, and the model's collection"
                (is (=? {:id          (:id t)
                         :model       "actiontest"
                         :sync_status "update"
                         :data        {:action {:id    action-id
                                                :name  "Refund"
                                                :model {:id         model-id
                                                        :name       "Synced model"
                                                        :collection {:id (:id synced) :name "Synced"}}}}}
                        (some #(when (= "actiontest" (:model %)) %)
                              (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")))))))))))))
