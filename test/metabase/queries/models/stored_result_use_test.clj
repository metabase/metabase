(ns metabase.queries.models.stored-result-use-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.core :as queries]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- stored-result! []
  (let [mp (mt/metadata-provider)]
    (first (t2/insert-returning-pks! :model/StoredResult
                                     {:result_data   (byte-array [1 2 3])
                                      :database_id   (mt/id)
                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}))))

(deftest exactly-one-reference-required-test
  (testing "stored_result_use requires exactly one of :card_id / :exploration_id"
    (mt/with-temp [:model/User       u    {}
                   :model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)}
                   :model/Exploration expl {:name "sru-test" :creator_id (:id u)}]
      (let [sr-id (stored-result!)]
        (testing "card_id only succeeds"
          (let [id (first (t2/insert-returning-pks! :model/StoredResultUse
                                                    {:stored_result_id sr-id :card_id (:id card)}))]
            (is (=? {:card_id (:id card) :exploration_id nil}
                    (t2/select-one :model/StoredResultUse :id id)))))
        (testing "neither set is rejected"
          (is (thrown? Exception
                       (t2/insert! :model/StoredResultUse {:stored_result_id sr-id}))))
        (testing "both set is rejected"
          (is (thrown? Exception
                       (t2/insert! :model/StoredResultUse
                                   {:stored_result_id sr-id
                                    :card_id          (:id card)
                                    :exploration_id   (:id expl)}))))))))

(deftest exploration-reference-test
  (testing "exploration_id only succeeds"
    (mt/with-temp [:model/User        u    {}
                   :model/Exploration expl {:name "sru-test" :creator_id (:id u)}]
      (let [sr-id (stored-result!)
            id    (first (t2/insert-returning-pks! :model/StoredResultUse
                                                   {:stored_result_id sr-id :exploration_id (:id expl)}))]
        (is (=? {:card_id nil :exploration_id (:id expl)}
                (t2/select-one :model/StoredResultUse :id id)))))))

(deftest carry-pairings-for-document-test
  (testing "carry-pairings-for-document! copies a pairing only when the snapshot is already reachable through the document"
    (let [mp           (mt/metadata-provider)
          venues-query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
      (mt/with-temp [:model/Collection coll {}
                     :model/Document   doc  {:name         "Summary"
                                             :document     {:type "doc" :content []}
                                             :content_type "application/json+vnd.prose-mirror"
                                             :collection_id (:id coll)}
                     :model/Document   other-doc {:name         "Other"
                                                  :document     {:type "doc" :content []}
                                                  :content_type "application/json+vnd.prose-mirror"
                                                  :collection_id (:id coll)}
                     :model/Card       owned {:name          "owned"
                                              :dataset_query venues-query
                                              :display       :table
                                              :document_id   (:id doc)
                                              :collection_id (:id coll)}
                     :model/Card       new-card {:name          "replacement"
                                                 :dataset_query venues-query
                                                 :display       :table
                                                 :document_id   (:id doc)
                                                 :collection_id (:id coll)}
                     :model/Card       hostile-card {:name          "hostile"
                                                     :dataset_query venues-query
                                                     :display       :table
                                                     :document_id   (:id other-doc)
                                                     :collection_id (:id coll)}]
        (let [sr-id (stored-result!)]
          (t2/insert! :model/StoredResultUse {:stored_result_id sr-id :card_id (:id owned)})
          (testing "carries when the snapshot is already paired with a card in this document"
            (queries/carry-pairings-for-document! (:id doc) [[(:id new-card) sr-id]])
            (is (some? (t2/select-one :model/StoredResultUse
                                      :stored_result_id sr-id
                                      :card_id (:id new-card)))
                "new card inherits the (document, snapshot) reachability"))
          (testing "refuses when the snapshot is not reachable through the target document"
            (let [before (t2/count :model/StoredResultUse :card_id (:id hostile-card))]
              (queries/carry-pairings-for-document! (:id other-doc) [[(:id hostile-card) sr-id]])
              (is (= before (t2/count :model/StoredResultUse :card_id (:id hostile-card)))
                  "hostile document cannot widen reachability to a foreign snapshot"))))))))
