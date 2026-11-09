(ns ^:mb/app-db-migrations-test metabase-enterprise.data-complexity-score.appdb-source-migration-test
  "The CLI's reads against appdbs migrated to an older schema, so a change that breaks an older appdb fails here rather
  than in a customer's run."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase-enterprise.data-complexity-score.cli :as cli]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase-enterprise.data-complexity-score.schema :as data-complexity-score.schema]
   [metabase-enterprise.data-complexity-score.synonym-source :as synonym-source]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- insert-database! []
  (t2/insert-returning-pk! :metabase_database {:name       "Complexity CLI Test DB"
                                               :engine     "h2"
                                               :details    "{}"
                                               :created_at :%now
                                               :updated_at :%now}))

(defn- insert-collection! []
  (t2/insert-returning-pk! :collection (merge (mt/with-temp-defaults :model/Collection)
                                              {:name "Complexity CLI Test Collection"
                                               :slug "complexity_cli_test_collection"})))

(defn- cli-table-row
  "The CLI's read of the Table with `table-id`, limited to the columns user settings can change."
  [table-id]
  ;; No Database has this id, so the read excludes no Table as the audit Database's.
  (some #(when (= table-id (:id %)) (select-keys % [:is_published :collection_id :data_layer :data_authority]))
        ((:universe-tables-fn (appdb-source/reads)) Integer/MAX_VALUE)))

(deftest cli-refuses-an-appdb-below-v59-test
  (testing "an appdb from before the `data_layer` conversion is refused, and scores once migrated through it"
    (impl/test-migrations ["v59.2026-03-17T13:00:00"] [migrate!]
      (let [e (try (appdb-source/verify-supported-appdb!)
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (=? {:cli-validation true} (ex-data e)))
        (is (re-find #"0\.59" (ex-message e))))
      (migrate!)
      (is (nil? (appdb-source/verify-supported-appdb!)))
      (testing "the whole read path runs against the migrated appdb and yields a score the schema accepts"
        (is (mr/validate ::data-complexity-score.schema/data-complexity-score.score-data
                         (complexity/complexity-scores :metabot-scope  (metabot-scope/internal-metabot-scope)
                                                       :reads          (appdb-source/reads)
                                                       :emit-snowplow? false)))))))

(deftest cli-reads-user-settings-on-a-v64-appdb-test
  (testing "on an appdb where v64 moved user values into the settings table, the CLI reads them from there"
    (impl/test-migrations ["v64.2026-09-11T00:00:00" "v64.2026-09-11T00:00:07"] [migrate!]
      (let [db-id         (insert-database!)
            collection-id (insert-collection!)
            table-id      (t2/insert-returning-pk! :metabase_table {:db_id          db-id
                                                                    :name           "published"
                                                                    :active         true
                                                                    :is_published   true
                                                                    :collection_id  collection-id
                                                                    :data_layer     "final"
                                                                    :data_authority "authoritative"
                                                                    :created_at     :%now
                                                                    :updated_at     :%now})]
        (migrate!)
        (testing "metabase_table alone says the Table is unpublished"
          (is (=? {:is_published false, :collection_id nil}
                  (t2/select-one [:metabase_table :is_published :collection_id] :id table-id))))
        (is (= {:is_published   true
                :collection_id  collection-id
                :data_layer     "final"
                :data_authority "authoritative"}
               (cli-table-row table-id)))))))

(deftest cli-reads-metabase-table-after-the-copy-back-test
  (testing "once ceygl0 copies user values back into metabase_table, the CLI reads metabase_table alone"
    (impl/test-migrations ["ceygl0" "ceygl0"] [migrate!]
      (let [db-id         (insert-database!)
            collection-id (insert-collection!)
            table-id      (t2/insert-returning-pk! :metabase_table {:db_id      db-id
                                                                    :name       "published"
                                                                    :active     true
                                                                    :created_at :%now
                                                                    :updated_at :%now})
            user-values   {:is_published   true
                           :collection_id  collection-id
                           :data_layer     "final"
                           :data_authority "authoritative"}]
        (t2/insert! :metabase_table_user_settings (assoc user-values :table_id table-id, :data_layer_set true))
        (testing "before the copy-back, the values come from the settings row"
          (is (= user-values (cli-table-row table-id))))
        (migrate!)
        (testing "after it, metabase_table holds them and a later settings value no longer decides"
          (t2/update! :metabase_table_user_settings :table_id table-id {:is_published false})
          (is (= user-values (cli-table-row table-id))))))))

(deftest cli-reads-settings-an-older-version-wrote-test
  (testing "on an appdb from before `setting.value_with_aad`, the CLI reads a persisted setting from `setting.value`"
    (impl/test-migrations ["v58.2026-09-01T00:00:00"] [_migrate!]
      (t2/insert! :setting {:key "data-complexity-scoring-synonym-embedding-model", :value "custom-model"})
      ;; Settings read the DB only once it is marked set up. The CLI's connect marks it, the migration harness does not.
      (mdb/finish-db-setup!)
      (testing "the Setting model reads it as unset"
        (setting/restore-cache!)
        (is (=? {:embedding-model {:model-name "sentence-transformers/all-MiniLM-L6-v2"}}
                (synonym-source/fingerprint-fragment))))
      (mt/with-dynamic-fn-redefs [mdb/setup-db-without-migrations! (fn [])]
        (#'cli/setup-appdb!))
      (testing "the scoring options and the fingerprint both use it"
        (is (=? {:embedding-model-meta {:model-name "custom-model"}}
                (synonym-source/complexity-scores-opts)))
        (is (=? {:embedding-model {:model-name "custom-model"}}
                (synonym-source/fingerprint-fragment)))))))
