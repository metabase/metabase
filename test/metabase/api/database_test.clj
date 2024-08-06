(ns metabase.api.database-test
  "Tests for /api/database endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.scheduler :as qs]
   [medley.core :as m]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.api.database :as api.database]
   [metabase.api.table :as api.table]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]
   [metabase.http-client :as client]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models
    :refer [Card Collection Database Field FieldValues Segment Table]]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database :as database :refer [protected-password]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.sync :as sync]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.field-values :as field-values]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.task :as task]
   [metabase.task.sync-databases :as task.sync-databases]
   [metabase.task.sync-databases-test :as task.sync-databases-test]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.sql Connection)
   (org.quartz JobDetail TriggerKey)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :plugins :test-drivers))

;; HELPER FNS

(driver/register! ::test-driver
  :parent :sql-jdbc
  :abstract? true)

(defmethod driver/connection-properties ::test-driver
  [_]
  nil)

(defmethod driver/can-connect? ::test-driver
  [_ _]
  true)

(defmethod driver/dbms-version ::test-driver
  [_ _]
  "1.0")

(defmethod driver/describe-database ::test-driver
  [_ _]
  {:tables []})

(defn- db-details
  "Return default column values for a database (either the test database, via `(mt/db)`, or optionally passed in)."
  ([]
   (-> (db-details (mt/db))
       (assoc :initial_sync_status "complete")))

  ([{driver :engine, :as db}]
   (merge
    (mt/object-defaults Database)
    (select-keys db [:created_at :id :details :updated_at :timezone :name :dbms_version
                     :metadata_sync_schedule :cache_field_values_schedule])
    {:engine               (u/qualified-name (:engine db))
     :settings             {}
     :features             (map u/qualified-name (driver.u/features driver db))
     :initial_sync_status "complete"})))

(defn- table-details [table]
  (-> (merge (mt/obj->json->obj (mt/object-defaults Table))
             (select-keys table [:active :created_at :db_id :description :display_name :entity_type
                                 :id :name :rows :schema :updated_at :visibility_type :initial_sync_status]))
      (update :entity_type #(when % (str "entity/" (name %))))
      (update :visibility_type #(when % (name %)))
      (update :schema str)))

(defn- expected-tables [db-or-id]
  (map table-details (t2/select Table
                       :db_id (u/the-id db-or-id), :active true, :visibility_type nil
                       {:order-by [[:%lower.schema :asc] [:%lower.display_name :asc]]})))

(defn- field-details [field]
  (mt/derecordize
   (merge
    (mt/object-defaults Field)
    {:target nil}
    (select-keys
     field
     [:updated_at :id :created_at :last_analyzed :fingerprint :fingerprint_version :fk_target_field_id :position]))))

(defn- card-with-native-query {:style/indent 1} [card-name & {:as kvs}]
  (merge
   {:name          card-name
    :database_id   (mt/id)
    :dataset_query {:database (mt/id)
                    :type     :native
                    :native   {:query (format "SELECT * FROM VENUES")}}}
   kvs))

(defn- card-with-mbql-query {:style/indent 1} [card-name & {:as inner-query-clauses}]
  {:name          card-name
   :database_id   (mt/id)
   :dataset_query {:database (mt/id)
                   :type     :query
                   :query    inner-query-clauses}})

(defn- virtual-table-for-card [card & {:as kvs}]
  (merge
   {:id               (format "card__%d" (u/the-id card))
    :db_id            (:database_id card)
    :display_name     (:name card)
    :schema           "Everything else"
    :moderated_status nil
    :description      nil
    :type             "question"}
   kvs))

(defn- ok-mbql-card []
  (assoc (card-with-mbql-query "OK Card"
                               :source-table (mt/id :checkins))
         :result_metadata [{:name "num_toucans"}]))

(deftest ^:parallel get-database-test
  (testing "GET /api/database/:id"
    (testing "DB details visibility"
      (testing "Regular users should not see DB details"
        (is (= (-> (db-details)
                   (dissoc :details :schedules))
               (-> (mt/user-http-request :rasta :get 200 (format "database/%d" (mt/id)))
                   (dissoc :schedules :can_upload)))))
      (testing "Superusers should see DB details"
        (is (= (assoc (db-details) :can-manage true)
               (-> (mt/user-http-request :crowberto :get 200 (format "database/%d" (mt/id)))
                   (dissoc :schedules :can_upload))))))))

(deftest ^:parallel get-database-test-2
  (testing "GET /api/database/:id"
    (mt/with-temp [Database db  {:name "My DB" :engine ::test-driver}
                   Table    t1  {:name "Table 1" :db_id (:id db)}
                   Table    t2  {:name "Table 2" :db_id (:id db)}
                   Table    _t3 {:name "Table 3" :db_id (:id db) :visibility_type "hidden"}
                   Field    f1  {:name "Field 1.1" :table_id (:id t1)}
                   Field    f2  {:name "Field 2.1" :table_id (:id t2)}
                   Field    f3  {:name "Field 2.2" :table_id (:id t2)}]
      (testing "`?include=tables` -- should be able to include Tables"
        (is (= {:tables [(table-details t1)
                         (table-details t2)]}
               (select-keys (mt/user-http-request :lucky :get 200 (format "database/%d?include=tables" (:id db)))
                            [:tables])))
        (testing "Schemas are always empty strings, not nil"
          (mt/with-temp [Database db  {:name "My DB" :engine ::test-driver}
                         Table    {}  {:name "Table 1" :db_id (:id db) :schema nil}]
            (is (= [""]
                   (->> (mt/user-http-request :lucky :get 200 (format "database/%d?include=tables" (:id db)))
                        :tables
                        (map :schema)))))))
      (testing "`?include=tables.fields` -- should be able to include Tables and Fields"
        (letfn [(field-details* [field]
                  (assoc (into {} (t2/hydrate field [:target :has_field_values] :has_field_values))
                         :base_type        "type/Text"
                         :visibility_type  "normal"
                         :has_field_values "search"))]
          (is (= {:tables [(assoc (table-details t1) :fields [(field-details* f1)])
                           (assoc (table-details t2) :fields [(field-details* f2)
                                                              (field-details* f3)])]}
                 (select-keys (mt/user-http-request :lucky :get 200 (format "database/%d?include=tables.fields" (:id db)))
                              [:tables]))))))))

(deftest ^:parallel get-database-test-3
  (testing "GET /api/database/:id"
    (testing "Invalid `?include` should return an error"
      (is (= {:errors          {:include "nullable enum of tables, tables.fields"},
              :specific-errors {:include ["should be either \"tables\" or \"tables.fields\", received: \"schemas\""]}}
             (mt/user-http-request :lucky :get 400 (format "database/%d?include=schemas" (mt/id))))))))

(deftest get-database-legacy-no-self-service-test
  (testing "GET /api/database/:id"
    (testing "A database can be fetched even if one table has legacy-no-self-service permissions"
        (mt/with-user-in-groups [group {:name "Legacy no-self-service group"}
                                 user  [group]]
          (mt/with-temp [:model/Database         {db-id :id}      {}
                         :model/Table            {table-id-1 :id} {:db_id  db-id}
                         :model/Table            {table-id-2 :id} {:db_id  db-id}]
            (mt/with-no-data-perms-for-all-users!
              ;; Query permissions for a single table is enough to fetch the DB
              (data-perms/set-table-permission! group table-id-1 :perms/view-data :legacy-no-self-service)
              (data-perms/set-table-permission! group table-id-1 :perms/create-queries :no)
              (data-perms/set-table-permission! group table-id-2 :perms/view-data :unrestricted)
              (data-perms/set-table-permission! group table-id-2 :perms/create-queries :query-builder)
              (mt/user-http-request user :get 200 (format "database/%d" db-id))))))))

(deftest get-database-can-upload-test
  (testing "GET /api/database"
    (mt/with-discard-model-updates! [:model/Database] ; to restore any existing metabase_database.uploads_enabled=true
      (doseq [uploads-enabled? [true false]]
        (mt/with-temp [Database {db-id :id} {:engine          :postgres
                                             :name            "The Chosen One"
                                             :uploads_enabled uploads-enabled?
                                             :uploads_schema_name "public"}]
          (testing (format "The database with uploads enabled for the public schema has can_upload=%s" uploads-enabled?)
            (let [result (mt/user-http-request :crowberto :get 200 (format "database/%d" db-id))]
              (is (= uploads-enabled? (:can_upload result))))))))))

(deftest ^:parallel get-database-usage-info-test
  (mt/with-temp
    [Database {db-id :id}      {}
     Table    {table-id-1 :id} {:db_id db-id}
     Table    {table-id-2 :id} {:db_id db-id}
     ;; question
     Card     _                {:database_id db-id
                                :table_id    table-id-1
                                :type        :question}
     ;; dataset
     Card     _                {:database_id db-id
                                :table_id    table-id-1
                                :type        :model}
     Card     _                {:database_id db-id
                                :table_id    table-id-2
                                :type        :model
                                :archived    true}

     ;; metric
     Card     _                {:database_id db-id
                                :table_id    table-id-1
                                :type        :metric
                                :archived    true}
     Card     _                {:database_id db-id
                                :table_id    table-id-1
                                :type        :metric}
     Card     _                {:database_id db-id
                                :table_id    table-id-2
                                :type        :metric}
     Segment  _                {:table_id table-id-2}]
    (testing "should require admin"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (format "database/%d/usage_info" db-id)))))
    (testing "return the correct usage info"
      (is (= {:question 1
              :dataset  2
              :metric   3
              :segment  1}
             (mt/user-http-request :crowberto :get 200 (format "database/%d/usage_info" db-id)))))
    (testing "404 if db does not exist"
      (let [non-existing-db-id (inc (t2/select-one-pk Database {:order-by [[:id :desc]]}))]
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404
                                     (format "database/%d/usage_info" non-existing-db-id))))))))

(deftest ^:parallel get-database-usage-info-test-2
  (mt/with-temp
    [Database {db-id :id} {}]
    (testing "should work with DB that has no tables"
      (is (= {:question 0
              :dataset  0
              :metric   0
              :segment  0}
             (mt/user-http-request :crowberto :get 200 (format "database/%d/usage_info" db-id)))))))

(defn- create-db-via-api! [& [m]]
  (let [db-name (mt/random-name)]
    (mt/with-model-cleanup [:model/Database]
      (let [{db-id :id, :as response} (with-redefs [driver/available?   (constantly true)
                                                    driver/can-connect? (constantly true)]
                                        (mt/user-http-request :crowberto :post 200 "database"
                                                              (merge
                                                               {:name    db-name
                                                                :engine  (u/qualified-name ::test-driver)
                                                                :details {:db "my_db"}}
                                                               m)))]
        (is (malli= [:map [:id ::lib.schema.id/database]]
                    response))
        (t2/select-one Database :id db-id)))))

(def ^:private monthly-schedule {:schedule_type "monthly" :schedule_day "fri" :schedule_frame "last"})

