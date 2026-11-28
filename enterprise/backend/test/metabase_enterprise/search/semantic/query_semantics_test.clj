(ns metabase-enterprise.search.semantic.query-semantics-test
  "Keyword, vector, hybrid, and fallback membership for the shared search cases.

  Vectors are frozen output from the production-default embedding model, so the vector arm shows what that
  model retrieves without needing it at test time.
  The once fixture skips this suite when MB_PGVECTOR_DB_URL is not configured."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.search.semantic.env :as semantic.env]
   [metabase-enterprise.search.semantic.index :as semantic.index]
   [metabase-enterprise.search.semantic.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.search.semantic.query-semantics-vectors :as vectors]
   [metabase-enterprise.search.semantic.test-util :as semantic.tu]
   [metabase.app-db.core :as mdb]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.settings :as search.settings]
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

(defn- fallback-hits!
  "Labels from semantic search's complete results, including any app-db fallback."
  [query id->label]
  (into #{}
        (map (comp id->label :id))
        (search.tu/search-results query {:search-engine          "semantic"
                                         :models                 #{"card"}
                                         :vector-search-strategy "brute-force"})))

(defn- check-fallback!
  "Index `case`'s documents for app-db search too, then check semantic search's complete results."
  [{:keys [id docs query] :as case} rewrites label->id id->label]
  ;; The report models the fallback with PostgreSQL's app-db engine.
  (when (= :postgres (mdb/db-type))
    (search.tu/with-temp-index-table
      (search.tu/index-labelled-documents! docs label->id)
      ;; Semantic search falls back to the first other engine.
      ;; A configured in-place engine would take app-db's place.
      ;; The threshold is the production default, which these catalogues are always below.
      (mt/with-temporary-setting-values [search.settings/search-engine         "semantic"
                                         semantic-search-min-results-threshold nil]
        (testing (str id " semantic with fallback")
          (is (= (fixtures/expected-hits case :semantic-with-fallback)
                 (fallback-hits! query id->label))))
        (doseq [comparison rewrites
                :let [{:keys [query hits]} (fixtures/comparison-spec
                                            case comparison :semantic-with-fallback)]]
          (testing (str id " / " (:focus comparison) " semantic with fallback")
            (is (= hits (fallback-hits! query id->label)))))))))

(defn- frozen-embeddings
  "Select the frozen vectors for `inputs`; throws if any is missing."
  [frozen inputs]
  ;; The mock provider would otherwise return a default vector for a missing input and skew the vector arm.
  (let [missing (remove #(contains? frozen %) inputs)]
    (when (seq missing)
      (throw (ex-info "Missing frozen vectors; run query-semantics-vectors/freeze!" {:inputs (vec missing)})))
    (select-keys frozen inputs)))

(defn- check-case!
  "Index `case`'s documents, then check the keyword arm, the vector arm, their union, and the fallback.
  A semantic rewrite in a comparison is checked against each arm."
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
                   :let [{:keys [query hits keyword]} (get-in comparison [:alternatives :semantic])]
                   arm        [:vector :keyword]]
             (testing (str id " / " (:focus comparison) " semantic " (name arm) " arm")
               (is (= (set (if (= arm :vector) hits keyword))
                      (sql-arm-hits! index (query-vector query) (search-context query) id->label arm)))))
           (check-fallback! case rewrites label->id id->label)))))))

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
