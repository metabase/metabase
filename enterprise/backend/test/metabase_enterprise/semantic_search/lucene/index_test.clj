(ns metabase-enterprise.semantic-search.lucene.index-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.models.embedding :as semantic.models.embedding]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (org.apache.lucene.document Document)
   (org.apache.lucene.index Term)
   (org.apache.lucene.search IndexSearcher KnnFloatVectorQuery ScoreDoc TermQuery TopDocs)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-index
  "Open a Lucene index of width `dims` under a fresh temp directory for the body."
  [[dims] & body]
  `(mt/with-temp-dir [dir# nil]
     (binding [lucene.index/*index-root* (str dir#)]
       (try
         (lucene.index/ensure-open! "test-space" ~dims)
         ~@body
         (finally
           (lucene.index/close!))))))

(defn- row
  "A `semantic_search_embedding` row for `model`/`id` carrying `embedding`, merged with extra `document` keys."
  [model id embedding & [document]]
  {:model     model
   :model_id  (str id)
   :embedding (semantic.models.embedding/floats->bytes embedding)
   :document  (merge {:id           id
                      :model        model
                      :legacy_input (json/encode {:id id :model model :name (str model " " id)})}
                     document)})

(defn- knn-hits
  "Run a kNN search for `embedding` and return `[{:id … :score … :legacy_input …}]`, nearest first."
  [embedding k]
  (lucene.index/with-searcher [^IndexSearcher searcher]
    (let [query           (KnnFloatVectorQuery. "embedding" (float-array embedding) k)
          ^TopDocs hits   (.search searcher query (int k))
          stored          (.storedFields searcher)]
      (vec (for [^ScoreDoc hit (.scoreDocs hits)
                 :let [^Document doc (.document stored (.-doc hit))]]
             {:id           (.get doc "id")
              :model        (.get doc "model")
              :model_id     (.get doc "model_id")
              :legacy_input (.get doc "legacy_input")
              :score        (.-score hit)})))))

(deftest floats-round-trip-test
  (testing "a 4-dimensional vector survives the little-endian float32 codec"
    (let [v [0.25 -0.5 0.0 1.0]]
      (is (= v (vec (semantic.models.embedding/bytes->floats
                     (semantic.models.embedding/floats->bytes v)))))))
  (testing "a 1024-dimensional vector survives, at 4 bytes per component"
    (let [v     (mapv #(float (/ % 1024.0)) (range 1024))
          bytes (semantic.models.embedding/floats->bytes v)]
      (is (= 4096 (alength bytes)))
      (is (= v (vec (semantic.models.embedding/bytes->floats bytes))))))
  (testing "a blob that is not a whole number of components is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"whole number of float32"
                          (semantic.models.embedding/bytes->floats (byte-array 3))))))

(deftest document-id-test
  (is (= "card_12" (lucene.index/document-id "card" 12)))
  (is (= "card_12" (lucene.index/document-id "card" "12"))))

(deftest upsert-and-knn-round-trip-test
  (with-index [4]
    (testing "upserting reports how many documents it wrote and makes them visible"
      (is (= 2 (lucene.index/upsert-rows! [(row "card" 1 [1.0 0.0 0.0 0.0])
                                           (row "dashboard" 2 [0.0 1.0 0.0 0.0])])))
      (is (= 2 (lucene.index/live-count)))
      (is (= #{"card_1" "dashboard_2"} (lucene.index/live-ids))))
    (testing "kNN returns the nearest document first, with its stored fields"
      (let [[nearest :as hits] (knn-hits [0.9 0.1 0.0 0.0] 2)]
        (is (= 2 (count hits)))
        (is (= "card_1" (:id nearest)))
        (is (= "card" (:model nearest)))
        (is (= "1" (:model_id nearest)))
        (is (= {:id 1 :model "card" :name "card 1"}
               (json/decode+kw (:legacy_input nearest))))
        (testing "cosine scores are in [0 1] and rank the nearer document higher"
          (is (< 0.0 (:score (second hits)) (:score nearest) 1.0001)))))
    (testing "upserting the same id again replaces the document rather than duplicating it"
      (is (= 1 (lucene.index/upsert-rows! [(row "card" 1 [0.0 0.0 1.0 0.0] {:legacy_input "{\"id\":1}"})])))
      (is (= 2 (lucene.index/live-count)))
      (is (= "{\"id\":1}" (:legacy_input (first (knn-hits [0.0 0.0 1.0 0.0] 1))))))))

(deftest delete-test
  (with-index [4]
    (lucene.index/upsert-rows! [(row "card" 1 [1.0 0.0 0.0 0.0])
                                (row "card" 2 [0.0 1.0 0.0 0.0])
                                (row "card" 3 [0.0 0.0 1.0 0.0])])
    (testing "deleting by document id removes exactly those documents"
      (is (= 1 (lucene.index/delete-ids! ["card_2"])))
      (is (= #{"card_1" "card_3"} (lucene.index/live-ids))))
    (testing "deleting an id that is not indexed is harmless"
      (is (= 1 (lucene.index/delete-ids! ["card_999"])))
      (is (= 2 (lucene.index/live-count))))
    (testing "delete-all! empties the index"
      (lucene.index/delete-all!)
      (is (= 0 (lucene.index/live-count)))
      (is (= #{} (lucene.index/live-ids))))))

(deftest indexed-filter-fields-test
  (with-index [4]
    (lucene.index/upsert-rows! [(row "card" 1 [1.0 0.0 0.0 0.0]
                                     {:archived false :collection_id 7 :personal_owner_id nil})
                                (row "card" 2 [0.0 1.0 0.0 0.0]
                                     {:archived true :collection_id 8 :personal_owner_id 3})])
    (lucene.index/with-searcher [^IndexSearcher searcher]
      (testing "booleans index as their string form"
        (is (= 1 (.count searcher (TermQuery. (Term. "archived" "true")))))
        (is (= 1 (.count searcher (TermQuery. (Term. "archived" "false"))))))
      (testing "ids index as decimal strings"
        (is (= 1 (.count searcher (TermQuery. (Term. "collection_id" "7"))))))
      (testing "a missing personal owner indexes as the null sentinel"
        (is (= 1 (.count searcher (TermQuery. (Term. "personal_owner_id" lucene.index/null-owner)))))
        (is (= 1 (.count searcher (TermQuery. (Term. "personal_owner_id" "3")))))))))

(deftest zero-vector-is-not-searchable-test
  (with-index [4]
    (testing "an all-zero embedding is indexed without its vector field, since cosine cannot score it"
      (is (= 1 (lucene.index/upsert-rows! [(row "card" 1 [0.0 0.0 0.0 0.0])])))
      (is (= #{"card_1"} (lucene.index/live-ids)))
      (is (= [] (knn-hits [1.0 0.0 0.0 0.0] 5))))))

(deftest reopen-on-space-change-test
  (mt/with-temp-dir [dir nil]
    (binding [lucene.index/*index-root* (str dir)]
      (try
        (let [four (lucene.index/ensure-open! "space-4dim" 4)]
          (lucene.index/upsert-rows! [(row "card" 1 [1.0 0.0 0.0 0.0])])
          (is (= 1 (lucene.index/live-count)))
          (testing "reopening the same space keeps the same index"
            (is (= (:path four) (:path (lucene.index/ensure-open! "space-4dim" 4))))
            (is (= 1 (lucene.index/live-count))))
          (testing "a different embedding space opens an empty index in its own directory"
            (let [eight (lucene.index/ensure-open! "space-8dim" 8)]
              (is (not= (:path four) (:path eight)))
              (is (= 0 (lucene.index/live-count))))))
        (finally
          (lucene.index/close!))))))

(deftest too-many-dimensions-test
  (mt/with-temp-dir [dir nil]
    (binding [lucene.index/*index-root* (str dir)]
      (testing "a model wider than Lucene's default codec allows is refused up front"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"too wide"
                              (lucene.index/ensure-open! "space-too-wide" (inc lucene.index/max-dimensions))))))))

(deftest space-id-is-sanitized-into-a-directory-name-test
  (mt/with-temp-dir [dir nil]
    (binding [lucene.index/*index-root* (str dir)]
      (try
        (let [{:keys [path]} (lucene.index/ensure-open! "emb:v1:sha256:abc" 4)]
          (is (= "emb_v1_sha256_abc" (str (.getFileName ^java.nio.file.Path path)))))
        (finally
          (lucene.index/close!))))))
