(ns metabase-enterprise.audit-app.audit-test
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.audit-app.audit :as ee-audit]
   [metabase-enterprise.audit-app.settings :as ee.audit.settings]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.audit-app.core :as audit]
   [metabase.core.core :as mbc]
   [metabase.lib.core :as lib]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.plugins.core :as plugins]
   [metabase.sync.core :as sync.core]
   [metabase.sync.sync :as sync]
   [metabase.sync.task.sync-databases :as task.sync-databases]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.nio.file Files OpenOption)
   (java.util.jar JarEntry JarOutputStream)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :plugins))

(defn do-with-audit-db-restoration! [thunk]
  (mbc/ensure-audit-db-installed!)
  (try
    (thunk)
    (finally
      (mbc/ensure-audit-db-installed!))))

(defmacro with-audit-db-restoration! [& body]
  "Calls `ensure-audit-db-installed!` before and after `body` to ensure that the audit DB is installed and then
  restored if necessary. Also disables audit content loading if it is already loaded."
  `(do-with-audit-db-restoration! (fn [] ~@body)))

(deftest audit-db-installation-test
  (mt/test-drivers #{:postgres :h2 :mysql}
    (testing "Audit DB content is not installed when it is not found"
      (t2/delete! :model/Database :is_audit true)
      ;; reset checksum
      (audit/last-analytics-checksum! 0)
      (with-redefs [ee-audit/analytics-dir-resource nil]
        (is (nil? @#'ee-audit/analytics-dir-resource))
        (is (= ::ee-audit/installed (ee-audit/ensure-audit-db-installed!)))
        (is (= audit/audit-db-id (t2/select-one-fn :id :model/Database {:where [:= :is_audit true]}))
            "Audit DB is installed.")
        (is (= 0 (t2/count :model/Card {:where [:= :database_id audit/audit-db-id]}))
            "No cards created for Audit DB."))
      (t2/delete! :model/Database :is_audit true)
      (audit/last-analytics-checksum! 0))
    (testing "Audit DB content is installed when it is found"
      (is (= ::ee-audit/installed (ee-audit/ensure-audit-db-installed!)))
      (is (= audit/audit-db-id (t2/select-one-fn :id :model/Database {:where [:= :is_audit true]}))
          "Audit DB is installed.")
      (is (some? (io/resource "instance_analytics")))
      (is (not= 0 (t2/count :model/Card {:where [:= :database_id audit/audit-db-id]}))
          "Cards should be created for Audit DB when the content is there."))
    (testing "Cards in the audit collection have non-empty :result_metadata after installation"
      (let [audit-cards             (t2/select [:model/Card :id :name :result_metadata :card_schema]
                                               :database_id audit/audit-db-id)
            audit-cards-no-metadata (filter (comp empty? :result_metadata) audit-cards)]
        (is (seq audit-cards))
        (is (empty? audit-cards-no-metadata)
            (str "Cards without :result_metadata: "
                 (pr-str (mapv :name audit-cards-no-metadata))))))
    (testing "Audit DB starts with no permissions for all users"
      (is (= {:perms/manage-database       :no
              :perms/download-results      :one-million-rows
              :perms/manage-table-metadata :no
              :perms/view-data             :unrestricted
              :perms/create-queries        :no
              :perms/transforms            :no}
             (-> (data-perms.graph/data-permissions-graph :db-id audit/audit-db-id :audit? true)
                 (get-in [(u/the-id (perms-group/all-users)) audit/audit-db-id])))))
    (testing "Audit DB does not have scheduled syncs"
      (let [db-has-sync-job-trigger? (fn [db-id]
                                       (contains?
                                        (set (map #(-> % :data (get "db-id"))
                                                  (task/job-info "metabase.task.sync-and-analyze.job")))
                                        db-id))]
        (is (not (db-has-sync-job-trigger? audit/audit-db-id)))))
    (testing "Audit DB doesn't get re-installed unless the engine changes"
      (mt/with-dynamic-fn-redefs [ee.audit.settings/load-analytics-content (constantly nil)]
        (is (= ::ee-audit/no-op (ee-audit/ensure-audit-db-installed!)))
        (t2/update! :model/Database :is_audit true {:engine "datomic"})
        (is (= ::ee-audit/updated (ee-audit/ensure-audit-db-installed!)))
        (is (= ::ee-audit/no-op (ee-audit/ensure-audit-db-installed!)))
        (t2/update! :model/Database :is_audit true {:engine "h2"})))))

(deftest instance-analytics-content-is-copied-to-mb-plugins-dir-test
  (mt/with-temp-env-var-value! [mb-plugins-dir "card_catalogue_dir"]
    (try
      (let [plugins-dir (plugins/plugins-dir)]
        (fs/create-dirs plugins-dir)
        (#'ee-audit/ia-content->plugins plugins-dir)
        (doseq [top-level-plugin-dir (map (comp str fs/absolutize)
                                          (fs/list-dir (fs/path plugins-dir "instance_analytics")))]
          (testing (str top-level-plugin-dir " starts with plugins value")
            (is (str/starts-with? top-level-plugin-dir (str (fs/absolutize plugins-dir)))))))
      (finally
        (fs/delete-tree (plugins/plugins-dir))))))

(deftest all-instance-analytics-content-is-copied-from-mb-plugins-dir-test
  (mt/with-temp-env-var-value! [mb-plugins-dir "card_catalogue_dir"]
    (try
      (#'ee-audit/ia-content->plugins (plugins/plugins-dir))
      (is (= (count (file-seq (io/file (str (fs/path (plugins/plugins-dir) "instance_analytics")))))
             (count (file-seq (io/file (io/resource "instance_analytics"))))))
      (finally
        (fs/delete-tree (plugins/plugins-dir))))))

(defn- get-audit-db-trigger-keys []
  (let [trigger-keys (->> (task/scheduler-info) :jobs (mapcat :triggers) (map :key))
        audit-db? #(str/includes? % (str audit/audit-db-id))]
    (filter audit-db? trigger-keys)))

(deftest no-sync-tasks-for-audit-db
  ;; clear out the old audit-db instance so that a new one can setup triggers with the temp scheduler
  (t2/delete! :model/Database :id audit/audit-db-id)
  (mt/with-temp-scheduler!
    (#'task.sync-databases/job-init)
    (with-audit-db-restoration!
      (is (= '("metabase.task.update-field-values.trigger.13371337")
             (get-audit-db-trigger-keys))
          "no sync scheduled after installation")
      (mt/with-dynamic-fn-redefs [task.sync-databases/job-context->database-id (constantly audit/audit-db-id)]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cannot sync Database: It is the audit db."
             (#'task.sync-databases/sync-and-analyze-database! "job-context"))))
      (is (= '("metabase.task.update-field-values.trigger.13371337")
             (get-audit-db-trigger-keys))
          "no sync occurred even when called directly for audit db."))))

(deftest checksum-not-recorded-when-load-fails-test
  (mt/test-drivers #{:postgres :h2 :mysql}
    (t2/delete! :model/Database :is_audit true)
    (testing "If audit content loading throws an exception, the checksum should not be stored"
      (audit/last-analytics-checksum! 0)
      (mt/with-dynamic-fn-redefs [serialization.cmd/v2-load-internal! (fn [& _] (throw (Exception. "Audit loading failed")))]
        (is (thrown-with-msg? Exception
                              #"Audit loading failed"
                              (ee-audit/ensure-audit-db-installed!)))
        (is (= 0 (audit/last-analytics-checksum)))))))

(deftest should-load-audit?-test
  (testing "load-analytics-content + checksums dont match => load"
    (is (#'ee-audit/should-load-audit? true 1 3)))
  (testing "load-analytics-content + last-checksum is -1 => load (even if current-checksum is also -1)"
    (is (#'ee-audit/should-load-audit? true -1 -1)))
  (testing "checksums are the same => do not load"
    (is (not (#'ee-audit/should-load-audit? true 3 3))))
  (testing "load-analytics-content false => do not load"
    (is (not (#'ee-audit/should-load-audit? false 3 5))))
  (testing "load-analytics-content is false + checksums do not match  => do not load"
    (is (not (#'ee-audit/should-load-audit? false 1 3)))))

(deftest views-checksum-works-for-jar-resources-test
  (let [jar-path (Files/createTempFile "instance-analytics-views" ".jar" (make-array java.nio.file.attribute.FileAttribute 0))
        resource "migrations/instance_analytics_views"
        entries  [["users/v1/postgres-users.sql"           "select 1;"]
                  ["dashboards/v1/postgres-dashboards.sql" "select 2;"]]
        jar-url  (java.net.URL. (format "jar:%s!/%s" (.toUri jar-path) resource))
        expected (hash (sort-by first (mapv (fn [[rel sql]] [rel sql]) entries)))]
    (try
      (with-open [out (-> jar-path
                          (Files/newOutputStream (into-array OpenOption []))
                          io/output-stream
                          JarOutputStream.)]
        (doseq [[rel sql] entries]
          (.putNextEntry out (JarEntry. (str resource "/" rel)))
          (.write out (.getBytes ^String sql StandardCharsets/UTF_8))
          (.closeEntry out)))
      (mt/with-dynamic-fn-redefs [io/resource (fn [path]
                                                (when (= path resource)
                                                  jar-url))]
        (is (= expected (#'ee-audit/views-checksum))))
      (finally
        (Files/deleteIfExists jar-path)))))

(deftest views-checksum-detects-rename-test
  (testing "renaming a file changes the checksum (path is part of the hash)"
    (let [make-jar (fn [entries]
                     (let [jar-path (Files/createTempFile "instance-analytics-views" ".jar"
                                                          (make-array java.nio.file.attribute.FileAttribute 0))
                           resource "migrations/instance_analytics_views"]
                       (with-open [out (-> jar-path
                                           (Files/newOutputStream (into-array OpenOption []))
                                           io/output-stream
                                           JarOutputStream.)]
                         (doseq [[rel sql] entries]
                           (.putNextEntry out (JarEntry. (str resource "/" rel)))
                           (.write out (.getBytes ^String sql StandardCharsets/UTF_8))
                           (.closeEntry out)))
                       [jar-path (java.net.URL. (format "jar:%s!/%s" (.toUri jar-path) resource))]))
          [jar-a url-a] (make-jar [["a.sql" "select 1;"]])
          [jar-b url-b] (make-jar [["b.sql" "select 1;"]])]
      (try
        (let [checksum-a (mt/with-dynamic-fn-redefs [io/resource (constantly url-a)]
                           (#'ee-audit/views-checksum))
              checksum-b (mt/with-dynamic-fn-redefs [io/resource (constantly url-b)]
                           (#'ee-audit/views-checksum))]
          (is (not= checksum-a checksum-b)))
        (finally
          (Files/deleteIfExists jar-a)
          (Files/deleteIfExists jar-b))))))

(deftest views-checksum-not-recorded-when-sync-fails-test
  (mt/with-temp [:model/Database audit-db {:engine "h2" :is_audit true}]
    (let [checksum 12345]
      (ee.audit.settings/last-analytics-views-checksum! 0)
      (mt/with-dynamic-fn-redefs [ee-audit/views-checksum (constantly checksum)
                                  sync/sync-database! (fn [& _]
                                                        (throw (Exception. "sync failed")))]
        (is (nil? (#'ee-audit/maybe-sync-audit-db! audit-db false)))
        (is (= 0 (ee.audit.settings/last-analytics-views-checksum)))))))

(deftest adjust-audit-db-to-source-test
  (testing "adjust-audit-db-to-source! correctly handles tables and fields with mixed case"
    (mt/with-temp [:model/Database {audit-db-id :id} {:engine "h2"}
                   ;; Create tables with both uppercase and lowercase names
                   :model/Table {upper-table-id :id} {:db_id audit-db-id
                                                      :schema "public"
                                                      :name "USERS"}
                   :model/Table {lower-table-id :id} {:db_id audit-db-id
                                                      :schema "public"
                                                      :name "users"}
                   ;; Create another table that doesn't have a lowercase version
                   :model/Table {single-table-id :id} {:db_id audit-db-id
                                                       :schema "public"
                                                       :name "ORDERS"}

                   ;; Create another table that has a two lower case versions
                   ;; one without a nil schema
                   :model/Table _ {:db_id audit-db-id
                                   :schema "public"
                                   :name "accounts"}

                   :model/Table _ {:db_id audit-db-id
                                   :schema nil
                                   :name "accounts"}

                   ;; Create another table that has both upper and lower case schemas
                   ;; and table names
                   :model/Table _ {:db_id audit-db-id
                                   :schema "public"
                                   :name "friends"}

                   :model/Table _ {:db_id audit-db-id
                                   :schema "PUBLIC"
                                   :name "FRIENDS"}

                   :model/Table {no-schema-table :id} {:db_id audit-db-id
                                                       :schema nil
                                                       :name "products"}

                   ;; Create fields with both uppercase and lowercase names
                   :model/Field {upper-field-id :id} {:table_id upper-table-id
                                                      :name "EMAIL"}
                   :model/Field {lower-field-id :id} {:table_id lower-table-id
                                                      :name "email"}
                   ;; Create another field that doesn't have a lowercase version
                   :model/Field {single-field-id :id} {:table_id single-table-id
                                                       :name "PRODUCT"}]
      ;; Call the function we're testing
      (#'ee-audit/adjust-audit-db-to-source! {:id audit-db-id})
      (testing "Database engine should be set to postgres"
        (is (= :postgres
               (t2/select-one-fn :engine :model/Database :id audit-db-id))))
      (testing "Tables with existing lowercase versions should not be modified"
        (is (= "USERS"
               (t2/select-one-fn :name :model/Table :id upper-table-id)))
        (is (= "users"
               (t2/select-one-fn :name :model/Table :id lower-table-id))))
      (testing "Tables without lowercase versions should be converted to lowercase"
        (is (= "orders"
               (t2/select-one-fn :name :model/Table :id single-table-id))))
      (testing "Tables with nil schemas should not be changed if a table with a schema exists"
        (is (= 2
               (t2/count :model/Table {:where [:= :name "accounts"]}))))
      (testing "Tables with nil schemas have their schema set to \"public\""
        (is (= "public"
               (t2/select-one-fn :schema :model/Table :id no-schema-table))))
      (testing "Fields with existing lowercase versions should not be modified"
        (is (= "EMAIL"
               (t2/select-one-fn :name :model/Field :id upper-field-id)))
        (is (= "email"
               (t2/select-one-fn :name :model/Field :id lower-field-id))))
      (testing "Fields without lowercase versions should be converted to lowercase"
        (is (= "product"
               (t2/select-one-fn :name :model/Field :id single-field-id)))))))

(defn- audit-view-table
  "The single active `metabase_table` row for audit view `view-name` (a lower-cased name), or nil.
   Matched case-insensitively so it finds the same view across host engines whose name casing differs."
  [view-name]
  (t2/select-one [:model/Table :id :name :schema :active]
                 :db_id audit/audit-db-id
                 :active true
                 {:where [:= [:lower :name] view-name]}))

(deftest audit-db-self-heals-duplicate-rows-from-stale-schema-test
  ;; GHY-3974 Mode A: when an interrupted or raced `adjust-audit-db-to-host!` leaves an audit
  ;; `metabase_table` row at a schema the host driver does not report, the next schema sync sees the
  ;; driver-reported tuple as new (insert) and the existing row as old (retire) — duplicating the view
  ;; and breaking customer content that still points at the now-inactive row. `ensure-audit-db-installed!`
  ;; must reconcile back to a single active row per view and leave dependent content on an active table.
  (mt/test-drivers #{:postgres :h2 :mysql}
    (with-audit-db-restoration!
      (ee-audit/ensure-audit-db-installed!)
      (let [v-content (audit-view-table "v_content")
            orig-id   (:id v-content)]
        (is (some? orig-id) "expected a v_content table after install")
        (mt/with-temp [:model/Card {card-id :id}
                       {:database_id   audit/audit-db-id
                        :table_id      orig-id
                        :dataset_query {:database audit/audit-db-id
                                        :type     :query
                                        :query    {:source-table orig-id}}}]
          (testing "precondition: an interrupted host-adjust + schema sync duplicates the view row"
            ;; flip the schema to a value the host driver will not report, so the sync diff mismatches
            (t2/update! :model/Table orig-id {:schema (if (nil? (:schema v-content)) "public" nil)})
            (sync/sync-database! (t2/select-one :model/Database :is_audit true) {:scan :schema})
            (is (= 2 (t2/count :model/Table :db_id audit/audit-db-id :name (:name v-content)))
                "stale-schema sync should produce a duplicate pair")
            (is (false? (t2/select-one-fn :active :model/Table :id orig-id))
                "the row the customer card points at is retired"))
          (testing "ensure-audit-db-installed! self-heals the duplicate"
            (ee-audit/ensure-audit-db-installed!)
            (let [rows (t2/select [:model/Table :id :name :active]
                                  :db_id audit/audit-db-id
                                  {:where [:= [:lower :name] "v_content"]})]
              (is (= 1 (count rows)) "exactly one metabase_table row per view after heal")
              (is (every? :active rows) "the surviving row is active"))
            (testing "the customer card still points at an active table"
              (is (true? (t2/select-one-fn :active :model/Table
                                           :id (t2/select-one-fn :table_id :model/Card :id card-id)))
                  "card's table_id must reference an active table after heal"))))))))

(deftest audit-db-reconcile-preserves-content-on-the-deleted-duplicate-test
  ;; GHY-3974 Mode A, destructive path: the sibling test above only covers a card pointing at the row that
  ;; becomes the *survivor*. But in real Mode A there are *two* referenced rows — Metabase's own bundled audit
  ;; cards reference the original (now retired) row, so any customer card that landed on the freshly-synced active
  ;; row points at the row reconcile chooses to delete. A naive `(t2/update! :model/Card {:table_id orphan} ...)`
  ;; repoint is a no-op (Card's before-update re-derives `table_id` from the unchanged `dataset_query`), and the
  ;; orphan's FK is ON DELETE CASCADE, so deleting it would destroy the customer card. A correct heal must rewrite
  ;; the card's query/field refs onto the survivor and keep it resolving.
  (mt/test-drivers #{:postgres :h2 :mysql}
    (with-audit-db-restoration!
      (ee-audit/ensure-audit-db-installed!)
      (let [v-content (audit-view-table "v_content")
            orig-id   (:id v-content)]
        (is (some? orig-id) "expected a v_content table after install")
        ;; a card on the ORIGINAL row stands in for bundled content, forcing orig to win as survivor
        (mt/with-temp [:model/Card _bundled
                       {:database_id   audit/audit-db-id
                        :table_id      orig-id
                        :dataset_query {:database audit/audit-db-id :type :query :query {:source-table orig-id}}}]
          (testing "precondition: a real Mode A duplicate pair, customer card on the new/active row"
            (t2/update! :model/Table orig-id {:schema (if (nil? (:schema v-content)) "public" nil)})
            (sync/sync-database! (t2/select-one :model/Database :is_audit true) {:scan :schema})
            (let [rows   (t2/select [:model/Table :id :active] :db_id audit/audit-db-id
                                    {:where [:= [:lower :name] "v_content"]})
                  new-id (:id (first (filter :active rows)))]
              (is (= 2 (count rows)) "stale-schema sync should produce a duplicate pair")
              (is (some? new-id) "a freshly-synced active row exists")
              (let [a-field    (t2/select-one [:model/Field :id :name :base_type] :table_id new-id)
                    a-field-id (:id a-field)]
                (mt/with-temp [:model/Card {card-id :id}
                               {:database_id     audit/audit-db-id
                                :table_id        new-id
                                :dataset_query   {:database audit/audit-db-id
                                                  :type     :query
                                                  :query    (cond-> {:source-table new-id}
                                                              a-field-id (assoc :fields [[:field a-field-id nil]]))}
                                ;; legacy-style result_metadata (id at position 1), as the QP stores it
                                :result_metadata (when a-field-id
                                                   [{:name      (:name a-field)
                                                     :base_type (:base_type a-field)
                                                     :id        a-field-id
                                                     :field_ref [:field a-field-id nil]}])}]
                  (testing "ensure-audit-db-installed! self-heals without destroying the customer card"
                    (ee-audit/ensure-audit-db-installed!)
                    (is (true? (t2/exists? :model/Card :id card-id))
                        "customer card must still exist after heal (must not be cascade-deleted)")
                    (let [healed       (t2/select-one :model/Card :id card-id)
                          healed-tid   (:table_id healed)
                          ref-field-id (-> healed :dataset_query :stages first :fields first lib/field-ref-id)]
                      (is (some? healed-tid) "card's table_id must not be nil after heal")
                      (is (true? (t2/select-one-fn :active :model/Table :id healed-tid))
                          "card's table_id must reference an active table after heal")
                      (when a-field-id
                        (is (some? ref-field-id) "card's field ref survived the rewrite")
                        (is (= healed-tid (t2/select-one-fn :table_id :model/Field :id ref-field-id))
                            "card's field ref must resolve to a field on the survivor table")
                        (testing "result_metadata (legacy field_ref) is remapped onto the survivor"
                          (let [col (-> healed :result_metadata first)]
                            (is (= healed-tid (t2/select-one-fn :table_id :model/Field :id (:id col)))
                                "result_metadata :id resolves to a survivor field")
                            (is (= (:id col) (nth (:field_ref col) 1))
                                "result_metadata legacy :field_ref id matches the remapped :id")))))))))))))))

(deftest checksum-not-advanced-until-host-adjust-completes-test
  ;; GHY-3974 Mode B: `last-analytics-checksum` must not advance until the audit DB is fully back at the
  ;; host-canonical schema. Today the checksum is written right after the serdes load but *before*
  ;; `adjust-audit-db-to-host!`; a process death in that window leaves rows at the postgres "source"
  ;; convention (schema="public", postgres types) while the checksum already says "up to date", so
  ;; `should-load-audit?` returns false forever and the host-adjust never re-runs. If the host-adjust
  ;; is interrupted, the checksum must stay put so the next boot re-runs the load and the adjust.
  (mt/test-drivers #{:postgres :h2 :mysql}
    (try
      (t2/delete! :model/Database :is_audit true)
      (audit/last-analytics-checksum! 0)
      (testing "an interrupted adjust-audit-db-to-host! does not advance the checksum"
        (mt/with-dynamic-fn-redefs [serialization.cmd/v2-load-internal!  (fn [& _] {:seen [] :errors []})
                                    ee-audit/adjust-audit-db-to-host! (fn [& _] (throw (ex-info "host-adjust interrupted" {})))]
          (is (thrown-with-msg? Exception #"host-adjust interrupted"
                                (ee-audit/ensure-audit-db-installed!)))
          (is (= 0 (audit/last-analytics-checksum))
              "checksum stays 0 so the next boot re-runs the load and host-adjust")))
      (finally
        ;; restore a clean, installed audit DB for sibling tests regardless of how this test exits
        (t2/delete! :model/Database :is_audit true)
        (audit/last-analytics-checksum! 0)
        (mbc/ensure-audit-db-installed!)))))

(deftest interrupted-engine-changed-sync-repaired-on-next-boot-test
  ;; A failed or interrupted post-load dialect sync must be repaired by the next boot.
  ;;
  ;; `engine-changed? true` is the mysql/h2-host state: `maybe-load-analytics-content!` flips the
  ;; audit DB engine to postgres for the serdes load and back to the host dialect after, and the
  ;; returned boolean triggers a one-shot schema sync so field metadata gets re-scanned for the
  ;; host dialect. (On a postgres appdb the engine never flips, so the boolean is injected here.)
  ;; By the time that sync runs, the content checksum has already advanced -- so if the sync dies
  ;; (or merely fails: `maybe-sync-audit-db!` catches and logs), the next boot sees engine
  ;; matching, checksum matching, and views not stale, and must still notice the audit DB never
  ;; got its dialect sync. There is no other repair path: the scheduled sync task and the sync
  ;; API both refuse the audit DB.
  (with-audit-db-restoration!
    (let [audit-db (t2/select-one :model/Database :is_audit true)]
      ;; "Boot 1": steady state (checksums current), the engine-changed sync dies mid-flight.
      (with-redefs [sync.core/sync-database! (fn [& _] (throw (ex-info "killed mid-sync" {})))]
        (#'ee-audit/maybe-sync-audit-db! audit-db true))
      ;; "Boot 2": the full, un-stubbed pipeline, spying on audit-DB syncs.
      (let [audit-db-syncs (atom 0)
            real-sync      sync.core/sync-database!]
        (with-redefs [sync.core/sync-database! (fn [db & [opts]]
                                                 (when (:is_audit db)
                                                   (swap! audit-db-syncs inc))
                                                 (real-sync db opts))]
          (mbc/ensure-audit-db-installed!))
        (testing "the boot after an interrupted engine-changed sync re-syncs the audit DB"
          (is (pos? @audit-db-syncs)))))))

(deftest audit-pipeline-commits-incrementally-test
  ;; Pins the `:detached? true` on `ensure-audit-db-installed!`'s cluster lock behaviorally: work
  ;; done inside the pipeline must be visible to other sessions while the pipeline is still
  ;; running. Under the pre-detached design the whole pipeline rode the lock's transaction, so
  ;; nothing was visible until the final commit -- if a refactor drops the flag, the marker row
  ;; below stays invisible to the probing thread and this test fails. (The probe binds
  ;; *current-connectable* to nil because future conveys bindings: without it, a transactional
  ;; pipeline would hand the probe its own connection and it would see uncommitted work.)
  (with-audit-db-restoration!
    (let [email   (mt/random-email)
          visible (atom ::not-checked)]
      (try
        ;; stale the content checksum so the (stubbed) load runs inside the locked pipeline
        (audit/last-analytics-checksum! 0)
        (with-redefs [serialization.cmd/v2-load-internal!
                      (fn [& _]
                        (t2/insert! :model/User (assoc (mt/with-temp-defaults :model/User) :email email))
                        (reset! visible
                                (deref (future
                                         (binding [t2.connection/*current-connectable* nil]
                                           (t2/exists? :model/User :email email)))
                                       5000 ::timeout))
                        ;; report no errors: content is already loaded from the steady state, so
                        ;; letting the checksum advance leaves a consistent end state
                        {:errors [] :seen []})]
          (mbc/ensure-audit-db-installed!))
        (testing "work committed inside the audit pipeline is visible mid-pipeline from another connection"
          (is (true? @visible)))
        (finally
          (t2/delete! :model/User :email email))))))

(deftest crash-mid-load-repaired-on-next-boot-test
  ;; Pins the self-healing premise the detached lock's safety argument leans on: a crash in the
  ;; middle of the serdes load must be repaired by the next boot. Two halves: the content
  ;; checksum must not advance past a load that did not complete (so the next boot re-enters the
  ;; load), and the next boot's un-stubbed pipeline must actually converge back to the healthy
  ;; state.
  (with-audit-db-restoration!
    (let [healthy-checksum (audit/last-analytics-checksum)]
      ;; make the content look new again, as an upgrade would
      (audit/last-analytics-checksum! 0)
      ;; "Boot 1": the serdes load dies partway through.
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"killed mid-load"
                            (with-redefs [serialization.cmd/v2-load-internal!
                                          (fn [& _] (throw (ex-info "killed mid-load" {})))]
                              (mbc/ensure-audit-db-installed!))))
      (testing "the content checksum does not advance past an incomplete load"
        (is (= 0 (audit/last-analytics-checksum))))
      ;; "Boot 2": the full, un-stubbed pipeline.
      (mbc/ensure-audit-db-installed!)
      (testing "the next boot re-runs the load and converges to the healthy state"
        (is (= healthy-checksum (audit/last-analytics-checksum)))
        (is (pos? (t2/count :model/Card :database_id audit/audit-db-id)))))))
