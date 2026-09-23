(ns metabase-enterprise.semantic-search.lucene.store-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.lucene.store :as lucene.store]
   [metabase-enterprise.semantic-search.lucene.test-util :as lucene.tu]
   [metabase-enterprise.semantic-search.models.embedding :as semantic.models.embedding]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (org.apache.lucene.document LongPoint)
   (org.apache.lucene.index Term)
   (org.apache.lucene.search IndexSearcher TermQuery)))

(set! *warn-on-reflection* true)

(defn- term-count
  "How many indexed documents carry `value` in `field`."
  [^IndexSearcher searcher ^String field ^String value]
  (.count searcher (TermQuery. (Term. field value))))

(defn- stored-rows []
  (t2/select :model/SemanticSearchEmbedding {:order-by [[:model :asc] [:model_id :asc]]}))

(deftest upsert-documents-writes-one-row-per-document-test
  (lucene.tu/with-lucene-store [4]
    (let [{:keys [rows report]} (lucene.store/upsert-documents!
                                 [(lucene.tu/document "card" 1)
                                  (lucene.tu/document "card" 2)
                                  (lucene.tu/document "dashboard" 3)])]
      (is (= {"card" 2 "dashboard" 1} report))
      (is (= 3 (count rows)))
      (let [[card-1 :as stored] (stored-rows)]
        (is (= 3 (count stored)))
        (is (= "card" (:model card-1)))
        (is (= "1" (:model_id card-1)))
        (is (= (lucene.store/space-id) (:embedding_space_id card-1)))
        (is (= 4 (:dims card-1)))
        (testing "the stored document round-trips as JSON, with the resolved personal owner added"
          (is (= "card" (get-in card-1 [:document :model])))
          (is (contains? (:document card-1) :legacy_input))
          (is (contains? (:document card-1) :personal_owner_id)))
        (testing "the vector round-trips through the blob column"
          (is (= [1 2 3 4]
                 (mapv #(Math/round (* 100.0 (double %)))
                       (vec (semantic.models.embedding/bytes->floats (:embedding card-1)))))))))))

(deftest upsert-documents-is-idempotent-test
  (lucene.tu/with-lucene-store [4]
    (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)])
    (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)])
    (is (= 1 (count (stored-rows))))))

(deftest embeddings-are-reused-across-writes-test
  (lucene.tu/with-lucene-store [4]
    (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)
                                     (lucene.tu/document "card" 2)])
    (is (= 2 (count (lucene.tu/embedded-texts))))
    (testing "re-writing the same documents does not call the embedder again"
      (lucene.tu/reset-embedded-texts!)
      (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)
                                       (lucene.tu/document "card" 2)])
      (is (= [] (lucene.tu/embedded-texts))))
    (testing "a metadata-only change rewrites the row without calling the embedder"
      (lucene.tu/reset-embedded-texts!)
      (lucene.store/upsert-documents! [(lucene.tu/document "card" 1 :archived true)])
      (is (= [] (lucene.tu/embedded-texts)))
      (is (true? (:archived (t2/select-one :model/SemanticSearchEmbedding :model_id "1")))))
    (testing "changing the embedded text embeds exactly that one text"
      (lucene.tu/reset-embedded-texts!)
      (lucene.store/upsert-documents! [(lucene.tu/document "card" 1 :name "renamed")])
      (is (= ["[card]\nname: renamed"] (lucene.tu/embedded-texts)))
      (is (= "renamed" (:name (t2/select-one :model/SemanticSearchEmbedding :model_id "1")))))
    (testing "two documents sharing the same text are embedded once"
      (lucene.tu/reset-embedded-texts!)
      (lucene.store/upsert-documents! [(lucene.tu/document "card" 10 :name "twin")
                                       (lucene.tu/document "dashboard" 11 :name "twin")])
      (is (= ["[card]\nname: twin" "[dashboard]\nname: twin"]
             (sort (lucene.tu/embedded-texts)))))))