(defn- sync-and-analyze-trigger-name
  [db]
  (.getName ^TriggerKey (#'task.sync-databases/trigger-key db @#'task.sync-databases/sync-analyze-task-info)))

(defmacro with-test-driver-available!
  [& body]
  `(mt/with-model-cleanup [:model/Database]
     (with-redefs [driver/available?   (constantly true)
                   driver/can-connect? (constantly true)]
       ~@body)))

(defmacro with-db-scheduler-setup
  [& body]
  `(mt/with-temp-scheduler
     (#'task.sync-databases/job-init)
     (u/prog1 ~@body
       (qs/delete-job (#'task/scheduler) (.getKey ^JobDetail @#'task.sync-databases/sync-analyze-job))
       (qs/delete-job (#'task/scheduler) (.getKey ^JobDetail @#'task.sync-databases/field-values-job)))))

(deftest create-db-default-schedule-test
  (testing "POST /api/database"
    (testing "create a db with default scan options"
      (with-db-scheduler-setup
        (with-test-driver-available!
          (let [resp (mt/user-http-request :crowberto :post 200 "database"
                                           {:name    (mt/random-name)
                                            :engine  (u/qualified-name ::test-driver)
                                            :details {:db "my_db"}})
                db   (t2/select-one :model/Database (:id resp))]
            (is (malli= [:merge
                         (into [:map] (m/map-vals (fn [v] [:= {} v]) (mt/object-defaults Database)))
                         [:map
                          [:settings                    :nil]
                          [:metadata_sync_schedule      #"0 \d{1,2} \* \* \* \? \*"]
                          [:cache_field_values_schedule #"0 \d{1,2} \d{1,2} \* \* \? \*"]
                          [:created_at                  (ms/InstanceOfClass java.time.temporal.Temporal)]
                          [:engine                      [:= ::test-driver]]
                          [:id                          ms/PositiveInt]
                          [:details                     [:fn #(= % {:db "my_db"})]]
                          [:updated_at                  (ms/InstanceOfClass java.time.temporal.Temporal)]
                          [:name                        ms/NonBlankString]
                          [:features                    [:= (driver.u/features ::test-driver (mt/db))]]
                          [:creator_id                  [:= (mt/user->id :crowberto)]]]]
                        db))
            (is (= (task.sync-databases-test/all-db-sync-triggers-name db)
                   (task.sync-databases-test/query-all-db-sync-triggers-name db)))))))))

(deftest create-db-no-full-sync-test
  (testing "POST /api/database"
    (testing "can we set `is_full_sync` to `false` when we create the Database?"
      (is (= {:is_full_sync false}
             (select-keys (create-db-via-api! {:is_full_sync false}) [:is_full_sync]))))))

(deftest create-db-ignore-schedules-if-no-manual-sync-test
  (testing "POST /api/database"
    (testing "if `:let-user-control-scheduling` is false it will ignore any schedules provided"
      (let [{:keys [details metadata_sync_schedule cache_field_values_schedule]}
            (create-db-via-api! {:schedules {:metadata_sync      monthly-schedule
                                             :cache_field_values monthly-schedule}})]
        (is (not (:let-user-control-scheduling details)))
        (is (= "daily" (-> cache_field_values_schedule u.cron/cron-string->schedule-map :schedule_type)))
        (is (= "hourly" (-> metadata_sync_schedule u.cron/cron-string->schedule-map :schedule_type)))))))

(deftest create-db-known-error-connection-test
  (testing "POST /api/database"
    (testing "well known connection errors are reported properly"
      (let [dbname (mt/random-name)
            exception (Exception. (format "FATAL: database \"%s\" does not exist" dbname))]
        (is (= {:errors {:dbname "check your database name settings"},
                :message "Looks like the Database name is incorrect."}
               (with-redefs [driver/can-connect? (fn [& _] (throw exception))]
                 (mt/user-http-request :crowberto :post 400 "database"
                                       {:name         dbname
                                        :engine       "postgres"
                                        :details      {:host "localhost", :port 5432
                                                       :dbname "fakedb", :user "rastacan"}}))))))))

(deftest create-db-unknown-error-connection-test
  (testing "POST /api/database"
    (testing "unknown connection errors are reported properly"
      (let [exception (Exception. "Unknown driver message" (java.net.ConnectException. "Failed!"))]
        (is (= {:errors  {:host "check your host settings"
                          :port "check your port settings"}
                :message "Hmm, we couldn't connect to the database. Make sure your Host and Port settings are correct"}
               (with-redefs [driver/available?   (constantly true)
                             driver/can-connect? (fn [& _] (throw exception))]
                 (mt/user-http-request :crowberto :post 400 "database"
                                       {:name    (mt/random-name)
                                        :engine  (u/qualified-name ::test-driver)
                                        :details {:db "my_db"}}))))))))

(deftest create-db-set-cache-ttl-throw-402-on-oss-test
  (testing "POST /api/database"
    (testing "should throw a 402 error if trying to set `cache_ttl` on OSS"
      (with-redefs [premium-features/enable-cache-granular-controls? (constantly false)]
        (mt/user-http-request :crowberto :post 402 "database"
                              {:name      (mt/random-name)
                               :engine    (u/qualified-name ::test-driver)
                               :details   {:db "my_db"}
                               :cache_ttl 13})))))

(deftest create-db-set-cache-ttl-on-ee-test
  (testing "POST /api/database"
    (testing "should allow setting `cache_ttl` on EE"
      (with-redefs [premium-features/enable-cache-granular-controls? (constantly true)]
        (is (partial= {:cache_ttl 13}
                      (create-db-via-api! {:cache_ttl 13})))))))

(deftest create-db-succesful-track-snowplow-test
  ;; h2 is no longer supported as a db source
  ;; the rests are disj because it's timeouted when adding it as a DB for some reasons
  (mt/test-drivers (disj (mt/normal-drivers) :h2 :bigquery-cloud-sdk :athena :snowflake)
    (snowplow-test/with-fake-snowplow-collector
      (let [dataset-def (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'avian-singles))]
        ;; trigger this to make sure the database exists before we add them
        (data.impl/get-or-create-database! driver/*driver* dataset-def)
        (mt/with-model-cleanup [:model/Database]
          (is (=? {:id int?}
                  (mt/user-http-request :crowberto :post 200 "database"
                                        {:name    (mt/random-name)
                                         :engine  (u/qualified-name driver/*driver*)
                                         :details (tx/dbdef->connection-details driver/*driver* nil dataset-def)})))
          (is (=? {"database"     (name driver/*driver*)
                   "database_id"  int?
                   "source"       "admin"
                   "dbms_version" string?
                   "event"        "database_connection_successful"}
                  (:data (last (snowplow-test/pop-event-data-and-user-id!))))))))))

(deftest create-db-audit-log-test
  (testing "POST /api/database"
    (testing "The id captured in the database-create event matches the new db's id"
      (mt/with-premium-features #{:audit-app}
        (with-redefs [premium-features/enable-cache-granular-controls? (constantly true)]
          (let [{:keys [id] :as _db} (create-db-via-api! {:id 19999999})
                audit-entry (mt/latest-audit-log-entry "database-create")]
            (is (= id (-> audit-entry :model_id)))
            (is (= id (-> audit-entry :details :id)))))))))

(deftest disallow-creating-h2-database-test
  (testing "POST /api/database/:id"
    (mt/with-model-cleanup [Database]
      (let [db-name (mt/random-name)
            details (:details (mt/db))]
        (is (= {:message "H2 is not supported as a data warehouse"}
               (mt/user-http-request :crowberto :post 400 "database" {:engine :h2, :name db-name, :details details})))
        (is (not (t2/exists? Database :name db-name)))))))

(deftest ^:parallel delete-database-test
  (testing "DELETE /api/database/:id"
    (testing "Check that a superuser can delete a Database"
      (t2.with-temp/with-temp [Database db]
        (mt/user-http-request :crowberto :delete 204 (format "database/%d" (:id db)))
        (is (false? (t2/exists? Database :id (u/the-id db))))))

    (testing "Check that a non-superuser cannot delete a Database"
      (t2.with-temp/with-temp [Database db]
        (mt/user-http-request :rasta :delete 403 (format "database/%d" (:id db)))))))

(let [normalize (fn normalize [audit-log-details] (update audit-log-details :engine keyword))]
  (deftest delete-database-audit-log-test
    (testing "DELETE /api/database/:id"
      (testing "Check that an audit log entry is created when someone deletes a Database"
        (mt/with-premium-features #{:audit-app}
          (t2.with-temp/with-temp [Database db]
            (mt/user-http-request :crowberto :delete 204 (format "database/%d" (:id db)))
            (is (= (audit-log/model-details db :model/Database)
                   (->> (mt/latest-audit-log-entry "database-delete")
                        :details
                        normalize)))))))))

(defn- api-update-database! [expected-status-code db-or-id changes]
  (with-redefs [h2/*allow-testing-h2-connections* true]
    (mt/user-http-request :crowberto :put expected-status-code (format "database/%d" (u/the-id db-or-id))
                          changes)))

(deftest update-database-test
  (testing "PUT /api/database/:id"
    (testing "Check that we can update fields in a Database"
      (t2.with-temp/with-temp [Database {db-id :id}]
        (let [updates {:name         "Cam's Awesome Toucan Database"
                       :engine       "h2"
                       :is_full_sync false
                       :details      {:host "localhost", :port 5432, :dbname "fakedb", :user "rastacan"}}
              update! (fn [expected-status-code]
                        (api-update-database! expected-status-code db-id updates))]
          (testing "Should check that connection details are valid on save"
            (is (=? {:errors {:db "check your connection string"}}
                    (update! 400))))
          (testing "If connection details are valid, we should be able to update the Database"
            (with-redefs [driver/can-connect? (constantly true)]
              (is (= nil
                     (:valid (update! 200))))
              (let [curr-db (t2/select-one [Database :name :engine :details :is_full_sync], :id db-id)]
                (is (=
                     {:details      {:host "localhost", :port 5432, :dbname "fakedb", :user "rastacan"}
                      :engine       :h2
                      :name         "Cam's Awesome Toucan Database"
                      :is_full_sync false
                      :features     (driver.u/features :h2 curr-db)}
                     (into {} curr-db)))))))))))

(deftest update-database-test-2
  (testing "PUT /api/database/:id"
    (testing "should be able to set `auto_run_queries`"
      (testing "when creating a Database"
        (is (= {:auto_run_queries false}
               (select-keys (create-db-via-api! {:auto_run_queries false}) [:auto_run_queries]))))
      (testing "when updating a Database"
        (t2.with-temp/with-temp [Database {db-id :id} {:engine ::test-driver}]
          (let [updates {:auto_run_queries false}]
            (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates))
          (is (= false
                 (t2/select-one-fn :auto_run_queries Database, :id db-id))))))))

(deftest update-database-test-3
  (testing "PUT /api/database/:id"
    (testing "should not be able to modify `cache_ttl` in OSS"
      (with-redefs [premium-features/enable-cache-granular-controls? (constantly false)]
        (t2.with-temp/with-temp [Database {db-id :id} {:engine ::test-driver}]
          (let [updates {:cache_ttl 13}]
            (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates))
          (is (= nil
                 (t2/select-one-fn :cache_ttl Database, :id db-id))))))))

(deftest update-database-test-4
  (testing "PUT /api/database/:id"
    (testing "should be able to set and unset `cache_ttl` in EE"
      (with-redefs [premium-features/enable-cache-granular-controls? (constantly true)]
        (t2.with-temp/with-temp [Database {db-id :id} {:engine ::test-driver}]
          (let [updates1 {:cache_ttl 1337}
                updates2 {:cache_ttl nil}
                updates1! (fn [] (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates1))
                updates2! (fn [] (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates2))]
            (updates1!)
            (let [curr-db (t2/select-one [Database :cache_ttl], :id db-id)]
              (is (= 1337 (:cache_ttl curr-db))))
            (updates2!)
            (let [curr-db (t2/select-one [Database :cache_ttl], :id db-id)]
              (is (= nil (:cache_ttl curr-db))))))))))

(deftest update-database-audit-log-test
  (testing "Check that we get audit log entries that match the db when updating a Database"
    (mt/with-premium-features #{:audit-app}
      (t2.with-temp/with-temp [Database {db-id :id}]
        (with-redefs [driver/can-connect? (constantly true)]
          (is (= "Original Database Name" (:name (api-update-database! 200 db-id {:name "Original Database Name"})))
              "A db update occured")
          (is (= "Updated Database Name" (:name (api-update-database! 200 db-id {:name "Updated Database Name"})))
              "A db update occured")
          (let [audit-log-entry (mt/latest-audit-log-entry)]
            (is (partial=
                 {:previous {:name "Original Database Name"}
                  :new      {:name "Updated Database Name"}}
                 (:details audit-log-entry)))))))))

(deftest disallow-updating-h2-database-details-test
  (testing "PUT /api/database/:id"
    (letfn [(update! [db request-body]
              (mt/user-http-request :crowberto :put 400 (str "database/" (u/the-id db)) request-body))]
      (t2.with-temp/with-temp [Database db {:name    (mt/random-name)
                                            :details (:details (mt/db))
                                            :engine  :postgres}]
        (testing "Don't allow changing engine to H2"
          (is (= {:message "H2 is not supported as a data warehouse"}
                 (update! db {:engine :h2})))
          (is (= :postgres
                 (t2/select-one-fn :engine Database (u/the-id db))))))
      (t2.with-temp/with-temp [Database db {:name    (mt/random-name)
                                            :details (:details (mt/db))
                                            :engine  :h2}]
        (testing "Don't allow editing H2 connection details"
          (is (= {:message "H2 is not supported as a data warehouse"}
                 (update! db {:details {:db "mem:test-data;USER=GUEST;PASSWORD=guest;WHATEVER=true"}})))
          (is (= (:details db)
                 (t2/select-one-fn :details Database (u/the-id db)))))))))

(deftest ^:parallel enable-model-actions-with-user-controlled-scheduling-test
  (testing "Should be able to enable/disable actions for a database with user-controlled scheduling (metabase#30699)"
    (t2.with-temp/with-temp [Database {db-id :id} {:details  {:let-user-control-scheduling true}
                                                   :settings {:database-enable-actions true}}]
      (is (false? (get-in (mt/user-http-request :crowberto
                                                :put 200
                                                (format "database/%s" db-id)
                                                {:settings {:database-enable-actions false}})
                          [:settings :database-enable-actions])))
      (is (true? (get-in (mt/user-http-request :crowberto
                                               :put 200
                                               (format "database/%s" db-id)
                                               {:settings {:database-enable-actions true}})
                         [:settings :database-enable-actions]))))))

(deftest update-database-enable-actions-open-connection-test
  (testing "Updating a database's `database-enable-actions` setting shouldn't close existing connections (metabase#27877)"
    (mt/test-drivers (filter #(isa? driver/hierarchy % :sql-jdbc) (mt/normal-drivers-with-feature :actions))
      (let [;; 1. create a database and sync
            database-name      (name (gensym))
            empty-dbdef        {:database-name database-name}
            _                  (tx/create-db! driver/*driver* empty-dbdef)
            connection-details (tx/dbdef->connection-details driver/*driver* :db empty-dbdef)
            db                 (first (t2/insert-returning-instances! :model/Database {:name    database-name
                                                                                       :engine  (u/qualified-name driver/*driver*)
                                                                                       :details connection-details}))
            _                  (sync/sync-database! db)]
        (let [;; 2. start a long running process on another thread that uses a connection
              connections-stay-open? (future
                                       (sql-jdbc.execute/do-with-connection-with-options
                                        driver/*driver*
                                        db
                                        nil
                                        (fn [^Connection conn]
                                          ;; sleep long enough to make sure the PUT request below finishes processing,
                                          ;; including any async operations that it might trigger
                                          (Thread/sleep 1000)
                                          ;; test the connection is open by executing a query
                                          (try
                                            (let [stmt      (.createStatement conn)
                                                  resultset (.executeQuery stmt "SELECT 1")]
                                              (.next resultset))
                                            (catch Exception _e
                                              false)))))]
          ;; 3. update the database's `database-enable-actions` setting
          (mt/user-http-request :crowberto :put 200 (format "database/%d" (u/the-id db))
                                {:settings {:database-enable-actions true}})
          ;; 4. test the connection was still open at the end of it of the long running process
          (is (true? @connections-stay-open?))
          (tx/destroy-db! driver/*driver* empty-dbdef))))))

(deftest ^:parallel fetch-database-metadata-test
  (testing "GET /api/database/:id/metadata"
    (is (= (merge (dissoc (db-details) :details)
                  {:engine        "h2"
                   :name          "test-data (h2)"
                   :features      (map u/qualified-name (driver.u/features :h2 (mt/db)))
                   :tables        [(merge
                                    (mt/obj->json->obj (mt/object-defaults Table))
                                    (t2/select-one [Table :created_at :updated_at] :id (mt/id :categories))
                                    {:schema              "PUBLIC"
                                     :name                "CATEGORIES"
                                     :display_name        "Categories"
                                     :entity_type         "entity/GenericTable"
                                     :initial_sync_status "complete"
                                     :fields              [(merge
                                                            (field-details (t2/select-one Field :id (mt/id :categories :id)))
                                                            {:table_id          (mt/id :categories)
                                                             :semantic_type     "type/PK"
                                                             :name              "ID"
                                                             :display_name      "ID"
                                                             :database_type     "BIGINT"
                                                             :base_type         "type/BigInteger"
                                                             :effective_type    "type/BigInteger"
                                                             :visibility_type   "normal"
                                                             :has_field_values  "none"
                                                             :database_position 0
                                                             :database_required false
                                                             :database_indexed  true
                                                             :database_is_auto_increment true})
                                                           (merge
                                                            (field-details (t2/select-one Field :id (mt/id :categories :name)))
                                                            {:table_id          (mt/id :categories)
                                                             :semantic_type     "type/Name"
                                                             :name              "NAME"
                                                             :display_name      "Name"
                                                             :database_type     "CHARACTER VARYING"
                                                             :base_type         "type/Text"
                                                             :effective_type    "type/Text"
                                                             :visibility_type   "normal"
                                                             :has_field_values  "list"
                                                             :database_position 1
                                                             :database_required true
                                                             :database_indexed  false
                                                             :database_is_auto_increment false})]
                                     :segments     []
                                     :metrics      []
                                     :id           (mt/id :categories)
                                     :db_id        (mt/id)})]})
           (let [resp (mt/derecordize (mt/user-http-request :rasta :get 200 (format "database/%d/metadata" (mt/id))))]
             (assoc resp :tables (filter #(= "CATEGORIES" (:name %)) (:tables resp))))))))

(deftest ^:parallel fetch-database-fields-test
  (letfn [(f [fields] (m/index-by #(str (:table_name %) "." (:name %)) fields))]
    (testing "GET /api/database/:id/fields"
      (is (partial= {"VENUES.ID"        {:name "ID" :display_name "ID"
                                         :table_name "VENUES"}
                     "CHECKINS.USER_ID" {:name "USER_ID" :display_name "User ID"
                                         :table_name "CHECKINS"}}
                    (f (mt/user-http-request :rasta :get 200 (format "database/%d/fields" (mt/id))))))
      (testing "shows display names"
        (mt/with-temp [Table {t-id :id} {:name "FOO_TABLE" :display_name "irrelevant"
                                         :db_id (mt/id)}
                       Field _ {:name "F_NAME" :display_name "user editable"
                                :table_id t-id}]
          (is (partial= {"FOO_TABLE.F_NAME" {:name "F_NAME" :display_name "user editable"
                                             :table_name "FOO_TABLE"}}
                        (f (mt/user-http-request :rasta :get 200 (format "database/%d/fields" (mt/id)))))))))))

(deftest fetch-database-metadata-include-hidden-test
  ;; NOTE: test for the exclude_uneditable parameter lives in metabase-enterprise.advanced-permissions.common-test
  (mt/with-temp-vals-in-db Table (mt/id :categories) {:visibility_type "hidden"}
    (mt/with-temp-vals-in-db Field (mt/id :venues :price) {:visibility_type "sensitive"}
      (testing "GET /api/database/:id/metadata?include_hidden=true"
        (let [tables (->> (mt/user-http-request :rasta :get 200 (format "database/%d/metadata?include_hidden=true" (mt/id)))
                          :tables)]
          (is (some (partial = "CATEGORIES") (map :name tables)))
          (is (->> tables
                   (filter #(= "VENUES" (:name %)))
                   first
                   :fields
                   (map :name)
                   (some (partial = "PRICE"))))))
      (testing "GET /api/database/:id/metadata"
        (let [tables (->> (mt/user-http-request :rasta :get 200 (format "database/%d/metadata" (mt/id)))
                          :tables)]
          (is (not (some (partial = "CATEGORIES") (map :name tables))))
          (is (not (->> tables
                        (filter #(= "VENUES" (:name %)))
                        first
                        :fields
                        (map :name)
                        (some (partial = "PRICE"))))))))))

(deftest ^:parallel fetch-database-metadata-remove-inactive-test
  (mt/with-temp [Database {db-id :id} {}
                 Table    _ {:db_id db-id, :active false}]
    (testing "GET /api/database/:id/metadata?include_hidden=true"
      (let [tables (->> (mt/user-http-request :rasta :get 200 (format "database/%d/metadata?remove_inactive=true" db-id))
                        :tables)]
        (is (= () tables))))))

(deftest ^:parallel fetch-database-metadata-skip-fields-test
  (mt/with-temp [Database {db-id :id} {}
                 Table    table       {:db_id db-id}
                 Field    _           {:table_id (u/the-id table)}]
    (testing "GET /api/database/:id/metadata?skip_fields=true"
      (let [fields (->> (mt/user-http-request :rasta :get 200 (format "database/%d/metadata?skip_fields=true" db-id))
                      :tables
                      first
                      :fields)]
        (is (= () fields))))))

(deftest ^:parallel autocomplete-suggestions-test
  (let [prefix-fn (fn [db-id prefix]
                    (mt/user-http-request :rasta :get 200
                                          (format "database/%d/autocomplete_suggestions" db-id)
                                          :prefix prefix))]
    (testing "GET /api/database/:id/autocomplete_suggestions"
      (doseq [[prefix expected] {"u"   [["USERS" "Table"]
                                        ["USER_ID" "CHECKINS :type/Integer :type/FK"]
                                        ["USER_ID" "ORDERS :type/Integer :type/FK"]]
                                 "c"   [["CATEGORIES" "Table"]
                                        ["CHECKINS" "Table"]
                                        ["CATEGORY" "PRODUCTS :type/Text :type/Category"]
                                        ["CATEGORY_ID" "VENUES :type/Integer :type/FK"]
                                        ["CITY" "PEOPLE :type/Text :type/City"]
                                        ["CREATED_AT" "ORDERS :type/DateTimeWithLocalTZ :type/CreationTimestamp"]
                                        ["CREATED_AT" "PEOPLE :type/DateTimeWithLocalTZ :type/CreationTimestamp"]
                                        ["CREATED_AT" "PRODUCTS :type/DateTimeWithLocalTZ :type/CreationTimestamp"]
                                        ["CREATED_AT" "REVIEWS :type/DateTimeWithLocalTZ :type/CreationTimestamp"]]
                                 "cat" [["CATEGORIES" "Table"]
                                        ["CATEGORY" "PRODUCTS :type/Text :type/Category"]
                                        ["CATEGORY_ID" "VENUES :type/Integer :type/FK"]]}]
        (is (= expected (prefix-fn (mt/id) prefix)))))))

(deftest ^:parallel autocomplete-suggestions-test-2
  (testing "GET /api/database/:id/autocomplete_suggestions"
    (testing " returns sane Cache-Control headers"
      (is (=? {"Cache-Control" "public, max-age=60"
               "Vary"          "Cookie"}
              (-> (client/client-full-response (test.users/username->token :rasta) :get 200
                                               (format "database/%s/autocomplete_suggestions" (mt/id))
                                               :prefix "u")
                  :headers))))))

(deftest autocomplete-suggestions-test-3
  (let [prefix-fn (fn [db-id prefix]
                    (mt/user-http-request :rasta :get 200
                                          (format "database/%d/autocomplete_suggestions" db-id)
                                          :prefix prefix))
        substring-fn (fn [db-id search]
                       (mt/user-http-request :rasta :get 200
                                             (format "database/%d/autocomplete_suggestions" db-id)
                                             :substring search))]
    (testing "GET /api/database/:id/autocomplete_suggestions"
      (testing " handles large numbers of tables and fields sensibly with prefix"
        (mt/with-model-cleanup [Field Table Database]
          (mt/with-temp [Database tmp-db {:name "Temp Autocomplete Pagination DB" :engine "h2"}]
            ;; insert more than 50 temporary tables and fields
            (doseq [i (range 60)]
              (let [tmp-tbl (first (t2/insert-returning-instances! Table {:name (format "My Table %d" i) :db_id (u/the-id tmp-db) :active true}))]
                (t2/insert! Field {:name (format "My Field %d" i) :table_id (u/the-id tmp-tbl) :base_type "type/Text" :database_type "varchar"})))
            ;; for each type-specific prefix, we should get 50 fields
            (is (= 50 (count (prefix-fn (u/the-id tmp-db) "My Field"))))
            (is (= 50 (count (prefix-fn (u/the-id tmp-db) "My Table"))))
            (let [my-results (prefix-fn (u/the-id tmp-db) "My")]
              ;; for this prefix, we should a mixture of 25 fields and 25 tables
              (is (= 50 (count my-results)))
              (is (= 25 (-> (filter #(str/starts-with? % "My Field") (map first my-results))
                            count)))
              (is (= 25 (-> (filter #(str/starts-with? % "My Table") (map first my-results))
                            count))))
            (testing " behaves differently with search and prefix query params"
              (is (= 0 (count (prefix-fn (u/the-id tmp-db) "a"))))
              (is (= 50 (count (substring-fn (u/the-id tmp-db) "a"))))
              ;; setting both uses search:
              (is (= 50 (count (mt/user-http-request :rasta :get 200
                                                     (format "database/%d/autocomplete_suggestions" (u/the-id tmp-db))
                                                     :prefix "a"
                                                     :substring "a")))))))))))

(deftest card-autocomplete-suggestions-test
  (testing "GET /api/database/:id/card_autocomplete_suggestions"
    (mt/with-temp
      [Collection collection {:name "Maz Analytics"}
       Card       card-1     (card-with-native-query "Maz Quote Views Per Month" :collection_id (:id collection))
       Card       card-2     (card-with-native-query "Maz Quote Views Per Day" :type :model)
       Card       card-3     (card-with-native-query "Maz Quote Views Per Day")]
      (let [card->result {card-1 (assoc (select-keys card-1 [:id :name]) :type "question", :collection_name (:name collection))
                          card-2 (assoc (select-keys card-2 [:id :name]) :type "model", :collection_name nil)
                          card-3 (assoc (select-keys card-3 [:id :name]) :type "question", :collection_name nil)}]
        (testing "exclude cards without perms"
          (mt/with-non-admin-groups-no-root-collection-perms
            (is (= [(card->result card-1)]
                   (mt/user-http-request :rasta :get 200
                                         (format "database/%d/card_autocomplete_suggestions" (mt/id))
                                         :query "maz"))))
          (testing "cards should match the query"
            (doseq [[query expected-cards] [; in all these queries, card-2 should be first because it's a model,
                                            ; followed by card-3 because it's created more recently than card-1
                                            ["QUOTE-views" [card-2 card-3 card-1]]
                                            ["per-day" [card-2 card-3]]
                                            [(str (:id card-1)) [card-1]]
                                            [(str (:id card-2) "-maz") [card-2]]
                                            [(str (:id card-2) "-kyle") []]]]
              (testing (format "query = %s" query)
                (is (= (map card->result expected-cards)
                       (mt/user-http-request :rasta :get 200
                                             (format "database/%d/card_autocomplete_suggestions" (mt/id))
                                             :query query))))))))
      (testing "should reject requests for databases for which the user has no perms"
        (mt/with-temp [Database {database-id :id} {}
                       Card     _ (card-with-native-query "Maz Quote Views Per Month" :database_id database-id)] {}
          (mt/with-no-data-perms-for-all-users!
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403
                                         (format "database/%d/card_autocomplete_suggestions" database-id)
                                         :query "maz")))))))))

(driver/register! ::no-nested-query-support
                  :parent :sql-jdbc
                  :abstract? true)

(defmethod driver/database-supports? [::no-nested-query-support :nested-queries] [_driver _feature _db] false)

(defn- get-all
  ([endpoint existing-ids]
   (get-all :rasta endpoint existing-ids))
  ([user endpoint existing-ids]
   (let [new?        (complement (set existing-ids))
         dbs         (->> (mt/user-http-request user :get 200 endpoint)
                          :data
                          (filter (comp new? :id)))]
     {:data  dbs
      :total (count dbs)})))

(deftest ^:parallel databases-list-test
  (testing "GET /api/database"
    (testing "Test that we can get all the DBs (ordered by name, then driver)"
      (testing "Database details/settings *should not* come back for Rasta since she's not a superuser"
        (let [expected-keys (-> #{:features :native_permissions :can_upload}
                                (into (keys (t2/select-one Database :id (mt/id))))
                                (disj :details))]
          (doseq [db (:data (mt/user-http-request :rasta :get 200 "database"))]
            (testing (format "Database %s %d %s" (:engine db) (u/the-id db) (pr-str (:name db)))
              (is (= expected-keys
                     (set (keys db)))))))))))

(deftest ^:parallel databases-list-test-2
  (testing "GET /api/database"
    (testing "Test that we can get all the DBs (ordered by name, then driver)"
      (testing "Make sure databases don't paginate"
        (mt/with-temp [Database _ {:engine ::test-driver}
                       Database _ {:engine ::test-driver}
                       Database _ {:engine ::test-driver}]
          (is (< 1 (count (:data (mt/user-http-request :rasta :get 200 "database" :limit 1 :offset 0))))))))))

(deftest ^:parallel databases-list-test-3
  (testing "GET /api/database"
    (testing "`?include=tables`"
      (let [old-ids (t2/select-pks-set Database)]
        (t2.with-temp/with-temp [Database _ {:engine (u/qualified-name ::test-driver)}]
          (doseq [db (:data (get-all "database?include=tables" old-ids))]
            (testing (format "Database %s %d %s" (:engine db) (u/the-id db) (pr-str (:name db)))
              (is (= (expected-tables db)
                     (:tables db))))))))))

(deftest ^:parallel databases-list-test-4
  (testing "GET /api/database"
    (testing "`?include_only_uploadable=true` -- excludes drivers that don't support uploads"
      (let [old-ids (t2/select-pks-set Database)]
        (t2.with-temp/with-temp [Database _ {:engine ::test-driver}]
          (is (= {:data  []
                  :total 0}
                 (get-all "database?include_only_uploadable=true" old-ids))))))))

(deftest ^:parallel databases-list-test-5
  (testing "GET /api/database"
    (testing "`?include_only_uploadable=true` -- includes drivers that do support uploads"
      (let [old-ids (t2/select-pks-set Database)]
        (t2.with-temp/with-temp [Database _ {:engine :postgres :name "The Chosen One"}]
          (testing "Must be an admin"
            (let [result (get-all :crowberto "database?include_only_uploadable=true" old-ids)]
              (is (= 1 (:total result)))
              (is (= "The Chosen One" (-> result :data first :name)))))
          (testing "No results for non-admins"
            (is (= {:data []
                    :total 0}
                   (get-all :rasta "database?include_only_uploadable=true" old-ids)))))))))

(deftest ^:parallel databases-list-can-upload-test
  (testing "GET /api/database"
    (let [old-ids (t2/select-pks-set Database)]
      (doseq [uploads-enabled? [true false]]
        (testing (format "The database with uploads enabled for the public schema has can_upload=%s" uploads-enabled?)
          (mt/with-temp [Database _ {:engine          :postgres
                                     :name            "The Chosen One"
                                     :uploads_enabled uploads-enabled?
                                     :uploads_schema_name "public"}]
            (let [result (get-all :crowberto "database" old-ids)]
              (is (= (:total result) 1))
              (is (= uploads-enabled? (-> result :data first :can_upload))))))))))

(deftest ^:parallel databases-list-include-saved-questions-test
  (testing "GET /api/database?saved=true"
    (t2.with-temp/with-temp [Card _ (assoc (card-with-native-query "Some Card")
                                           :result_metadata [{:name "col_name"}])]
      (testing "We should be able to include the saved questions virtual DB (without Tables) with the param ?saved=true"
        (is (= {:name               "Saved Questions"
                :id                 lib.schema.id/saved-questions-virtual-database-id
                :features           ["basic-aggregations"]
                :is_saved_questions true}
               (last (:data (mt/user-http-request :lucky :get 200 "database?saved=true")))))))))

(deftest ^:parallel databases-list-include-saved-questions-test-2
  (testing "GET /api/database?saved=true"
    (testing "We should not include the saved questions virtual DB if there aren't any cards"
      (is (not-any?
           :is_saved_questions
           (mt/user-http-request :lucky :get 200 "database?saved=true"))))))

(deftest databases-list-include-saved-questions-test-3
  (testing "GET /api/database?saved=true"
    (testing "Omit virtual DB if nested queries are disabled"
      (tu/with-temporary-setting-values [enable-nested-queries false]
        (is (every? some? (:data (mt/user-http-request :lucky :get 200 "database?saved=true"))))))))

(deftest ^:parallel fetch-databases-with-invalid-driver-test
  (testing "GET /api/database"
    (testing "\nEndpoint should still work even if there is a Database saved with a invalid driver"
      (t2.with-temp/with-temp [Database {db-id :id} {:engine "my-invalid-driver"}]
        (testing (format "\nID of Database with invalid driver = %d" db-id)
          (doseq [params [nil
                          "?saved=true"
                          "?include=tables"]]
            (testing (format "\nparams = %s" (pr-str params))
              (let [db-ids (set (map :id (:data (mt/user-http-request :lucky :get 200 (str "database" params)))))]
                (testing "DB should still come back, even though driver is invalid :shrug:"
                  (is (contains? db-ids db-id)))))))))))

(def ^:private SavedQuestionsDB
  "Schema for the expected shape of info about the 'saved questions' virtual DB from API responses."
  [:map
   [:name               [:= "Saved Questions"]]
   [:id                 [:= -1337]]
   [:is_saved_questions [:= true]]
   [:features           [:= ["basic-aggregations"]]]
   [:tables             [:sequential [:map
                                      [:id               #"^card__\d+$"]
                                      [:db_id            :int]
                                      [:display_name     :string]
                                      [:moderated_status [:or nil? [:= "verified"]]]
                                      [:schema           :string] ; collection name
                                      [:description      [:maybe :string]]]]]])

(defn- check-tables-included [response & tables]
  (let [response-tables (set (:tables response))]
    (doseq [table tables]
      (testing (format "Should include Table %s" (pr-str table))
        (is (contains? response-tables table))))))

(defn- check-tables-not-included [response & tables]
  (let [response-tables (set (:tables response))]
    (doseq [table tables]
      (testing (format "Should *not* include Table %s" (pr-str table))
        (is (not (contains? response-tables table)))))))

(defn- fetch-virtual-database []
  (some #(when (= (:name %) "Saved Questions")
           %)
        (:data (mt/user-http-request :crowberto :get 200 "database?saved=true&include=tables"))))

(deftest ^:parallel databases-list-include-saved-questions-tables-test
  (testing "GET /api/database?saved=true&include=tables"
    (testing "Check that we get back 'virtual' tables for Saved Questions"
      (testing "The saved questions virtual DB should be the last DB in the list"
        (t2.with-temp/with-temp [Card card (card-with-native-query "Maz Quote Views Per Month")]
          ;; run the Card which will populate its result_metadata column
          (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card)))
          ;; Now fetch the database list. The 'Saved Questions' DB should be last on the list
          (let [response (last (:data (mt/user-http-request :crowberto :get 200 "database?saved=true&include=tables")))]
            (is (malli= SavedQuestionsDB
                        response))
            (check-tables-included response (virtual-table-for-card card))))))))

(deftest databases-list-include-saved-questions-tables-test-2
  (testing "GET /api/database?saved=true&include=tables"
    (testing "Check that we get back 'virtual' tables for Saved Questions"
      (testing "Make sure saved questions are NOT included if the setting is disabled"
        (mt/with-temp-env-var-value! ["MB_ENABLE_NESTED_QUERIES" "false"]
          (t2.with-temp/with-temp [Card card (card-with-native-query "Maz Quote Views Per Month")]
            ;; run the Card which will populate its result_metadata column
            (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card)))
            ;; Now fetch the database list. The 'Saved Questions' DB should NOT be in the list
            (is (= nil
                   (fetch-virtual-database)))))))))

(deftest ^:parallel databases-list-include-saved-questions-tables-test-3
  (testing "GET /api/database?saved=true&include=tables"
    (testing "should pretend Collections are schemas"
      (mt/with-temp [Collection stamp-collection {:name "Stamps"}
                     Collection coin-collection  {:name "Coins"}
                     Card       stamp-card (card-with-native-query "Total Stamp Count", :collection_id (u/the-id stamp-collection))
                     Card       coin-card  (card-with-native-query "Total Coin Count",  :collection_id (u/the-id coin-collection))]
        ;; run the Cards which will populate their result_metadata columns
        (doseq [card [stamp-card coin-card]]
          (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card))))
        ;; Now fetch the database list. The 'Saved Questions' DB should be last on the list. Cards should have their
        ;; Collection name as their Schema
        (let [response (last (:data (mt/user-http-request :crowberto :get 200 "database?saved=true&include=tables")))]
          (is (malli= SavedQuestionsDB
                      response))
          (check-tables-included
           response
           (virtual-table-for-card coin-card :schema "Coins")
           (virtual-table-for-card stamp-card :schema "Stamps")))))))

(deftest ^:parallel databases-list-include-saved-questions-tables-test-4
  (testing "GET /api/database?saved=true&include=tables"
    (testing "should remove Cards that have ambiguous columns"
      (mt/with-temp [Card ok-card         (assoc (card-with-native-query "OK Card")         :result_metadata [{:name "cam"}])
                     Card cambiguous-card (assoc (card-with-native-query "Cambiguous Card") :result_metadata [{:name "cam"} {:name "cam_2"}])]
        (let [response (fetch-virtual-database)]
          (is (malli= SavedQuestionsDB
                      response))
          (check-tables-included response (virtual-table-for-card ok-card))
          (check-tables-not-included response (virtual-table-for-card cambiguous-card)))))))

(deftest ^:parallel databases-list-include-saved-questions-tables-test-5
  (testing "GET /api/database?saved=true&include=tables"
    (testing "should remove Cards that belong to a driver that doesn't support nested queries"
      (mt/with-temp [Database bad-db   {:engine ::no-nested-query-support, :details {}}
                     Card     bad-card {:name            "Bad Card"
                                        :dataset_query   {:database (u/the-id bad-db)
                                                          :type     :native
                                                          :native   {:query "[QUERY GOES HERE]"}}
                                        :result_metadata [{:name "sparrows"}]
                                        :database_id     (u/the-id bad-db)}
                     Card     ok-card  (assoc (card-with-native-query "OK Card")
                                              :result_metadata [{:name "finches"}])]
        (let [response (fetch-virtual-database)]
          (is (malli= SavedQuestionsDB
                      response))
          (check-tables-included response (virtual-table-for-card ok-card))
          (check-tables-not-included response (virtual-table-for-card bad-card)))))))

(deftest databases-list-include-saved-questions-tables-test-6
  (testing "GET /api/database?saved=true&include=tables"
    (testing "should work when there are no DBs that support nested queries"
      (with-redefs [driver.u/supports? (constantly false)]
        (is (nil? (fetch-virtual-database)))))))

(deftest ^:parallel databases-list-include-saved-questions-tables-test-7
  (testing "GET /api/database?saved=true&include=tables"
    (testing "should remove Cards that use cumulative-sum and cumulative-count aggregations"
      (mt/with-temp [Card ok-card  (ok-mbql-card)
                     Card bad-card (merge
                                    (mt/$ids checkins
                                      (card-with-mbql-query "Cum Count Card"
                                        :source-table $$checkins
                                        :aggregation  [[:cum-count]]
                                        :breakout     [!month.date]))
                                    {:result_metadata [{:name "num_toucans"}]})]
        (let [response (fetch-virtual-database)]
          (is (malli= SavedQuestionsDB
                      response))
          (check-tables-included response (virtual-table-for-card ok-card))
          (check-tables-not-included response (virtual-table-for-card bad-card)))))))

(deftest ^:parallel db-metadata-saved-questions-db-test
  (testing "GET /api/database/:id/metadata works for the Saved Questions 'virtual' database"
    (t2.with-temp/with-temp [Card card (assoc (card-with-native-query "Birthday Card")
                                              :result_metadata [{:name "age_in_bird_years"}])]
      (let [response (mt/user-http-request :crowberto :get 200
                                           (format "database/%d/metadata" lib.schema.id/saved-questions-virtual-database-id))]
        (is (malli= SavedQuestionsDB
                    response))
        (check-tables-included
         response
         (assoc (virtual-table-for-card card)
                :fields [{:name                     "age_in_bird_years"
                          :table_id                 (str "card__" (u/the-id card))
                          :id                       ["field" "age_in_bird_years" {:base-type "type/*"}]
                          :semantic_type            nil
                          :base_type                nil
                          :default_dimension_option nil
                          :dimension_options        []}]))))))

(deftest db-metadata-saved-questions-db-test-2
  (testing "GET /api/database/:id/metadata works for the Saved Questions 'virtual' database"
    (testing "\nif no eligible Saved Questions exist the endpoint should return empty tables"
      (with-redefs [api.database/cards-virtual-tables (constantly [])]
        (is (= {:name               "Saved Questions"
                :id                 lib.schema.id/saved-questions-virtual-database-id
                :features           ["basic-aggregations"]
                :is_saved_questions true
                :tables             []}
               (mt/user-http-request :crowberto :get 200
                                     (format "database/%d/metadata" lib.schema.id/saved-questions-virtual-database-id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                CRON SCHEDULES!                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private schedule-map-for-last-friday-at-11pm
  {:schedule_minute 0
   :schedule_day    "fri"
   :schedule_frame  "last"
   :schedule_hour   23
   :schedule_type   "monthly"})

(def ^:private schedule-map-for-weekly
  {:schedule_minute 0
   :schedule_day    "fri"
   :schedule_frame  nil
   :schedule_hour   nil
   :schedule_type   "weekly"})

(deftest create-db-with-manual-schedules-test
  (testing "POST /api/database"
    (testing "create a db with scan field values option is \"regularly on a schedule\""
      (with-db-scheduler-setup
        (with-test-driver-available!
          (let [{:keys [details] :as db}
                (mt/user-http-request :crowberto :post 200 "database"
                                      {:name    (mt/random-name)
                                       :engine  (u/qualified-name ::test-driver)
                                       :details   {:let-user-control-scheduling true}
                                       :schedules {:metadata_sync      schedule-map-for-weekly
                                                   :cache_field_values schedule-map-for-last-friday-at-11pm}
                                       :is_on_demand false
                                       :is_full_sync true})]
            (is (:let-user-control-scheduling details))
            (is (= (u.cron/schedule-map->cron-string schedule-map-for-weekly)
                   (:metadata_sync_schedule db)))
            (is (= (u.cron/schedule-map->cron-string schedule-map-for-last-friday-at-11pm)
                   (:cache_field_values_schedule db)))
            (is (= (task.sync-databases-test/all-db-sync-triggers-name db)
                   (task.sync-databases-test/query-all-db-sync-triggers-name db)))))))))

(deftest create-db-never-scan-field-values-test
  (testing "POST /api/database"
    (testing "create a db with scan field values option is \"Never, I'll do it myself\""
      (with-db-scheduler-setup
        (with-test-driver-available!
          (let [resp (mt/user-http-request :crowberto :post 200 "database"
                                           {:name         (mt/random-name)
                                            :engine       (u/qualified-name ::test-driver)
                                            :details      {:db                          "my_db"
                                                           :let-user-control-scheduling true}
                                            :schedules    {:metadata_sync      schedule-map-for-weekly
                                                           :cache_field_values schedule-map-for-last-friday-at-11pm}
                                            :is_on_demand false
                                            :is_full_sync false})
                db   (t2/select-one :model/Database (:id resp))]
            (is (= (u.cron/schedule-map->cron-string schedule-map-for-weekly)
                   (:metadata_sync_schedule db)))
            (is (nil? (:cache_field_values_schedule db)))
            (is (= #{(sync-and-analyze-trigger-name db)}
                   (task.sync-databases-test/query-all-db-sync-triggers-name db)))))))))

(deftest create-db-on-demand-scan-field-values-test
  (testing "POST /api/database"
    (testing "create a db with scan field values option is \"Only when adding a new filter widget\""
      (with-db-scheduler-setup
        (with-test-driver-available!
          (let [resp (mt/user-http-request :crowberto :post 200 "database"
                                           {:name         (mt/random-name)
                                            :engine       (u/qualified-name ::test-driver)
                                            :details      {:db                          "my_db"
                                                           :let-user-control-scheduling true}
                                            :schedules    {:metadata_sync      schedule-map-for-weekly
                                                           :cache_field_values schedule-map-for-last-friday-at-11pm}
                                            :is_on_demand true
                                            :is_full_sync false})
                db   (t2/select-one :model/Database (:id resp))]
            (is (= (u.cron/schedule-map->cron-string schedule-map-for-weekly)
                   (:metadata_sync_schedule db)))
            (is (nil? (:cache_field_values_schedule db)))
            (is (= #{(sync-and-analyze-trigger-name db)}
                   (task.sync-databases-test/query-all-db-sync-triggers-name db)))))))))

(deftest update-db-to-sync-on-custom-schedule-test
  (with-db-scheduler-setup
    (with-test-driver-available!
      (mt/with-temp
        [:model/Database db {}]
        (testing "can't update if let-user-control-scheduling is false"
          (let [db (mt/user-http-request :crowberto :put 200 (format "/database/%d" (:id db))
                                         {:details     {}
                                          :schedules   {:metadata_sync      schedule-map-for-weekly
                                                        :cache_field_values schedule-map-for-last-friday-at-11pm}
                                          :is_full_sync true
                                          :is_on_demand false})]
            (is (not= (u.cron/schedule-map->cron-string schedule-map-for-weekly)
                      (:metadata_sync_schedule db)))
            (is (not= (u.cron/schedule-map->cron-string schedule-map-for-last-friday-at-11pm)
                      (:cache_field_values_schedule db)))))

        (testing "update db setting with a custom trigger should reschedule scan field values"
          (mt/user-http-request :crowberto :put 200 (format "/database/%d" (:id db))
                                {:details     {:let-user-control-scheduling true}
                                 :schedules   {:metadata_sync      schedule-map-for-weekly
                                               :cache_field_values schedule-map-for-last-friday-at-11pm}
                                 :is_full_sync true
                                 :is_on_demand false})
          (is (= (task.sync-databases-test/all-db-sync-triggers-name db)
                 (task.sync-databases-test/query-all-db-sync-triggers-name db)))
          (let [db (t2/select-one :model/Database (:id db))]
            (is (= (u.cron/schedule-map->cron-string schedule-map-for-weekly)
                   (:metadata_sync_schedule db)))
            (is (= (u.cron/schedule-map->cron-string schedule-map-for-last-friday-at-11pm)
                   (:cache_field_values_schedule db)))))

       (testing "update db setting to never scan should remove scan field values trigger"
         (mt/user-http-request :crowberto :put 200 (format "/database/%d" (:id db))
                               {:details     {:let-user-control-scheduling true}
                                :schedules   {:metadata_sync      schedule-map-for-weekly
                                              :cache_field_values schedule-map-for-last-friday-at-11pm}
                                :is_full_sync false
                                :is_on_demand false})
         (is (= #{(sync-and-analyze-trigger-name db)}
                (task.sync-databases-test/query-all-db-sync-triggers-name db)))
         (let [db (t2/select-one :model/Database (:id db))]
           (is (= (u.cron/schedule-map->cron-string schedule-map-for-weekly)
                  (:metadata_sync_schedule db)))
           (is (nil? (:cache_field_values_schedule db)))))

       (testing "turn back to default settings should recreate all tasks with randomized schedule"
         (mt/user-http-request :crowberto :put 200 (format "/database/%d" (:id db))
                               {:details     {:let-user-control-scheduling false}
                                :schedules   {:metadata_sync      schedule-map-for-weekly
                                              :cache_field_values schedule-map-for-last-friday-at-11pm}
                                :is_full_sync true
                                :is_on_demand false})
         (is (= (task.sync-databases-test/all-db-sync-triggers-name db)
                (task.sync-databases-test/query-all-db-sync-triggers-name db)))
         (let [db (t2/select-one :model/Database (:id db))]
           ;; make sure the new schedule is randomized, not from the payload
           (is (not= (-> schedule-map-for-weekly u.cron/schedule-map->cron-string)
                     (:metadata_sync_schedule db)))
           (is (not= (-> schedule-map-for-last-friday-at-11pm u.cron/schedule-map->cron-string)
                     (:cache_field_values_schedule db)))))))))

(deftest update-db-to-never-scan-values-on-demand-test
  (with-db-scheduler-setup
    (with-test-driver-available!
      (mt/with-temp
        [:model/Database db {}]
        (testing "update db setting to never scan should remove scan field values trigger"
          (testing "sanity check that it has all triggers to begin with"
            (is (= (task.sync-databases-test/all-db-sync-triggers-name db)
                   (task.sync-databases-test/query-all-db-sync-triggers-name db))))
          (mt/user-http-request :crowberto :put 200 (format "/database/%d" (:id db))
                                {:details     {:let-user-control-scheduling true}
                                 :schedules   {:metadata_sync      schedule-map-for-weekly
                                               :cache_field_values schedule-map-for-last-friday-at-11pm}
                                 :is_full_sync false
                                 :is_on_demand false})
          (is (= #{(sync-and-analyze-trigger-name db)}
                 (task.sync-databases-test/query-all-db-sync-triggers-name db)))
          (let [db (t2/select-one :model/Database (:id db))]
            (is (= (u.cron/schedule-map->cron-string schedule-map-for-weekly)
                   (:metadata_sync_schedule db)))
            (is (nil? (:cache_field_values_schedule db)))))))))

(deftest update-db-to-scan-field-values-on-demand-test
  (with-db-scheduler-setup
    (with-test-driver-available!
      (testing "update db to scan on demand should remove scan field values trigger"
        (mt/with-temp
          [:model/Database db {}]
          (mt/user-http-request :crowberto :put 200 (format "/database/%d" (:id db))
                                {:details     {:let-user-control-scheduling true}
                                 :schedules   {:metadata_sync      schedule-map-for-weekly
                                               :cache_field_values schedule-map-for-last-friday-at-11pm}
                                 :is_full_sync false
                                 :is_on_demand true})
          (is (= #{(sync-and-analyze-trigger-name db)}
                 (task.sync-databases-test/query-all-db-sync-triggers-name db)))
          (let [db (t2/select-one :model/Database (:id db))]
            (is (= (u.cron/schedule-map->cron-string schedule-map-for-weekly)
                   (:metadata_sync_schedule db)))
            (is (nil? (:cache_field_values_schedule db)))))))))

(deftest ^:parallel fetch-db-with-expanded-schedules
  (testing "If we FETCH a database will it have the correct 'expanded' schedules?"
    (t2.with-temp/with-temp [Database db {:details                     {:let-user-control-scheduling true}
                                          :metadata_sync_schedule      "0 0 * ? * 6 *"
                                          :cache_field_values_schedule "0 0 23 ? * 6L *"}]
      (is (= {:cache_field_values_schedule "0 0 23 ? * 6L *"
              :metadata_sync_schedule      "0 0 * ? * 6 *"
              :schedules                   {:cache_field_values schedule-map-for-last-friday-at-11pm
                                            :metadata_sync      schedule-map-for-weekly}}
             (-> (mt/user-http-request :crowberto :get 200 (format "database/%d" (u/the-id db)))
                 (select-keys [:cache_field_values_schedule :metadata_sync_schedule :schedules])))))))

;; Five minutes
(def ^:private long-timeout (* 5 60 1000))

(defn- deliver-when-db [promise-to-deliver expected-db]
  (fn [db]
    (when (= (u/the-id db) (u/the-id expected-db))
      (deliver promise-to-deliver true))))

(deftest trigger-metadata-sync-for-db-test
  (testing "Can we trigger a metadata sync for a DB?"
    (let [sync-called?    (promise)
          analyze-called? (promise)]
      (mt/with-premium-features #{:audit-app}
        (t2.with-temp/with-temp [Database {db-id :id :as db} {:engine "h2", :details (:details (mt/db))}]
          (with-redefs [sync-metadata/sync-db-metadata! (deliver-when-db sync-called? db)
                        analyze/analyze-db!             (deliver-when-db analyze-called? db)]
            (mt/user-http-request :crowberto :post 200 (format "database/%d/sync_schema" (u/the-id db)))
            ;; Block waiting for the promises from sync and analyze to be delivered. Should be delivered instantly,
            ;; however if something went wrong, don't hang forever, eventually timeout and fail
            (testing "sync called?"
              (is (= true
                     (deref sync-called? long-timeout :sync-never-called))))
            (testing "analyze called?"
              (is (= true
                     (deref analyze-called? long-timeout :analyze-never-called))))
            (testing "audit log entry generated"
              (is (= db-id
                     (:model_id (mt/latest-audit-log-entry "database-manual-sync")))))))))))

(deftest ^:parallel dismiss-spinner-test
  (testing "Can we dismiss the spinner? (#20863)"
    (t2.with-temp/with-temp [Database db    {:engine "h2", :details (:details (mt/db)) :initial_sync_status "incomplete"}
                             Table    table {:db_id (u/the-id db) :initial_sync_status "incomplete"}]
      (mt/user-http-request :crowberto :post 200 (format "database/%d/dismiss_spinner" (u/the-id db)))
      (testing "dismissed db spinner"
        (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database (:id db)))))
      (testing "dismissed table spinner"
        (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Table (:id table))))))))

(deftest ^:parallel dismiss-spinner-test-2
  (testing "can we dissmiss the spinner if db has no tables? (#30837)"
    (t2.with-temp/with-temp [Database db    {:engine "h2", :details (:details (mt/db)) :initial_sync_status "incomplete"}]
      (mt/user-http-request :crowberto :post 200 (format "database/%d/dismiss_spinner" (u/the-id db)))
      (testing "dismissed db spinner"
        (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database (:id db))))))))

(deftest ^:parallel non-admins-cant-trigger-sync
  (testing "Non-admins should not be allowed to trigger sync"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 (format "database/%d/sync_schema" (mt/id)))))))

(deftest can-rescan-fieldvalues-for-a-db
  (testing "Can we RESCAN all the FieldValues for a DB?"
    (mt/with-premium-features #{:audit-app}
      (let [update-field-values-called? (promise)]
        (t2.with-temp/with-temp [Database db {:engine "h2", :details (:details (mt/db))}]
          (with-redefs [field-values/update-field-values! (fn [synced-db]
                                                            (when (= (u/the-id synced-db) (u/the-id db))
                                                              (deliver update-field-values-called? :sync-called)))]
            (mt/user-http-request :crowberto :post 200 (format "database/%d/rescan_values" (u/the-id db)))
            (is (= :sync-called
                   (deref update-field-values-called? long-timeout :sync-never-called)))
            (is (= (:id db) (:model_id (mt/latest-audit-log-entry "database-manual-scan"))))
            (is (= (:id db) (-> (mt/latest-audit-log-entry "database-manual-scan")
                                :details :id)))))))))

(deftest ^:parallel nonadmins-cant-trigger-rescan
  (testing "Non-admins should not be allowed to trigger re-scan"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 (format "database/%d/rescan_values" (mt/id)))))))

(deftest discard-db-fieldvalues
  (testing "Can we DISCARD all the FieldValues for a DB?"
    (mt/with-temp [Database    db       {:engine "h2", :details (:details (mt/db))}
                   Table       table-1  {:db_id (u/the-id db)}
                   Table       table-2  {:db_id (u/the-id db)}
                   Field       field-1  {:table_id (u/the-id table-1)}
                   Field       field-2  {:table_id (u/the-id table-2)}
                   FieldValues values-1 {:field_id (u/the-id field-1), :values [1 2 3 4]}
                   FieldValues values-2 {:field_id (u/the-id field-2), :values [1 2 3 4]}]
      (is (= {:status "ok"}
             (mt/user-http-request :crowberto :post 200 (format "database/%d/discard_values" (u/the-id db)))))
      (testing "values-1 still exists?"
        (is (= false
               (t2/exists? FieldValues :id (u/the-id values-1)))))
      (testing "values-2 still exists?"
        (is (= false
               (t2/exists? FieldValues :id (u/the-id values-2))))))))

(deftest discard-db-fieldvalues-audit-log-test
  (testing "Do we get an audit log entry when we discard all the FieldValues for a DB?"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [Database db {:engine "h2", :details (:details (mt/db))}]
        (is (= {:status "ok"} (mt/user-http-request :crowberto :post 200 (format "database/%d/discard_values" (u/the-id db)))))
        (is (= (:id db) (:model_id (mt/latest-audit-log-entry))))))))

(deftest ^:parallel nonadmins-cant-discard-all-fieldvalues
  (testing "Non-admins should not be allowed to discard all FieldValues"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 (format "database/%d/discard_values" (mt/id)))))))

(defn- api-validate-database!
  ([request-body]
   (api-validate-database! nil request-body))

  ([{:keys [expected-status-code user]
     :or   {expected-status-code 200
            user                 :crowberto}}
    request-body]
   (with-redefs [h2/*allow-testing-h2-connections* true]
     (mt/user-http-request user :post expected-status-code "database/validate" request-body))))

(defn- test-connection-details [engine details]
  (with-redefs [h2/*allow-testing-h2-connections* true]
    (#'api.database/test-connection-details engine details)))

(deftest validate-database-test
  (testing "POST /api/database/validate"
    (testing "Should require superuser permissions"
      (is (= "You don't have permissions to do that."
             (api-validate-database! {:user :rasta, :expected-status-code 403}
                                     {:details {:engine :h2, :details (:details (mt/db))}}))))

    (testing "Underlying `test-connection-details` function should work"
      (is (= (:details (mt/db))
             (test-connection-details "h2" (:details (mt/db))))))

    (testing "Valid database connection details"
      (is (= (merge (:details (mt/db)) {:valid true})
             (api-validate-database! {:details {:engine :h2, :details (:details (mt/db))}}))))

    (testing "invalid database connection details"
      (testing "calling test-connection-details directly"
        (is (= {:errors  {:db "check your connection string"}
                :message "Implicitly relative file paths are not allowed."
                :valid   false}
               (test-connection-details "h2" {:db "ABC"}))))

      (testing "via the API endpoint"
        (is (= {:errors  {:db "check your connection string"}
                :message "Implicitly relative file paths are not allowed."
                :valid   false}
               (api-validate-database! {:details {:engine :h2, :details {:db "ABC"}}})))))))

(deftest validate-database-test-2
  (testing "POST /api/database/validate"
    (let [call-count (atom 0)
          ssl-values (atom [])
          valid?     (atom false)]
      (with-redefs [api.database/test-database-connection (fn [_ details & _]
                                                            (swap! call-count inc)
                                                            (swap! ssl-values conj (:ssl details))
                                                            (if @valid? nil {:valid false}))]
        (testing "with SSL enabled, do not allow non-SSL connections"
          (#'api.database/test-connection-details "postgres" {:ssl true})
          (is (= 1 @call-count))
          (is (= [true] @ssl-values)))

        (reset! call-count 0)
        (reset! ssl-values [])

        (testing "with SSL disabled, try twice (once with, once without SSL)"
          (#'api.database/test-connection-details "postgres" {:ssl false})
          (is (= 2 @call-count))
          (is (= [true false] @ssl-values)))

        (reset! call-count 0)
        (reset! ssl-values [])

        (testing "with SSL unspecified, try twice (once with, once without SSL)"
          (#'api.database/test-connection-details "postgres" {})
          (is (= 2 @call-count))
          (is (= [true nil] @ssl-values)))

        (reset! call-count 0)
        (reset! ssl-values [])
        (reset! valid? true)

        (testing "with SSL disabled, but working try once (since SSL work we don't try without SSL)"
          (is (= {:ssl true}
                 (#'api.database/test-connection-details "postgres" {:ssl false})))
          (is (= 1 @call-count))
          (is (= [true] @ssl-values)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                      GET /api/database/:id/schemas & GET /api/database/:id/schema/:schema                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel get-schemas-test
  (testing "GET /api/database/:id/schemas"
    (testing "Multiple schemas are ordered by name"
      (mt/with-temp
        [Database {db-id :id} {}
         Table    _           {:db_id db-id :schema "schema3"}
         Table    _           {:db_id db-id :schema "schema2"}
         Table    _           {:db_id db-id :schema "schema1"}]
        (is (= ["schema1" "schema2" "schema3"]
               (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id))))))

    (testing "Looking for a database that doesn't exist should return a 404"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 (format "database/%s/schemas" Integer/MAX_VALUE)))))

    (testing "should work for the saved questions 'virtual' database"
      (mt/with-temp [Collection coll   {:name "My Collection"}
                     Card       card-1 (assoc (card-with-native-query "Card 1") :collection_id (:id coll))
                     Card       card-2 (card-with-native-query "Card 2")]
        ;; run the cards to populate their result_metadata columns
        (doseq [card [card-1 card-2]]
          (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card))))
        (let [schemas (set (mt/user-http-request
                            :lucky :get 200
                            (format "database/%d/schemas" lib.schema.id/saved-questions-virtual-database-id)))]
          (is (contains? schemas "Everything else"))
          (is (contains? schemas "My Collection")))))
    (testing "null and empty schemas should both come back as blank strings"
      (mt/with-temp [Database {db-id :id} {}
                     Table    _ {:db_id db-id :schema ""}
                     Table    _ {:db_id db-id :schema nil}
                     Table    _ {:db_id db-id :schema " "}]
        (is (= ["" " "]
               (mt/user-http-request :lucky :get 200 (format "database/%d/schemas" db-id))))))))

(deftest get-syncable-schemas-test
  (testing "GET /api/database/:id/syncable_schemas"
    (testing "Multiple schemas are ordered by name"
      ;; We need to redef driver/syncable-schemas here because different databases might have different schemas
      (with-redefs [driver/syncable-schemas (constantly #{"PUBLIC"})]
        (is (= ["PUBLIC"]
               (mt/user-http-request :crowberto :get 200 (format "database/%d/syncable_schemas" (mt/id)))))
        (testing "Non-admins don't have permission to see syncable schemas"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (format "database/%d/syncable_schemas" (mt/id))))))))))

(deftest ^:parallel get-schemas-for-schemas-with-no-visible-tables
  (mt/with-temp
    [Database {db-id :id} {}
     Table    _ {:db_id db-id :schema "schema_1a" :name "table_1"}
     Table    _ {:db_id db-id :schema "schema_1c" :name "table_1"} ;; out of order for sorting
     Table    _ {:db_id db-id :schema "schema_1b" :name "table_1"}
     ;; table is not visible. Any non-nil value of `visibility_type` means Table shouldn't be visible
     Table    _ {:db_id db-id :schema "schema_2" :name "table_2a" :visibility_type "hidden"}
     Table    _ {:db_id db-id :schema "schema_2" :name "table_2b" :visibility_type "cruft"}
       ;; table is not active
     Table    _ {:db_id db-id :schema "schema_3" :name "table_3" :active false}]
    (testing "GET /api/database/:id/schemas should not return schemas with no VISIBLE TABLES"
      (is (= ["schema_1a" "schema_1b" "schema_1c"]
             (mt/user-http-request :crowberto :get 200 (format "database/%d/schemas" db-id)))))
    (testing "GET /api/database/:id/schemas?include_hidden=true should return schemas with no VISIBLE TABLES"
      (is (= ["schema_1a" "schema_1b" "schema_1c" "schema_2"]
             (mt/user-http-request :crowberto :get 200 (format "database/%d/schemas?include_hidden=true" db-id)))))))

(deftest get-schemas-permissions-test
  (testing "GET /api/database/:id/schemas against permissions"
    (mt/with-temp [Database {db-id :id} {}
                   Table    t1 {:db_id db-id :schema "schema1"}
                   Table    t2 {:db_id db-id :schema "schema1"}]
      (testing "should work if user has full DB perms..."
        (is (= ["schema1"]
               (mt/with-full-data-perms-for-all-users!
                 (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id))))))

      (testing "...or just table read perms..."
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t1) :perms/create-queries :query-builder)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t2) :perms/create-queries :query-builder)
          (is (= ["schema1"]
                 (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id))))))

      (testing "should return a 403 for a user that doesn't have read permissions for the database"
        (mt/with-no-data-perms-for-all-users!
          (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "database/%s/schemas" db-id))))))

      (testing "should return a 403 if there are no perms for any schema"
        (mt/with-full-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t1) :perms/create-queries :no)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t2) :perms/create-queries :no)
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (format "database/%s/schemas" db-id)))))))

    (testing "should exclude schemas for which the user has no perms"
      (mt/with-temp [Database {database-id :id} {}
                     Table    {t1-id :id} {:db_id database-id :schema "schema-with-perms"}
                     Table    _ {:db_id database-id :schema "schema-without-perms"}]
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) database-id :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) t1-id :perms/create-queries :query-builder)
          (is (= ["schema-with-perms"]
                 (mt/user-http-request :rasta :get 200 (format "database/%s/schemas" database-id)))))))))

(deftest get-schema-tables-test
  (testing "GET /api/database/:id/schema/:schema"
    (testing "Should return a 404 if the database isn't found"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 (format "database/%s/schema/%s" Integer/MAX_VALUE "schema1")))))
    (testing "Should return a 404 if the schema isn't found"
      (mt/with-temp [Database {db-id :id} {}
                     Table    _ {:db_id db-id :schema "schema1"}]
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 (format "database/%d/schema/%s" db-id "not schema1"))))))

    (testing "should exclude Tables for which the user has no perms"
      (mt/with-temp [Database {database-id :id} {}
                     Table    table-with-perms {:db_id database-id :schema "public" :name "table-with-perms"}
                     Table    _                {:db_id database-id :schema "public" :name "table-without-perms"}]
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) database-id :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) table-with-perms :perms/create-queries :query-builder)
          (is (= ["table-with-perms"]
                 (map :name (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public"))))))))

    (testing "should exclude inactive Tables"
      (mt/with-temp [Database {database-id :id} {}
                     Table    _ {:db_id database-id :schema "public" :name "table"}
                     Table    _ {:db_id database-id :schema "public" :name "inactive-table" :active false}]
        (is (= ["table"]
               (map :name (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public")))))))

    (testing "should exclude hidden Tables"
      (mt/with-temp [Database {database-id :id} {}
                     Table    _ {:db_id database-id :schema "public" :name "table"}
                     Table    _ {:db_id database-id :schema "public" :name "hidden-table" :visibility_type "hidden"}]
        (is (= ["table"]
               (map :name (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public")))))))

    (testing "should show hidden Tables when explicitly asked for"
      (mt/with-temp [Database {database-id :id} {}
                     Table    _ {:db_id database-id :schema "public" :name "table"}
                     Table    _ {:db_id database-id :schema "public" :name "hidden-table" :visibility_type "hidden"}]
        (is (= #{"table" "hidden-table"}
               (set (map :name (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public")
                                                     :include_hidden true)))))))

    (testing "should work for the saved questions 'virtual' database"
      (mt/with-temp [Collection coll   {:name "My Collection"}
                     Card       card-1 (assoc (card-with-native-query "Card 1") :collection_id (:id coll))
                     Card       card-2 (card-with-native-query "Card 2")]
        ;; run the cards to populate their result_metadata columns
        (doseq [card [card-1 card-2]]
          (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card))))
        (testing "Should be able to get saved questions in a specific collection"
          (is (= [{:id               (format "card__%d" (:id card-1))
                   :db_id            (mt/id)
                   :moderated_status nil
                   :display_name     "Card 1"
                   :schema           "My Collection"
                   :description      nil
                   :type             "question"}]
                 (mt/user-http-request :lucky :get 200
                                       (format "database/%d/schema/%s" lib.schema.id/saved-questions-virtual-database-id "My Collection")))))

        (testing "Should be able to get saved questions in the root collection"
          (let [response (mt/user-http-request :lucky :get 200
                                               (format "database/%d/schema/%s" lib.schema.id/saved-questions-virtual-database-id
                                                       (api.table/root-collection-schema-name)))]
            (is (malli= [:sequential
                         [:map
                          [:id               #"^card__\d+$"]
                          [:db_id            ::lib.schema.id/database]
                          [:display_name     :string]
                          [:moderated_status [:maybe [:= "verified"]]]
                          [:schema           [:= (api.table/root-collection-schema-name)]]
                          [:description      [:maybe :string]]]]
                        response))
            (is (not (contains? (set (map :display_name response)) "Card 3")))
            (is (contains? (set response)
                           {:id               (format "card__%d" (:id card-2))
                            :db_id            (mt/id)
                            :display_name     "Card 2"
                            :moderated_status nil
                            :schema           (api.table/root-collection-schema-name)
                            :description      nil
                            :type             "question"}))))

        (testing "Should throw 404 if the schema/Collection doesn't exist"
          (is (= "Not found."
                 (mt/user-http-request :lucky :get 404
                                       (format "database/%d/schema/%s" lib.schema.id/saved-questions-virtual-database-id "Coin Collection")))))))
    (testing "should work for the datasets in the 'virtual' database"
      (mt/with-temp [Collection coll   {:name "My Collection"}
                     Card       card-1 (assoc (card-with-native-query "Card 1")
                                              :collection_id (:id coll)
                                              :type :model)
                     Card       card-2 (assoc (card-with-native-query "Card 2")
                                              :type :model)
                     Card       _card-3 (assoc (card-with-native-query "error")
                                               ;; regular saved question should not be in the results
                                               :type :question)]
        ;; run the cards to populate their result_metadata columns
        (doseq [card [card-1 card-2]]
          (is (=? {:status "completed"}
                  (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card))))))
        (testing "Should be able to get datasets in a specific collection"
          (is (= [{:id               (format "card__%d" (:id card-1))
                   :db_id            (mt/id)
                   :moderated_status nil
                   :display_name     "Card 1"
                   :schema           "My Collection"
                   :description      nil
                   :type             "model"}]
                 (mt/user-http-request :lucky :get 200
                                       (format "database/%d/datasets/%s" lib.schema.id/saved-questions-virtual-database-id "My Collection")))))

        (testing "Should be able to get datasets in the root collection"
          (let [response (mt/user-http-request :lucky :get 200
                                               (format "database/%d/datasets/%s" lib.schema.id/saved-questions-virtual-database-id
                                                       (api.table/root-collection-schema-name)))]
            (is (malli= [:sequential
                         [:map
                          [:id               [:re #"^card__\d+$"]]
                          [:db_id            ::lib.schema.id/database]
                          [:display_name     :string]
                          [:moderated_status [:maybe [:= :verified]]]
                          [:schema           [:= (api.table/root-collection-schema-name)]]
                          [:description      [:maybe :string]]]]
                        response))
            (is (contains? (set response)
                           {:id               (format "card__%d" (:id card-2))
                            :db_id            (mt/id)
                            :display_name     "Card 2"
                            :moderated_status nil
                            :schema           (api.table/root-collection-schema-name)
                            :description      nil
                            :type             "model"}))))

        (testing "Should throw 404 if the schema/Collection doesn't exist"
          (is (= "Not found."
                 (mt/user-http-request :lucky :get 404
                                       (format "database/%d/schema/%s" lib.schema.id/saved-questions-virtual-database-id "Coin Collection")))))))

    (mt/with-temp [Database {db-id :id} {}
                   Table    _ {:db_id db-id :schema nil :name "t1"}
                   Table    _ {:db_id db-id :schema "" :name "t2"}]
      (testing "to fetch Tables with `nil` or empty schemas, use the blank string"
        (is (= ["t1" "t2"]
               (map :name (mt/user-http-request :lucky :get 200 (format "database/%d/schema/" db-id)))))))))

(deftest get-schema-tables-permissions-test
  (testing "GET /api/database/:id/schema/:schema against permissions"
    (mt/with-temp [Database {db-id :id} {}
                   Table    t1  {:db_id db-id :schema "schema1" :name "t1"}
                   Table    _t2 {:db_id db-id :schema "schema2"}
                   Table    t3  {:db_id db-id :schema "schema1" :name "t3"}]
      (testing "if we have full data perms for the DB"
        (mt/with-full-data-perms-for-all-users!
          (is (= ["t1" "t3"]
               (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/%s" db-id "schema1")))))))

      (testing "if we have query perms for all tables in the schema"
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t1) :perms/create-queries :query-builder)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t3) :perms/create-queries :query-builder)
          (is (= ["t1" "t3"]
                 (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/%s" db-id "schema1")))))))

      (testing "if we have query perms for one table in the schema, and legacy-no-self-service data perms for another"
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t1) :perms/view-data :legacy-no-self-service)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t1) :perms/create-queries :no)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t3) :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t3) :perms/create-queries :query-builder)
          (is (= ["t3"]
                 (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/%s" db-id "schema1"))))))))

    (testing "should return a 403 for a user that doesn't have read permissions"
      (testing "for the DB"
        (mt/with-temp [Database {database-id :id} {}
                       Table    _ {:db_id database-id :schema "test"}]
          (mt/with-no-data-perms-for-all-users!
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "database/%s/schema/%s" database-id "test")))))))

      (testing "for all tables in the schema"
        (mt/with-temp [Database {database-id :id} {}
                       Table    {t1-id :id} {:db_id database-id :schema "schema-with-perms"}
                       Table    _ {:db_id database-id :schema "schema-without-perms"}]
          (mt/with-no-data-perms-for-all-users!
            (data-perms/set-database-permission! (perms-group/all-users) database-id :perms/view-data :unrestricted)
            (data-perms/set-table-permission! (perms-group/all-users) t1-id :perms/create-queries :query-builder)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "database/%s/schema/%s" database-id "schema-without-perms"))))))))))

(deftest ^:parallel slashes-in-identifiers-test
  (testing "We should handle Databases with slashes in identifiers correctly (#12450)"
    (t2.with-temp/with-temp [Database {db-id :id} {:name "my/database"}]
      (doseq [schema-name ["my/schema"
                           "my//schema"
                           "my\\schema"
                           "my\\\\schema"
                           "my\\//schema"
                           "my_schema/"
                           "my_schema\\"]]
        (testing (format "\nschema name = %s" (pr-str schema-name))
          (t2.with-temp/with-temp [Table _ {:db_id db-id, :schema schema-name, :name "my/table"}]
            (testing "\nFetch schemas"
              (testing "\nGET /api/database/:id/schemas/"
                (is (= [schema-name]
                       (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id))))))
            (testing (str "\nFetch schema tables -- should work if you URL escape the schema name"
                          "\nGET /api/database/:id/schema/:schema")
              (let [url (format "database/%d/schema/%s" db-id (codec/url-encode schema-name))]
                (testing (str "\nGET /api/" url)
                  (is (=? [{:schema schema-name}]
                          (mt/user-http-request :rasta :get 200 url))))))))))))

(deftest ^:parallel upsert-sensitive-fields-no-changes-test
  (testing "empty maps are okay"
    (is (= {}
           (#'api.database/upsert-sensitive-fields {} {}))))
  (testing "no details updates are okay"
    (is (= nil
           (#'api.database/upsert-sensitive-fields nil nil)))))

(deftest ^:parallel upsert-sensitive-fields-fields-are-replaced-test
  (testing "fields are replaced"
    (is (= {:use-service-account           nil
            :dataset-id                    "dacort"
            :use-jvm-timezone              false
            :service-account-json          "{\"foo\": \"bar\"}"
            :password                      "foo"
            :pass                          "bar"
            :tunnel-pass                   "quux"
            :tunnel-private-key            "foobar"
            :tunnel-private-key-passphrase "fooquux"
            :access-token                  "foobarfoo"
            :refresh-token                 "foobarquux"}
           (#'api.database/upsert-sensitive-fields {:description nil
                                                    :name        "customer success BQ"
                                                    :details     {:use-service-account           nil
                                                                  :dataset-id                    "dacort"
                                                                  :service-account-json          "{}"
                                                                  :use-jvm-timezone              false
                                                                  :password                      "password"
                                                                  :pass                          "pass"
                                                                  :tunnel-pass                   "tunnel-pass"
                                                                  :tunnel-private-key            "tunnel-private-key"
                                                                  :tunnel-private-key-passphrase "tunnel-private-key-passphrase"
                                                                  :access-token                  "access-token"
                                                                  :refresh-token                 "refresh-token"}
                                                    :id          (mt/id)}
                                                   {:service-account-json          "{\"foo\": \"bar\"}"
                                                    :password                      "foo"
                                                    :pass                          "bar"
                                                    :tunnel-pass                   "quux"
                                                    :tunnel-private-key            "foobar"
                                                    :tunnel-private-key-passphrase "fooquux"
                                                    :access-token                  "foobarfoo"
                                                    :refresh-token                 "foobarquux"})))))

(deftest ^:parallel upsert-sensitive-fields-one-field-replaced-test
  (testing "only one field is replaced"
    (is (= {:use-service-account           nil
            :dataset-id                    "dacort"
            :use-jvm-timezone              false
            :service-account-json          "{}"
            :password                      "new-password"
            :pass                          "pass"
            :tunnel-pass                   "tunnel-pass"
            :tunnel-private-key            "tunnel-private-key"
            :tunnel-private-key-passphrase "tunnel-private-key-passphrase"
            :access-token                  "access-token"
            :refresh-token                 "refresh-token"}
           (#'api.database/upsert-sensitive-fields {:description nil
                                                    :name        "customer success BQ"
                                                    :details     {:use-service-account           nil
                                                                  :dataset-id                    "dacort"
                                                                  :use-jvm-timezone              false
                                                                  :service-account-json          "{}"
                                                                  :password                      "password"
                                                                  :pass                          "pass"
                                                                  :tunnel-pass                   "tunnel-pass"
                                                                  :tunnel-private-key            "tunnel-private-key"
                                                                  :tunnel-private-key-passphrase "tunnel-private-key-passphrase"
                                                                  :access-token                  "access-token"
                                                                  :refresh-token                 "refresh-token"}
                                                    :id          (mt/id)}
                                                   {:service-account-json          protected-password
                                                    :password                      "new-password"
                                                    :pass                          protected-password
                                                    :tunnel-pass                   protected-password
                                                    :tunnel-private-key            protected-password
                                                    :tunnel-private-key-passphrase protected-password
                                                    :access-token                  protected-password
                                                    :refresh-token                 protected-password})))))

(deftest ^:parallel upsert-sensitive-fields-no-fields-replaced-test
  (testing "no fields are replaced"
    (is (= {:use-service-account           nil
            :dataset-id                    "dacort"
            :use-jvm-timezone              false
            :service-account-json          "{}"
            :password                      "password"
            :pass                          "pass"
            :tunnel-pass                   "tunnel-pass"
            :tunnel-private-key            "tunnel-private-key"
            :tunnel-private-key-passphrase "tunnel-private-key-passphrase"
            :access-token                  "access-token"
            :refresh-token                 "refresh-token"}
           (#'api.database/upsert-sensitive-fields {:description nil
                                                    :name        "customer success BQ"
                                                    :details     {:use-service-account           nil
                                                                  :dataset-id                    "dacort"
                                                                  :use-jvm-timezone              false
                                                                  :service-account-json          "{}"
                                                                  :password                      "password"
                                                                  :pass                          "pass"
                                                                  :tunnel-pass                   "tunnel-pass"
                                                                  :tunnel-private-key            "tunnel-private-key"
                                                                  :tunnel-private-key-passphrase "tunnel-private-key-passphrase"
                                                                  :access-token                  "access-token"
                                                                  :refresh-token                 "refresh-token"}
                                                    :id          (mt/id)}
                                                   {:service-account-json          protected-password
                                                    :password                      protected-password
                                                    :pass                          protected-password
                                                    :tunnel-pass                   protected-password
                                                    :tunnel-private-key            protected-password
                                                    :tunnel-private-key-passphrase protected-password
                                                    :access-token                  protected-password
                                                    :refresh-token                 protected-password})))))


(deftest ^:parallel secret-file-paths-returned-by-api-test
  (mt/with-driver :secret-test-driver
    (testing "File path values for secrets are returned as plaintext in the API (#20030)"
      (t2.with-temp/with-temp [Database database {:engine  :secret-test-driver
                                                  :name    "Test secret DB with password path"
                                                  :details {:host           "localhost"
                                                            :password-path "/path/to/password.txt"}}]
        (is (= {:password-source "file-path"
                :password-value  "/path/to/password.txt"}
               (as-> (u/the-id database) d
                 (format "database/%d" d)
                 (mt/user-http-request :crowberto :get 200 d)
                 (:details d)
                 (select-keys d [:password-source :password-value]))))))))

;; these descriptions use deferred-tru because the `defsetting` macro complains if they're not, but since these are in
;; tests they won't get scraped for i18n purposes so it's ok.
(defsetting test-db-local-setting-public
  (deferred-tru "Test Database-local Setting with internal visibility.")
  :database-local :only
  :visibility :public
  :type :integer)

(defsetting test-db-local-setting-authenticated
  (deferred-tru "Test Database-local Setting with internal visibility.")
  :database-local :only
  :visibility :authenticated
  :type :integer)

(defsetting test-db-local-setting-admin
  (deferred-tru "Test Database-local Setting with internal visibility.")
  :database-local :only
  :visibility :admin
  :type :integer)

(defsetting test-db-local-setting-internal
  "Test Database-local Setting with internal visibility."
  :database-local :only
  :visibility :internal
  :type :integer)

(deftest database-local-settings-come-back-with-database-test
  (testing "Database-local Settings should come back with"
    (mt/with-temp-vals-in-db Database (mt/id) {:settings {:test-db-local-setting-public        1
                                                          :test-db-local-setting-authenticated 1
                                                          :test-db-local-setting-admin         1
                                                          :test-db-local-setting-internal      1}}
      (doseq [[user user-type] {:crowberto :admin, :rasta :non-admin}]
        (doseq [{:keys [endpoint response]} [{:endpoint "GET /api/database/:id"
                                              :response (fn []
                                                          (mt/user-http-request user :get 200 (format "database/%d" (mt/id))))}
                                             {:endpoint "GET /api/database"
                                              :response (fn []
                                                          (some
                                                           (fn [database]
                                                             (when (= (:id database) (mt/id))
                                                               database))
                                                           (:data (mt/user-http-request user :get 200 "database"))))}]]
          (testing endpoint
            (let [{:keys [settings], :as response} (response)]
              (is (map? response))
              (is (map? settings))
              (doseq [{:keys [setting visible?]} [{:setting  :test-db-local-setting-public
                                                   :visible? (if (= user-type :non-admin) true true)}
                                                  {:setting  :test-db-local-setting-authenticated
                                                   :visible? (if (= user-type :non-admin) true true)}
                                                  {:setting  :test-db-local-setting-admin
                                                   :visible? (if (= user-type :non-admin) false true)}
                                                  {:setting  :test-db-local-setting-internal
                                                   :visible? (if (= user-type :non-admin) false false)}]
                      :let                       [{:keys [visibility]} (setting/resolve-setting setting)]]
                (testing (format "\nIf Setting visibility is %s, %s user should %s be able to see its value"
                                 visibility user-type (if visible? "SHOULD" "SHOULD NOT"))
                  (testing (format "\nresponse = %s" (u/pprint-to-str response))
                    (if visible?
                      (is (partial= {setting 1}
                                    settings))
                      (is (not (contains? settings setting))))))))))))))

(deftest admins-set-database-local-settings-test
  (testing "Admins should be allowed to update Database-local Settings (#19409)"
    (mt/with-temp-vals-in-db Database (mt/id) {:settings nil}
      (letfn [(settings []
                (t2/select-one-fn :settings Database :id (mt/id)))
              (set-settings! [m]
                (with-redefs [h2/*allow-testing-h2-connections* true]
                  (u/prog1 (mt/user-http-request :crowberto :put 200 (format "database/%d" (mt/id))
                                                 {:settings m})
                    (is (=? {:id (mt/id)}
                            <>)))))]
        (testing "Should not contain :unaggregated-query-row-limit"
          (is (=? {:unaggregated-query-row-limit (symbol "nil #_\"key is not present.\"")}
                  (settings))))
        (testing "Set initial value"
          (testing "response"
            (is (=? {:settings {:unaggregated-query-row-limit 1337}}
                    (set-settings! {:unaggregated-query-row-limit 1337}))))
          (testing "App DB"
            (is (=? {:unaggregated-query-row-limit 1337}
                    (settings)))))
        (testing "Setting a different value should not affect anything not specified (PATCH-style update)"
          (testing "response"
            (is (=? {:settings {:unaggregated-query-row-limit 1337
                                :database-enable-actions      true}}
                    (set-settings! {:database-enable-actions true}))))
          (testing "App DB"
            (is (=? {:unaggregated-query-row-limit 1337
                     :database-enable-actions      true}
                    (settings)))))
        (testing "Update existing value"
          (testing "response"
            (is (=? {:settings {:unaggregated-query-row-limit 1337
                                :database-enable-actions      false}}
                    (set-settings! {:database-enable-actions false}))))
          (testing "App DB"
            (is (=? {:unaggregated-query-row-limit 1337
                     :database-enable-actions      false}
                    (settings)))))
        (testing "Unset a value"
          (testing "response"
            (is (=? {:settings {:database-enable-actions      false
                                :unaggregated-query-row-limit (symbol "nil #_\"key is not present.\"")}}
                    (set-settings! {:unaggregated-query-row-limit nil}))))
          (testing "App DB"
            (is (=? {:database-enable-actions      false
                     :unaggregated-query-row-limit (symbol "nil #_\"key is not present.\"")}
                    (settings)))))))))

(deftest log-an-error-if-contains-undefined-setting-test
  (testing "should log an error message if database contains undefined settings"
    (t2.with-temp/with-temp [Database {db-id :id} {:settings {:undefined-setting true}}]
      (is (= "Error checking the readability of :undefined-setting setting. The setting will be hidden in API response."
             (-> (mt/with-log-messages-for-level :error
                   (testing "does not includes undefined keys by default"
                     (is (not (contains? (:settings (mt/user-http-request :crowberto :get 200 (str "database/" db-id)))
                                         :undefined-setting)))))
                 first
                 last))))))

(deftest persist-database-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
    (mt/dataset test-data
      (let [db-id (:id (mt/db))]
        (t2.with-temp/with-temp
          [Card card {:database_id db-id
                      :type        :model}]
          (mt/with-temporary-setting-values [persisted-models-enabled false]
            (testing "requires persist setting to be enabled"
              (is (= "Persisting models is not enabled."
                     (mt/user-http-request :crowberto :post 400 (str "database/" db-id "/persist"))))))

          (mt/with-temporary-setting-values [persisted-models-enabled true]
            (testing "only users with permissions can persist a database"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :post 403 (str "database/" db-id "/persist")))))

            (testing "should be able to persit an database"
              (mt/user-http-request :crowberto :post 204 (str "database/" db-id "/persist"))
              (is (= "creating" (t2/select-one-fn :state 'PersistedInfo
                                                  :database_id db-id
                                                  :card_id     (:id card))))
              (is (true? (t2/select-one-fn (comp :persist-models-enabled :settings)
                                           Database
                                           :id db-id)))
              (is (true? (get-in (mt/user-http-request :crowberto :get 200
                                                       (str "database/" db-id))
                                 [:settings :persist-models-enabled]))))
            (testing "it's okay to trigger persist even though the database is already persisted"
              (mt/user-http-request :crowberto :post 204 (str "database/" db-id "/persist")))))))))

(deftest unpersist-database-test
  (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
    (mt/dataset test-data
      (let [db-id (:id (mt/db))]
        (t2.with-temp/with-temp
          [Card     _ {:database_id db-id
                       :type        :model}]
          (testing "only users with permissions can persist a database"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 (str "database/" db-id "/unpersist")))))

          (mt/with-temporary-setting-values [persisted-models-enabled true]
            (testing "should be able to persit an database"
              ;; trigger persist first
              (mt/user-http-request :crowberto :post 204 (str "database/" db-id "/unpersist"))
              (is (nil? (t2/select-one-fn (comp :persist-models-enabled :settings)
                                          Database
                                          :id db-id))))
            (testing "it's okay to unpersist even though the database is not persisted"
              (mt/user-http-request :crowberto :post 204 (str "database/" db-id "/unpersist")))))))))
