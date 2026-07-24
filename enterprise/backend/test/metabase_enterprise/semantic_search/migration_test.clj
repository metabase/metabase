(ns metabase-enterprise.semantic-search.migration-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.db.connection :as semantic.db.connection]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.migration :as semantic.db.migration]
   [metabase-enterprise.semantic-search.db.migration.impl :as semantic.db.migration.impl]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.collections.models.collection :as collection]
   [metabase.embeddings.provider :as embeddings.provider]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.log.capture :as log.capture]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest migration-table-versions-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (letfn [(migrate-and-get-db-version
                [attempted-version]
                (with-redefs [semantic.db.migration.impl/schema-version          attempted-version
                              semantic.db.migration.impl/migrate-schema!         (constantly nil)
                              semantic.db.migration.impl/migrate-dynamic-schema! (constantly nil)]
                  (log.capture/with-log-messages-for-level [messages [metabase-enterprise.semantic-search.db.migration :info]]
                    (semantic.db.connection/with-migrate-tx [tx]
                      (semantic.db.migration/maybe-migrate! tx {:index-metadata semantic.index-metadata/default-index-metadata})
                      {:messages (messages)
                       :db-version (@#'semantic.db.migration/db-version semantic.index-metadata/default-index-metadata tx)}))))]
        (testing "Migration up works"
          (u/prog1 (migrate-and-get-db-version 130)
            (is (= 130 (:db-version <>)))
            (is (m/find-first (comp #{"Starting migration from version -1 to 130."} :message)
                              (:messages <>)))))
        (testing "Migration down is noop"
          (u/prog1 (migrate-and-get-db-version 1)
            (is (= 130 (:db-version <>)))
            (is (m/find-first
                 (comp #{(str "Database schema version (130) is newer than "
                              "code version (1). Not performing migration.")}
                       :message)
                 (:messages <>)))))
        (testing "Migration to the same version is noop"
          (u/prog1 (migrate-and-get-db-version 130)
            (is (= 130 (:db-version <>)))
            (is (m/find-first (comp #{"Migration already performed, skipping."} :message)
                              (:messages <>)))))))))

(deftest version-2-embedding-space-migration-preserves-index-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (let [pgvector  (semantic.env/get-pgvector-datasource!)
            table-name "index_legacy_preserved_4"
            model      {:provider "openai" :model-name "legacy-model" :vector-dimensions 4}
            space-id   (:embedding-space-id (embeddings.provider/legacy-resolved-model model))]
        (jdbc/execute! pgvector ["CREATE TABLE migration (version bigint PRIMARY KEY, migrated_at timestamp DEFAULT NOW(), status varchar(32))"])
        (jdbc/execute! pgvector ["INSERT INTO migration (version, status) VALUES (2, 'success')"])
        (jdbc/execute! pgvector [(str "CREATE TABLE index_metadata ("
                                      "id bigint PRIMARY KEY, provider text NOT NULL, model_name text NOT NULL, "
                                      "vector_dimensions int NOT NULL, table_name text NOT NULL UNIQUE, "
                                      "index_version int NOT NULL, index_created_at timestamptz NOT NULL)")])
        (jdbc/execute! pgvector ["CREATE TABLE index_control (id bigint PRIMARY KEY, version text NOT NULL, active_id int, active_updated_at timestamptz)"])
        (jdbc/execute! pgvector [(format "CREATE TABLE %s (id text PRIMARY KEY)" table-name)])
        (jdbc/execute! pgvector [(str "INSERT INTO index_metadata "
                                      "(id, provider, model_name, vector_dimensions, table_name, index_version, index_created_at) "
                                      "VALUES (7, 'openai', 'legacy-model', 4, ?, 5, NOW())")
                                 table-name])
        (jdbc/execute! pgvector ["INSERT INTO index_control (id, version, active_id) VALUES (0, '2', 7)"])
        (semantic.db.connection/with-migrate-tx [tx]
          (semantic.db.migration/maybe-migrate!
           tx {:index-metadata semantic.index-metadata/default-index-metadata}))
        (let [control-row  (jdbc/execute-one! pgvector ["SELECT active_id, version FROM index_control"]
                                              {:builder-fn jdbc.rs/as-unqualified-lower-maps})
              metadata-row (jdbc/execute-one! pgvector ["SELECT id, embedding_space_id, model_revision FROM index_metadata"]
                                              {:builder-fn jdbc.rs/as-unqualified-lower-maps})
              column-rows  (jdbc/execute! pgvector
                                          ["SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'index_metadata' AND column_name IN ('embedding_space_id', 'model_revision')"]
                                          {:builder-fn jdbc.rs/as-unqualified-lower-maps})
              nullable-by-column (into {} (map (juxt :column_name :is_nullable)) column-rows)
              active-model (get-in (semantic.index-metadata/get-active-index-state
                                    pgvector semantic.index-metadata/default-index-metadata)
                                   [:index :embedding-model])]
          (testing "the physical index and active pointer survive"
            (is (semantic.util/table-exists? pgvector table-name))
            (is (= {:active_id 7 :version "3"} control-row)))
          (testing "the existing metadata row is backfilled in place"
            (is (= {:id 7 :embedding_space_id space-id :model_revision nil} metadata-row))
            (is (= {"embedding_space_id" "NO" "model_revision" "YES"} nullable-by-column))
            (is (not (contains? active-model :model-revision)))))))))

(deftest schema-scoped-migration-drop-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (testing "app-db-mode migration reset only ever drops tables inside the module's schema"
        (let [pgvector       (semantic.env/get-pgvector-datasource!)
              index-metadata semantic.index-metadata/app-db-index-metadata
              schema-tables  (fn []
                               (->> (jdbc/execute! pgvector
                                                   ["SELECT tablename FROM pg_tables WHERE schemaname = 'semantic_search'"]
                                                   {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                                    (map :tablename)
                                    set))]
          ;; decoys playing the role of application tables; the second is a real app-db table name
          ;; (migration 056) squarely inside the module's naming family — the worst case for any
          ;; name-pattern-based scoping
          (jdbc/execute! pgvector ["CREATE TABLE decoy_app_table (id int)"])
          (jdbc/execute! pgvector ["CREATE TABLE semantic_search_token_tracking (id int)"])
          ;; positive control: a leftover table inside the module schema is fair game for the reset
          (jdbc/execute! pgvector ["CREATE SCHEMA semantic_search"])
          (jdbc/execute! pgvector ["CREATE TABLE semantic_search.legacy_junk (id int)"])
          (semantic.db.connection/with-migrate-tx [tx]
            (semantic.db.migration/maybe-migrate! tx {:index-metadata index-metadata}))
          (testing "tables outside the schema survive the version<2 drop-everything reset"
            (is (semantic.util/table-exists? pgvector "public.decoy_app_table"))
            (is (semantic.util/table-exists? pgvector "public.semantic_search_token_tracking")))
          (testing "inside the schema: junk dropped, module tables created"
            (is (= #{"migration" "index_metadata" "index_control" "index_gate"}
                   (schema-tables)))))))))

(deftest dedicated-reset-stays-in-default-schema-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (testing "the dedicated-mode reset wipes only the default schema — cohabitant schemas survive"
        (let [pgvector (semantic.env/get-pgvector-datasource!)]
          (jdbc/execute! pgvector ["CREATE SCHEMA cohabitant"])
          (jdbc/execute! pgvector ["CREATE TABLE cohabitant.precious (id int)"])
          (jdbc/execute! pgvector ["CREATE TABLE doomed (id int)"])
          (semantic.db.connection/with-migrate-tx [tx]
            (semantic.db.migration/maybe-migrate! tx {:index-metadata semantic.index-metadata/default-index-metadata}))
          (is (true? (semantic.util/table-exists? pgvector "cohabitant.precious")))
          (is (false? (semantic.util/table-exists? pgvector "public.doomed"))))))))