(deftest embedder-failure-skips-the-batch-test
  (lucene.tu/with-lucene-store [4]
    (testing "a failing embedder writes nothing and does not throw"
      (binding [lucene.tu/*embedder-fails?* true]
        (is (= {:rows [] :report {}}
               (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)]))))
      (is (= [] (stored-rows))))
    (testing "the next write once the embedder recovers backfills it"
      (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)])
      (is (= 1 (count (stored-rows)))))))

(deftest delete-documents-test
  (lucene.tu/with-lucene-store [4]
    (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)
                                     (lucene.tu/document "card" 2)
                                     (lucene.tu/document "dashboard" 3)])
    (is (= 1 (lucene.store/delete-documents! "card" [1])))
    (is (= [["card" "2"] ["dashboard" "3"]]
           (map (juxt :model :model_id) (stored-rows))))
    (testing "deleting nothing is a no-op"
      (is (= 0 (lucene.store/delete-documents! "card" []))))))

(deftest space-isolation-test
  (lucene.tu/with-lucene-store [4]
    (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)])
    (let [four-dim-space (lucene.store/space-id)]
      (mt/with-temporary-setting-values [ee-embedding-model-dimensions 8]
        (testing "a different embedding model is a different space, with its own rows"
          (is (not= four-dim-space (lucene.store/space-id)))
          (is (= {:n 0 :mx nil} (lucene.store/space-stats (lucene.store/space-id))))
          (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)])
          (is (= 1 (:n (lucene.store/space-stats (lucene.store/space-id)))))))
      (testing "the original space is untouched"
        (is (= 1 (:n (lucene.store/space-stats four-dim-space))))
        (is (= 2 (count (stored-rows))))))))

(deftest read-helpers-test
  (lucene.tu/with-lucene-store [4]
    (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)
                                     (lucene.tu/document "card" 2)
                                     (lucene.tu/document "dashboard" 3)])
    (let [space (lucene.store/space-id)]
      (testing "space-stats counts the space and reports its watermark"
        (let [{:keys [n mx]} (lucene.store/space-stats space)]
          (is (= 3 n))
          (is (some? mx))))
      (testing "model-ids lists every row's identity"
        (is (= #{["card" "1"] ["card" "2"] ["dashboard" "3"]}
               (into #{} (map (juxt :model :model_id)) (lucene.store/model-ids space)))))
      (testing "rows-after pages by id"
        (let [[first-row :as page] (lucene.store/rows-after space 0 nil 2)]
          (is (= 2 (count page)))
          (is (= 1 (count (lucene.store/rows-after space (:id (last page)) nil 2))))
          (testing "rows come back with their document decoded and their vector as bytes"
            (is (map? (:document first-row)))
            (is (= 16 (alength ^bytes (:embedding first-row)))))))
      (testing "rows-after can be bounded by a watermark"
        (is (= [] (lucene.store/rows-after space 0 (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC) 10))))
      (testing "rows-for-model-ids fetches exactly the requested rows"
        (is (= #{["card" "2"] ["dashboard" "3"]}
               (into #{}
                     (map (juxt :model :model_id))
                     (lucene.store/rows-for-model-ids space [["card" "2"] ["dashboard" "3"]]))))))))

(deftest delete-space-test
  (lucene.tu/with-lucene-store [4]
    (lucene.store/upsert-documents! [(lucene.tu/document "card" 1)])
    (is (= 1 (lucene.store/delete-space! (lucene.store/space-id))))
    (is (= [] (stored-rows)))))

(deftest stored-document-rebuilds-every-indexed-field-test
  (lucene.tu/with-lucene-store [4]
    (lucene.index/ensure-open!)
    (let [{:keys [rows]} (lucene.store/upsert-documents!
                          [(lucene.tu/document "card" 1
                                               :display_type   "table"
                                               :verified       true
                                               :curated        true
                                               :collection_id  7
                                               :creator_id     11
                                               :last_editor_id 12
                                               :database_id    13
                                               :created_at     "2026-01-02T03:04:05Z"
                                               :updated_at     "2026-02-03T04:05:06Z")])]
      (testing "the stored document keeps only what the Lucene document is built from"
        (is (= #{:model :id :legacy_input :display_type :archived :verified :curated :collection_id
                 :creator_id :last_editor_id :database_id :created_at :updated_at :personal_owner_id}
               (set (keys (:document (first rows)))))))
      (testing "and that is still enough to rebuild every field of the Lucene document schema"
        (lucene.index/upsert-rows! rows)
        (lucene.index/with-searcher [^IndexSearcher searcher]
          (are [field value] (= 1 (term-count searcher field value))
            "id"                "card_1"
            "model"             "card"
            "model_id"          "1"
            "display_type"      "table"
            "archived"          "false"
            "verified"          "true"
            "curated"           "true"
            "collection_id"     "7"
            "creator_id"        "11"
            "last_editor_id"    "12"
            "database_id"       "13"
            "personal_owner_id" lucene.index/null-owner)
          (is (= 1 (.count searcher (LongPoint/newRangeQuery "model_created_at" Long/MIN_VALUE Long/MAX_VALUE))))
          (is (= 1 (.count searcher (LongPoint/newRangeQuery "model_updated_at" Long/MIN_VALUE Long/MAX_VALUE)))))))))
