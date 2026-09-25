(ns metabase-enterprise.semantic-search.query-semantics-test
  "Keyword, vector, and hybrid membership for the shared S and T search cases.

  Uses deterministic mock embeddings in a dedicated pgvector test database.
  The once fixture skips this suite when MB_PGVECTOR_DB_URL is not configured."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(use-fixtures :once #'semantic.tu/once-fixture)

(def ^:private cases
  (-> "search/query_semantics_cases.edn" io/resource slurp edn/read-string))

(def ^:private translations
  (-> "search/query_semantics_translations.edn" io/resource slurp edn/read-string))

(def ^:private query-vector [1.0 0.0 0.0 0.0])
(def ^:private far-vector [0.1 0.99498743710662 0.0 0.0])
(def ^:private near-vector [0.8 0.6 0.0 0.0])

(defn- indexed-documents
  "Preserve each card's name and description as indexed lexical text."
  [docs label->id]
  (for [[label {:keys [name description]}] docs
        :let [id (label->id label)]]
    {:model           "card"
     :id              id
     :name            name
     :searchable_text (str/join " " (remove nil? [name description]))
     :embeddable_text (str "fixture-document-" id)
     :archived        false
     :legacy_input    {:model "card", :id id, :name name}}))

(defn- mock-embeddings
  "Give B in S12/S13/S25 a vector hit.

  Its cosine distance from the query is 0.2. Every other document has distance
  0.9, beyond the semantic arm's 0.7 cutoff."
  [source label->id documents queries]
  (let [near-id (when (#{"S12" "S13" "S25"} source) (label->id :B))]
    (into (zipmap queries (repeat query-vector))
          (map (fn [{:keys [id embeddable_text]}]
                 [embeddable_text (if (= id near-id) near-vector far-vector)]))
          documents)))

(defn- sql-arm-hits!
  "Query one real pgvector SQL arm before the hybrid union."
  [search-ctx id->label arm]
  (let [db        (semantic.env/get-pgvector-datasource!)
        index     semantic.tu/mock-index
        query-map (case arm
                    :keyword (#'semantic.index/keyword-search-query index search-ctx)
                    :vector  (#'semantic.index/semantic-search-query index query-vector search-ctx))]
    (into #{}
          (map (comp id->label parse-long :model_id))
          (jdbc/execute! db (semantic.index/sql-format-quoted query-map)
                         {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- hybrid-hits
  [query id->label]
  (into #{}
        (map (comp id->label :id))
        (semantic.tu/query-index {:search-string          query
                                  :models                 #{"card"}
                                  :archived?              false
                                  :vector-search-strategy :brute-force})))

(defn- check-case!
  "Replace the isolated index's rows, then check both arms and their hybrid result.

  Temporary cards keep the semantic engine's read-permission checks live.
  Automatic ingestion is disabled because the index is populated explicitly."
  [{:keys [id config docs expect query]} translations-by-source]
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
                documents (vec (indexed-documents docs label->id))
                queries   (cons query (map (comp :semantic :queries) translations-by-source))]
            (semantic.tu/with-mock-embeddings (mock-embeddings id label->id documents queries)
              (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                             [(str "TRUNCATE TABLE \"" (:table-name semantic.tu/mock-index) "\"")])
              (semantic.tu/upsert-index! documents :serial? true)
              (let [context {:search-string          query
                             :models                 #{"card"}
                             :archived?              false
                             :vector-search-strategy :brute-force}]
                (testing (str id " keyword arm")
                  (is (= (set (:keyword expect))
                         (sql-arm-hits! context id->label :keyword))))
                (testing (str id " vector arm")
                  (is (= (set (:vector expect))
                         (sql-arm-hits! context id->label :vector))))
                (testing (str id " hybrid")
                  (is (= (set (:semantic expect))
                         (hybrid-hits query id->label)))))
              (doseq [{translation-id :id, translation-query :queries, translation-expect :expect}
                      translations-by-source]
                (testing (str translation-id " semantic translation")
                  (is (= (set (:semantic translation-expect))
                         (hybrid-hits (:semantic translation-query) id->label))))))))))))

(deftest semantic-query-semantics-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [ee-embedding-query-prefix ""
                                       semantic-search-results-limit 50
                                       semantic-search-min-results-threshold 0]
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-initialized}
          (semantic.tu/with-only-semantic-weights
            (let [translations-by-source (group-by :source translations)]
              (doseq [case cases]
                (check-case! case (translations-by-source (:id case)))))))))))