(deftest dedicated-reset-refuses-app-db-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (testing "the dedicated-mode reset refuses a database that looks like a Metabase app db"
        (let [pgvector (semantic.env/get-pgvector-datasource!)]
          ;; core_user is the app-db sentinel; a generic Liquibase table alongside it must not mask the refusal
          (jdbc/execute! pgvector ["CREATE TABLE databasechangelog (id int)"])
          (jdbc/execute! pgvector ["CREATE TABLE core_user (id int)"])
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Metabase application"
                                (semantic.db.connection/with-migrate-tx [tx]
                                  (semantic.db.migration/maybe-migrate!
                                   tx {:index-metadata semantic.index-metadata/default-index-metadata}))))
          (testing "nothing was dropped"
            (is (true? (semantic.util/table-exists? pgvector "public.core_user")))))))))

(deftest dedicated-reset-allows-liquibase-only-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (testing "a generic Liquibase databasechangelog does not, on its own, look like a Metabase app db"
        (let [pgvector (semantic.env/get-pgvector-datasource!)]
          (jdbc/execute! pgvector ["CREATE TABLE databasechangelog (id int)"])
          (semantic.db.connection/with-migrate-tx [tx]
            (semantic.db.migration/maybe-migrate!
             tx {:index-metadata semantic.index-metadata/default-index-metadata}))
          (testing "migration proceeds: the module tables are created and the stray table is wiped"
            (is (true? (semantic.util/table-exists? pgvector "public.index_metadata")))
            (is (false? (semantic.util/table-exists? pgvector "public.databasechangelog")))))))))

