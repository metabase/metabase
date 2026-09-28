(ns metabase-enterprise.semantic-search.query-semantics-test
  "Keyword, vector, and hybrid membership for the shared search cases.

  Vectors are frozen output from the production-default embedding model, so the vector arm shows what that
  model retrieves without needing it at test time.
  The once fixture skips this suite when MB_PGVECTOR_DB_URL is not configured."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.query-semantics-vectors :as vectors]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.query-semantics :as fixtures]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- indexed-documents
  "Preserve indexed lexical text and production card embedding text."
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

(defn- hybrid-hits!
  [index query id->label]
  (into #{}
        (map (comp id->label :id))
        (:results (semantic.index/query-index
                   (semantic.env/get-pgvector-datasource!) index (search-context query)))))

(defn- frozen-embeddings
  "Select the frozen vectors for these inputs, failing on any without one.

  The mock provider would otherwise return a default vector for a missing input and skew the vector arm."
  [frozen inputs]
  (let [missing (remove #(contains? frozen %) inputs)]
    (when (seq missing)
      (throw (ex-info "Missing frozen vectors; run query-semantics-vectors/freeze!" {:inputs (vec missing)})))
    (select-keys frozen inputs)))

(defn- check-case!
  "Replace the isolated index's rows, then check both arms and their hybrid result.

  Comparisons treat semantic as the vector arm alone, so a semantic alternative is checked against that arm.
  Temporary cards keep the semantic engine's read-permission checks live.
  Automatic ingestion is disabled because the index is populated explicitly."
  [{:keys [id config docs expect query comparisons] :as case} index frozen]
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
                alternatives (keep #(when (get-in % [:alternatives :semantic])
                                      [% (fixtures/comparison-spec case % :semantic)])
                                   comparisons)
                queries    (cons query (map (comp :query second) alternatives))
                embeddings (frozen-embeddings frozen (concat (map :embeddable_text documents)
                                                             (map vectors/query-text queries)))
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
              (doseq [[comparison {:keys [query hits]}] alternatives]
                (testing (str id " / " (:focus comparison) " semantic vector arm")
                  (is (= hits (sql-arm-hits! index (query-vector query) (search-context query)
                                             id->label :vector))))))))))))

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
                                   :model-name model
                                   :vector-dimensions dimensions)
                  index (semantic.pgvector-api/init-semantic-search!
                         (semantic.env/get-pgvector-datasource!)
                         semantic.tu/mock-index-metadata embedding-model)
                  frozen (vectors/read-vectors)]
              (doseq [case fixtures/cases]
                (check-case! case index frozen)))))))))
