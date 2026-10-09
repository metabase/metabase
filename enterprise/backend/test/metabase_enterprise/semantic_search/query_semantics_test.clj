(ns metabase-enterprise.semantic-search.query-semantics-test
  "Keyword, vector, and hybrid membership for the shared search cases.

  Vectors are frozen output from the production-default embedding model, so the vector arm shows what that
  model retrieves without needing it at test time.
  The once fixture skips this suite when MB_PGVECTOR_DB_URL is not configured."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.query-semantics-vectors :as vectors]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- indexed-documents
  "Index rows for `docs`, with the searchable and embeddable text production would store for cards."
  [docs label->id]
  (for [[label {:keys [name description] :as doc}] docs
        :let [id (label->id label)]]
    {:model           "card"
     :id              id
     :name            name
     :searchable_text (str/join " " (remove nil? [name description]))
     :embeddable_text (vectors/document-text doc)
     :archived        false
     :legacy_input    {:model "card", :id id, :name name}}))

(defn- search-context
  [query]
  {:search-string          query
   :models                 #{"card"}
   :archived?              false
   :vector-search-strategy :brute-force})

(defn- sql-arm-hits!
  "Labels returned by one arm of the semantic search query, `:keyword` or `:vector`, before the union."
  [index query-vector search-ctx id->label arm]
  (let [db        (semantic.env/get-pgvector-datasource!)
        query-map (case arm
                    :keyword (#'semantic.index/keyword-search-query index search-ctx)
                    :vector  (#'semantic.index/semantic-search-query index query-vector search-ctx))]
    (into #{}
          (map (comp id->label parse-long :model_id))
          (jdbc/execute! db (semantic.index/sql-format-quoted query-map)
                         {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- hybrid-hits!
  [index query id->label]
  (into #{}
        (map (comp id->label :id))
        (:results (semantic.index/query-index
                   (semantic.env/get-pgvector-datasource!) index (search-context query)))))

(defn- frozen-embeddings
  "Select the frozen vectors for `inputs`; throws if any is missing."
  [frozen inputs]
  ;; The mock provider would otherwise return a default vector for a missing input and skew the vector arm.
  (let [missing (remove #(contains? frozen %) inputs)]
    (when (seq missing)
      (throw (ex-info "Missing frozen vectors; run query-semantics-vectors/freeze!" {:inputs (vec missing)})))
    (select-keys frozen inputs)))

(defn- check-case!
  "Index `case`'s documents, then check the keyword arm, the vector arm, and their union.
  A semantic rewrite in a comparison is checked against the vector arm alone."
  [{:keys [id config docs expect query comparisons] :as case} index frozen]
  (mt/with-temporary-setting-values [search-language config]
    ;; Temporary cards keep the semantic engine's read-permission checks live.
    ;; Only the cards in `:docs` get indexed.
    ;; The test indexes them itself, so automatic ingestion stays off.
    (search.tu/do-with-labelled-cards
     docs
     (fn [label->id]
       (let [id->label    (set/map-invert label->id)
             documents    (vec (indexed-documents docs label->id))
             rewrites     (filter #(get-in % [:alternatives :semantic]) comparisons)
             embeddings   (frozen-embeddings frozen (concat (map :embeddable_text documents)
                                                            (map vectors/query-text
                                                                 (vectors/semantic-queries case))))
             query-vector (comp embeddings vectors/query-text)]
         (semantic.tu/with-mock-embeddings embeddings
           (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                          [(str "TRUNCATE TABLE \"" (:table-name index) "\"")])
           (semantic.tu/upsert-index! documents :index index :serial? true)
           (doseq [arm [:keyword :vector]]
             (testing (str id " " (name arm) " arm")
               (is (= (set (get-in expect [:semantic arm]))
                      (sql-arm-hits! index (query-vector query) (search-context query) id->label arm)))))
           (testing (str id " hybrid")
             (is (= (fixtures/expected-hybrid-hits case)
                    (hybrid-hits! index query id->label))))
           (doseq [comparison rewrites
                   :let [{:keys [query hits]} (fixtures/comparison-spec case comparison :semantic)]]
             (testing (str id " / " (:focus comparison) " semantic vector arm")
               (is (= hits (sql-arm-hits! index (query-vector query) (search-context query)
                                          id->label :vector)))))))))))

(deftest semantic-query-semantics-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [ee-embedding-query-prefix ""
                                       semantic-search-results-limit 50
                                       semantic-search-min-results-threshold 0]
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-initialized}
          (semantic.tu/with-only-semantic-weights
            (let [{:keys [model dimensions]} vectors/metadata
                  ;; The mock provider only looks up frozen real-model vectors;
                  ;; pgvector still performs the actual keyword and cosine queries.
                  embedding-model (semantic.tu/resolved-mock-embedding-model
                                   :model-name        model
                                   :vector-dimensions dimensions)
                  index           (semantic.pgvector-api/init-semantic-search!
                                   (semantic.env/get-pgvector-datasource!)
                                   semantic.tu/mock-index-metadata
                                   embedding-model)
                  frozen          (vectors/read-vectors)]
              (doseq [case fixtures/cases]
                (check-case! case index frozen)))))))))
