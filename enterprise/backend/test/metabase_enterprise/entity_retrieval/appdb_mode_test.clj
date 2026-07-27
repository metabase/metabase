(ns metabase-enterprise.entity-retrieval.appdb-mode-test
  "End-to-end round trip for the library entity index on pgvector-on-the-app-db: no MB_PGVECTOR_DB_URL,
  every table inside the library_retrieval schema, sharing the app-db pool.

  Opt-in and self-gated like [[metabase-enterprise.semantic-search.appdb-pgvector-mode-test]]: the round
  trip installs the vector extension and drops the library_retrieval schema on cleanup, so it runs only
  with MB_APPDB_PGVECTOR_MODE_TEST=true, set by the appdb-mode CI job.
  No test-util once-fixture: that gates on the dedicated-harness MB_PGVECTOR_DB_URL, which is what this
  namespace runs without."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval.core]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.migration.impl :as semantic.migration.impl]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

;; the mode probe answers only once the app db is set up, and this namespace can be the first thing a
;; fresh test JVM runs
(use-fixtures :once (fixtures/initialize :db :test-users))

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

(defn- appdb-can-host-library-index?
  "The extension, plus this feature's own schema. Gating on semantic search's check instead would let the
  harness pass where a role that can use `semantic_search` but not create ours fails in production."
  []
  (and (= :postgres (mdb/db-type))
       (try
         (and (semantic.db.datasource/check-app-db-pgvector-support)
              (#'entity-retrieval.core/app-db-schema-usable?*))
         (catch Exception _ false))))

(defn- opted-in?
  []
  (Boolean/parseBoolean (System/getenv "MB_APPDB_PGVECTOR_MODE_TEST")))

(deftest ^:synchronized appdb-library-index-round-trip-test
  (cond
    (not (opted-in?))
    (testing "destructive round trip requires the MB_APPDB_PGVECTOR_MODE_TEST opt-in — skipping"
      (is true))

    (not (appdb-can-host-library-index?))
    (testing "opted in, but the app db can't host the index — the CI service must be misconfigured"
      (is false "the appdb-mode job expects a pgvector-capable Postgres app db"))

    (schema-exists? (mdb/data-source) index-table/index-schema)
    (testing "opted in, but a library_retrieval schema already exists — refusing to clobber it"
      (is false "the appdb-mode job should start from a fresh app db"))

    :else
    (mt/with-premium-features #{:library :library-retrieval}
      ;; near-identical vectors, so the query lands on its document and nothing else
      (semantic.tu/with-mock-embeddings {"Dog Training Guide" [0.12 -0.34 0.56 -0.78]
                                         "puppy"              [0.13 -0.33 0.57 -0.77]}
        (with-redefs [semantic.db.datasource/db-url                  nil
                      semantic.db.datasource/data-source             (atom nil)
                      ;; a cooldown left open by another test would make pgvector-mode read :unavailable
                      semantic.db.datasource/app-db-pgvector-support (atom nil)
                      semantic.db.datasource/probe-cooldown-timer    (atom nil)
                      semantic.db.datasource/logged-pgvector-absent? (atom false)
                      semantic.embedding/get-configured-model        (fn [] semantic.tu/mock-embedding-model)]
          (let [app-db (mdb/data-source)]
            (try
              (testing "the app db serves as the store, with no dedicated URL"
                (is (= :app-db (semantic.db.datasource/pgvector-mode)))
                (is (true? (entity-retrieval.core/available?)))
                (is (= index-table/default-tables (index-table/tables))))
              (let [ds            (semantic.db.datasource/ensure-initialized-data-source!)
                    public-before (tables-in-schema app-db "public")]
                (is (identical? app-db ds) "app-db mode shares the application pool")
                ;; an index built before the schema existed, standing in for an upgrading instance. Its
                ;; rows must survive: rebuilding instead would re-embed the whole library.
                (jdbc/execute! app-db ["CREATE TABLE library_entity_index
                                        (doc_id text primary key, entity_type text, entity_local_id bigint,
                                         doc_type text, doc_text text, doc_embedding vector(4))"])
                (jdbc/execute! app-db ["INSERT INTO library_entity_index
                                        VALUES ('legacy-doc', 'table', 1, 'name', 'legacy', '[0,0,0,0]')"])
                (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                               :model/Collection {data-id :id} {:type     "library-data"
                                                                :location (str "/" lib-id "/")}
                               :model/Database   {db-id :id}   {}
                               :model/Table      {table-id :id} {:db_id        db-id
                                                                 :collection_id data-id
                                                                 :is_published true
                                                                 :active       true
                                                                 :name         "dog_training_guide"
                                                                 :display_name "Dog Training Guide"}]
                  (testing "adoption keeps the rows an upgrading instance already embedded"
                    ;; asserted here rather than after the reconcile, which GCs any document the library
                    ;; no longer implies -- including this synthetic one
                    (index-table/ensure-tables! ds semantic.tu/mock-embedding-model)
                    (is (= 1 (:count (jdbc/execute-one!
                                      app-db
                                      [(format "SELECT count(*) AS count FROM %s WHERE doc_id = 'legacy-doc'"
                                               (index-table/vectors-table-sql))]
                                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})))
                        "moved, not recreated empty -- otherwise the whole library re-embeds"))
                  (reconcile/reconcile! ds (constantly semantic.tu/mock-embedding-model))
                  (testing "both tables live inside the library_retrieval schema"
                    (is (= #{"library_entity_index" "library_entity_index_meta"}
                           (tables-in-schema app-db index-table/index-schema))))
                  (testing "the pre-existing index was moved, not left behind"
                    (is (not (contains? (tables-in-schema app-db "public") "library_entity_index"))))
                  (testing "the application schema is untouched"
                    (is (= public-before (tables-in-schema app-db "public"))))
                  (testing "retrieval round-trips through the app-db pool"
                    (is (= [{:model "table" :id table-id}]
                           (->> (entity-retrieval.core/search "puppy" 5)
                                (map :entity)
                                distinct
                                vec))))
                  (testing "a semantic-search wipe cannot reach the library index"
                    ;; the reason for a separate schema: this drops every table in the schema it is given
                    (jdbc/with-transaction [tx app-db]
                      (#'semantic.migration.impl/drop-all-but-migration-table
                       semantic.index-metadata/app-db-index-metadata tx))
                    (is (= #{"library_entity_index" "library_entity_index_meta"}
                           (tables-in-schema app-db index-table/index-schema))))))
              (finally
                (jdbc/execute! app-db [(format "DROP SCHEMA IF EXISTS %s CASCADE"
                                               index-table/index-schema)])))))))))
