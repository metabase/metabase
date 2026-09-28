(ns metabase-enterprise.semantic-search.query-semantics-test
  "Keyword, vector, and hybrid membership for the shared search cases.

  Vectors are frozen output from the production-default embedding model, so the vector arm shows what that
  model retrieves without needing it at test time.
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
  "Preserve indexed lexical text and production card embedding text."
  [docs label->id]
  (for [[label {:keys [name description]}] docs
        :let [id (label->id label)]]
    {:model           "card"
     :id              id
     :name            name
     :searchable_text (str/join " " (remove nil? [name description]))
     :embeddable_text (#'search.ingestion/embeddable-text {:model "card", :name name, :description description})
     :archived        false
     :legacy_input    {:model "card", :id id, :name name}}))

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

(defn- frozen-embeddings
  "Select the frozen vectors for these inputs, failing on any without one.

  The mock provider would otherwise return a default vector for a missing input and skew the vector arm."
  [vectors inputs]
  (let [missing (remove #(contains? vectors %) inputs)]
    (when (seq missing)
      (throw (ex-info "Missing frozen vectors; regenerate arctic_embed_l_v2_vectors.edn" {:inputs (vec missing)})))
    (select-keys vectors inputs)))

(defn- check-case!
  "Replace the isolated index's rows, then check both arms and their hybrid result.

  Temporary cards keep the semantic engine's read-permission checks live.
  Automatic ingestion is disabled because the index is populated explicitly."
  [{:keys [id config docs expect query comparisons] :as case} index vectors]
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
                documents  (vec (indexed-documents docs label->id))
                queries    (cons query (map #(-> (fixtures/comparison-spec case % :semantic) :query)
                                            comparisons))
                embeddings (frozen-embeddings vectors
                                              (concat (map :embeddable_text documents)
                                                      (map #(semantic.embedding/prefix-search-query
                                                             (:embedding-model index) %)
                                                           queries)))
                query-vector (get embeddings (semantic.embedding/prefix-search-query
                                              (:embedding-model index) query))]
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
            (let [{:keys [model dimensions vectors]} (read-arctic-vectors)
                  ;; The mock provider only looks up frozen real-model vectors;
                  ;; pgvector still performs the actual keyword and cosine queries.
                  embedding-model (semantic.tu/resolved-mock-embedding-model
                                   :model-name model
                                   :vector-dimensions dimensions)
                  index (semantic.pgvector-api/init-semantic-search!
                         (semantic.env/get-pgvector-datasource!)
                         semantic.tu/mock-index-metadata embedding-model)]
              (doseq [case fixtures/cases]
                (check-case! case index vectors)))))))))