(defn- executions-overlap?
  "Check if any two executions overlap in time. Each entry is [tid :started/:ended timestamp].
   Returns true if there's any overlap (which would indicate lock failure)."
  [log]
  (let [by-thread (group-by first log)]
    (when (= 2 (count by-thread))
      (let [[[_tid1 entries1] [_tid2 entries2]] (seq by-thread)
            get-time (fn [entries event]
                       (->> entries (filter #(= event (second %))) first last))
            start1 (get-time entries1 :started)
            end1 (get-time entries1 :ended)
            start2 (get-time entries2 :started)
            end2 (get-time entries2 :ended)]
        (when (and start1 end1 start2 end2)
          ;; Overlap occurs if one execution starts before the other ends AND vice versa
          ;; i.e., start1 < end2 AND start2 < end1
          (and (t/before? start1 end2)
               (t/before? start2 end1)))))))

(deftest migration-lock-coordination-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (testing "Database lock prevents concurrent migration execution"
        (let [original-write-fn @#'semantic.db.migration/write-successful-migration!
              original-maybe-migrate @#'semantic.db.migration/maybe-migrate!
              results (atom {:executed-migrations 0
                             :log []})]
          (with-redefs-fn {;; Wrap maybe-migrate! to log timestamps AFTER lock is acquired
                           ;; (maybe-migrate! is called inside with-migrate-tx, after the lock)
                           #'semantic.db.migration/maybe-migrate!
                           (fn [& args]
                             (let [tid (.getId (Thread/currentThread))]
                               (swap! results update :log conj [tid :started (t/local-date-time)])
                               (try
                                 (Thread/sleep 200)
                                 (apply original-maybe-migrate args)
                                 (finally
                                   (swap! results update :log conj [tid :ended (t/local-date-time)])))))
                           #'semantic.db.migration/write-successful-migration!
                           (fn [& args]
                             (Thread/sleep 2000)
                             (apply original-write-fn args)
                             (swap! results update :executed-migrations inc)
                             nil)}
            (fn []
              (let [;; thread 1 attempts migration on clean db
                    f1 (future (semantic.core/init! (semantic.tu/mock-documents) nil))
                    ;; thread 2 attempts migration concurrently
                    f2 (future (semantic.core/init! (semantic.tu/mock-documents) nil))]
                ;; wait for completion
                @f1
                @f2
                (testing "Single migration performed"
                  (is (= 1 (:executed-migrations @results))))
                (testing "Executions do not overlap"
                  (is (not (executions-overlap? (:log @results)))
                      "Executions should not overlap - lock should serialize them"))))))))))

(defn- map-contains-keys?
  [m kseq]
  (reduce #(and %1 (contains? m %2)) true kseq))

(defn- qualify
  [q xs]
  (into []
        (map (fn [x] (keyword (name q) (name x))))
        xs))

(deftest expected-db-schema-after-migration-test
  (try
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db-defaults!
        (semantic.core/init! (semantic.tu/mock-documents) nil)
        (testing "migration table has expected columns"
          (is (map-contains-keys?
               (jdbc/execute-one! (semantic.env/get-pgvector-datasource!)
                                  (sql/format {:select [:*]
                                               :from [:migration]}))
               (qualify :migration [:migrated_at
                                    :status
                                    :version]))))
        (testing "control table has expected columns"
          (is (map-contains-keys?
               (jdbc/execute-one! (semantic.env/get-pgvector-datasource!)
                                  (sql/format {:select [:*]
                                               :from [:index_control]}))
               (qualify :index_control [:active_id
                                        :active_updated_at
                                        :id
                                        :version]))))
        (testing "metadata table has expected columns"
          (is  (map-contains-keys?
                (jdbc/execute-one! (semantic.env/get-pgvector-datasource!)
                                   (sql/format {:select [:*]
                                                :from [:index_metadata]}))
                (qualify :index_metadata [:id
                                          :index_created_at
                                          :index_version
                                          :indexer_last_poll
                                          :indexer_last_seen
                                          :indexer_last_seen_hash
                                          :indexer_last_seen_id
                                          :embedding_space_id
                                          :model_name
                                          :model_revision
                                          :provider
                                          :table_name
                                          :vector_dimensions]))))
        (testing "index table has expected columns"
          (let [index-table (->
                             (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                                (sql/format {:select [[:im.table_name]]
                                                             :from [[:index_control :ic]]
                                                             :join [[:index_metadata :im]
                                                                    [:= :ic.active_id :im.id]]}))
                             :index_metadata/table_name)]
            (is (=? #{"archived"
                      "collection_id"
                      "collection_type"
                      "content"
                      "created_at"
                      "creator_id"
                      "curated"
                      "dashboardcard_count"
                      "database_id"
                      "data_authority"
                      "data_layer"
                      "display_type"
                      "embedding"
                      "id"
                      "last_editor_id"
                      "last_viewed_at"
                      "legacy_input"
                      "metadata"
                      "model"
                      "model_created_at"
                      "model_id"
                      "model_updated_at"
                      "name"
                      "official_collection"
                      "personal_owner_id"
                      "pinned"
                      "root_collection_type"
                      "text_search_vector"
                      "text_search_with_native_query_vector"
                      "verified"
                      "view_count"}
                    (->>  (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                                         (sql/format {:select [:column_name]
                                                      :from [:information_schema.columns]
                                                      :where [[:= :table_name [:inline index-table]]]}))
                          (map :columns/column_name)
                          set)))))
        (testing "index table has expected columns"
          (is (= ["document" "document_hash" "gated_at" "id" "model" "model_id" "updated_at"]
                 (->> (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                                     (sql/format {:select [:column_name]
                                                  :from [:information_schema.columns]
                                                  :where [[:= :table_name [:inline "index_gate"]]]}))
                      (map :columns/column_name)
                      sort
                      vec))))))
    (catch Throwable e
      (log/fatal e)
      (throw e))))

