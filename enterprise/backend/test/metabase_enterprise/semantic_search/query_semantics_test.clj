(ns metabase-enterprise.semantic-search.query-semantics-test
  "Keyword, vector, and hybrid membership for the shared search cases.

  Uses frozen real-model vectors for lexical-and-vector-union and controlled
  mock vectors elsewhere.
  The once fixture skips this suite when MB_PGVECTOR_DB_URL is not configured."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.query-semantics :as fixtures]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.nio ByteBuffer)
   (java.util Base64)))

(use-fixtures :once #'semantic.tu/once-fixture)

(def ^:private mock-query-vector [1.0 0.0 0.0 0.0])
(def ^:private far-vector [0.1 0.99498743710662 0.0 0.0])
(def ^:private near-vector [0.8 0.6 0.0 0.0])

(defn- read-arctic-vectors
  "Decode frozen float32 vectors captured from the production-default model.

  This keeps the test offline without replacing semantic similarity with an
  invented four-dimensional geometry."
  []
  (let [{:keys [dimensions encoding vectors] :as fixture}
        (-> "search/arctic_embed_l_v2_vectors.edn" io/resource slurp edn/read-string)]
    (when-not (= encoding :float32-be-base64)
      (throw (ex-info "Unexpected vector encoding" {:encoding encoding})))
    (assoc fixture :vectors
           (into {}
                 (map (fn [[input encoded]]
                        (let [bytes (.decode (Base64/getDecoder) ^String encoded)]
                          (when-not (= (alength bytes) (* 4 dimensions))
                            (throw (ex-info "Unexpected vector length" {:input input})))
                          (let [buffer (ByteBuffer/wrap bytes)]
                            [input (mapv (fn [_] (double (.getFloat buffer)))
                                         (range dimensions))]))))
                 vectors))))

(defn- indexed-documents
  "Preserve indexed lexical text and, for real vectors, production card embedding text."
  [docs label->id real-vectors?]
  (for [[label {:keys [name description]}] docs
        :let [id (label->id label)]]
    {:model           "card"
     :id              id
     :name            name
     :searchable_text (str/join " " (remove nil? [name description]))
     :embeddable_text (if real-vectors?
                        (#'search.ingestion/embeddable-text
                         {:model "card", :name name, :description description})
                        (str "fixture-document-" id))
     :archived        false
     :legacy_input    {:model "card", :id id, :name name}}))

(defn- mock-embeddings
  "Give B in three isolated cases a controlled vector hit.

  Its cosine distance from the query is 0.2. Every other document has distance
  0.9, beyond the semantic arm's 0.7 cutoff."
  [source label->id documents queries]
  (let [near-id (when (#{"vector-only-match" "vector-negation-leak" "punctuation-vector"} source)
                  (label->id :B))]
    (into (zipmap queries (repeat mock-query-vector))
          (map (fn [{:keys [id embeddable_text]}]
                 [embeddable_text (if (= id near-id) near-vector far-vector)]))
          documents)))

(defn- sql-arm-hits!
  "Query one real pgvector SQL arm before the hybrid union."
  [index query-vector search-ctx id->label arm]
  (let [db        (semantic.env/get-pgvector-datasource!)
        query-map (case arm
                    :keyword (#'semantic.index/keyword-search-query index search-ctx)
                    :vector  (#'semantic.index/semantic-search-query index query-vector search-ctx))]
    (into #{}
          (map (comp id->label parse-long :model_id))
          (jdbc/execute! db (semantic.index/sql-format-quoted query-map)
                         {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- hybrid-hits
  [index query id->label]
  (into #{}
        (map (comp id->label :id))
        (:results (semantic.index/query-index
                   (semantic.env/get-pgvector-datasource!) index
                   {:search-string          query
                    :models                 #{"card"}
                    :archived?              false
                    :vector-search-strategy :brute-force}))))

(defn- check-case!
  "Replace the isolated index's rows, then check both arms and their hybrid result.

  Temporary cards keep the semantic engine's read-permission checks live.
  Automatic ingestion is disabled because the index is populated explicitly."
  [{:keys [id config docs expect query comparisons] :as case} index real-vectors]
  (mt/with-temporary-setting-values [search-language config]
    ;; `with-temp` needs fixed bindings; only the cards in :docs are indexed.
    (binding [search.ingestion/*disable-updates* true]
      (let [missing {:name (str "zzq-nonmatch-" (random-uuid))}]
        (mt/with-temp
          [:model/Card {a :id} (get docs :A missing)
           :model/Card {b :id} (get docs :B missing)
           :model/Card {c :id} (get docs :C missing)
           :model/Card {d :id} (get docs :D missing)
           :model/Card {e :id} (get docs :E missing)
           :model/Card {f :id} (get docs :F missing)
           :model/Card {g :id} (get docs :G missing)
           :model/Card {h :id} (get docs :H missing)]
          (let [label->id  {:A a, :B b, :C c, :D d, :E e, :F f, :G g, :H h}
                id->label  (into {} (map (fn [[label db-id]] [db-id label])) label->id)
                documents (vec (indexed-documents docs label->id (some? real-vectors)))
                queries   (cons query (map #(-> (fixtures/comparison-spec case % :semantic) :query)
                                           comparisons))
                embeddings (or real-vectors (mock-embeddings id label->id documents queries))
                query-vector (if real-vectors
                               (get real-vectors (semantic.embedding/prefix-search-query
                                                  (:embedding-model index) query))
                               mock-query-vector)]
            (semantic.tu/with-mock-embeddings embeddings
              (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                             [(str "TRUNCATE TABLE \"" (:table-name index) "\"")])
              (semantic.tu/upsert-index! documents :index index :serial? true)
              (let [context {:search-string          query
                             :models                 #{"card"}
                             :archived?              false
                             :vector-search-strategy :brute-force}]
                (doseq [arm [:keyword :vector]]
                  (testing (str id " " (name arm) " arm")
                    (is (= (set (get-in expect [:semantic arm]))
                           (sql-arm-hits! index query-vector context id->label arm)))))
                (testing (str id " hybrid")
                  (is (= (fixtures/expected-hits case :semantic)
                         (hybrid-hits index query id->label)))))
              (doseq [comparison comparisons]
                (testing (str id " / " (:focus comparison) " semantic translation")
                  (let [{:keys [query hits]} (fixtures/comparison-spec case comparison :semantic)]
                    (is (= hits (hybrid-hits index query id->label)))))))))))))

(deftest semantic-query-semantics-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [ee-embedding-query-prefix ""
                                       semantic-search-results-limit 50
                                       semantic-search-min-results-threshold 0]
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-initialized}
          (semantic.tu/with-only-semantic-weights
            (when-not (every? #(contains? #{nil :arctic-embed-l-v2} %)
                              (map :vector-fixture fixtures/cases))
              (throw (ex-info "Unknown vector fixture" {})))
            (doseq [case fixtures/cases
                    :when (nil? (:vector-fixture case))]
              (check-case! case semantic.tu/mock-index nil))
            (let [{:keys [model dimensions vectors]} (read-arctic-vectors)
                  ;; The mock provider only looks up frozen real-model vectors;
                  ;; pgvector still performs the actual keyword and cosine queries.
                  embedding-model (semantic.tu/resolved-mock-embedding-model
                                   :model-name model
                                   :vector-dimensions dimensions)
                  index (semantic.pgvector-api/init-semantic-search!
                         (semantic.env/get-pgvector-datasource!)
                         semantic.tu/mock-index-metadata embedding-model)]
              (doseq [case fixtures/cases
                      :when (= :arctic-embed-l-v2 (:vector-fixture case))]
                (check-case! case index vectors)))))))))
