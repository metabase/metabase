(ns metabase-enterprise.semantic-search.lucene.sync-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.lucene.store :as lucene.store]
   [metabase-enterprise.semantic-search.lucene.sync :as lucene.sync]
   [metabase-enterprise.semantic-search.lucene.test-util :as lucene.tu]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (org.apache.lucene.index Term)
   (org.apache.lucene.search IndexSearcher TermQuery TopDocs)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-active-engine
  "Run `body` as if the semantic engine were one of the active search engines, which the sync gates on."
  [& body]
  `(mt/with-dynamic-fn-redefs [semantic.util/semantic-search-active? (constantly true)]
     ~@body))

(defn- write-elsewhere!
  "Write documents to the embedding table only — what another node's write looks like from here."
  [documents]
  (lucene.store/upsert-documents! documents))

(defn- indexed-legacy-input
  "The `legacy_input` this node has indexed for `document-id`, or nil when it has none."
  [document-id]
  (lucene.index/with-searcher [^IndexSearcher searcher]
    (let [^TopDocs hits (.search searcher (TermQuery. (Term. "id" ^String document-id)) (int 1))]
      (when-let [hit (first (.scoreDocs hits))]
        (.get (.document (.storedFields searcher) (.-doc hit)) "legacy_input")))))

(deftest sync-imports-rows-written-elsewhere-test
  (lucene.tu/with-lucene-store [4]
    (with-active-engine
      (write-elsewhere! [(lucene.tu/document "card" 1)
                         (lucene.tu/document "dashboard" 2)])
      (testing "a tick imports everything the table has"
        (is (= {:space (lucene.store/space-id) :indexed 2 :stale 0 :missing 0}
               (lucene.sync/sync-tick!)))
        (is (= #{"card_1" "dashboard_2"} (lucene.index/live-ids)))))))

(deftest sync-does-nothing-when-nothing-changed-test
  (lucene.tu/with-lucene-store [4]
    (with-active-engine
      (write-elsewhere! [(lucene.tu/document "card" 1)])
      (lucene.sync/sync-tick!)
      (testing "a tick with the same row count and watermark does no work"
        (is (= {:space (lucene.store/space-id) :skipped true}
               (lucene.sync/sync-tick!)))))))

(deftest sync-removes-rows-deleted-elsewhere-test
  (lucene.tu/with-lucene-store [4]
    (with-active-engine
      (write-elsewhere! [(lucene.tu/document "card" 1)
                         (lucene.tu/document "card" 2)])
      (lucene.sync/sync-tick!)
      (t2/delete! :model/SemanticSearchEmbedding :model_id "2")
      (testing "the next tick notices the row count changed and drops the local document"
        (is (= 1 (:stale (lucene.sync/sync-tick!))))
        (is (= #{"card_1"} (lucene.index/live-ids)))))))

(deftest sync-picks-up-documents-updated-elsewhere-test
  (lucene.tu/with-lucene-store [4]
    (with-active-engine
      (write-elsewhere! [(lucene.tu/document "card" 1)])
      (lucene.sync/sync-tick!)
      (is (= "doc 1" (:name (json/decode+kw (indexed-legacy-input "card_1")))))
      (write-elsewhere! [(lucene.tu/document "card" 1 :name "renamed elsewhere")])
      (testing "the watermark moved, so the next tick re-indexes the row"
        (is (pos? (:indexed (lucene.sync/sync-tick!))))
        (is (= "renamed elsewhere" (:name (json/decode+kw (indexed-legacy-input "card_1")))))))))

(deftest sync-repairs-a-local-index-that-fell-behind-test
  (lucene.tu/with-lucene-store [4]
    (with-active-engine
      (write-elsewhere! [(lucene.tu/document "card" 1)
                         (lucene.tu/document "card" 2)])
      (lucene.sync/sync-tick!)
      (lucene.index/delete-ids! ["card_2"])
      (is (= 1 (lucene.index/live-count)))
      (testing "a document lost locally comes back, even when it is too old for the watermark window"
        ;; Age every row past the overlap window, so only the id comparison can find the gap.
        (t2/update! :model/SemanticSearchEmbedding
                    :embedding_space_id (lucene.store/space-id)
                    {:updated_at (t/minus (t/offset-date-time) (t/hours 2))})
        (let [{:keys [indexed missing]} (lucene.sync/sync-tick!)]
          (is (= 0 indexed))
          (is (= 1 missing)))
        (is (= #{"card_1" "card_2"} (lucene.index/live-ids)))))))

(deftest sync-rebuilds-from-scratch-after-reset-test
  (lucene.tu/with-lucene-store [4]
    (with-active-engine
      (write-elsewhere! [(lucene.tu/document "card" 1)])
      (lucene.sync/sync-tick!)
      (lucene.index/delete-all!)
      (lucene.sync/reset-state!)
      (testing "forgetting the watermark makes the next tick a full import"
        (is (= 1 (:indexed (lucene.sync/sync-tick!))))
        (is (= #{"card_1"} (lucene.index/live-ids)))))))

(deftest sync-is-inert-while-the-engine-is-inactive-test
  (lucene.tu/with-lucene-store [4]
    (write-elsewhere! [(lucene.tu/document "card" 1)])
    (testing "nothing is indexed while the semantic engine is not active"
      (is (nil? (lucene.sync/sync-tick!))))))

(deftest start-is-idempotent-test
  (lucene.tu/with-lucene-store [4]
    (testing "only the first start! creates the timer"
      (is (true? (lucene.sync/start!)))
      (is (false? (lucene.sync/start!))))
    (testing "stopping twice is harmless"
      (is (nil? (lucene.sync/stop!)))
      (is (nil? (lucene.sync/stop!))))))