(defn- has-column?!
  [tx table-name column-name]
  (seq (jdbc/execute-one! tx (sql/format {:select [[[:raw 1] :contains]]
                                          :from [:information_schema.columns]
                                          :where [:and
                                                  [:= :table_name [:inline table-name]]
                                                  [:= :column_name [:inline column-name]]]}))))

(deftest dynamic-schema-migration-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (semantic.core/init! (semantic.tu/mock-documents) nil)
      ;; add column to index table
      (let [original-dynamic-schema semantic.db.migration.impl/dynamic-schema-version]
        (with-redefs-fn {#'semantic.db.migration.impl/migrate-dynamic-schema!
                         (fn [tx _opts]
                           (let [table_names (->> (jdbc/execute! tx
                                                                 (sql/format {:select [:table_name]
                                                                              :from [:index_metadata]
                                                                              :where [[:< :index_version semantic.db.migration.impl/dynamic-schema-version]]
                                                                              :group-by [:table_name]}))
                                                  (map :index_metadata/table_name)
                                                  set)]
                             (doseq [table_name table_names]
                               (when-not (has-column?! tx table_name "new_col")
                                 (jdbc/execute! tx (sql/format {:alter-table [table_name] :add-column [[:new_col :int]]}))))
                             (jdbc/execute! tx (sql/format {:update :index_metadata
                                                            :set {:index_version semantic.db.migration.impl/dynamic-schema-version}
                                                            :where [[:in :table_name table_names]]}))))
                         #'semantic.db.migration.impl/dynamic-schema-version (inc original-dynamic-schema)}
          (fn []
            ;; Trigger migration by next initialization attempt
            (semantic.core/init! (semantic.tu/mock-documents) nil)
            (let [#:index_metadata{:keys [index_version table_name]}
                  (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                     (sql/format
                                      {:select [:*]
                                       :from [:index_metadata]}))]
              (testing "Index metadata table ids were updated"
                (is (= index_version semantic.db.migration.impl/dynamic-schema-version)))
              (testing "Index table contains new column"
                (is (has-column?! (semantic.db.datasource/ensure-initialized-data-source!)
                                  table_name "new_col"))))))))))

