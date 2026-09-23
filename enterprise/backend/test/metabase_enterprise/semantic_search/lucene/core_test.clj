(ns metabase-enterprise.semantic-search.lucene.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.lucene.core :as lucene.core]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.lucene.store :as lucene.store]
   [metabase-enterprise.semantic-search.lucene.test-util :as lucene.tu]
   [metabase-enterprise.semantic-search.models.embedding :as semantic.models.embedding]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- updated-at [model-id]
  (:updated_at (t2/select-one :model/SemanticSearchEmbedding :model_id model-id)))

(deftest update-reports-an-empty-stream-test
  (lucene.tu/with-lucene-store [4]
    (testing "an empty document stream reports no writes rather than nil"
      (is (= {} (lucene.core/update! []))))))

(deftest update-indexes-what-it-persists-test
  (lucene.tu/with-lucene-store [4]
    (is (= {"card" 2} (lucene.core/update! [(lucene.tu/document "card" 1)
                                            (lucene.tu/document "card" 2)])))
    (is (= #{"card_1" "card_2"} (lucene.index/live-ids)))
    (testing "deleting removes the row and the local document together"
      (is (= {"card" 1} (lucene.core/delete! "card" [2])))
      (is (= #{"card_1"} (lucene.index/live-ids)))
      (is (= 1 (t2/count :model/SemanticSearchEmbedding))))))

(deftest init-populates-once-test
  (lucene.tu/with-lucene-store [4]
    (is (= {"card" 1} (lucene.core/init! [(lucene.tu/document "card" 1)] {})))
    (testing "a second init! leaves the corpus alone"
      (lucene.tu/reset-embedded-texts!)
      (is (= {} (lucene.core/init! [(lucene.tu/document "card" 1)] {})))
      (is (= [] (lucene.tu/embedded-texts))))
    (testing "force-reset? wipes and repopulates"
      (is (= {"card" 1} (lucene.core/init! [(lucene.tu/document "card" 1)] {:force-reset? true})))
      (is (= 1 (t2/count :model/SemanticSearchEmbedding))))))

(deftest repair-only-fills-gaps-test
  (lucene.tu/with-lucene-store [4]
    (lucene.core/update! [(lucene.tu/document "card" 1)])
    (let [before (updated-at "1")]
      (lucene.tu/reset-embedded-texts!)
      (testing "a document the table is missing is backfilled"
        (is (= 0 (:orphans (lucene.core/repair! [(lucene.tu/document "card" 1)
                                                 (lucene.tu/document "card" 2)]))))
        (is (= 2 (t2/count :model/SemanticSearchEmbedding)))
        (is (= ["[card]\nname: doc 2"] (lucene.tu/embedded-texts))
            "only the missing document reaches the embedder"))
      (testing "a document the table already has is left untouched"
        ;; Rewriting it would move its updated_at and make every node re-import the whole space next tick.
        (is (= before (updated-at "1")))))))

(deftest repair-drops-what-no-longer-exists-test
  (lucene.tu/with-lucene-store [4]
    (lucene.core/update! [(lucene.tu/document "card" 1)
                          (lucene.tu/document "card" 2)])
    (testing "a document that has left the corpus is dropped from the table and the index"
      (is (= 1 (:orphans (lucene.core/repair! [(lucene.tu/document "card" 1)]))))
      (is (= #{"card_1"} (lucene.index/live-ids)))
      (is (= 1 (t2/count :model/SemanticSearchEmbedding))))))

(deftest repair-reclaims-abandoned-embedding-spaces-test
  (lucene.tu/with-lucene-store [4]
    (lucene.core/update! [(lucene.tu/document "card" 1)])
    (t2/insert! :model/SemanticSearchEmbedding
                {:embedding_space_id "emb:v1:sha256:a-model-we-no-longer-use"
                 :model              "card"
                 :model_id           "99"
                 :archived           false
                 :content_hash       "deadbeef"
                 :dims               4
                 :embedding          (semantic.models.embedding/floats->bytes [1.0 0.0 0.0 0.0])
                 :document           {:model "card" :id 99}})
    (is (= 2 (t2/count :model/SemanticSearchEmbedding)))
    (testing "rows left behind by an embedding-model change are reclaimed, since nothing else collects them"
      (lucene.core/repair! [(lucene.tu/document "card" 1)])
      (is (= [(lucene.store/space-id)]
             (map :embedding_space_id (t2/select :model/SemanticSearchEmbedding)))))))
