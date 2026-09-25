(ns metabase-enterprise.metabot.conversation-recall-index-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.conversation-recall-index :as index]
   [metabase-enterprise.semantic-search.core :as semantic]
   [metabase-enterprise.semantic-search.db.datasource :as datasource]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase-enterprise.semantic-search.index-metadata :as index-metadata]
   [metabase-enterprise.semantic-search.test-util :as semantic.test-util]
   [metabase.metabot.db :as metabot.db]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [f] (when datasource/db-url (f))))

(deftest indexing-and-backfill-test
  (semantic.test-util/with-test-db! {:dbname (str "recall_test_" (System/nanoTime)) :cleanup :both}
    (let [ds (datasource/ensure-initialized-data-source!)
          model {:provider "mock" :model-name "heron" :vector-dimensions 3 :embedding-space-id "heron-v1"}
          embedded (atom 0)
          deleted? (atom false)
          conversations [{:id "a" :user_id 1} {:id "b" :user_id 1} {:id "foreign" :user_id 2}]
          messages [{:id 1 :role :user :profile_id "nlq" :created_at (java.time.OffsetDateTime/now)
                     :data [{:type "text" :text "Show heron sightings"}]}
                    {:id 2 :role :assistant :profile_id "nlq" :finished true
                     :created_at (java.time.OffsetDateTime/now)
                     :data [{:type "text" :text "Monthly heron sightings"}]}]]
      ;; Provisioning the extension belongs to the operator, not the recall implementation.
      (jdbc/execute! ds ["CREATE EXTENSION IF NOT EXISTS vector"])
      (mt/with-dynamic-fn-redefs [semantic/get-index-metadata (constantly index-metadata/app-db-index-metadata)
                                  embedding/get-configured-model (constantly model)
                                  embedding/resolve-model identity
                                  embedding/embedding-supported? (constantly true)
                                  embedding/prefix-search-query (fn [_ query] query)
                                  embedding/get-embedding (fn [& _] [1.0 0.0 0.0])
                                  embedding/process-embeddings-streaming
                                  (fn [_ texts callback & _]
                                    (swap! embedded + (count texts))
                                    (callback (zipmap texts (repeat [1.0 0.0 0.0]))))
                                  metabot.db/conversation (fn [id] (some #(when (= id (:id %)) %) conversations))
                                  metabot.db/live-messages (fn [_] (if @deleted? [] messages))
                                  metabot.db/saved-cards-for-conversation (constantly [])
                                  metabot.db/recall-backfill-page
                                  (fn [{:keys [after-id limit]}]
                                    (take limit (filter #(or (nil? after-id) (pos? (compare (:id %) after-id)))
                                                        conversations)))]
        (testing "the shared schema hosts recall and repeated indexing retains embeddings"
          (is (index/available?))
          (is (= {:indexed 1 :unchanged 0 :deleted 0} (index/reconcile-conversation! "a")))
          (is (= {:indexed 0 :unchanged 1 :deleted 0} (index/reconcile-conversation! "a")))
          (is (= 1 @embedded)))
        (testing "the persisted cursor resumes a backfill and handles already-indexed conversations"
          (is (= {:processed 2 :failed 0 :indexed 1 :deleted 0 :unchanged 1
                  :status :ok :cursor "b" :complete? false}
                 (index/backfill! {:limit 2})))
          (is (= {:processed 1 :failed 0 :indexed 1 :deleted 0 :unchanged 0
                  :status :ok :cursor nil :complete? true}
                 (index/backfill! {:limit 2}))))
        (testing "both retrieval paths enforce ownership and exclude the active conversation"
          (let [result (index/search 1 "a" "heron" nil)]
            (is (= :ok (:status result)))
            (is (= ["b"] (mapv :conversation_id (:results result)))))
          (is (empty? (:results (index/search 1 "a" "heron" "foreign"))))
          (mt/with-dynamic-fn-redefs [embedding/get-embedding (fn [& _] (throw (ex-info "Offline" {})))]
            (let [result (index/search 1 "a" "heron" nil)]
              (is (= :keyword-only (:status result)))
              (is (= ["b"] (mapv :conversation_id (:results result)))))))
        (testing "deleted source turns are removed on reconciliation"
          (reset! deleted? true)
          (is (= {:indexed 0 :unchanged 0 :deleted 1} (index/reconcile-conversation! "b")))
          (is (empty? (:results (index/search 1 "a" "heron" nil)))))))))