(deftest schema-version-match-default-version-test
  (testing "Default schema should match dynamic schema version"
    (is (= semantic.db.migration.impl/dynamic-schema-version
           (-> (semantic.index/default-index semantic.tu/mock-embedding-model)
               :version)))))

(defn- active-index-table-name!
  [pgvector index-metadata]
  (let [{:keys [control-table-name metadata-table-name]} index-metadata]
    (->> (jdbc/execute-one! pgvector
                            (sql/format {:select [:im.table_name]
                                         :from   [[(keyword metadata-table-name) :im]]
                                         :join   [[(keyword control-table-name) :ic] [:= :ic.active_id :im.id]]}))
         vals
         first)))

(defn- insert-index-row!
  "Raw INSERT into the active index table for backfill tests. Fills in the minimum NOT NULL
  columns with placeholder values; `row` supplies anything else (model, model_id,
  collection_type, root_collection_type)."
  [pgvector kw-tbl row]
  (jdbc/execute! pgvector
                 (sql/format {:insert-into kw-tbl
                              :values      [(merge {:name                                 [:inline ""]
                                                    :content                              [:inline ""]
                                                    :text_search_vector                   [:to_tsvector [:inline "simple"] [:inline ""]]
                                                    :text_search_with_native_query_vector [:to_tsvector [:inline "simple"] [:inline ""]]
                                                    :embedding                            [:raw "'[0,0,0,0]'::vector"]}
                                                   row)]}
                             :quoted true)))

(deftest migration-4-backfill-test
  (testing "migration 4 backfills root_collection_type from the gate doc, then via an appdb walk of the Library forest"
    (mt/with-premium-features #{:semantic-search}
      ;; :mock-initialized puts the 4-dim mock embedding model in scope so the placeholder
      ;; `[0,0,0,0]` embedding in [[insert-index-row!]] matches the index column's dimensions.
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        ;; Stand up a Library tree: library root → library-data sub → library-data sub-sub,
        ;; plus a library-metrics sub under the root. The backfill should resolve every nested
        ;; collection's `root_collection_type` to the top-level Library's own `:type`.
        (mt/with-temp [:model/Collection {lib-id :id} {:name "Library" :type collection/library-collection-type :location "/"}
                       :model/Collection {data-id :id} {:name     "Data"
                                                        :type     collection/library-data-collection-type
                                                        :location (str "/" lib-id "/")}
                       :model/Collection {nested-data-id :id} {:name     "Nested Data"
                                                               :type     collection/library-data-collection-type
                                                               :location (str "/" lib-id "/" data-id "/")}
                       :model/Collection {metrics-id :id} {:name     "Metrics"
                                                           :type     collection/library-metrics-collection-type
                                                           :location (str "/" lib-id "/")}
                       :model/Collection {other-id :id} {:name "Regular" :location "/"}]
          (let [pgvector       (semantic.env/get-pgvector-datasource!)
                index-metadata (semantic.env/get-index-metadata)
                gate-tbl       (keyword (:gate-table-name index-metadata))
                meta-tbl       (keyword (:metadata-table-name index-metadata))
                kw-tbl         (keyword (active-index-table-name! pgvector index-metadata))]
            ;; row 1: NULL root_collection_type; matching gate doc carries "library" in its document JSON
            (insert-index-row! pgvector kw-tbl {:model [:inline "card"] :model_id [:inline "1"]})
            ;; row 2: collection_id = top-level Library (root of its own tree)
            (insert-index-row! pgvector kw-tbl {:model         [:inline "card"]
                                                :model_id      [:inline "2"]
                                                :collection_id lib-id})
            ;; row 3: collection_id = first-level library-data sub-collection
            (insert-index-row! pgvector kw-tbl {:model         [:inline "card"]
                                                :model_id      [:inline "3"]
                                                :collection_id data-id})
            ;; row 4: collection_id = deeper library-data sub-sub-collection
            (insert-index-row! pgvector kw-tbl {:model         [:inline "card"]
                                                :model_id      [:inline "4"]
                                                :collection_id nested-data-id})
            ;; row 5: collection_id = library-metrics sub-collection — still resolves to "library"
            (insert-index-row! pgvector kw-tbl {:model         [:inline "card"]
                                                :model_id      [:inline "5"]
                                                :collection_id metrics-id})
            ;; row 6: collection_id = a non-library collection — backfill must leave NULL
            (insert-index-row! pgvector kw-tbl {:model         [:inline "card"]
                                                :model_id      [:inline "6"]
                                                :collection_id other-id})
            ;; row 7: already-populated root_collection_type — backfill must leave it alone
            (insert-index-row! pgvector kw-tbl {:model                [:inline "card"]
                                                :model_id             [:inline "7"]
                                                :root_collection_type [:inline "library-data"]})
            ;; Gate doc for row 1 — JSON includes root_collection_type
            (jdbc/execute! pgvector
                           (sql/format {:insert-into gate-tbl
                                        :values [{:id            [:inline "card_1"]
                                                  :model         [:inline "card"]
                                                  :model_id      [:inline "1"]
                                                  :updated_at    [:now]
                                                  :document      [:cast [:inline "{\"root_collection_type\":\"library\"}"] :jsonb]
                                                  :document_hash [:inline "h"]}]}
                                       :quoted true))
            ;; Roll metadata.index_version back to 3 so migration 4 re-runs against the table.
            (jdbc/execute! pgvector
                           (sql/format {:update meta-tbl
                                        :set    {:index_version 3}}))
            ;; Trigger re-migration via init.
            (semantic.core/init! (semantic.tu/mock-documents) nil)
            ;; Verify each backfill branch.
            (let [rows-by-id (->> (jdbc/execute! pgvector
                                                 (sql/format {:select   [:model_id :root_collection_type]
                                                              :from     [kw-tbl]
                                                              :order-by [:model_id]}
                                                             :quoted true)
                                                 {:builder-fn jdbc.rs/as-unqualified-maps})
                                  (map (juxt :model_id :root_collection_type))
                                  (into {}))]
              (is (= {"1" "library"        ; pulled from gate.document->>'root_collection_type'
                      "2" "library"        ; collection_id IS the library root
                      "3" "library"        ; library-data sub-collection — walks up to library
                      "4" "library"        ; deeper library-data sub-sub — still walks up
                      "5" "library"        ; library-metrics sub-collection — still walks up
                      "6" nil              ; non-library collection, no gate doc
                      "7" "library-data"}  ; pre-existing value preserved
                     rows-by-id)))))))))

