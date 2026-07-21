(ns metabase-enterprise.semantic-search.appdb-pgvector-mode-test
  "End-to-end round trip for pgvector-on-the-app-db mode: no MB_PGVECTOR_DB_URL, semantic search runs
  against the application database inside the semantic_search schema, sharing the app-db pool.

  Opt-in and self-gated: the destructive round trip (installs the vector extension, drops the
  semantic_search schema on cleanup) only runs with MB_APPDB_PGVECTOR_MODE_TEST=true — set by the
  appdb-mode CI job, whose pgvector/pgvector app-db image it then REQUIRES (skips fail loudly there).
  Deliberately does NOT use test-util's once-fixture — that fixture gates on the dedicated-harness
  MB_PGVECTOR_DB_URL, which is exactly what this test runs without."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

;; the mode probe deliberately answers only after the app db is set up (mdb/db-is-set-up?), and this
;; namespace can be the first thing a fresh test JVM runs
(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest ^:parallel get-index-metadata-mode-test
  (testing "get-index-metadata returns the schema-qualified config exactly in app-db mode"
    (mt/with-dynamic-fn-redefs [semantic.db.datasource/pgvector-mode (constantly :app-db)]
      (is (= semantic.index-metadata/app-db-index-metadata (semantic.env/get-index-metadata))))
    (doseq [mode [:dedicated :unavailable]]
      (mt/with-dynamic-fn-redefs [semantic.db.datasource/pgvector-mode (constantly mode)]
        (is (= semantic.index-metadata/default-index-metadata (semantic.env/get-index-metadata)))))))

(defn- appdb-can-host-pgvector?
  "Real-environment gate for the round trip: a Postgres app db where the vector extension is installed or
  installable. Read-only — activation (init-semantic-search!) installs the extension and creates the
  schema."
  []
  (and (= :postgres (mdb/db-type))
       (try
         (semantic.db.datasource/check-app-db-pgvector-support)
         (catch Exception _ false))))

(defn- tables-in-schema
  [connectable schema]
  (->> (jdbc/execute! connectable
                      ["SELECT tablename FROM pg_tables WHERE schemaname = ?" schema]
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})
       (map :tablename)
       set))

(defn- schema-exists?
  [connectable schema]
  (boolean (seq (jdbc/execute! connectable
                               ["SELECT 1 FROM information_schema.schemata WHERE schema_name = ?" schema]
                               {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- opted-in?
  "True when MB_APPDB_PGVECTOR_MODE_TEST=true: the appdb-mode CI job (or a developer deliberately opting
  in). The round trip installs the vector extension and drops the semantic_search schema on cleanup, so it
  never runs implicitly against whatever Postgres app db happens to be around."
  []
  (Boolean/parseBoolean (System/getenv "MB_APPDB_PGVECTOR_MODE_TEST")))

(deftest ^:synchronized appdb-pgvector-round-trip-test
  (cond
    (not (opted-in?))
    (testing "destructive round trip requires the MB_APPDB_PGVECTOR_MODE_TEST opt-in — skipping"
      (is true))

    (not (appdb-can-host-pgvector?))
    (testing "opted in, but the app db can't host pgvector — the CI service must be misconfigured"
      (is false "the appdb-mode job expects a pgvector-capable Postgres app db"))

    ;; the app db already carries a semantic_search schema (a real app-db-mode deployment, or even an empty
    ;; schema) — this test's cleanup DROP SCHEMA CASCADE would clobber it, so refuse rather than destroy it
    (schema-exists? (mdb/data-source) "semantic_search")
    (testing "opted in, but a semantic_search schema already exists — refusing to clobber it"
      (is false "the appdb-mode job should start from a fresh app db with no semantic_search schema"))

    :else
    (mt/with-premium-features #{:semantic-search}
      ;; the pair mirrors mock-embeddings' doc/query geometry: nearly identical vectors, so the query
      ;; lands well inside the distance threshold for its document and nothing else
      (semantic.tu/with-mock-embeddings {"Dog Training Guide" [0.12 -0.34 0.56 -0.78]
                                         "puppy"              [0.13 -0.33 0.57 -0.77]}
        (with-redefs [semantic.db.datasource/db-url                 nil
                      semantic.db.datasource/data-source            (atom nil)
                      ;; a cooldown left open by another test would make pgvector-mode read :unavailable here
                      semantic.db.datasource/app-db-pgvector-support (atom nil)
                      semantic.db.datasource/probe-cooldown-timer    (atom nil)
                      semantic.db.datasource/logged-pgvector-absent? (atom false)
                      semantic.embedding/get-configured-model  (fn [] semantic.tu/mock-embedding-model)]
          (let [app-db (mdb/data-source)]
            (try
              (testing "activation is automatic: Postgres app db + extension, no URL"
                (is (= :app-db (semantic.db.datasource/pgvector-mode)))
                (is (semantic.db.datasource/pgvector-configured?)))
              (testing "the module uses the shared app-db pool and the schema-qualified config"
                (is (identical? app-db (semantic.env/get-pgvector-datasource!)))
                (is (nil? @semantic.db.datasource/data-source)
                    "the shared pool must never land in the module's own pool atom")
                (is (= "semantic_search" (:schema (semantic.env/get-index-metadata)))))
              (let [pgvector       (semantic.env/get-pgvector-datasource!)
                    index-metadata (semantic.env/get-index-metadata)
                    public-before  (tables-in-schema app-db "public")]
                (semantic.pgvector-api/init-semantic-search! pgvector index-metadata
                                                             (semantic.env/get-configured-embedding-model))
                (semantic.pgvector-api/index-documents! pgvector index-metadata (semantic.tu/mock-documents))
                (testing "every module table lives inside the semantic_search schema"
                  (let [tables (tables-in-schema app-db "semantic_search")]
                    (is (contains? tables "migration"))
                    (is (contains? tables "index_metadata"))
                    (is (contains? tables "index_control"))
                    (is (contains? tables "index_gate"))
                    (is (contains? tables (semantic.index/model-table-name semantic.tu/mock-embedding-model)))
                    (is (some #(str/starts-with? % "dlq_") tables))))
                (testing "search round-trips through the app-db pool"
                  ;; results are reconstructed from legacy_input, so the mock card comes back as model+id
                  (is (= [{:model "card" :id 123}]
                         (->> (mt/with-test-user :crowberto
                                (semantic.pgvector-api/query pgvector index-metadata
                                                             {:search-string "puppy" :archived? false}))
                              :results
                              (filter (comp #{"card"} :model))
                              (mapv #(select-keys % [:model :id]))))))
                (testing "the application schema is untouched"
                  (is (= public-before (tables-in-schema app-db "public")))))
              (finally
                (jdbc/execute! app-db ["DROP SCHEMA IF EXISTS semantic_search CASCADE"])))))))))