(deftest candidate-table-ids-test
  (testing "Migration 5 sweeps only active published/authoritative tables, sorted into the two id lists it
            backfills — others are implicitly not curated (table curation never uses root_collection_type)"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {pub :id}      {:db_id db-id :active true  :is_published true :data_layer :final}
                   :model/Table {auth :id}     {:db_id db-id :active true  :data_authority :authoritative}
                   :model/Table {inactive :id} {:db_id db-id :active false :is_published true :data_layer :final}
                   :model/Table {plain :id}    {:db_id db-id :active true}]
      (let [{:keys [authoritative published]} (#'semantic.db.migration.impl/candidate-table-ids)
            authoritative (set authoritative)
            published     (set published)]
        (is (contains? published (str pub))      "published-final tables go in :published")
        (is (contains? authoritative (str auth)) "authoritative tables go in :authoritative")
        (is (not (contains? published (str inactive))) "inactive tables are skipped")
        (is (not (contains? published (str plain)))    "plain tables aren't candidates")
        (is (not (contains? authoritative (str plain))))))))

(deftest official-collection-dashboard-ids-test
  (testing "Migration 5 backfills official-only dashboards (official_collection is new on the spec, so
            existing index rows lack it)"
    (mt/with-temp [:model/Collection {official :id} {:authority_level :official}
                   :model/Collection {normal :id}   {}
                   :model/Dashboard {od :id} {:collection_id official}
                   :model/Dashboard {nd :id} {:collection_id normal}
                   :model/Dashboard {ad :id} {:collection_id official :archived true}]
      (let [ids (set (#'semantic.db.migration.impl/official-collection-dashboard-ids))]
        (is (contains? ids (str od))      "dashboards in official collections are backfilled")
        (is (not (contains? ids (str nd))) "dashboards in normal collections are not")
        (is (not (contains? ids (str ad))) "archived dashboards are skipped")))))
