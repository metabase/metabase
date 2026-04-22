(ns ^:mb/driver-tests metabase.warehouses-rest.api-test
  "Tests for /api/database endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [clojurewerkz.quartzite.scheduler :as qs]
   [medley.core :as m]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.premium-features.core :as premium-features]
   [metabase.secrets.core :as secret]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.core :as sync]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.task.sync-databases :as task.sync-databases]
   [metabase.sync.task.sync-databases-test :as task.sync-databases-test]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [metabase.util.quick-task :as quick-task]
   [metabase.util.random :as u.random]
   [metabase.warehouse-schema.table :as schema.table]
   [metabase.warehouses-rest.api :as api.database]
   [metabase.warehouses.core :as warehouses]
   [metabase.warehouses.util :as warehouses.util]
   [ring.util.codec :as codec]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)
   (java.sql Connection)
   (java.util.concurrent CountDownLatch)
   (org.quartz JobDetail TriggerKey)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :plugins :test-drivers :row-lock))

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

(defmethod driver/describe-database* ::test-driver
  [_ _]
  {:tables []})

(defn- db-details
  "Return default column values for a database (either the test database, via `(mt/db)`, or optionally passed in)."
  ([]
   (-> (db-details (mt/db))
       (assoc :initial_sync_status "complete")))

  ([{driver :engine, :as db}]
   (merge
    (mt/object-defaults :model/Database)
    (select-keys db [:created_at :id :details :updated_at :timezone :name :dbms_version
                     :metadata_sync_schedule :cache_field_values_schedule :uploads_enabled :uploads_schema_name])
    {:engine                (u/qualified-name (:engine db))
     :settings              {}
     :features              (map u/qualified-name (driver.u/features driver db))
     :initial_sync_status   "complete"
     :router_user_attribute nil})))

(defn- table-details [table]
  (-> (merge (mt/obj->json->obj (mt/object-defaults :model/Table))
             (select-keys table [:active :created_at :db_id :description :display_name :entity_type
                                 :id :name :rows :schema :updated_at :visibility_type :initial_sync_status]))
      (update :entity_type #(when % (str "entity/" (name %))))
      (update :visibility_type #(when % (name %)))
      (update :schema str)))

(defn- expected-tables [db-or-id]
  (map table-details (t2/select :model/Table
                                :db_id (u/the-id db-or-id), :active true, :visibility_type nil
                                {:order-by [[:%lower.schema :asc] [:%lower.display_name :asc]]})))

(defn- field-details [field]
  (mt/derecordize
   (merge
    (mt/object-defaults :model/Field)
    {:target nil}
    (select-keys
     field
     [:updated_at :id :created_at :last_analyzed :fingerprint :fingerprint_version :fk_target_field_id
      :position]))))

(defn- card-with-native-query [card-name & {:as kvs}]
  (merge
   {:name          card-name
    :database_id   (mt/id)
    :dataset_query {:database (mt/id)
                    :type     :native
                    :native   {:query (format "SELECT * FROM VENUES")}}}
   kvs))

(defn- card-with-mbql-query [card-name & {:as inner-query-clauses}]
  {:name          card-name
   :database_id   (mt/id)
   :dataset_query {:database (mt/id)
                   :type     :query
                   :query    inner-query-clauses}})

(defn- virtual-table-for-card [card & {:as kvs}]
  (merge
   {:id               (format "card__%d" (u/the-id card))
    :db_id            (:database_id card)
    :entity_id        nil
    :display_name     (:name card)
    :schema           "Everything else"
    :moderated_status nil
    :metrics          nil
    :description      nil
    :type             "question"}
   kvs))

(defn- ok-mbql-card []
  (assoc (card-with-mbql-query "OK Card"
                               :source-table (mt/id :checkins))
         :result_metadata [{:name         "num_toucans"
                            :display_name "Num Toucans"
                            :base_type    :type/Integer}]))

(deftest ^:parallel get-database-test
  (testing "GET /api/database/:id"
    (testing "DB details visibility"
      (testing "Regular users should not see DB details"
        (is (= (-> (db-details)
                   (dissoc :details :write_data_details :schedules))
               (-> (mt/user-http-request :rasta :get 200 (format "database/%d" (mt/id)))
                   (dissoc :schedules :can_upload)))))
      (testing "Superusers should see DB details"
        (is (= (assoc (db-details) :can-manage true)
               (-> (mt/user-http-request :crowberto :get 200 (format "database/%d" (mt/id)))
                   (dissoc :schedules :can_upload))))))))

(deftest ^:parallel get-database-test-2
  (testing "GET /api/database/:id"
    (mt/with-temp [:model/Database db  {:name "My DB" :engine ::test-driver}
                   :model/Table    t1  {:name "Table 1" :db_id (:id db)}
                   :model/Table    t2  {:name "Table 2" :db_id (:id db)}
                   :model/Table    _t3 {:name "Table 3" :db_id (:id db) :visibility_type "hidden"}
                   :model/Field    f1  {:name "Field 1.1" :table_id (:id t1)}
                   :model/Field    f2  {:name "Field 2.1" :table_id (:id t2)}
                   :model/Field    f3  {:name "Field 2.2" :table_id (:id t2)}]
      (testing "`?include=tables` -- should be able to include Tables"
        (is (= {:tables [(table-details t1)
                         (table-details t2)]}
               (select-keys (mt/user-http-request :lucky :get 200 (format "database/%d?include=tables" (:id db)))
                            [:tables])))
        (testing "Schemas are always empty strings, not nil"
          (mt/with-temp [:model/Database db  {:name "My DB" :engine ::test-driver}
                         :model/Table    {}  {:name "Table 1" :db_id (:id db) :schema nil}]
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
        (mt/with-temp [:model/Database {db-id :id} {:engine          :postgres
                                                    :name            "The Chosen One"
                                                    :uploads_enabled uploads-enabled?
                                                    :uploads_schema_name "public"}]
          (testing (format "The database with uploads enabled for the public schema has can_upload=%s" uploads-enabled?)
            (let [result (mt/user-http-request :crowberto :get 200 (format "database/%d" db-id))]
              (is (= uploads-enabled? (:can_upload result))))))))))

(deftest ^:parallel get-database-usage-info-test
  (mt/with-temp
    [:model/Database {db-id :id}      {}
     :model/Table    {table-id-1 :id} {:db_id db-id}
     :model/Table    {table-id-2 :id} {:db_id db-id}
     ;; question
     :model/Card     _                {:database_id db-id
                                       :table_id    table-id-1
                                       :type        :question}
     ;; dataset
     :model/Card     _                {:database_id db-id
                                       :table_id    table-id-1
                                       :type        :model}
     :model/Card     _                {:database_id db-id
                                       :table_id    table-id-2
                                       :type        :model
                                       :archived    true}

     ;; metric
     :model/Card     _                {:database_id db-id
                                       :table_id    table-id-1
                                       :type        :metric
                                       :archived    true}
     :model/Card     _                {:database_id db-id
                                       :table_id    table-id-1
                                       :type        :metric}
     :model/Card     _                {:database_id db-id
                                       :table_id    table-id-2
                                       :type        :metric}
     :model/Segment  _                {:table_id table-id-2}]
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
      (let [non-existing-db-id (inc (t2/select-one-pk :model/Database {:order-by [[:id :desc]]}))]
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404
                                     (format "database/%d/usage_info" non-existing-db-id))))))))

(defn- find-in-clauses
  "Walk a HoneySQL map and return any [:in ...] clauses where the value is a collection."
  [hsql]
  (let [results (volatile! [])]
    (walk/postwalk
     (fn [form]
       (when (and (vector? form)
                  (let [[op _ coll] form]
                    (and
                     (= :in op)
                     (= 3 (count form))
                     (coll? coll)
                     (not (map? coll)))))
         (vswap! results conj form))
       form)
     hsql)
    @results))

(deftest get-database-usage-info-no-large-in-test
  (testing "usage_info query should not use IN clauses with more than 100 items (GHY-2413)"
    (mt/with-temp
      [:model/Database {db-id :id} {}
       :model/Table    _           {:db_id db-id}]
      (let [queries    (volatile! [])
            orig-query mdb/query]
        (with-redefs [mdb/query (fn [hsql]
                                  (vswap! queries conj hsql)
                                  (orig-query hsql))]
          (mt/user-http-request :crowberto :get 200 (format "database/%d/usage_info" db-id)))
        (doseq [q @queries]
          (is (empty? (find-in-clauses q))
              "usage_info should not generate IN clauses with inline collections"))))))

(deftest ^:parallel get-database-usage-info-test-2
  (mt/with-temp
    [:model/Database {db-id :id} {}]
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
        (t2/select-one :model/Database :id db-id)))))

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

(defmacro with-db-scheduler-setup!
  [& body]
  `(mt/with-temp-scheduler!
     (#'task.sync-databases/job-init)
     (u/prog1 ~@body
       (qs/delete-job (#'task/scheduler) (.getKey ^JobDetail @#'task.sync-databases/sync-analyze-job))
       (qs/delete-job (#'task/scheduler) (.getKey ^JobDetail @#'task.sync-databases/field-values-job)))))

(deftest create-db-default-schedule-test
  (testing "POST /api/database"
    (testing "create a db with default scan options"
      (with-db-scheduler-setup!
        (with-test-driver-available!
          (let [resp (mt/user-http-request :crowberto :post 200 "database"
                                           {:name    (mt/random-name)
                                            :engine  (u/qualified-name ::test-driver)
                                            :details {:db "my_db"}})
                db   (t2/select-one :model/Database (:id resp))]
            (is (malli= [:merge
                         (into [:map] (m/map-vals (fn [v] [:= {} v]) (mt/object-defaults :model/Database)))
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

(deftest create-db-provider-name-test
  (testing "POST /api/database"
    (testing "can we set `provider_name` when creating a Database?"
      (is (= {:provider_name "AWS RDS"}
             (select-keys (create-db-via-api! {:provider_name "AWS RDS"}) [:provider_name]))))
    (testing "provider_name is optional and can be nil"
      (is (= {:provider_name nil}
             (select-keys (create-db-via-api! {}) [:provider_name]))))
    (testing "can explicitly set provider_name to nil"
      (is (= {:provider_name nil}
             (select-keys (create-db-via-api! {:provider_name nil}) [:provider_name]))))))

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
                :message "Hmm, we couldn't connect to the database. Make sure your Host and Port settings are correct."}
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
  ;;
  ;; TODO (Cam 6/20/25) -- we should NOT be hardcoding driver names in tests
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :test/dynamic-dataset-loading)
                         :h2 :bigquery-cloud-sdk :snowflake)
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
    (mt/with-model-cleanup [:model/Database]
      (let [db-name (mt/random-name)
            details (:details (mt/db))]
        (is (= {:message "H2 is not supported as a data warehouse"}
               (mt/user-http-request :crowberto :post 400 "database" {:engine :h2, :name db-name, :details details})))
        (is (not (t2/exists? :model/Database :name db-name)))))))

(deftest ^:parallel delete-database-test
  (testing "DELETE /api/database/:id"
    (testing "Check that a superuser can delete a Database"
      (mt/with-temp [:model/Database db]
        (mt/user-http-request :crowberto :delete 204 (format "database/%d" (:id db)))
        (is (false? (t2/exists? :model/Database :id (u/the-id db))))))

    (testing "Check that a non-superuser cannot delete a Database"
      (mt/with-temp [:model/Database db]
        (mt/user-http-request :rasta :delete 403 (format "database/%d" (:id db)))))))

(let [normalize (fn normalize [audit-log-details] (update audit-log-details :engine keyword))]
  (deftest delete-database-audit-log-test
    (testing "DELETE /api/database/:id"
      (testing "Check that an audit log entry is created when someone deletes a Database"
        (mt/with-premium-features #{:audit-app}
          (mt/with-temp [:model/Database db]
            (mt/user-http-request :crowberto :delete 204 (format "database/%d" (:id db)))
            (is (= (audit/model-details db :model/Database)
                   (->> (mt/latest-audit-log-entry "database-delete")
                        :details
                        normalize)))))))))

(defn- api-update-database! [expected-status-code db-or-id changes]
  (with-redefs [driver.settings/*allow-testing-h2-connections* true]
    (mt/user-http-request :crowberto :put expected-status-code (format "database/%d" (u/the-id db-or-id))
                          changes)))

(deftest update-database-test
  (testing "PUT /api/database/:id"
    (testing "Check that we can update fields in a Database"
      (mt/with-temp [:model/Database {db-id :id}]
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
              (let [curr-db (t2/select-one [:model/Database :name :engine :details :is_full_sync], :id db-id)]
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
        (mt/with-temp [:model/Database {db-id :id} {:engine ::test-driver}]
          (let [updates {:auto_run_queries false}]
            (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates))
          (is (= false
                 (t2/select-one-fn :auto_run_queries :model/Database, :id db-id))))))))

(deftest update-database-test-3
  (testing "PUT /api/database/:id"
    (testing "should not be able to modify `cache_ttl` in OSS"
      (with-redefs [premium-features/enable-cache-granular-controls? (constantly false)]
        (mt/with-temp [:model/Database {db-id :id} {:engine ::test-driver}]
          (let [updates {:cache_ttl 13}]
            (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates))
          (is (= nil
                 (t2/select-one-fn :cache_ttl :model/Database, :id db-id))))))))

(deftest update-database-test-4
  (testing "PUT /api/database/:id"
    (testing "should be able to set and unset `cache_ttl` in EE"
      (with-redefs [premium-features/enable-cache-granular-controls? (constantly true)]
        (mt/with-temp [:model/Database {db-id :id} {:engine ::test-driver}]
          (let [updates1 {:cache_ttl 1337}
                updates2 {:cache_ttl nil}
                updates1! (fn [] (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates1))
                updates2! (fn [] (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates2))]
            (updates1!)
            (let [curr-db (t2/select-one [:model/Database :cache_ttl], :id db-id)]
              (is (= 1337 (:cache_ttl curr-db))))
            (updates2!)
            (let [curr-db (t2/select-one [:model/Database :cache_ttl], :id db-id)]
              (is (= nil (:cache_ttl curr-db))))))))))

(deftest update-database-provider-name-test
  (testing "PUT /api/database/:id"
    (testing "should be able to set and unset `provider_name`"
      (mt/with-temp [:model/Database {db-id :id} {:engine ::test-driver}]
        (let [updates1 {:provider_name "AWS RDS"}
              updates2 {:provider_name nil}
              updates1! (fn [] (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates1))
              updates2! (fn [] (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id) updates2))]
          (updates1!)
          (let [curr-db (t2/select-one [:model/Database :provider_name], :id db-id)]
            (is (= "AWS RDS" (:provider_name curr-db))))
          (updates2!)
          (let [curr-db (t2/select-one [:model/Database :provider_name], :id db-id)]
            (is (= nil (:provider_name curr-db)))))))))

(deftest update-database-audit-log-test
  (testing "Check that we get audit log entries that match the db when updating a Database"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Database {db-id :id}]
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
      (mt/with-temp [:model/Database db {:name    (mt/random-name)
                                         :details (:details (mt/db))
                                         :engine  :postgres}]
        (testing "Don't allow changing engine to H2"
          (is (= {:message "H2 is not supported as a data warehouse"}
                 (update! db {:engine :h2})))
          (is (= :postgres
                 (t2/select-one-fn :engine :model/Database (u/the-id db))))))
      (mt/with-temp [:model/Database db {:name    (mt/random-name)
                                         :details (:details (mt/db))
                                         :engine  :h2}]
        (testing "Don't allow editing H2 connection details"
          (is (= {:message "H2 is not supported as a data warehouse"}
                 (update! db {:details {:db "mem:test-data;USER=GUEST;PASSWORD=guest;WHATEVER=true"}})))
          (is (= (:details db)
                 (t2/select-one-fn :details :model/Database (u/the-id db)))))))))

(deftest ^:parallel enable-model-actions-with-user-controlled-scheduling-test
  (testing "Should be able to enable/disable actions for a database with user-controlled scheduling (metabase#30699)"
    (mt/with-temp [:model/Database {db-id :id} {:details  {:let-user-control-scheduling true}
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

(deftest update-database-settings-only-validates-changed-settings-test
  (testing "PUT /api/database/:id only validates settings that are being changed"
    (testing "should not validate existing settings that aren't being changed"
      ;; api-test-disabled-for-database is always disabled, so it would fail validation if we tried to validate it
      ;; Here we create a database with that setting already set, then update a different setting.
      ;; If validation happens on all settings, it would fail. If it only validates changed settings, it should succeed.
      (mt/with-temp [:model/Database {db-id :id} {:engine   :h2
                                                  :settings {:api-test-disabled-for-database true
                                                             :database-enable-actions        false}}]
        (is (= {:api-test-disabled-for-database true
                :database-enable-actions        true}
               (:settings (mt/user-http-request :crowberto :put 200
                                                (format "database/%s" db-id)
                                                {:settings {:database-enable-actions true}}))))))

    (testing "should not validate settings where the value hasn't changed"
      ;; Same setup, but we set the same value as before - should skip validation
      (mt/with-temp [:model/Database {db-id :id} {:engine   :h2
                                                  :settings {:api-test-disabled-for-database true}}]
        (is (= {:api-test-disabled-for-database true}
               (:settings (mt/user-http-request :crowberto :put 200
                                                (format "database/%s" db-id)
                                                {:settings {:api-test-disabled-for-database true}}))))))

    (testing "should still validate settings that are actually being changed to a new value"
      ;; If we try to change api-test-disabled-for-database to a different value, it should fail validation
      (mt/with-temp [:model/Database {db-id :id} {:engine   :h2
                                                  :settings {:api-test-disabled-for-database false}}]
        (is (= "Setting api-test-disabled-for-database is not enabled for this database"
               (:message (mt/user-http-request :crowberto :put 400
                                               (format "database/%s" db-id)
                                               {:settings {:api-test-disabled-for-database true}}))))))

    (testing "should not validate settings being reset to nil (default)"
      ;; Resetting a setting to nil should always be allowed, even if the setting would fail validation
      (mt/with-temp [:model/Database {db-id :id} {:engine   :h2
                                                  :settings {:api-test-disabled-for-database true}}]
        (is (= {}
               (:settings (mt/user-http-request :crowberto :put 200
                                                (format "database/%s" db-id)
                                                {:settings {:api-test-disabled-for-database nil}}))))))

    (testing "should not validate settings being reset to default value (literally)"
      ;; Resetting a setting to default should always be allowed, even if the setting would fail validation
      (mt/with-temp [:model/Database {db-id :id} {:engine   :h2
                                                  :settings {:api-test-disabled-for-database true}}]
        (is (= {:api-test-disabled-for-database false}
               (:settings (mt/user-http-request :crowberto :put 200
                                                (format "database/%s" db-id)
                                                {:settings {:api-test-disabled-for-database false}}))))))))

(deftest update-database-enable-actions-open-connection-test
  (testing "Updating a database's `database-enable-actions` setting shouldn't close existing connections (metabase#27877)"
    (mt/test-drivers (filter #(isa? driver/hierarchy % :sql-jdbc) (mt/normal-drivers-with-feature :actions))
      (let [;; 1. create a database and sync
            database-name      (u.random/random-name)
            empty-dbdef        {:database-name database-name}
            _                  (tx/create-db! driver/*driver* empty-dbdef)
            connection-details (tx/dbdef->connection-details driver/*driver* :db empty-dbdef)
            db                 (first (t2/insert-returning-instances! :model/Database {:name    database-name
                                                                                       :engine  (u/qualified-name driver/*driver*)
                                                                                       :details connection-details}))
            _                  (sync/sync-database! db)
            ;; 2. start a long running process on another thread that uses a connection
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
        (tx/destroy-db! driver/*driver* empty-dbdef)))))

(deftest databases-metadata-test
  (testing "GET /api/database/metadata"
    (mt/with-temp [:model/Database {db-id :id}    {:name "test-db" :engine :h2}
                   :model/Table    {t-id :id}     {:db_id db-id :name "my_table" :schema "PUBLIC"
                                                   :description "A test table"}
                   :model/Field    {f1-id :id}    {:table_id t-id :name "id" :base_type :type/Integer
                                                   :database_type "BIGINT"
                                                   :semantic_type :type/PK}
                   :model/Field    {f2-id :id}    {:table_id t-id :name "created_at" :base_type :type/Text
                                                   :database_type "TIMESTAMP"
                                                   :effective_type :type/DateTime
                                                   :semantic_type :type/Name
                                                   :coercion_strategy :Coercion/ISO8601->DateTime
                                                   :description "The creation time"}
                   :model/Field    {f3-id :id}    {:table_id t-id :name "parent_id" :base_type :type/Integer
                                                   :database_type "BIGINT"
                                                   :semantic_type :type/FK
                                                   :fk_target_field_id f1-id}]
      (let [{:keys [databases tables fields]} (mt/user-http-request :crowberto :get 202 "database/metadata")]
        (is (=? {:id db-id :name "test-db" :engine "h2"}
                (m/find-first (comp #{db-id} :id) databases)))
        (is (=? {:id t-id :db_id db-id :name "my_table" :schema "PUBLIC" :description "A test table"}
                (m/find-first (comp #{t-id} :id) tables)))
        (is (=? {:id f1-id :table_id t-id :name "id" :base_type "type/Integer" :database_type "BIGINT"
                 :semantic_type "type/PK"}
                (m/find-first (comp #{f1-id} :id) fields)))
        (is (=? {:id                f2-id
                 :table_id          t-id
                 :name              "created_at"
                 :base_type         "type/Text"
                 :database_type     "TIMESTAMP"
                 :effective_type    "type/DateTime"
                 :semantic_type     "type/Name"
                 :coercion_strategy "Coercion/ISO8601->DateTime"
                 :description       "The creation time"}
                (m/find-first (comp #{f2-id} :id) fields)))
        (is (=? {:id                 f3-id
                 :table_id           t-id
                 :name               "parent_id"
                 :base_type          "type/Integer"
                 :database_type      "BIGINT"
                 :semantic_type      "type/FK"
                 :fk_target_field_id f1-id}
                (m/find-first (comp #{f3-id} :id) fields)))))))

(deftest databases-metadata-no-perms-test
  (testing "GET /api/database/metadata — user without data perms sees nothing"
    (mt/with-temp [:model/Database {db-id :id} {:name "test-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "my_table" :schema "PUBLIC"}
                   :model/Field    _           {:table_id t-id :name "id" :base_type :type/Integer
                                                :database_type "BIGINT"}]
      (mt/with-no-data-perms-for-all-users!
        (is (= {:databases [] :tables [] :fields []}
               (mt/user-http-request :rasta :get 202 "database/metadata")))))))

(deftest databases-field-values-test
  (testing "GET /api/database/field-values"
    (mt/with-temp [:model/Database    {db-id :id} {:name "fv-db" :engine :h2}
                   :model/Table       {t-id :id}  {:db_id db-id :name "people" :schema "PUBLIC"}
                   :model/Field       {f1-id :id} {:table_id t-id :name "state" :base_type :type/Text
                                                   :database_type "VARCHAR"}
                   :model/Field       {f2-id :id} {:table_id t-id :name "rating" :base_type :type/Integer
                                                   :database_type "INTEGER"}
                   :model/FieldValues _           {:field_id f1-id :type :full
                                                   :values [["CA"] ["NY"] ["TX"]]
                                                   :has_more_values false}
                   :model/FieldValues _           {:field_id f2-id :type :full
                                                   :values [[1] [2] [3]]
                                                   :human_readable_values ["Low" "Mid" "High"]
                                                   :has_more_values true}]
      (let [{:keys [field_values]} (mt/user-http-request :crowberto :get 202 "database/field-values")
            by-field                (into {} (map (juxt :field_id identity)) field_values)]
        (is (=? {:field_id        f1-id
                 :values          [["CA"] ["NY"] ["TX"]]
                 :has_more_values false}
                (by-field f1-id)))
        (is (nil? (:human_readable_values (by-field f1-id)))
            "human_readable_values is omitted when empty")
        (is (=? {:field_id              f2-id
                 :values                [[1] [2] [3]]
                 :human_readable_values ["Low" "Mid" "High"]
                 :has_more_values       true}
                (by-field f2-id)))))))

(deftest databases-field-values-non-admin-test
  (testing "GET /api/database/field-values — non-admin requests are rejected"
    (mt/with-temp [:model/Database    {db-id :id} {:name "fv-db" :engine :h2}
                   :model/Table       {t-id :id}  {:db_id db-id :name "people" :schema "PUBLIC"}
                   :model/Field       {f-id :id}  {:table_id t-id :name "state" :base_type :type/Text
                                                   :database_type "VARCHAR"}
                   :model/FieldValues _           {:field_id f-id :type :full
                                                   :values [["CA"] ["NY"]]
                                                   :has_more_values false}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "database/field-values"))))))

(deftest databases-field-values-excludes-non-full-test
  (testing "GET /api/database/field-values — only :full FieldValues are included"
    (mt/with-temp [:model/Database    {db-id :id} {:name "fv-db" :engine :h2}
                   :model/Table       {t-id :id}  {:db_id db-id :name "people" :schema "PUBLIC"}
                   :model/Field       {f-id :id}  {:table_id t-id :name "state" :base_type :type/Text
                                                   :database_type "VARCHAR"}
                   :model/FieldValues _           {:field_id f-id :type :full
                                                   :values [["CA"]]
                                                   :has_more_values false}
                   :model/FieldValues _           {:field_id f-id :type :sandbox
                                                   :hash_key "sandbox-hash"
                                                   :values [["NY"]]
                                                   :has_more_values false}]
      (let [{:keys [field_values]} (mt/user-http-request :crowberto :get 202 "database/field-values")
            for-field               (filter #(= f-id (:field_id %)) field_values)]
        (is (= 1 (count for-field))
            "only the :full entry streams; :sandbox / other variants are excluded")
        (is (= [["CA"]] (-> for-field first :values)))))))

(deftest databases-metadata-excludes-audit-db-test
  (testing "GET /api/database/metadata — audit (internal) database, its tables, and its fields are excluded"
    (mt/with-temp [:model/Database {db-id :id} {:name "audit-db" :engine :h2 :is_audit true}
                   :model/Table    {t-id :id}  {:db_id db-id :name "audit_table" :schema "PUBLIC"}
                   :model/Field    {f-id :id}  {:table_id t-id :name "audit_col" :base_type :type/Integer}]
      (let [{:keys [databases tables fields]} (mt/user-http-request :crowberto :get 202 "database/metadata")]
        (is (nil? (m/find-first (comp #{db-id} :id) databases)))
        (is (nil? (m/find-first (comp #{t-id}  :id) tables)))
        (is (nil? (m/find-first (comp #{f-id}  :id) fields)))))))

(deftest databases-metadata-import-test
  (testing "POST /api/database/metadata"
    (mt/with-temp [:model/Database {db-id :id} {:name "import-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "orders" :schema "PUBLIC"
                                                :description "original"}
                   :model/Field    {pk-id :id} {:table_id t-id :name "id" :base_type :type/Integer
                                                :database_type "BIGINT"}
                   :model/Field    {fk-id :id} {:table_id t-id :name "order_id" :base_type :type/Integer
                                                :database_type "BIGINT"}]
      (testing "matched entities are updated; missing tables/fields are created when parent exists"
        ;; Payload carries ids from "another" instance — here we reuse our own ids, but the
        ;; endpoint matches by natural key regardless of what the numeric ids are.
        (let [payload   {:databases [{:id db-id :name "import-db" :engine "h2"}
                                     {:id 9999 :name "does-not-exist" :engine "h2"}]
                         :tables    [{:id t-id :db_id db-id :name "orders" :schema "PUBLIC"
                                      :description "updated via import"}
                                     {:id 9998 :db_id db-id :name "new_table" :schema "PUBLIC"
                                      :description "created via import"}]
                         :fields    [{:id pk-id :table_id t-id :name "id"
                                      :base_type "type/Integer" :database_type "BIGINT"
                                      :semantic_type "type/PK"
                                      :description "primary key"}
                                     {:id fk-id :table_id t-id :name "order_id"
                                      :base_type "type/Integer" :database_type "BIGINT"
                                      :semantic_type "type/FK"
                                      :fk_target_field_id pk-id}
                                     {:id 9997 :table_id t-id :name "new_field"
                                      :base_type "type/Integer" :database_type "INT"
                                      :description "created via import"
                                      :semantic_type "type/Quantity"}
                                     {:id 9996 :table_id 9998 :name "new_table_field"
                                      :base_type "type/Text" :database_type "VARCHAR"}]}
              report    (mt/user-http-request :crowberto :post 200
                                              "database/metadata" payload)]
          (is (=? {:databases {:matched 1 :missing [{:name "does-not-exist"}]}
                   :tables    {:matched 1 :created 1 :missing []}
                   :fields    {:matched 2 :created 2 :missing []}}
                  report))
          (is (= "updated via import" (t2/select-one-fn :description :model/Table :id t-id)))
          (is (= :type/PK (t2/select-one-fn :semantic_type :model/Field :id pk-id)))
          (is (= "primary key" (t2/select-one-fn :description :model/Field :id pk-id)))
          (is (= pk-id (t2/select-one-fn :fk_target_field_id :model/Field :id fk-id)))
          (testing "new table was created under the matched database"
            (let [new-tbl (t2/select-one :model/Table :db_id db-id :name "new_table")]
              (is (some? new-tbl))
              (is (= "created via import" (:description new-tbl)))
              (is (true? (:active new-tbl)))))
          (testing "new field was created under the existing table"
            (let [new-fld (t2/select-one :model/Field :table_id t-id :name "new_field")]
              (is (some? new-fld))
              (is (= :type/Integer (:base_type new-fld)))
              (is (= "INT" (:database_type new-fld)))
              (is (= "created via import" (:description new-fld)))
              (is (= :type/Quantity (:semantic_type new-fld)))))
          (testing "new field was created under a newly-created table"
            (let [new-tbl-id (t2/select-one-pk :model/Table :db_id db-id :name "new_table")]
              (is (some? (t2/select-one :model/Field :table_id new-tbl-id :name "new_table_field")))))))

      (testing "fields whose database is missing on the target are reported as missing"
        (let [payload {:databases [{:id 9999 :name "does-not-exist" :engine "h2"}]
                       :tables    [{:id 9998 :db_id 9999 :name "x" :schema "PUBLIC"}]
                       :fields    [{:id 9997 :table_id 9998 :name "y"
                                    :base_type "type/Integer" :database_type "INTEGER"}]}
              report  (mt/user-http-request :crowberto :post 200
                                            "database/metadata" payload)]
          (is (=? {:tables {:matched 0 :created 0 :missing [{:name "x"}]}
                   :fields {:matched 0 :created 0 :missing [{:path ["y"]}]}}
                  report))))

      (testing "base_type and database_type are never overwritten"
        (let [payload {:databases [{:id db-id :name "import-db" :engine "h2"}]
                       :tables    [{:id t-id :db_id db-id :name "orders" :schema "PUBLIC"}]
                       :fields    [{:id pk-id :table_id t-id :name "id"
                                    :base_type "type/Text" :database_type "TEXT"
                                    :description "still a pk"}]}]
          (mt/user-http-request :crowberto :post 200 "database/metadata" payload)
          (is (= :type/Integer (t2/select-one-fn :base_type :model/Field :id pk-id)))
          (is (= "BIGINT" (t2/select-one-fn :database_type :model/Field :id pk-id)))))

      (testing "nested fields are matched by parent path"
        (mt/with-temp [:model/Field {parent-id :id} {:table_id t-id :name "payload"
                                                     :base_type :type/JSON :database_type "JSON"}
                       :model/Field {child-id :id}  {:table_id t-id :parent_id parent-id :name "amount"
                                                     :base_type :type/Integer :database_type "BIGINT"}]
          (let [payload {:databases [{:id db-id :name "import-db" :engine "h2"}]
                         :tables    [{:id t-id :db_id db-id :name "orders" :schema "PUBLIC"}]
                         :fields    [{:id 1 :table_id t-id :name "payload"
                                      :base_type "type/JSON" :database_type "JSON"}
                                     {:id 2 :table_id t-id :parent_id 1 :name "amount"
                                      :base_type "type/Integer" :database_type "BIGINT"
                                      :description "nested description"
                                      :semantic_type "type/Quantity"}]}]
            (mt/user-http-request :crowberto :post 200 "database/metadata" payload)
            (is (= "nested description" (t2/select-one-fn :description :model/Field :id child-id)))
            (is (= :type/Quantity (t2/select-one-fn :semantic_type :model/Field :id child-id))))))

      (testing "fields with the same leaf name at different parent paths are matched independently"
        ;; A root-level `amount` and a nested `payload.amount` coexist on the same table.
        ;; Matching by full parent path must update each without clobbering the other.
        (mt/with-temp [:model/Field {root-amount-id :id}   {:table_id t-id :name "amount"
                                                            :base_type :type/Integer :database_type "BIGINT"}
                       :model/Field {parent-id :id}        {:table_id t-id :name "payload"
                                                            :base_type :type/JSON :database_type "JSON"}
                       :model/Field {nested-amount-id :id} {:table_id t-id :parent_id parent-id :name "amount"
                                                            :base_type :type/Integer :database_type "BIGINT"}]
          (let [payload {:databases [{:id db-id :name "import-db" :engine "h2"}]
                         :tables    [{:id t-id :db_id db-id :name "orders" :schema "PUBLIC"}]
                         :fields    [{:id 10 :table_id t-id :name "amount"
                                      :base_type "type/Integer" :database_type "BIGINT"
                                      :description "root amount"
                                      :semantic_type "type/Quantity"}
                                     {:id 11 :table_id t-id :name "payload"
                                      :base_type "type/JSON" :database_type "JSON"}
                                     {:id 12 :table_id t-id :parent_id 11 :name "amount"
                                      :base_type "type/Integer" :database_type "BIGINT"
                                      :description "nested amount"
                                      :semantic_type "type/Currency"}]}]
            (mt/user-http-request :crowberto :post 200 "database/metadata" payload)
            (is (= "root amount"   (t2/select-one-fn :description   :model/Field :id root-amount-id)))
            (is (= :type/Quantity  (t2/select-one-fn :semantic_type :model/Field :id root-amount-id)))
            (is (= "nested amount" (t2/select-one-fn :description   :model/Field :id nested-amount-id)))
            (is (= :type/Currency  (t2/select-one-fn :semantic_type :model/Field :id nested-amount-id))))))

      (testing "non-superusers are rejected"
        (mt/user-http-request :rasta :post 403 "database/metadata"
                              {:databases [] :tables [] :fields []})))))

(deftest databases-metadata-import-nested-fields-test
  (testing "POST /api/database/metadata — nested fields with shared leaf names under siblings"
    (mt/with-temp [:model/Database {db-id :id} {:name "nested-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "obs" :schema "PUBLIC"}]
      (let [payload  {:databases [{:id db-id :name "nested-db" :engine "h2"}]
                      :tables    [{:id t-id :db_id db-id :name "obs" :schema "PUBLIC"}]
                      :fields    [{:id 100 :table_id t-id :name "wind"
                                   :base_type "type/Dictionary" :database_type "NULL"}
                                  {:id 101 :table_id t-id :parent_id 100 :name "value"
                                   :base_type "type/Float" :database_type "NULL"}
                                  {:id 102 :table_id t-id :name "temp"
                                   :base_type "type/Dictionary" :database_type "NULL"}
                                  {:id 103 :table_id t-id :parent_id 102 :name "value"
                                   :base_type "type/Float" :database_type "NULL"}]}
            report   (mt/user-http-request :crowberto :post 200
                                           "database/metadata" payload)
            by-name  (->> (t2/select [:model/Field :id :name :parent_id] :table_id t-id)
                          (group-by :name))
            wind-id  (:id (first (get by-name "wind")))
            temp-id  (:id (first (get by-name "temp")))
            values   (sort-by :parent_id (get by-name "value"))]
        (is (=? {:databases {:matched 1 :missing []}
                 :tables    {:matched 1 :created 0 :missing []}
                 :fields    {:matched 0 :created 4 :missing []}}
                report))
        (is (= 4 (t2/count :model/Field :table_id t-id)))
        (is (= 2 (count values)))
        (testing "each value row points at its own parent, not NULL"
          (is (= #{wind-id temp-id}
                 (set (map :parent_id values))))))))

  (testing "POST /api/database/metadata — 3-level deep nesting with correct parent chain"
    (mt/with-temp [:model/Database {db-id :id} {:name "nested-3-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "tree" :schema "PUBLIC"}]
      (let [payload {:databases [{:id db-id :name "nested-3-db" :engine "h2"}]
                     :tables    [{:id t-id :db_id db-id :name "tree" :schema "PUBLIC"}]
                     :fields    [{:id 1 :table_id t-id :name "a"
                                  :base_type "type/Dictionary" :database_type "NULL"}
                                 {:id 2 :table_id t-id :parent_id 1 :name "b"
                                  :base_type "type/Dictionary" :database_type "NULL"}
                                 {:id 3 :table_id t-id :parent_id 2 :name "c"
                                  :base_type "type/Integer" :database_type "NULL"}]}]
        (mt/user-http-request :crowberto :post 200 "database/metadata" payload)
        (let [a (t2/select-one :model/Field :table_id t-id :name "a")
              b (t2/select-one :model/Field :table_id t-id :name "b")
              c (t2/select-one :model/Field :table_id t-id :name "c")]
          (is (nil? (:parent_id a)))
          (is (= (:id a) (:parent_id b)))
          (is (= (:id b) (:parent_id c)))))))

  (testing "POST /api/database/metadata — new child attaches to a pre-existing matched parent"
    (mt/with-temp [:model/Database {db-id :id} {:name "matched-parent-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}
                   :model/Field    {p-id :id}  {:table_id t-id :name "payload"
                                                :base_type :type/Dictionary}]
      (let [payload {:databases [{:id db-id :name "matched-parent-db" :engine "h2"}]
                     :tables    [{:id t-id :db_id db-id :name "t" :schema "PUBLIC"}]
                     :fields    [{:id 10 :table_id t-id :name "payload"
                                  :base_type "type/Dictionary" :database_type "NULL"}
                                 {:id 11 :table_id t-id :parent_id 10 :name "new_leaf"
                                  :base_type "type/Integer" :database_type "NULL"}]}]
        (mt/user-http-request :crowberto :post 200 "database/metadata" payload)
        (let [child (t2/select-one :model/Field :table_id t-id :name "new_leaf")]
          (is (some? child))
          (is (= p-id (:parent_id child)))))))

  (testing "POST /api/database/metadata — nested-field import is idempotent on repeat"
    (mt/with-temp [:model/Database {db-id :id} {:name "idempotency-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "obs" :schema "PUBLIC"}]
      (let [payload {:databases [{:id db-id :name "idempotency-db" :engine "h2"}]
                     :tables    [{:id t-id :db_id db-id :name "obs" :schema "PUBLIC"}]
                     :fields    [{:id 100 :table_id t-id :name "wind"
                                  :base_type "type/Dictionary" :database_type "NULL"}
                                 {:id 101 :table_id t-id :parent_id 100 :name "value"
                                  :base_type "type/Float" :database_type "NULL"}
                                 {:id 102 :table_id t-id :name "temp"
                                  :base_type "type/Dictionary" :database_type "NULL"}
                                 {:id 103 :table_id t-id :parent_id 102 :name "value"
                                  :base_type "type/Float" :database_type "NULL"}]}
            first-report  (mt/user-http-request :crowberto :post 200 "database/metadata" payload)
            second-report (mt/user-http-request :crowberto :post 200 "database/metadata" payload)]
        (is (=? {:fields {:matched 0 :created 4}} first-report))
        (is (=? {:fields {:matched 4 :created 0}} second-report))
        (is (= 4 (t2/count :model/Field :table_id t-id)))))))

(deftest databases-metadata-import-edge-cases-test
  (testing "POST /api/database/metadata — orphan parent_id (references a field not in payload) lands as root"
    (mt/with-temp [:model/Database {db-id :id} {:name "orphan-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [payload {:databases [{:id db-id :name "orphan-db" :engine "h2"}]
                     :tables    [{:id t-id :db_id db-id :name "t" :schema "PUBLIC"}]
                     :fields    [{:id 99 :table_id t-id :parent_id 9999 :name "orphan"
                                  :base_type "type/Text" :database_type "TEXT"}]}
            report  (mt/user-http-request :crowberto :post 200 "database/metadata" payload)]
        (is (=? {:fields {:created 1}} report))
        (let [orphan (t2/select-one :model/Field :table_id t-id :name "orphan")]
          (is (some? orphan))
          (is (nil? (:parent_id orphan)))))))

  (testing "POST /api/database/metadata — omitted database_type falls back to the \"NULL\" sentinel"
    ;; GET's `format-field-metadata` drops nil `database_type` via `m/assoc-some`,
    ;; so a round-tripped payload from a MySQL app DB (nullable column) can omit
    ;; the key. The sentinel keeps the INSERT valid under Postgres' NOT NULL.
    (mt/with-temp [:model/Database {db-id :id} {:name "no-db-type-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [payload {:databases [{:id db-id :name "no-db-type-db" :engine "h2"}]
                     :tables    [{:id t-id :db_id db-id :name "t" :schema "PUBLIC"}]
                     :fields    [{:id 1 :table_id t-id :name "mongo_field"
                                  :base_type "type/Text"}]}]
        (mt/user-http-request :crowberto :post 200 "database/metadata" payload)
        (is (= "NULL"
               (t2/select-one-fn :database_type :model/Field :table_id t-id :name "mongo_field"))))))

  (testing "POST /api/database/metadata — cycle in incoming parent_id does not stack-overflow"
    (mt/with-temp [:model/Database {db-id :id} {:name "cycle-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [payload {:databases [{:id db-id :name "cycle-db" :engine "h2"}]
                     :tables    [{:id t-id :db_id db-id :name "t" :schema "PUBLIC"}]
                     :fields    [{:id 1 :table_id t-id :parent_id 2 :name "a"
                                  :base_type "type/Text" :database_type "TEXT"}
                                 {:id 2 :table_id t-id :parent_id 1 :name "b"
                                  :base_type "type/Text" :database_type "TEXT"}]}]
        ;; Degenerate payload — only the status code is asserted; the rows' shape
        ;; after a cycle-broken insert is intentionally unspecified.
        (is (=? {:databases {:matched 1}}
                (mt/user-http-request :crowberto :post 200 "database/metadata" payload)))))))

(deftest databases-metadata-import-batching-test
  (testing "POST /api/database/metadata — new-field INSERTs are chunked by import-batch-size"
    (mt/with-temp [:model/Database {db-id :id} {:name "batch-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [insert-calls (atom [])
            orig-insert  t2/insert-returning-pks!
            payload      {:databases [{:id db-id :name "batch-db" :engine "h2"}]
                          :tables    [{:id t-id :db_id db-id :name "t" :schema "PUBLIC"}]
                          :fields    (mapv (fn [idx]
                                             {:id            (+ 1000 idx)
                                              :table_id      t-id
                                              :name          (str "col_" idx)
                                              :base_type     "type/Integer"
                                              :database_type "INTEGER"})
                                           (range 7))}]
        (with-redefs [api.database/import-batch-size 3
                      t2/insert-returning-pks!       (fn [model rows]
                                                       (when (= model :model/Field)
                                                         (swap! insert-calls conj (count rows)))
                                                       (orig-insert model rows))]
          (mt/user-http-request :crowberto :post 200 "database/metadata" payload))
        (is (= [3 3 1] @insert-calls))))))

(deftest databases-metadata-import-partial-failure-test
  (testing "POST /api/database/metadata — one DB's failure does not roll back others"
    (mt/with-temp [:model/Database {db-a-id :id} {:name "pf-db-a" :engine :h2}
                   :model/Database {db-b-id :id} {:name "pf-db-b" :engine :h2}
                   :model/Table    {t-a-id :id}  {:db_id db-a-id :name "ta" :schema "PUBLIC"}
                   :model/Table    {t-b-id :id}  {:db_id db-b-id :name "tb" :schema "PUBLIC"}]
      (let [orig-import-fields (deref #'api.database/import-fields!)]
        (with-redefs [api.database/import-fields! (fn [state fields incoming-by-id in-tbl->target path-lookup]
                                                    (if (some #(= t-b-id (:table_id %)) fields)
                                                      (throw (ex-info "injected failure for DB-B" {}))
                                                      (orig-import-fields state fields incoming-by-id
                                                                          in-tbl->target path-lookup)))]
          (let [payload {:databases [{:id db-a-id :name "pf-db-a" :engine "h2"}
                                     {:id db-b-id :name "pf-db-b" :engine "h2"}]
                         :tables    [{:id t-a-id :db_id db-a-id :name "ta" :schema "PUBLIC"}
                                     {:id t-b-id :db_id db-b-id :name "tb" :schema "PUBLIC"}]
                         :fields    [{:id 1 :table_id t-a-id :name "a_col"
                                      :base_type "type/Integer" :database_type "INTEGER"}
                                     {:id 2 :table_id t-b-id :name "b_col"
                                      :base_type "type/Integer" :database_type "INTEGER"}]}
                report  (mt/user-http-request :crowberto :post 200 "database/metadata" payload)]
            (is (=? {:databases {:matched 2
                                 :missing []
                                 :failed  [{:id db-b-id :target db-b-id}]}}
                    report))
            (testing "DB-A's field committed despite DB-B's failure"
              (is (some? (t2/select-one :model/Field :table_id t-a-id :name "a_col"))))
            (testing "DB-B's field did not commit (transaction rolled back)"
              (is (nil? (t2/select-one :model/Field :table_id t-b-id :name "b_col")))))))))

  (testing "POST /api/database/metadata — pathmap is scoped to the current DB only"
    (mt/with-temp [:model/Database {db-a-id :id} {:name "scope-db-a" :engine :h2}
                   :model/Database {db-b-id :id} {:name "scope-db-b" :engine :h2}
                   :model/Table    {t-a-id :id}  {:db_id db-a-id :name "t" :schema "PUBLIC"}
                   :model/Table    {t-b-id :id}  {:db_id db-b-id :name "t" :schema "PUBLIC"}]
      (let [calls          (atom [])
            orig-build-pm  (deref #'api.database/build-target-field-pathmap)]
        (with-redefs [api.database/build-target-field-pathmap (fn [ids]
                                                                (swap! calls conj (set ids))
                                                                (orig-build-pm ids))]
          (let [payload {:databases [{:id db-a-id :name "scope-db-a" :engine "h2"}]
                         :tables    [{:id t-a-id :db_id db-a-id :name "t" :schema "PUBLIC"}]
                         :fields    [{:id 1 :table_id t-a-id :name "c"
                                      :base_type "type/Integer" :database_type "INTEGER"}]}]
            (mt/user-http-request :crowberto :post 200 "database/metadata" payload))
          (testing "build-target-field-pathmap never saw db-b's table"
            (is (every? #(not (contains? % t-b-id)) @calls)))
          (testing "and was called with db-a's table"
            (is (some #(contains? % t-a-id) @calls))))))))

(deftest databases-metadata-import-cross-db-fk-test
  (testing "POST /api/database/metadata — cross-DB fk_target_field_id resolves after all DBs commit"
    (mt/with-temp [:model/Database {db-a-id :id} {:name "xfk-db-a" :engine :h2}
                   :model/Database {db-b-id :id} {:name "xfk-db-b" :engine :h2}
                   :model/Table    {t-a-id :id}  {:db_id db-a-id :name "ta" :schema "PUBLIC"}
                   :model/Table    {t-b-id :id}  {:db_id db-b-id :name "tb" :schema "PUBLIC"}
                   :model/Field    {pk-id :id}   {:table_id t-a-id :name "id"
                                                  :base_type :type/Integer
                                                  :database_type "BIGINT"
                                                  :semantic_type :type/PK}
                   :model/Field    {fk-id :id}   {:table_id t-b-id :name "a_id"
                                                  :base_type :type/Integer
                                                  :database_type "BIGINT"
                                                  :semantic_type :type/FK}]
      (let [payload {:databases [{:id db-b-id :name "xfk-db-b" :engine "h2"}
                                 {:id db-a-id :name "xfk-db-a" :engine "h2"}]
                     :tables    [{:id t-b-id :db_id db-b-id :name "tb" :schema "PUBLIC"}
                                 {:id t-a-id :db_id db-a-id :name "ta" :schema "PUBLIC"}]
                     :fields    [{:id fk-id :table_id t-b-id :name "a_id"
                                  :base_type "type/Integer" :database_type "BIGINT"
                                  :fk_target_field_id pk-id}
                                 {:id pk-id :table_id t-a-id :name "id"
                                  :base_type "type/Integer" :database_type "BIGINT"
                                  :semantic_type "type/PK"}]}]
        (mt/user-http-request :crowberto :post 200 "database/metadata" payload)
        (is (= pk-id (t2/select-one-fn :fk_target_field_id :model/Field :id fk-id)))))))

;;; -------------------------- POST /api/database/metadata/* (streaming NDJSON) --------------------------

(defn- ndjson-post
  "Submit `lines` (a sequence of maps) as an `application/x-ndjson` body to `path`. Returns the
  parsed response lines in order. Temporarily replaces `metabase.test.http-client/parse-response`
  with `identity` so the raw NDJSON body survives the mock client's default JSON-decoding path."
  [user path lines]
  (let [ndjson (str/join (map #(str (json/encode %) "\n") lines))
        body   (ByteArrayInputStream. (.getBytes ^String ndjson "UTF-8"))
        orig   @#'client/parse-response
        resp   (try
                 (alter-var-root #'client/parse-response (constantly identity))
                 (mt/user-http-request-full-response
                  user :post 202 path
                  {:request-options {:headers {"content-type" "application/x-ndjson"}
                                     :body    body}})
                 (finally
                   (alter-var-root #'client/parse-response (constantly orig))))]
    (->> (str/split-lines (:body resp))
         (remove str/blank?)
         (mapv json/decode+kw))))

(deftest post-field-values-streaming-test
  (testing "POST /api/database/field-values — happy path upserts by field_id"
    (mt/with-temp [:model/Database {db-id :id} {:name "fv-post-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t1" :schema "PUBLIC"}
                   :model/Field    {f1-id :id} {:table_id t-id :name "x" :base_type :type/Text
                                                :database_type "TEXT"}
                   :model/Field    {f2-id :id} {:table_id t-id :name "y" :base_type :type/Integer
                                                :database_type "INT"}]
      (let [resp (ndjson-post :crowberto "database/field-values"
                              [{:field_id f1-id :values [["A"] ["B"]] :has_more_values false}
                               {:field_id f2-id :values [[1] [2] [3]] :has_more_values true
                                :human_readable_values ["One" "Two" "Three"]}])]
        (is (= [{:field_id f1-id :created true}
                {:field_id f2-id :created true}]
               resp))
        (is (= [["A"] ["B"]]
               (t2/select-one-fn :values :model/FieldValues :field_id f1-id :type :full :hash_key nil)))
        (is (= true
               (t2/select-one-fn :has_more_values :model/FieldValues :field_id f2-id :type :full :hash_key nil)))
        (is (= ["One" "Two" "Three"]
               (t2/select-one-fn :human_readable_values :model/FieldValues :field_id f2-id :type :full :hash_key nil))))
      (testing "re-post updates the existing row and reports updated: true"
        (let [resp (ndjson-post :crowberto "database/field-values"
                                [{:field_id f1-id :values [["A"] ["B"] ["C"]] :has_more_values true}])]
          (is (= [{:field_id f1-id :updated true}] resp))
          (is (= [["A"] ["B"] ["C"]]
                 (t2/select-one-fn :values :model/FieldValues :field_id f1-id :type :full :hash_key nil)))
          (is (= true
                 (t2/select-one-fn :has_more_values :model/FieldValues :field_id f1-id :type :full :hash_key nil))))))))

(deftest post-field-values-fast-fail-test
  (testing "POST /api/database/field-values — invalid_field_id terminates the stream and nothing from the failing batch commits"
    (mt/with-temp [:model/Database {db-id :id} {:name "fv-fastfail-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}
                   :model/Field    {f-id :id}  {:table_id t-id :name "x" :base_type :type/Text
                                                :database_type "TEXT"}]
      (let [resp (ndjson-post :crowberto "database/field-values"
                              [{:field_id f-id     :values [["A"]] :has_more_values false}
                               {:field_id 99999999 :values [["B"]] :has_more_values false}
                               {:field_id f-id     :values [["C"]] :has_more_values false}])]
        (testing "exactly one line is written and it's the error for line 2"
          (is (= 1 (count resp)))
          (is (=? {:error "invalid_field_id" :line 2 :field_id 99999999} (first resp))))
        (testing "the whole batch rolled back — nothing committed"
          (is (nil? (t2/select-one :model/FieldValues :field_id f-id :type :full :hash_key nil))))))))

(deftest post-field-values-batched-test
  (testing "POST /api/database/field-values — more than import-batch-size lines stream successfully"
    (mt/with-temp [:model/Database {db-id :id} {:name "fv-batch-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      ;; Create 2100 fields (> import-batch-size = 2000)
      (let [n     2100
            rows  (mapv (fn [i]
                          {:table_id t-id :name (str "f" i)
                           :base_type :type/Text :database_type "TEXT" :active true})
                        (range n))
            f-ids (t2/insert-returning-pks! :model/Field rows)
            lines (mapv (fn [f-id]
                          {:field_id f-id :values [[(str "val-" f-id)]] :has_more_values false})
                        f-ids)
            resp  (ndjson-post :crowberto "database/field-values" lines)]
        (is (= n (count resp)))
        (is (every? :created resp))
        (is (= n (t2/count :model/FieldValues :field_id [:in f-ids] :type :full :hash_key nil)))))))

(deftest post-field-values-query-count-test
  (testing "POST /api/database/field-values — # SQL statements per batch is O(1), not O(N)"
    ;; Measures the batch processor directly — wrapping the full HTTP request counts session/perm/
    ;; streaming-setup queries that vary with JVM warmth and drown out the signal we care about.
    (mt/with-temp [:model/Database {db-id :id} {:name "fv-qcount-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [n       50
            rows    (mapv (fn [i]
                            {:table_id t-id :name (str "f" i)
                             :base_type :type/Text :database_type "TEXT" :active true})
                          (range n))
            f-ids   (t2/insert-returning-pks! :model/Field rows)
            batch   (map-indexed (fn [i fid]
                                   [(inc i) {:field_id fid :values [[(str "val-" fid)]] :has_more_values false}])
                                 f-ids)
            buffer  (java.util.ArrayList.)
            calls   (t2/with-call-count [call-count]
                      (t2/with-transaction [_conn]
                        (#'metabase.warehouses-rest.api/process-field-values-batch! batch buffer))
                      (call-count))]
        (testing "field-values batch processor should issue a bounded number of statements independent of batch size"
          (is (< calls 10)
              (format "expected < 10 SQL statements for %d-row field-values batch, got %d" n calls))
          (is (= n (.size buffer)))
          (is (every? :created (vec buffer))))))))

(deftest post-field-values-non-admin-test
  (testing "POST /api/database/field-values — non-admin requests are rejected"
    (let [body (ByteArrayInputStream. (.getBytes "{}\n" "UTF-8"))
          orig @#'client/parse-response
          resp (try
                 (alter-var-root #'client/parse-response (constantly identity))
                 (mt/user-http-request-full-response
                  :rasta :post 403 "database/field-values"
                  {:request-options {:headers {"content-type" "application/x-ndjson"}
                                     :body    body}})
                 (finally
                   (alter-var-root #'client/parse-response (constantly orig))))]
      (is (= 403 (:status resp))))))

(deftest post-metadata-databases-streaming-test
  (testing "POST /api/database/metadata/databases — matched rows return new_id in order"
    (mt/with-temp [:model/Database {db-a :id} {:name "streaming-db-a" :engine :h2}
                   :model/Database {db-b :id} {:name "streaming-db-b" :engine :h2}]
      (let [resp (ndjson-post :crowberto "database/metadata/databases"
                              [{:id 900 :name "streaming-db-a" :engine "h2"}
                               {:id 901 :name "streaming-db-b" :engine "h2"}])]
        (is (= [{:old_id 900 :new_id db-a}
                {:old_id 901 :new_id db-b}]
               resp))))))

(deftest post-metadata-databases-fast-fail-test
  (testing "POST /api/database/metadata/databases — no_match terminates the stream; same-batch successes are discarded"
    (mt/with-temp [:model/Database _ {:name "ff-db-a" :engine :h2}]
      (let [resp (ndjson-post :crowberto "database/metadata/databases"
                              [{:id 900 :name "ff-db-a" :engine "h2"}
                               {:id 901 :name "does-not-exist" :engine "h2"}
                               {:id 902 :name "ff-db-a" :engine "h2"}])]
        (testing "exactly one line is written — the error for line 2"
          (is (= 1 (count resp)))
          (is (=? {:error "no_match" :line 2 :old_id 901} (first resp))))))))

(deftest post-metadata-databases-batched-test
  (testing "POST /api/database/metadata/databases — > import-batch-size rows stream successfully"
    ;; 2100 matchable DBs created in one go so we exercise multi-batch streaming end-to-end.
    (let [n     2100
          names (mapv #(str "streaming-db-batch-" %) (range n))]
      (mt/with-model-cleanup [:model/Database]
        (t2/insert! :model/Database
                    (mapv (fn [nm] {:name nm :engine :h2 :details "{}"}) names))
        (let [lines (mapv (fn [i nm] {:id (+ 100000 i) :name nm :engine "h2"})
                          (range n) names)
              resp  (ndjson-post :crowberto "database/metadata/databases" lines)]
          (is (= n (count resp)))
          (is (every? :new_id resp)))))))

(deftest post-metadata-databases-non-admin-test
  (testing "POST /api/database/metadata/databases — non-admin rejected"
    (let [body (ByteArrayInputStream. (.getBytes "{}\n" "UTF-8"))
          orig @#'client/parse-response
          resp (try
                 (alter-var-root #'client/parse-response (constantly identity))
                 (mt/user-http-request-full-response
                  :rasta :post 403 "database/metadata/databases"
                  {:request-options {:headers {"content-type" "application/x-ndjson"}
                                     :body    body}})
                 (finally
                   (alter-var-root #'client/parse-response (constantly orig))))]
      (is (= 403 (:status resp))))))

(deftest post-metadata-tables-streaming-test
  (testing "POST /api/database/metadata/tables — match updates description, unmatched insert"
    (mt/with-temp [:model/Database {db-id :id} {:name "streaming-tbl-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "orders" :schema "PUBLIC"
                                                :description "before"}]
      (let [resp (ndjson-post :crowberto "database/metadata/tables"
                              [{:id 500 :db_id db-id :schema "PUBLIC" :name "orders"
                                :description "after"}
                               {:id 501 :db_id db-id :schema "PUBLIC" :name "customers"
                                :description "new"}])]
        (is (=? [{:old_id 500 :existing_id t-id}
                 {:old_id 501 :new_id int?}]
                resp))
        (is (= "after" (t2/select-one-fn :description :model/Table :id t-id)))
        (let [new-tbl (t2/select-one :model/Table :db_id db-id :name "customers")]
          (is (some? new-tbl))
          (is (= "new" (:description new-tbl)))
          (is (true? (:active new-tbl))))))))

(deftest post-metadata-tables-fast-fail-test
  (testing "POST /api/database/metadata/tables — invalid_db_id terminates the stream and rolls back the batch"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-fastfail-db" :engine :h2}]
      (let [resp (ndjson-post :crowberto "database/metadata/tables"
                              [{:id 500 :db_id db-id    :schema "PUBLIC" :name "good-before"}
                               {:id 501 :db_id 99999999 :schema "PUBLIC" :name "orphan"}
                               {:id 502 :db_id db-id    :schema "PUBLIC" :name "after-error"}])]
        (testing "only the error line is emitted (batch rolled back, pre-error successes were buffered)"
          (is (= 1 (count resp)))
          (is (=? {:error "invalid_db_id" :line 2 :old_id 501} (first resp))))
        (testing "nothing from the failing batch committed"
          (is (nil? (t2/select-one :model/Table :db_id db-id :name "good-before")))
          (is (nil? (t2/select-one :model/Table :db_id db-id :name "after-error"))))))))

(deftest post-metadata-tables-null-schema-test
  (testing "POST /api/database/metadata/tables — null schema matches via IS NULL"
    (mt/with-temp [:model/Database {db-id :id} {:name "null-schema-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "no-schema-tbl" :schema nil
                                                :description "before"}]
      (let [resp (ndjson-post :crowberto "database/metadata/tables"
                              [{:id 500 :db_id db-id :schema nil :name "no-schema-tbl"
                                :description "after"}])]
        (is (= [{:old_id 500 :existing_id t-id}] resp))
        (is (= "after" (t2/select-one-fn :description :model/Table :id t-id)))))))

(deftest post-metadata-tables-batched-test
  (testing "POST /api/database/metadata/tables — > import-batch-size rows stream"
    (mt/with-temp [:model/Database {db-id :id} {:name "batched-tbl-db" :engine :h2}]
      (let [n     2100
            lines (mapv (fn [i]
                          {:id (+ 10000 i) :db_id db-id :schema "PUBLIC" :name (str "t" i)})
                        (range n))
            resp  (ndjson-post :crowberto "database/metadata/tables" lines)]
        (is (= n (count resp)))
        (is (every? :new_id resp))
        (is (= n (t2/count :model/Table :db_id db-id)))))))

(deftest post-metadata-fields-insert-and-finalize-test
  (testing "POST /api/database/metadata/fields + /finalize — deeply nested fields that would collide under idx_unique_field"
    (mt/with-temp [:model/Database {db-id :id} {:name "nested-insert-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "obs" :schema "PUBLIC"}]
      ;; Payload: 3 root fields each with a child "leaf" — all 3 children collide under the
      ;; naive unique constraint, but defective-duplicate insertion bypasses it.
      (let [insert-resp (ndjson-post :crowberto "database/metadata/fields"
                                     [{:id 100 :table_id t-id :name "wind"
                                       :base_type "type/Dictionary" :database_type "NULL"}
                                      {:id 101 :table_id t-id :name "leaf"
                                       :base_type "type/Float" :database_type "NULL"}
                                      {:id 200 :table_id t-id :name "temp"
                                       :base_type "type/Dictionary" :database_type "NULL"}
                                      {:id 201 :table_id t-id :name "leaf"
                                       :base_type "type/Float" :database_type "NULL"}
                                      {:id 300 :table_id t-id :name "humidity"
                                       :base_type "type/Dictionary" :database_type "NULL"}
                                      {:id 301 :table_id t-id :name "leaf"
                                       :base_type "type/Float" :database_type "NULL"}])
            by-old      (into {} (map (juxt :old_id identity)) insert-resp)
            target-id   (fn [old] (or (:new_id (by-old old)) (:existing_id (by-old old))))
            finalize    [{:id (target-id 100) :parent_id nil                 :fk_target_field_id nil}
                         {:id (target-id 101) :parent_id (target-id 100)     :fk_target_field_id nil}
                         {:id (target-id 200) :parent_id nil                 :fk_target_field_id nil}
                         {:id (target-id 201) :parent_id (target-id 200)     :fk_target_field_id nil}
                         {:id (target-id 300) :parent_id nil                 :fk_target_field_id nil}
                         {:id (target-id 301) :parent_id (target-id 300)     :fk_target_field_id nil}]
            fin-resp    (ndjson-post :crowberto "database/metadata/fields/finalize" finalize)]
        (is (= 6 (count insert-resp)))
        (is (every? :new_id insert-resp))
        (is (= 6 (count fin-resp)))
        (is (every? :ok fin-resp))
        (let [rows (t2/query {:select [:id :name :parent_id :is_defective_duplicate :unique_field_helper]
                              :from   [:metabase_field]
                              :where  [:= :table_id t-id]
                              :order-by [:id]})]
          (is (= 6 (count rows)))
          (testing "every row has is_defective_duplicate = false after finalize"
            (is (every? (comp false? :is_defective_duplicate) rows)))
          (testing "unique_field_helper is 0 for roots and parent_id for nested rows"
            (let [by-name (group-by :name rows)
                  leafs   (get by-name "leaf")
                  roots   (concat (get by-name "wind") (get by-name "temp") (get by-name "humidity"))]
              (is (every? #(= 0 (:unique_field_helper %)) roots))
              (is (= #{(target-id 100) (target-id 200) (target-id 300)}
                     (set (map :unique_field_helper leafs)))))))))))

(deftest post-metadata-fields-root-reimport-test
  (testing "POST /api/database/metadata/fields — root-level re-import matches and returns existing_id"
    (mt/with-temp [:model/Database {db-id :id} {:name "reimport-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t1" :schema "PUBLIC"}
                   :model/Field    {f-id :id}  {:table_id t-id :name "id" :base_type :type/Integer
                                                :database_type "BIGINT" :description "before"}]
      (let [resp (ndjson-post :crowberto "database/metadata/fields"
                              [{:id 9001 :table_id t-id :name "id"
                                :base_type "type/Integer" :database_type "BIGINT"
                                :description "after" :semantic_type "type/PK"}])]
        (is (= [{:old_id 9001 :existing_id f-id}] resp))
        (is (= "after"   (t2/select-one-fn :description :model/Field :id f-id)))
        (is (= :type/PK (t2/select-one-fn :semantic_type :model/Field :id f-id)))
        (testing "base_type and database_type on matched rows are not overwritten"
          (is (= :type/Integer (t2/select-one-fn :base_type :model/Field :id f-id)))
          (is (= "BIGINT"      (t2/select-one-fn :database_type :model/Field :id f-id))))))))

(deftest post-metadata-fields-fast-fail-test
  (testing "POST /api/database/metadata/fields — invalid_table_id terminates the stream and rolls back the batch"
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-fastfail-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [resp (ndjson-post :crowberto "database/metadata/fields"
                              [{:id 1 :table_id t-id     :name "before"
                                :base_type "type/Integer" :database_type "INT"}
                               {:id 2 :table_id 99999999 :name "orphan"
                                :base_type "type/Integer" :database_type "INT"}
                               {:id 3 :table_id t-id     :name "after"
                                :base_type "type/Integer" :database_type "INT"}])]
        (testing "only the error line is emitted"
          (is (= 1 (count resp)))
          (is (=? {:error "invalid_table_id" :line 2 :old_id 2} (first resp))))
        (testing "nothing from the failing batch committed"
          (is (zero? (t2/count :model/Field :table_id t-id)))))))
  (testing "POST /api/database/metadata/fields — missing database_type is invalid_input (no silent fallback)"
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-missing-dbtype" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [resp (ndjson-post :crowberto "database/metadata/fields"
                              [{:id 1 :table_id t-id :name "no_dbtype"
                                :base_type "type/Text"}])]
        (is (= 1 (count resp)))
        (is (=? {:error "invalid_input" :line 1 :old_id 1} (first resp)))))))

(deftest post-metadata-fields-batched-test
  (testing "POST /api/database/metadata/fields — > import-batch-size rows stream and all end up defective pre-finalize"
    (mt/with-temp [:model/Database {db-id :id} {:name "batched-fld-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [n     2100
            lines (mapv (fn [i]
                          {:id (+ 100000 i) :table_id t-id :name (str "col" i)
                           :base_type "type/Integer" :database_type "INT"})
                        (range n))
            resp  (ndjson-post :crowberto "database/metadata/fields" lines)]
        (is (= n (count resp)))
        (is (every? :new_id resp))
        (is (= n (t2/count :metabase_field
                           {:where [:and [:= :table_id t-id]
                                    [:= :is_defective_duplicate true]]})))))))

(deftest post-metadata-fields-finalize-unique-violation-test
  (testing "POST /api/database/metadata/fields/finalize — unique_violation terminates the stream and rolls back the batch"
    (mt/with-temp [:model/Database {db-id :id} {:name "fin-collide-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [insert-resp (ndjson-post :crowberto "database/metadata/fields"
                                     [{:id 1 :table_id t-id :name "parent"
                                       :base_type "type/Dictionary" :database_type "NULL"}
                                      {:id 2 :table_id t-id :name "leaf"
                                       :base_type "type/Integer" :database_type "INT"}
                                      {:id 3 :table_id t-id :name "leaf"
                                       :base_type "type/Integer" :database_type "INT"}])
            target-id   (fn [old] (:new_id (first (filter #(= old (:old_id %)) insert-resp))))
            parent-id   (target-id 1)
            leaf1-id    (target-id 2)
            leaf2-id    (target-id 3)
            fin-resp    (ndjson-post :crowberto "database/metadata/fields/finalize"
                                     [{:id parent-id :parent_id nil       :fk_target_field_id nil}
                                      {:id leaf1-id  :parent_id parent-id :fk_target_field_id nil}
                                      {:id leaf2-id  :parent_id parent-id :fk_target_field_id nil}])]
        (testing "exactly one line is written and it's a unique_violation"
          ;; Per the batched-UPDATE plan, per-row :line / :id attribution is lost for SQL-level throws.
          (is (= 1 (count fin-resp)))
          (is (=? {:error "unique_violation"} (first fin-resp))))
        (testing "the whole batch rolled back — every row stays defective"
          (is (true? (t2/select-one-fn :is_defective_duplicate :metabase_field :id parent-id)))
          (is (true? (t2/select-one-fn :is_defective_duplicate :metabase_field :id leaf1-id)))
          (is (true? (t2/select-one-fn :is_defective_duplicate :metabase_field :id leaf2-id))))))))

(deftest post-metadata-fields-finalize-server-error-test
  (testing "POST /api/database/metadata/fields/finalize — an unexpected exception surfaces as server_error"
    (mt/with-temp [:model/Database {db-id :id} {:name "fin-svr-err-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}
                   :model/Field    {f-id :id}  {:table_id t-id :name "x" :base_type :type/Integer
                                                :database_type "INT" :is_defective_duplicate true}]
      ;; Batched-UPDATE path issues one t2/query per batch — simulate a DB-layer failure by
      ;; throwing from it. Per-line attribution is lost for SQL-level throws (documented caveat).
      (let [orig-query t2/query]
        (with-redefs [t2/query (fn [& args]
                                 (let [q (first args)]
                                   (if (and (vector? q)
                                            (str/starts-with? (str (first q)) "UPDATE metabase_field"))
                                     (throw (RuntimeException. "kaboom"))
                                     (apply orig-query args))))]
          (let [resp (ndjson-post :crowberto "database/metadata/fields/finalize"
                                  [{:id f-id :parent_id nil :fk_target_field_id nil}])]
            (is (= 1 (count resp)))
            (is (=? {:error "server_error"} (first resp)))))))))

(deftest post-metadata-fields-finalize-not-found-test
  (testing "POST /api/database/metadata/fields/finalize — unknown id terminates the stream with :not_found tagged to the offending line"
    (mt/with-temp [:model/Database {db-id :id} {:name "fin-notfound-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}
                   :model/Field    {f-id :id}  {:table_id t-id :name "x" :base_type :type/Integer
                                                :database_type "INT" :is_defective_duplicate true}]
      (let [resp (ndjson-post :crowberto "database/metadata/fields/finalize"
                              [{:id f-id     :parent_id nil :fk_target_field_id nil}
                               {:id 99999999 :parent_id nil :fk_target_field_id nil}])]
        (is (= 1 (count resp)))
        (is (=? {:error "not_found" :line 2 :id 99999999} (first resp)))
        (testing "the whole batch rolled back — the real row stays defective"
          (is (true? (t2/select-one-fn :is_defective_duplicate :metabase_field :id f-id))))))))

(deftest post-metadata-fields-finalize-batched-test
  (testing "POST /api/database/metadata/fields/finalize — > import-batch-size rows stream per-row UPDATEs"
    (mt/with-temp [:model/Database {db-id :id} {:name "fin-batch-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      ;; Bulk-insert 2100 defective rows directly (simulating the prior insert pass), then finalize.
      (let [n        2100
            rows     (mapv (fn [i]
                             {:table_id t-id :name (str "col" i)
                              :base_type :type/Integer :database_type "INT"
                              :active true :is_defective_duplicate true})
                           (range n))
            f-ids    (t2/insert-returning-pks! :model/Field rows)
            fin-lines (mapv (fn [fid] {:id fid :parent_id nil :fk_target_field_id nil}) f-ids)
            resp     (ndjson-post :crowberto "database/metadata/fields/finalize" fin-lines)]
        (is (= n (count resp)))
        (is (every? :ok resp))
        (is (zero? (t2/count :metabase_field {:where [:and [:= :table_id t-id]
                                                      [:= :is_defective_duplicate true]]})))))))

(deftest post-metadata-fields-finalize-query-count-test
  (testing "POST /api/database/metadata/fields/finalize — # SQL statements is O(1) in batch size, not O(N)"
    ;; Measures the batch processor directly — wrapping the full HTTP request counts session/perm/
    ;; streaming-setup queries that vary with JVM warmth and drown out the signal we care about.
    (mt/with-temp [:model/Database {db-id :id} {:name "fin-qcount-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}]
      (let [n      50
            rows   (mapv (fn [i]
                           {:table_id t-id :name (str "col" i)
                            :base_type :type/Integer :database_type "INT"
                            :active true :is_defective_duplicate true})
                         (range n))
            f-ids  (t2/insert-returning-pks! :model/Field rows)
            batch  (map-indexed (fn [i fid]
                                  [(inc i) {:id fid :parent_id nil :fk_target_field_id nil}])
                                f-ids)
            buffer (java.util.ArrayList.)
            calls  (t2/with-call-count [call-count]
                     (t2/with-transaction [_conn]
                       (#'metabase.warehouses-rest.api/process-finalize-batch! batch buffer))
                     (call-count))]
        (testing "finalize batch processor should issue a bounded number of statements independent of batch size"
          (is (< calls 10)
              (format "expected < 10 SQL statements for %d-row finalize batch, got %d" n calls))
          (is (= n (.size buffer)))
          (is (every? :ok (vec buffer))))))))

(deftest post-metadata-fields-finalize-overrides-user-settings-test
  (testing "POST /api/database/metadata/fields/finalize — finalize's fk_target_field_id wins over any existing FieldUserSettings row"
    (mt/with-temp [:model/Database {db-id :id} {:name "fin-overrides-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}
                   :model/Field    {fk-target-a :id} {:table_id t-id :name "target_a"
                                                      :base_type :type/Integer :database_type "INT"}
                   :model/Field    {fk-target-b :id} {:table_id t-id :name "target_b"
                                                      :base_type :type/Integer :database_type "INT"}
                   :model/Field    {f-id :id}   {:table_id t-id :name "x"
                                                 :base_type :type/Integer :database_type "INT"
                                                 :is_defective_duplicate true}
                   ;; User settings row carries an fk_target_field_id pointing at target A. finalize
                   ;; sends target B. The contract says finalize wins; the current pre-update hook
                   ;; merges the user-settings value over the finalize value and target A survives.
                   :model/FieldUserSettings _ {:field_id f-id :fk_target_field_id fk-target-a}]
      (let [resp (ndjson-post :crowberto "database/metadata/fields/finalize"
                              [{:id f-id :parent_id nil :fk_target_field_id fk-target-b}])]
        (is (= [{:id f-id :ok true}] resp))
        (is (= fk-target-b
               (t2/select-one-fn :fk_target_field_id :metabase_field :id f-id))
            "finalize's fk_target_field_id must not be overridden by FieldUserSettings")))))

(deftest post-metadata-streaming-end-to-end-test
  (testing "POST /api/database/metadata/{databases,tables,fields,fields/finalize} — full happy-path chain"
    (mt/with-temp [:model/Database {db-id :id} {:name "e2e-streaming-db" :engine :h2}]
      (let [db-resp   (ndjson-post :crowberto "database/metadata/databases"
                                   [{:id 900 :name "e2e-streaming-db" :engine "h2"}])
            target-db (-> db-resp first :new_id)
            tbl-resp  (ndjson-post :crowberto "database/metadata/tables"
                                   [{:id 1001 :db_id target-db :schema "PUBLIC" :name "orders"
                                     :description "o"}])
            target-t  (-> tbl-resp first :new_id)
            fld-resp  (ndjson-post :crowberto "database/metadata/fields"
                                   [{:id 2001 :table_id target-t :name "id"
                                     :base_type "type/Integer" :database_type "BIGINT"
                                     :semantic_type "type/PK"}
                                    {:id 2002 :table_id target-t :name "item"
                                     :base_type "type/Dictionary" :database_type "NULL"}
                                    {:id 2003 :table_id target-t :name "name"
                                     :base_type "type/Text" :database_type "TEXT"}])
            pk-id     (->> fld-resp (filter #(= 2001 (:old_id %))) first :new_id)
            item-id   (->> fld-resp (filter #(= 2002 (:old_id %))) first :new_id)
            name-id   (->> fld-resp (filter #(= 2003 (:old_id %))) first :new_id)
            fin-resp  (ndjson-post :crowberto "database/metadata/fields/finalize"
                                   [{:id pk-id   :parent_id nil     :fk_target_field_id nil}
                                    {:id item-id :parent_id nil     :fk_target_field_id nil}
                                    {:id name-id :parent_id item-id :fk_target_field_id pk-id}])]
        (is (= target-db db-id))
        (is (every? :new_id tbl-resp))
        (is (every? :new_id fld-resp))
        (is (every? :ok fin-resp))
        (testing "parent_id and fk_target_field_id committed on the nested field"
          (let [nested (t2/select-one :model/Field :id name-id)]
            (is (= item-id (:parent_id nested)))
            (is (= pk-id   (:fk_target_field_id nested)))))
        (testing "all rows flipped is_defective_duplicate = false"
          (is (zero? (t2/count :metabase_field
                               {:where [:and [:= :table_id target-t]
                                        [:= :is_defective_duplicate true]]}))))))))

(deftest ^:parallel fetch-database-metadata-test
  (testing "GET /api/database/:id/metadata"
    (is (= (merge (dissoc (db-details) :details :write_data_details :router_user_attribute)
                  {:engine        "h2"
                   :name          "test-data (h2)"
                   :features      (map u/qualified-name (driver.u/features :h2 (mt/db)))
                   :tables        [(merge
                                    (mt/obj->json->obj (mt/object-defaults :model/Table))
                                    (t2/select-one [:model/Table :created_at :updated_at :is_writable] :id (mt/id :categories))
                                    {:schema              "PUBLIC"
                                     :name                "CATEGORIES"
                                     :display_name        "Categories"
                                     :entity_type         "entity/GenericTable"
                                     :initial_sync_status "complete"
                                     :data_layer          "hidden"
                                     :fields              [(merge
                                                            (field-details (t2/select-one :model/Field :id (mt/id :categories :id)))
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
                                                             ;; Index sync is turned off across the application as it is not used ATM.
                                                             #_#_:database_indexed  true
                                                             :database_is_auto_increment true
                                                             :database_is_generated      false
                                                             :database_is_nullable       false
                                                             :database_is_pk             true})
                                                           (merge
                                                            (field-details (t2/select-one :model/Field :id (mt/id :categories :name)))
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
                                                             ;; Index sync is turned off across the application as it is not used ATM.
                                                             #_#_:database_indexed  false
                                                             :database_is_auto_increment false
                                                             :database_is_generated      false
                                                             :database_is_nullable       false
                                                             :database_is_pk             nil})]
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
        (mt/with-temp [:model/Table {t-id :id} {:name "FOO_TABLE" :display_name "irrelevant"
                                                :db_id (mt/id)}
                       :model/Field _ {:name "F_NAME" :display_name "user editable"
                                       :table_id t-id}]
          (is (partial= {"FOO_TABLE.F_NAME" {:name "F_NAME" :display_name "user editable"
                                             :table_name "FOO_TABLE"}}
                        (f (mt/user-http-request :rasta :get 200 (format "database/%d/fields" (mt/id)))))))))))

(deftest fetch-database-metadata-include-hidden-test
  ;; NOTE: test for the exclude_uneditable parameter lives in metabase-enterprise.advanced-permissions.common-test
  (mt/with-temp-vals-in-db :model/Table (mt/id :categories) {:visibility_type "hidden"}
    (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:visibility_type "sensitive"}
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
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    _ {:db_id db-id, :active false}]
    (testing "GET /api/database/:id/metadata?include_hidden=true"
      (let [tables (->> (mt/user-http-request :rasta :get 200 (format "database/%d/metadata?remove_inactive=true" db-id))
                        :tables)]
        (is (= () tables))))))

(deftest fetch-database-metadata-skip-fields-test
  (mt/with-empty-h2-app-db!
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table table {:db_id db-id}
                   :model/Field _ {:table_id (u/the-id table)}]
      (testing "GET /api/database/:id/metadata?skip_fields=true"
        (let [fields (->> (mt/user-http-request :rasta :get 200 (format "database/%d/metadata?skip_fields=true" db-id))
                          :tables
                          first
                          :fields)]
          (is (= () fields)))))))

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
        (mt/with-model-cleanup [:model/Field :model/Table :model/Database]
          (mt/with-temp [:model/Database tmp-db {:name "Temp Autocomplete Pagination DB" :engine "h2"}]
            ;; insert more than 50 temporary tables and fields
            (doseq [i (range 60)]
              (let [tmp-tbl (first (t2/insert-returning-instances! :model/Table {:name (format "My Table %d" i) :db_id (u/the-id tmp-db) :active true}))]
                (t2/insert! :model/Field {:name (format "My Field %d" i) :table_id (u/the-id tmp-tbl) :base_type "type/Text" :database_type "varchar"})))
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
      [:model/Collection collection {:name "Maz Analytics"}
       :model/Card       card-1     (card-with-native-query "Maz Quote Views Per Month" :collection_id (:id collection))
       :model/Card       card-2     (card-with-native-query "Maz Quote Views Per Day" :type :model)
       :model/Card       card-3     (card-with-native-query "Maz Quote Views Per Day")]
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
        (mt/with-temp [:model/Database {database-id :id} {}
                       :model/Card     _ (card-with-native-query "Maz Quote Views Per Month" :database_id database-id)] {}
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
        (let [expected-keys (-> #{:features :native_permissions :can_upload :router_user_attribute :transforms_permissions}
                                (into (keys (t2/select-one :model/Database :id (mt/id))))
                                (disj :details :write_data_details))]
          (doseq [db (:data (mt/user-http-request :rasta :get 200 "database"))]
            (testing (format "Database %s %d %s" (:engine db) (u/the-id db) (pr-str (:name db)))
              (is (= expected-keys
                     (set (keys db)))))))))))

(deftest ^:parallel databases-caching
  (testing "GET /api/database"
    (testing "Testing that listing all databases does not make excessive queries with multiple databases"
      (mt/with-temp [:model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}
                     :model/Database _ {:engine ::test-driver}]
        (mt/user-http-request :rasta :get 200 "database")
        (t2/with-call-count [call-count]
          (mt/user-http-request :rasta :get 200 "database")
          (is (< (call-count) 10)))))))

(deftest ^:parallel databases-list-test-2
  (testing "GET /api/database"
    (testing "Test that we can get all the DBs (ordered by name, then driver)"
      (testing "Make sure databases don't paginate"
        (mt/with-temp [:model/Database _ {:engine ::test-driver}
                       :model/Database _ {:engine ::test-driver}
                       :model/Database _ {:engine ::test-driver}]
          (is (=? {:data #(> (count %) 1)}
                  (mt/user-http-request :rasta :get 200 "database" :limit 1 :offset 0))))))))

(deftest ^:parallel databases-list-test-3
  (testing "GET /api/database"
    (testing "`?include=tables`"
      (let [old-ids (t2/select-pks-set :model/Database)]
        (mt/with-temp [:model/Database _ {:engine (u/qualified-name ::test-driver)}]
          (doseq [db (:data (get-all "database?include=tables" old-ids))]
            (testing (format "Database %s %d %s" (:engine db) (u/the-id db) (pr-str (:name db)))
              (is (= (expected-tables db)
                     (:tables db))))))))))

(deftest ^:parallel databases-list-test-4
  (testing "GET /api/database"
    (testing "`?include_only_uploadable=true` -- excludes drivers that don't support uploads"
      (let [old-ids (t2/select-pks-set :model/Database)]
        (mt/with-temp [:model/Database _ {:engine ::test-driver}]
          (is (= {:data  []
                  :total 0}
                 (get-all "database?include_only_uploadable=true" old-ids))))))))

(deftest ^:parallel databases-list-test-5
  (testing "GET /api/database"
    (testing "`?include_only_uploadable=true` -- includes drivers that do support uploads"
      (let [old-ids (t2/select-pks-set :model/Database)]
        (mt/with-temp [:model/Database _ {:engine :postgres :name "The Chosen One"}]
          (testing "Must be an admin"
            (let [result (get-all :crowberto "database?include_only_uploadable=true" old-ids)]
              (is (= 1 (:total result)))
              (is (= "The Chosen One" (-> result :data first :name)))))
          (testing "No results for non-admins"
            (is (= {:data []
                    :total 0}
                   (get-all :rasta "database?include_only_uploadable=true" old-ids)))))))))

(deftest databases-list-can-upload-test
  (mt/with-empty-h2-app-db!
    (testing "GET /api/database"
      (let [old-ids (t2/select-pks-set :model/Database)]
        (doseq [uploads-enabled? [true false]]
          (testing (format "The database with uploads enabled for the public schema has can_upload=%s" uploads-enabled?)
            (mt/with-temp [:model/Database _ {:engine              :postgres
                                              :name                "The Chosen One"
                                              :uploads_enabled     uploads-enabled?
                                              :uploads_schema_name "public"}]
              (let [result (get-all :crowberto "database" old-ids)]
                (is (= 1
                       (:total result)))
                (is (= uploads-enabled?
                       (-> result :data first :can_upload)))))))))))

(deftest ^:parallel databases-list-include-saved-questions-test
  (testing "GET /api/database?saved=true"
    (mt/with-temp [:model/Card _ (assoc (card-with-native-query "Some Card")
                                        :result_metadata [{:name         "col_name"
                                                           :display_name "Col Name"
                                                           :base_type    :type/Text}])]
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

(deftest fetch-databases-with-invalid-driver-test
  (testing "GET /api/database"
    (testing "\nEndpoint should still work even if there is a Database saved with a invalid driver"
      (mt/with-temp [:model/Database {db-id :id} {:engine "my-invalid-driver"}]
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
  (let [response-tables (:tables response)]
    (doseq [table tables]
      (testing (format "Should include Table %s" (pr-str table))
        (let [response-table (m/find-first #(= (:id %) (:id table))
                                           response-tables)]
          (is (=? table
                  response-table)))))))

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
        (mt/with-temp [:model/Card card (card-with-native-query "Maz Quote Views Per Month")]
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
          (mt/with-temp [:model/Card card (card-with-native-query "Maz Quote Views Per Month")]
            ;; run the Card which will populate its result_metadata column
            (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card)))
            ;; Now fetch the database list. The 'Saved Questions' DB should NOT be in the list
            (is (= nil
                   (fetch-virtual-database)))))))))

(deftest ^:parallel databases-list-include-saved-questions-tables-test-3
  (testing "GET /api/database?saved=true&include=tables"
    (testing "should pretend Collections are schemas"
      (mt/with-temp [:model/Collection stamp-collection {:name "Stamps"}
                     :model/Collection coin-collection  {:name "Coins"}
                     :model/Card       stamp-card (card-with-native-query "Total Stamp Count", :collection_id (u/the-id stamp-collection))
                     :model/Card       coin-card  (card-with-native-query "Total Coin Count",  :collection_id (u/the-id coin-collection))]
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
      (mt/with-temp [:model/Card ok-card         (assoc (card-with-native-query "OK Card")         :result_metadata [{:name         "cam"
                                                                                                                      :display_name "Cam"
                                                                                                                      :base_type    :type/Text}])
                     :model/Card cambiguous-card (assoc (card-with-native-query "Cambiguous Card") :result_metadata [{:name         "cam"
                                                                                                                      :display_name "Cam"
                                                                                                                      :base_type    :type/Text}
                                                                                                                     {:name         "cam_2"
                                                                                                                      :display_name "Cam 2"
                                                                                                                      :base_type    :type/Text}])]
        (let [response (fetch-virtual-database)]
          (is (malli= SavedQuestionsDB
                      response))
          (check-tables-included response (virtual-table-for-card ok-card))
          (check-tables-not-included response (virtual-table-for-card cambiguous-card)))))))

(deftest databases-list-include-saved-questions-tables-test-5
  (testing "GET /api/database?saved=true&include=tables"
    (testing "should remove Cards that belong to a driver that doesn't support nested queries"
      (mt/with-temp [:model/Database bad-db {:engine ::no-nested-query-support, :details {}}
                     :model/Card bad-card {:name            "Bad Card"
                                           :dataset_query   {:database (u/the-id bad-db)
                                                             :type     :native
                                                             :native   {:query "[QUERY GOES HERE]"}}
                                           :result_metadata [{:name         "sparrows"
                                                              :display_name "Sparrows"
                                                              :base_type    :type/Integer}]
                                           :database_id     (u/the-id bad-db)}
                     :model/Card ok-card (assoc (card-with-native-query "OK Card")
                                                :result_metadata [{:name         "finches"
                                                                   :display_name "Finches"
                                                                   :base_type    :type/Integer}])]
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
      (mt/with-temp [:model/Card ok-card  (ok-mbql-card)
                     :model/Card bad-card (merge
                                           (mt/$ids checkins
                                             (card-with-mbql-query "Cum Count Card"
                                                                   :source-table $$checkins
                                                                   :aggregation  [[:cum-count]]
                                                                   :breakout     [!month.date]))
                                           {:result_metadata [{:name         "num_toucans"
                                                               :display_name "Num Toucans"
                                                               :base_type    :type/Integer}]})]
        (let [response (fetch-virtual-database)]
          (is (malli= SavedQuestionsDB
                      response))
          (check-tables-included response (virtual-table-for-card ok-card))
          (check-tables-not-included response (virtual-table-for-card bad-card)))))))

(deftest ^:parallel db-metadata-saved-questions-db-test
  (testing "GET /api/database/:id/metadata works for the Saved Questions 'virtual' database"
    (mt/with-temp [:model/Card card (card-with-native-query
                                     "Birthday Card"
                                     :entity_id       "M6W4CLdyJxiW-DyzDbGl4"
                                     :result_metadata [{:name         "age_in_bird_years"
                                                        :display_name "Age in Bird Years"
                                                        :base_type    :type/Integer}])]
      (let [response (mt/user-http-request :crowberto :get 200
                                           (format "database/%d/metadata" lib.schema.id/saved-questions-virtual-database-id))]
        (is (malli= SavedQuestionsDB
                    response))
        (check-tables-included
         response
         (assoc (virtual-table-for-card card)
                :fields [{:name                     "age_in_bird_years"
                          :display_name             "Age in Bird Years"
                          :table_id                 (str "card__" (u/the-id card))
                          :id                       ["field" "age_in_bird_years" {:base-type "type/Integer"}]
                          :semantic_type            nil
                          :base_type                "type/Integer"}]))))))

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

(deftest db-metadata-tables-have-non-nil-schemas
  (mt/test-drivers (mt/normal-drivers)
    (is (every? some?
                (->> (mt/user-http-request :crowberto :get 200
                                           (format "database/%d/metadata" (mt/id)))
                     :tables
                     (map :schema))))))

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
      (with-db-scheduler-setup!
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
      (with-db-scheduler-setup!
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
      (with-db-scheduler-setup!
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
  (with-db-scheduler-setup!
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
  (with-db-scheduler-setup!
    (with-test-driver-available!
      (mt/with-temp
        [:model/Database db {}]
        (testing "update db setting to never scan should remove scan field values trigger"
          (testing "sanity check that it has all triggers to begin with"
            (is (= (task.sync-databases-test/all-db-sync-triggers-name db)
                   ;; this is flaking and I suspect it's because the triggers is created async in
                   ;; post-insert hook of Database
                   (u/poll {:thunk     #(task.sync-databases-test/query-all-db-sync-triggers-name db)
                            :done?      not-empty
                            :timeout-ms 300}))))
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
  (with-db-scheduler-setup!
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
    (mt/with-temp [:model/Database db {:details                     {:let-user-control-scheduling true}
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

(defn- deliver-when-db [promise-to-deliver expected-db-id]
  (fn [db]
    (when (= (u/the-id db) expected-db-id)
      (deliver promise-to-deliver true))))

(deftest trigger-metadata-sync-for-db-test
  (testing "Can we trigger a metadata sync for a DB?"
    (let [sync-called?    (promise)
          analyze-called? (promise)]
      (mt/with-premium-features #{:audit-app}
        (mt/with-temp [:model/Database {db-id :id} {:engine "h2", :details (:details (mt/db))}]
          ;; redefine quick-task/submit-task! so as not to depend on the capacity of the quick-task executor
          (with-redefs [quick-task/submit-task!         future-call
                        sync-metadata/sync-db-metadata! (deliver-when-db sync-called? db-id)
                        analyze/analyze-db!             (deliver-when-db analyze-called? db-id)]
            (snowplow-test/with-fake-snowplow-collector
              (mt/user-http-request :crowberto :post 200 (format "database/%d/sync_schema" db-id))
              ;; Block waiting for the promises from sync and analyze to be delivered. Should be delivered instantly,
              ;; however if something went wrong, don't hang forever, eventually timeout and fail
              (testing "sync called?"
                (is (true?
                     (deref sync-called? long-timeout :sync-never-called))))
              (testing "analyze called?"
                (is (true?
                     (deref analyze-called? long-timeout :analyze-never-called))))
              (testing "audit log entry generated"
                (is (= db-id
                       (:model_id (mt/latest-audit-log-entry "database-manual-sync")))))
              (testing "triggers snowplow event"
                (is (=?
                     {"event" "database_manual_sync", "target_id" db-id}
                     (:data (last (snowplow-test/pop-event-data-and-user-id!)))))))))))))

(deftest sync-schema-executes-when-executor-busy-test
  (testing "POST /api/database/:id/sync_schema should execute sync even when quick-task executor is busy (GHY-3254)"
    (let [sync-called?  (promise)
          blocker-latch (CountDownLatch. 1)]
      (mt/with-temp [:model/Database {db-id :id} {:engine "h2" :details (:details (mt/db))}]
        (with-redefs [sync-metadata/sync-db-metadata! (deliver-when-db sync-called? db-id)
                      analyze/analyze-db!             (constantly nil)]
          ;; Submit a blocking task with a 1-second timeout so it gets cancelled quickly.
          ;; This simulates a stuck sync (e.g., hanging JDBC connection) that exceeds
          ;; the quick-task timeout and gets evicted.
          (with-redefs [quick-task/task-timeout-ms (constantly 1000)]
            (quick-task/submit-task! (fn [] (.await blocker-latch))))
          (try
            (mt/user-http-request :crowberto :post 200 (format "database/%d/sync_schema" db-id))
            ;; The sync task is queued behind the blocker. After the blocker times out
            ;; and is cancelled, the sync task should execute.
            (testing "sync executes after stuck task is evicted"
              (is (true? (deref sync-called? 10000 :sync-never-called))))
            (finally
              (.countDown blocker-latch))))))))

(deftest ^:parallel dismiss-spinner-test
  (testing "Can we dismiss the spinner? (#20863)"
    (mt/with-temp [:model/Database db    {:engine "h2", :details (:details (mt/db)) :initial_sync_status "incomplete"}
                   :model/Table    table {:db_id (u/the-id db) :initial_sync_status "incomplete"}]
      (mt/user-http-request :crowberto :post 200 (format "database/%d/dismiss_spinner" (u/the-id db)))
      (testing "dismissed db spinner"
        (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database (:id db)))))
      (testing "dismissed table spinner"
        (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Table (:id table))))))))

(deftest ^:parallel dismiss-spinner-test-2
  (testing "can we dissmiss the spinner if db has no tables? (#30837)"
    (mt/with-temp [:model/Database db    {:engine "h2", :details (:details (mt/db)) :initial_sync_status "incomplete"}]
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
        (mt/with-temp [:model/Database db {:engine "h2", :details (:details (mt/db))}]
          (with-redefs [sync.field-values/update-field-values! (fn [synced-db]
                                                                 (when (= (u/the-id synced-db) (u/the-id db))
                                                                   (deliver update-field-values-called? :sync-called)))]
            (snowplow-test/with-fake-snowplow-collector
              (mt/user-http-request :crowberto :post 200 (format "database/%d/rescan_values" (u/the-id db)))
              (is (= :sync-called
                     (deref update-field-values-called? long-timeout :sync-never-called)))
              (is (= (:id db) (:model_id (mt/latest-audit-log-entry "database-manual-scan"))))
              (is (= (:id db) (-> (mt/latest-audit-log-entry "database-manual-scan")
                                  :details :id)))
              (testing "triggers snowplow event"
                (is (=?
                     {"event" "database_manual_scan", "target_id" (u/the-id db)}
                     (:data (last (snowplow-test/pop-event-data-and-user-id!)))))))))))))

(deftest ^:parallel nonadmins-cant-trigger-rescan-test
  (testing "Non-admins should not be allowed to trigger re-scan"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 (format "database/%d/rescan_values" (mt/id)))))))

(deftest discard-db-fieldvalues-test
  (testing "Can we DISCARD all the FieldValues for a DB?"
    (mt/with-temp [:model/Database    db       {:engine "h2", :details (:details (mt/db))}
                   :model/Table       table-1  {:db_id (u/the-id db)}
                   :model/Table       table-2  {:db_id (u/the-id db)}
                   :model/Field       field-1  {:table_id (u/the-id table-1)}
                   :model/Field       field-2  {:table_id (u/the-id table-2)}
                   :model/FieldValues values-1 {:field_id (u/the-id field-1), :values [1 2 3 4]}
                   :model/FieldValues values-2 {:field_id (u/the-id field-2), :values [1 2 3 4]}]

      (snowplow-test/with-fake-snowplow-collector
        (is (= {:status "ok"}
               (mt/user-http-request :crowberto :post 200 (format "database/%d/discard_values" (u/the-id db)))))

        (testing "triggers snowplow event"
          (is (=?
               {"event" "database_discard_field_values", "target_id" (u/the-id db)}
               (:data (last (snowplow-test/pop-event-data-and-user-id!)))))))

      (testing "values-1 still exists?"
        (is (= false
               (t2/exists? :model/FieldValues :id (u/the-id values-1)))))
      (testing "values-2 still exists?"
        (is (= false
               (t2/exists? :model/FieldValues :id (u/the-id values-2))))))))

(deftest discard-db-fieldvalues-audit-log-test
  (testing "Do we get an audit log entry when we discard all the FieldValues for a DB?"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Database db {:engine "h2", :details (:details (mt/db))}]
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
   (with-redefs [driver.settings/*allow-testing-h2-connections* true]
     (mt/user-http-request user :post expected-status-code "database/validate" request-body))))

(defn- test-connection-details! [engine details]
  (with-redefs [driver.settings/*allow-testing-h2-connections* true]
    (warehouses/test-connection-details engine details)))

(deftest validate-database-test
  (testing "POST /api/database/validate"
    (testing "Should require superuser permissions"
      (is (= "You don't have permissions to do that."
             (api-validate-database! {:user :rasta, :expected-status-code 403}
                                     {:details {:engine :h2, :details (:details (mt/db))}}))))))

(deftest validate-database-test-1b
  (testing "POST /api/database/validate"
    (testing "Underlying `test-connection-details` function should work"
      (is (= (:details (mt/db))
             (test-connection-details! "h2" (:details (mt/db))))))))

(deftest validate-database-test-1c
  (testing "POST /api/database/validate"
    (testing "Valid database connection details"
      (is (= (merge (:details (mt/db)) {:valid true})
             (api-validate-database! {:details {:engine :h2, :details (:details (mt/db))}}))))))

(deftest validate-database-test-1d
  (testing "POST /api/database/validate"
    (testing "invalid database connection details"
      (testing "calling test-connection-details directly"
        (is (= {:errors  {:db "check your connection string"}
                :message "Implicitly relative file paths are not allowed."
                :valid   false}
               (test-connection-details! "h2" {:db "ABC"})))))))

(deftest validate-database-test-1e
  (testing "POST /api/database/validate"
    (testing "invalid database connection details"
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
      (with-redefs [warehouses.util/test-database-connection (fn [_ details & _]
                                                               (swap! call-count inc)
                                                               (swap! ssl-values conj (:ssl details))
                                                               (if @valid? nil {:valid false}))]
        (testing "with SSL enabled, do not allow non-SSL connections"
          (#'warehouses.util/test-connection-details "postgres" {:ssl true})
          (is (= 1 @call-count))
          (is (= [true] @ssl-values)))

        (reset! call-count 0)
        (reset! ssl-values [])

        (testing "with SSL disabled, try twice (once with, once without SSL)"
          (#'warehouses.util/test-connection-details "postgres" {:ssl false})
          (is (= 2 @call-count))
          (is (= [true false] @ssl-values)))

        (reset! call-count 0)
        (reset! ssl-values [])

        (testing "with SSL unspecified, try twice (once with, once without SSL)"
          (#'warehouses.util/test-connection-details "postgres" {})
          (is (= 2 @call-count))
          (is (= [true nil] @ssl-values)))

        (reset! call-count 0)
        (reset! ssl-values [])
        (reset! valid? true)

        (testing "with SSL disabled, but working try once (since SSL work we don't try without SSL)"
          (is (= {:ssl true}
                 (#'warehouses.util/test-connection-details "postgres" {:ssl false})))
          (is (= 1 @call-count))
          (is (= [true] @ssl-values)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                      GET /api/database/:id/schemas & GET /api/database/:id/schema/:schema                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest get-schemas-test
  (testing "GET /api/database/:id/schemas"
    (testing "Multiple schemas are ordered by name"
      (mt/with-temp
        [:model/Database {db-id :id} {}
         :model/Table    _           {:db_id db-id :schema "schema3"}
         :model/Table    _           {:db_id db-id :schema "schema2"}
         :model/Table    _           {:db_id db-id :schema "schema1"}]
        (is (= ["schema1" "schema2" "schema3"]
               (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id))))))

    (testing "Looking for a database that doesn't exist should return a 404"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 (format "database/%s/schemas" Integer/MAX_VALUE)))))

    (testing "should work for the saved questions 'virtual' database"
      (mt/with-temp [:model/Collection coll   {:name "My Collection"}
                     :model/Card       card-1 (assoc (card-with-native-query "Card 1") :collection_id (:id coll))
                     :model/Card       card-2 (card-with-native-query "Card 2")]
        ;; run the cards to populate their result_metadata columns
        (doseq [card [card-1 card-2]]
          (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card))))
        (let [schemas (set (mt/user-http-request
                            :lucky :get 200
                            (format "database/%d/schemas" lib.schema.id/saved-questions-virtual-database-id)))]
          (is (contains? schemas "Everything else"))
          (is (contains? schemas "My Collection")))))
    (testing "null and empty schemas should both come back as blank strings"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table    _ {:db_id db-id :schema ""}
                     :model/Table    _ {:db_id db-id :schema nil}
                     :model/Table    _ {:db_id db-id :schema " "}]
        (is (= ["" " "]
               (mt/user-http-request :lucky :get 200 (format "database/%d/schemas" db-id))))))))

(deftest ^:parallel blank-schema-identifier-test
  (testing "We should handle Databases with blank schema correctly (#12450)"
    (mt/with-temp [:model/Database {db-id :id} {:name "my/database"}]
      (doseq [schema-name [nil ""]]
        (testing (str "schema name = " (pr-str schema-name))
          (mt/with-temp [:model/Table _ {:db_id db-id, :schema schema-name, :name "just a table"}]
            (is (= [""] (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id))))))))))

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

(deftest get-syncable-schemas-checks-permissions-correctly
  (testing "GET /api/database/:id/syncable_schemas"
    (testing "Non-admins can get syncable schemas on the attached DWH"
      (mt/with-temp [:model/Database {id :id} {:is_attached_dwh true}]
        (with-redefs [driver/syncable-schemas (constantly #{"PUBLIC"})]
          (is (= ["PUBLIC"]
                 (mt/user-http-request :rasta :get 200 (format "database/%d/syncable_schemas" id)))))))))

(deftest ^:parallel get-schemas-for-schemas-with-no-visible-tables
  (mt/with-temp
    [:model/Database {db-id :id} {}
     :model/Table    _ {:db_id db-id :schema "schema_1a" :name "table_1"}
     :model/Table    _ {:db_id db-id :schema "schema_1c" :name "table_1"} ;; out of order for sorting
     :model/Table    _ {:db_id db-id :schema "schema_1b" :name "table_1"}
     ;; table is not visible. Any non-nil value of `visibility_type` means Table shouldn't be visible
     :model/Table    _ {:db_id db-id :schema "schema_2" :name "table_2a" :visibility_type "hidden"}
     :model/Table    _ {:db_id db-id :schema "schema_2" :name "table_2b" :visibility_type "cruft"}
       ;; table is not active
     :model/Table    _ {:db_id db-id :schema "schema_3" :name "table_3" :active false}]
    (testing "GET /api/database/:id/schemas should not return schemas with no VISIBLE TABLES"
      (is (= ["schema_1a" "schema_1b" "schema_1c"]
             (mt/user-http-request :crowberto :get 200 (format "database/%d/schemas" db-id)))))
    (testing "GET /api/database/:id/schemas?include_hidden=true should return schemas with no VISIBLE TABLES"
      (is (= ["schema_1a" "schema_1b" "schema_1c" "schema_2"]
             (mt/user-http-request :crowberto :get 200 (format "database/%d/schemas?include_hidden=true" db-id)))))))

(deftest get-schemas-permissions-test
  (testing "GET /api/database/:id/schemas against permissions"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    t1 {:db_id db-id :schema "schema1"}
                   :model/Table    t2 {:db_id db-id :schema "schema1"}]
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

      (testing "returns empty list when user has no create-queries perms for any schema"
        (mt/with-full-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t1) :perms/create-queries :no)
          (data-perms/set-table-permission! (perms-group/all-users) (u/the-id t2) :perms/create-queries :no)
          ;; User can access the endpoint but sees no schemas since they have no query perms
          (is (= []
                 (mt/user-http-request :rasta :get 200 (format "database/%s/schemas" db-id)))))))

    (testing "should exclude schemas for which the user has no perms"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    {t1-id :id} {:db_id database-id :schema "schema-with-perms"}
                     :model/Table    _ {:db_id database-id :schema "schema-without-perms"}]
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) database-id :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) t1-id :perms/create-queries :query-builder)
          (is (= ["schema-with-perms"]
                 (mt/user-http-request :rasta :get 200 (format "database/%s/schemas" database-id)))))))))

(deftest ^:parallel get-schema-tables-test
  (testing "GET /api/database/:id/schema/:schema"
    (testing "Should return a 404 if the database isn't found"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 (format "database/%s/schema/%s" Integer/MAX_VALUE "schema1")))))))

(deftest ^:parallel get-schema-tables-test-2
  (testing "GET /api/database/:id/schema/:schema"
    (testing "Should return a 404 if the schema isn't found"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table    _ {:db_id db-id :schema "schema1"}]
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 (format "database/%d/schema/%s" db-id "not schema1"))))))))

(deftest get-schema-tables-test-3
  (testing "GET /api/database/:id/schema/:schema"
    (testing "should exclude Tables for which the user has no perms"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    table-with-perms {:db_id database-id :schema "public" :name "table-with-perms"}
                     :model/Table    _                {:db_id database-id :schema "public" :name "table-without-perms"}]
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) database-id :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) table-with-perms :perms/create-queries :query-builder)
          (is (= ["table-with-perms"]
                 (map :name (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public"))))))))))

(deftest ^:parallel get-schema-tables-test-4
  (testing "GET /api/database/:id/schema/:schema"
    (testing "should exclude inactive Tables"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    _ {:db_id database-id :schema "public" :name "table"}
                     :model/Table    _ {:db_id database-id :schema "public" :name "inactive-table" :active false}]
        (is (= ["table"]
               (map :name (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public")))))))))

(deftest ^:parallel get-schema-tables-test-5
  (testing "GET /api/database/:id/schema/:schema"
    (testing "should exclude hidden Tables"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    _ {:db_id database-id :schema "public" :name "table"}
                     :model/Table    _ {:db_id database-id :schema "public" :name "hidden-table" :visibility_type "hidden"}]
        (is (= ["table"]
               (map :name (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public")))))))))

(deftest ^:parallel get-schema-tables-test-6
  (testing "GET /api/database/:id/schema/:schema"
    (testing "should show hidden Tables when explicitly asked for"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    _ {:db_id database-id :schema "public" :name "table"}
                     :model/Table    _ {:db_id database-id :schema "public" :name "hidden-table" :visibility_type "hidden"}]
        (is (= #{"table" "hidden-table"}
               (set (map :name (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public")
                                                     :include_hidden true)))))))))

(deftest ^:parallel get-schema-tables-test-7
  (testing "GET /api/database/:id/schema/:schema"
    (testing "should work for the saved questions 'virtual' database"
      (mt/with-temp [:model/Collection coll   {:name "My Collection"}
                     :model/Card       card-1 (assoc (card-with-native-query "Card 1") :collection_id (:id coll))
                     :model/Card       card-2 (card-with-native-query "Card 2")]
        ;; run the cards to populate their result_metadata columns
        (doseq [card [card-1 card-2]]
          (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card))))
        (testing "Should be able to get saved questions in a specific collection"
          (is (= [{:id               (format "card__%d" (:id card-1))
                   :db_id            (mt/id)
                   :entity_id        nil
                   :metrics          nil
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
                                                       (schema.table/root-collection-schema-name)))]
            (is (malli= [:sequential
                         [:map
                          [:id               #"^card__\d+$"]
                          [:db_id            ::lib.schema.id/database]
                          [:display_name     :string]
                          [:moderated_status [:maybe [:= "verified"]]]
                          [:schema           [:= (schema.table/root-collection-schema-name)]]
                          [:description      [:maybe :string]]]]
                        response))
            (is (not (contains? (set (map :display_name response)) "Card 3")))
            (is (contains? (set response)
                           {:id               (format "card__%d" (:id card-2))
                            :db_id            (mt/id)
                            :entity_id        nil
                            :display_name     "Card 2"
                            :metrics          nil
                            :moderated_status nil
                            :schema           (schema.table/root-collection-schema-name)
                            :description      nil
                            :type             "question"}))))

        (testing "Should throw 404 if the schema/Collection doesn't exist"
          (is (= "Not found."
                 (mt/user-http-request :lucky :get 404
                                       (format "database/%d/schema/%s" lib.schema.id/saved-questions-virtual-database-id "Coin Collection")))))))))

(deftest ^:parallel get-schema-tables-test-8
  (testing "GET /api/database/:id/schema/:schema"
    (testing "should work for the datasets in the 'virtual' database"
      (mt/with-temp [:model/Collection coll   {:name "My Collection"}
                     :model/Card       card-1 (assoc (card-with-native-query "Card 1")
                                                     :collection_id (:id coll)
                                                     :type :model)
                     :model/Card       metric {:type :metric
                                               :name "Metric"
                                               :database_id (mt/id)
                                               :collection_id (:id coll)
                                               :dataset_query (mt/mbql-query nil
                                                                {:source-table (str "card__" (:id card-1))
                                                                 :aggregation [[:count]]})}
                     :model/Card       card-2 (assoc (card-with-native-query "Card 2")
                                                     :type :model)
                     :model/Card       _card-3 (assoc (card-with-native-query "error")
                                               ;; regular saved question should not be in the results
                                                      :type :question)]
        ;; run the cards to populate their result_metadata columns
        (doseq [card [card-1 card-2]]
          (is (=? {:status "completed"}
                  (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card))))))
        (testing "Should be able to get datasets in a specific collection"
          (is (=? [{:id               (format "card__%d" (:id card-1))
                    :db_id            (mt/id)
                    :metrics          [{:id             (:id metric)
                                        :name           "Metric"
                                        :type           "metric"
                                        :source_card_id (:id card-1)
                                        :database_id    (mt/id)}]
                    :display_name     "Card 1"
                    :schema           "My Collection"
                    :type             "model"}
                   {:id           (format "card__%d" (:id metric))
                    :db_id        (mt/id)
                    :display_name "Metric"
                    :schema       "My Collection"}]
                  (mt/user-http-request :lucky :get 200
                                        (format "database/%d/datasets/%s" lib.schema.id/saved-questions-virtual-database-id "My Collection")))))

        (testing "Should be able to get datasets in the root collection"
          (let [response (mt/user-http-request :lucky :get 200
                                               (format "database/%d/datasets/%s" lib.schema.id/saved-questions-virtual-database-id
                                                       (schema.table/root-collection-schema-name)))]
            (is (malli= [:sequential
                         [:map
                          [:id               [:re #"^card__\d+$"]]
                          [:db_id            ::lib.schema.id/database]
                          [:display_name     :string]
                          [:moderated_status [:maybe [:= :verified]]]
                          [:schema           [:= (schema.table/root-collection-schema-name)]]
                          [:description      [:maybe :string]]]]
                        response))
            (is (contains? (set response)
                           {:id               (format "card__%d" (:id card-2))
                            :db_id            (mt/id)
                            :entity_id        nil
                            :display_name     "Card 2"
                            :metrics          nil
                            :moderated_status nil
                            :schema           (schema.table/root-collection-schema-name)
                            :description      nil
                            :type             "model"}))))

        (testing "Should throw 404 if the schema/Collection doesn't exist"
          (is (= "Not found."
                 (mt/user-http-request :lucky :get 404
                                       (format "database/%d/schema/%s" lib.schema.id/saved-questions-virtual-database-id "Coin Collection")))))))))

(deftest ^:parallel get-schema-tables-test-9
  (testing "GET /api/database/:id/schema/:schema"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    _ {:db_id db-id :schema nil :name "t1"}
                   :model/Table    _ {:db_id db-id :schema "" :name "t2"}]
      (testing "to fetch Tables with `nil` or empty schemas, use the blank string"
        (is (= ["t1" "t2"]
               (map :name (mt/user-http-request :lucky :get 200 (format "database/%d/schema/" db-id)))))))))

(deftest ^:parallel get-schema-tables-publishing-test
  (testing "GET /api/database/:id/schema/:schema"
    (testing "should return is_published as true for published tables"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    _ {:db_id database-id :schema "public" :name "published-table" :is_published true}
                     :model/Table    _ {:db_id database-id :schema "public" :name "unpublished-table" :is_published false}]
        (let [tables (mt/user-http-request :rasta :get 200 (format "database/%s/schema/%s" database-id "public"))]
          (is (true? (:is_published (m/find-first #(= "published-table" (:name %)) tables))))
          (is (false? (:is_published (m/find-first #(= "unpublished-table" (:name %)) tables)))))))))

(deftest get-schema-tables-unreadable-metrics-are-not-returned-test
  (mt/with-temp [:model/Collection model-coll   {:name "Model Collection"}
                 :model/Card       card         (card-with-native-query
                                                 "Card 1"
                                                 :collection_id (:id model-coll)
                                                 :type :model)
                 :model/Collection metric-coll {:name "Metric Collection"}
                 :model/Card       metric      {:type          :metric
                                                :name          "Metric"
                                                :database_id   (mt/id)
                                                :collection_id (:id metric-coll)
                                                :dataset_query {:type     :query
                                                                :database (mt/id)
                                                                :query    {:source-table (str "card__" (:id card))
                                                                           :aggregation  [[:count]]}}}]
    (is (=? nil (:result_metadata card)))
    (is (=? nil (:result_metadata (t2/select-one :model/Card :id (:id card)))))
    (is (=? {:status "completed"}
            (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (:id card)))))
    (let [virtual-table {:id           (format "card__%d" (:id card))
                         :db_id        (mt/id)
                         :metrics      nil
                         :display_name "Card 1"
                         :schema       (:name model-coll)
                         :type         "model"}]
      (testing "Metrics should be returned"
        (is (=? [(assoc virtual-table
                        :metrics [{:id             (:id metric)
                                   :name           "Metric"
                                   :type           "metric"
                                   :source_card_id (:id card)
                                   :database_id    (mt/id)}])]
                (mt/user-http-request :lucky :get 200
                                      (format "database/%d/datasets/%s"
                                              lib.schema.id/saved-questions-virtual-database-id
                                              (:name model-coll))))))
      (perms/revoke-collection-permissions! (perms-group/all-users) (:id metric-coll))
      (testing "Metrics should not be returned if its collection is not accessible"
        (is (=? [virtual-table]
                (mt/user-http-request :lucky :get 200
                                      (format "database/%d/datasets/%s"
                                              lib.schema.id/saved-questions-virtual-database-id
                                              (:name model-coll)))))))))

(deftest get-schema-tables-permissions-test
  (testing "GET /api/database/:id/schema/:schema against permissions"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    t1  {:db_id db-id :schema "schema1" :name "t1"}
                   :model/Table    _t2 {:db_id db-id :schema "schema2"}
                   :model/Table    t3  {:db_id db-id :schema "schema1" :name "t3"}]
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
                 (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/%s" db-id "schema1"))))))))))

(deftest get-schema-tables-permissions-test-2
  (testing "GET /api/database/:id/schema/:schema against permissions"
    (testing "should return a 403 for a user that doesn't have read permissions"
      (testing "for the DB"
        (mt/with-temp [:model/Database {database-id :id} {}
                       :model/Table    _ {:db_id database-id :schema "test"}]
          (mt/with-no-data-perms-for-all-users!
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "database/%s/schema/%s" database-id "test"))))))))))

(deftest get-schema-tables-permissions-test-2b
  (testing "GET /api/database/:id/schema/:schema against permissions"
    (testing "should return a 403 for a user that doesn't have read permissions"
      (testing "for all tables in the schema"
        (mt/with-temp [:model/Database {database-id :id} {}
                       :model/Table    {t1-id :id} {:db_id database-id :schema "schema-with-perms"}
                       :model/Table    _ {:db_id database-id :schema "schema-without-perms"}]
          (mt/with-no-data-perms-for-all-users!
            (data-perms/set-database-permission! (perms-group/all-users) database-id :perms/view-data :unrestricted)
            (data-perms/set-table-permission! (perms-group/all-users) t1-id :perms/create-queries :query-builder)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "database/%s/schema/%s" database-id "schema-without-perms"))))))))))

(deftest ^:parallel slashes-in-identifiers-test
  (testing "We should handle Databases with slashes in identifiers correctly (#12450)"
    (mt/with-temp [:model/Database {db-id :id} {:name "my/database"}]
      (doseq [schema-name ["my/schema"
                           "my//schema"
                           "my\\schema"
                           "my\\\\schema"
                           "my\\//schema"
                           "my_schema/"
                           "my_schema\\"]]
        (testing (format "\nschema name = %s" (pr-str schema-name))
          (mt/with-temp [:model/Table _ {:db_id db-id, :schema schema-name, :name "my/table"}]
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
                                                   {:service-account-json          secret/protected-password
                                                    :password                      "new-password"
                                                    :pass                          secret/protected-password
                                                    :tunnel-pass                   secret/protected-password
                                                    :tunnel-private-key            secret/protected-password
                                                    :tunnel-private-key-passphrase secret/protected-password
                                                    :access-token                  secret/protected-password
                                                    :refresh-token                 secret/protected-password})))))

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
                                                   {:service-account-json          secret/protected-password
                                                    :password                      secret/protected-password
                                                    :pass                          secret/protected-password
                                                    :tunnel-pass                   secret/protected-password
                                                    :tunnel-private-key            secret/protected-password
                                                    :tunnel-private-key-passphrase secret/protected-password
                                                    :access-token                  secret/protected-password
                                                    :refresh-token                 secret/protected-password})))))

(deftest ^:parallel secret-file-paths-returned-by-api-test
  (mt/with-driver :secret-test-driver
    (testing "File path values for secrets are returned as plaintext in the API (#20030)"
      (mt/with-temp [:model/Database database {:engine  :secret-test-driver
                                               :name    "Test secret DB with password path"
                                               :details {:host           "localhost"
                                                         :password-path "/path/to/password.txt"}}]
        (is (=? {:password-options "local"
                 :password-path  "/path/to/password.txt"}
                (as-> (u/the-id database) d
                  (format "database/%d" d)
                  (mt/user-http-request :crowberto :get 200 d)
                  (:details d))))))))

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
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:test-db-local-setting-public        1
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
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings nil}
      (letfn [(settings []
                (t2/select-one-fn :settings :model/Database :id (mt/id)))
              (set-settings! [m]
                (with-redefs [driver.settings/*allow-testing-h2-connections* true]
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

(deftest ^:parallel log-an-error-if-contains-undefined-setting-test
  (testing "should log an error message if database contains undefined settings"
    (mt/with-temp [:model/Database {db-id :id} {:settings {:undefined-setting true}}]
      (mt/with-log-messages-for-level [messages :error]
        (testing "does not includes undefined keys by default"
          (is (not (contains? (:settings (mt/user-http-request :crowberto :get 200 (str "database/" db-id)))
                              :undefined-setting))))
        (is (= "Error checking the readability of :undefined-setting setting. The setting will be hidden in API response."
               (-> (messages)
                   first
                   :message)))))))

(deftest autocomplete-suggestions-do-not-include-dashboard-cards
  (testing "GET /api/database/:id/card_autocomplete_suggestions"
    (mt/with-temp
      [:model/Dashboard {dash-id :id} {}
       :model/Card {card-id :id} {:dashboard_id dash-id :name "flozzlebarger"}]
      (testing "dashboard cards are excluded"
        (is (= []
               (mt/user-http-request :rasta :get 200
                                     (format "database/%d/card_autocomplete_suggestions" (mt/id))
                                     :query "flozzlebarger"))))
      (testing "dashboard cards can be included if you pass `include_dashboard_questions=true`"
        (is (= 1
               (count
                (mt/user-http-request :rasta :get 200
                                      (format "database/%d/card_autocomplete_suggestions" (mt/id))
                                      :query "flozzlebarger"
                                      :include_dashboard_questions "true")))))
      (testing "sanity check: removing the `dashboard_id` lets us get it"
        (t2/update! :model/Card :id card-id {:dashboard_id nil})
        (is (= 1
               (count
                (mt/user-http-request :rasta :get 200
                                      (format "database/%d/card_autocomplete_suggestions" (mt/id))
                                      :query "flozzlebarger"))))))))

(deftest healthcheck-works
  (testing "GET /api/database/:id/healthcheck"
    (mt/with-temp [:model/Database {id :id} {}]
      (with-redefs [driver/available?   (constantly true)
                    driver/can-connect? (constantly true)]
        (is (= {:status "ok"} (mt/user-http-request :crowberto :get 200 (str "database/" id "/healthcheck"))))))
    (mt/with-temp [:model/Database {id :id} {}]
      (testing "connection throws"
        (with-redefs [driver/available? (constantly true)
                      driver/can-connect? (fn [& _args]
                                            (throw (Exception. "oh no")))]
          (is (= {:status "error"
                  :message "oh no"}
                 (mt/user-http-request :crowberto :get 200 (str "database/" id "/healthcheck"))))))
      (testing "connection just fails, doesn't throw"
        (with-redefs [driver/available? (constantly true)
                      driver/can-connect? (constantly false)]
          (is (= {:status "error"
                  :message "Failed to connect to Database"}
                 (mt/user-http-request :crowberto :get 200 (str "database/" id "/healthcheck")))))))
    (when config/ee-available?
      (testing "connection-type passed and configured"
        (mt/with-premium-features #{:writable-connection}
          (mt/with-temp [:model/Database {id :id} {:details {:host "primary"}
                                                   :write_data_details {:host "write"}}]
            (with-redefs [driver/available? (constantly true)
                          driver/can-connect? (constantly true)]
              (is (= {:status "ok"}
                     (mt/user-http-request :crowberto :get 200 (str "database/" id "/healthcheck?connection-type=write-data")))))))))
    (testing "connection-type passed but not configured returns 400"
      (mt/with-temp [:model/Database {id :id} {:details {:host "primary"}}]
        (with-redefs [driver/available? (constantly true)]
          (is (mt/user-http-request :crowberto :get 400 (str "database/" id "/healthcheck?connection-type=write-data"))))))
    (testing "invalid connection-type value returns 400"
      (mt/with-temp [:model/Database {id :id} {}]
        (is (mt/user-http-request :crowberto :get 400 (str "database/" id "/healthcheck?connection-type=invalid")))))))

(setting/defsetting api-test-missing-premium-feature
  "A feature used for testing /settings-available (1)"
  :type :boolean
  :database-local :only
  :feature :forever-withheld-feature)

(setting/defsetting api-test-missing-driver-feature
  "A feature used for testing /settings-available (2)"
  :type :boolean
  :database-local :only
  ;; Something h2 will never support
  :driver-feature :test/jvm-timezone-setting)

(setting/defsetting api-test-disabled-for-database
  "A feature used for testing /settings-available (3)"
  :type :boolean
  :default false
  :database-local :only
  :enabled-for-db? (constantly false))

(setting/defsetting api-test-disabled-for-custom-reasons
  "A feature used for testing /settings-available (4)"
  :type :boolean
  :database-local :only
  :enabled-for-db? (fn [_]
                     (setting/custom-disabled-reasons! [{:key :custom/one, :type :warning, :message "Because..."}
                                                        {:key :custom/two, :type :warning, :message "Also..."}])))

(setting/defsetting api-test-disabled-for-multiple-reasons
  "A feature used for testing /settings-available (5)"
  :type :boolean
  :database-local :only
  ;; Something h2 will never support
  :driver-feature :test/jvm-timezone-setting
  :enabled-for-db? (fn [_]
                     (setting/custom-disabled-reasons! [{:key :custom/three, :type :error, :message "Never"}])))

(deftest settings-available-test
  (testing "GET /api/database/:id/settings-available"
    (mt/with-premium-features #{:table-data-editing}
      (mt/with-temp [:model/Database {id :id} {:engine :h2}]
        (testing "returns database-local settings with correct business logic"
          (let [settings (:settings (mt/user-http-request :rasta :get 200 (str "database/" id "/settings-available")))]
            (is (= {:unaggregated-query-row-limit
                    {:enabled true}

                    :api-test-missing-driver-feature
                    {:enabled false
                     :reasons [{:key     "driver-feature-missing"
                                :type    "error"
                                :message "The H2 driver does not support the `jvm-timezone-setting` feature"}]}

                    :api-test-disabled-for-database
                    {:enabled false
                     :reasons [{:key     "disabled-for-db"
                                :type    "error"
                                :message "This database does not support this setting"}]}

                    :api-test-disabled-for-custom-reasons
                    {:enabled true
                     :reasons [{:key "custom/one", :type "warning", :message "Because..."}
                               {:key "custom/two", :type "warning", :message "Also..."}]}

                    :api-test-disabled-for-multiple-reasons
                    {:enabled false
                     :reasons [{:key     "driver-feature-missing"
                                :type    "error"
                                :message "The H2 driver does not support the `jvm-timezone-setting` feature"}
                               {:key     "custom/three"
                                :type    "error"
                                :message "Never"}]}}

                   (select-keys settings [:unaggregated-query-row-limit
                                          :api-test-missing-premium-feature
                                          :api-test-missing-driver-feature
                                          :api-test-disabled-for-database
                                          :api-test-disabled-for-custom-reasons
                                          :api-test-disabled-for-multiple-reasons])))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         can-query filter tests                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+
;; Note: can-write-metadata tests are in metabase-enterprise.advanced-permissions.common-test since they require
;; enterprise features (:perms/manage-table-metadata permission)

(deftest list-databases-can-query-filter-test
  (testing "GET /api/database with can-query=true filters to only queryable databases"
    (mt/with-temp [:model/Database {db-1-id :id} {:name "Queryable DB"}
                   :model/Database {db-2-id :id} {:name "Not Queryable DB"}
                   :model/Table    _             {:db_id db-1-id :name "table1" :active true}
                   :model/Table    _             {:db_id db-2-id :name "table2" :active true}
                   :model/PermissionsGroup {pg-id :id :as pg} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id pg-id}]
      (t2/delete! :model/DataPermissions :db_id db-1-id)
      (t2/delete! :model/DataPermissions :db_id db-2-id)
      ;; Grant full permissions to db-1 (queryable)
      (data-perms/set-database-permission! pg db-1-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! pg db-1-id :perms/create-queries :query-builder)
      ;; Grant only view-data to db-2 (not queryable)
      (data-perms/set-database-permission! pg db-2-id :perms/view-data :unrestricted)

      (let [response (->> (mt/user-http-request :rasta :get 200 "database" :can-query true)
                          :data
                          (filter #(#{db-1-id db-2-id} (:id %))))]
        (is (= 1 (count response)))
        (is (= "Queryable DB" (-> response first :name)))))))

(deftest list-schemas-can-query-filter-test
  (testing "GET /api/database/:id/schemas with can-query=true filters to only schemas with queryable tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    t1 {:db_id db-id :schema "queryable_schema" :name "t1" :active true}
                   :model/Table    _ {:db_id db-id :schema "not_queryable_schema" :name "t2" :active true}]
      (mt/with-no-data-perms-for-all-users!
        ;; Grant view-data at database level (required for accessing the endpoint)
        (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
        ;; Grant create-queries only to t1 (queryable)
        (data-perms/set-table-permission! (perms-group/all-users) t1 :perms/create-queries :query-builder)

        (let [response (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id) :can-query true)]
          (is (= ["queryable_schema"] response)))))))

(deftest list-schema-tables-can-query-filter-test
  (testing "GET /api/database/:id/schema/:schema with can-query=true filters to only queryable tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    t1 {:db_id db-id :schema "test_schema" :name "queryable_table" :active true}
                   :model/Table    _ {:db_id db-id :schema "test_schema" :name "not_queryable_table" :active true}]
      (mt/with-no-data-perms-for-all-users!
        ;; Grant view-data at database level (required for accessing the endpoint)
        (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
        ;; Grant create-queries only to t1 (queryable)
        (data-perms/set-table-permission! (perms-group/all-users) t1 :perms/create-queries :query-builder)

        (let [response (mt/user-http-request :rasta :get 200 (format "database/%d/schema/%s" db-id "test_schema") :can-query true)]
          (is (= 1 (count response)))
          (is (= "queryable_table" (-> response first :name))))))))

(deftest list-databases-includes-manage-permissions-test
  (testing "GET /api/database includes databases where user has manage-database permission (details :yes)"
    (mt/with-temp [:model/Database {db-1-id :id} {:name "Query DB"}
                   :model/Database {db-2-id :id} {:name "Manage DB"}
                   :model/Database {db-3-id :id} {:name "No Access DB"}
                   :model/Table    _             {:db_id db-1-id :name "table1" :active true}
                   :model/Table    _             {:db_id db-2-id :name "table2" :active true}
                   :model/Table    _             {:db_id db-3-id :name "table3" :active true}
                   :model/PermissionsGroup {pg-id :id :as pg} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id pg-id}]
      (t2/delete! :model/DataPermissions :db_id db-1-id)
      (t2/delete! :model/DataPermissions :db_id db-2-id)
      (t2/delete! :model/DataPermissions :db_id db-3-id)
      ;; Grant query permissions to db-1 (queryable)
      (data-perms/set-database-permission! pg db-1-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! pg db-1-id :perms/create-queries :query-builder)
      ;; Grant only manage-database (details) permission to db-2 (no query access)
      (data-perms/set-database-permission! pg db-2-id :perms/manage-database :yes)
      ;; No permissions for db-3

      (let [response (->> (mt/user-http-request :rasta :get 200 "database")
                          :data
                          (filter #(#{db-1-id db-2-id db-3-id} (:id %)))
                          (map :name)
                          set)]
        (testing "Both query-accessible and manage-accessible databases should be included"
          (is (contains? response "Query DB"))
          (is (contains? response "Manage DB")))
        (testing "Database with no permissions should not be included"
          (is (not (contains? response "No Access DB"))))))))

;;; ----------------------------------------- write_data_details tests -----------------------------------------

(deftest ^:parallel upsert-sensitive-fields-write-data-details-test
  (testing "upsert-sensitive-fields works with :write_data_details key"
    (is (= {:host "localhost"
            :port 5432
            :password "new-password"}
           (#'api.database/upsert-sensitive-fields
            {:engine :h2
             :id (mt/id)
             :details {:host "localhost" :port 5432 :password "main-pass"}
             :write_data_details {:host "localhost" :port 5432 :password "write-pass"}}
            {:host "localhost"
             :port 5432
             :password "new-password"}
            :write_data_details)))
    (testing "protected passwords are replaced from original"
      (is (= {:host "localhost"
              :port 5432
              :password "write-pass"}
             (#'api.database/upsert-sensitive-fields
              {:engine :h2
               :id (mt/id)
               :details {:host "localhost" :port 5432 :password "main-pass"}
               :write_data_details {:host "localhost" :port 5432 :password "write-pass"}}
              {:host "localhost"
               :port 5432
               :password secret/protected-password}
              :write_data_details))))))

(deftest get-database-write-data-details-test
  (testing "GET /api/database/:id"
    (testing "Superusers see write_data_details with sensitive fields redacted"
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2
                                                  :details {:host "localhost"}
                                                  :write_data_details {:host "write-host"
                                                                       :password "secret-write-pass"}}]
        (let [response (mt/user-http-request :crowberto :get 200 (format "database/%d" db-id))]
          (is (some? (:write_data_details response)))
          (is (= "write-host" (get-in response [:write_data_details :host])))
          (is (= secret/protected-password (get-in response [:write_data_details :password]))))))
    (testing "Regular users do not see write_data_details"
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2
                                                  :details {:host "localhost"}
                                                  :write_data_details {:host "write-host"}}]
        (let [response (mt/user-http-request :rasta :get 200 (format "database/%d" db-id))]
          (is (not (contains? response :write_data_details)))
          (is (not (contains? response :details))))))))

(deftest update-database-write-data-details-test
  (testing "PUT /api/database/:id with write_data_details"
    (testing "Superusers can set write_data_details"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {db-id :id} {:engine :h2
                                                    :details {:host "localhost"}}]
          (with-redefs [driver/can-connect? (constantly true)]
            (let [response (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id)
                                                 {:write_data_details {:host "write-host"
                                                                       :password "write-pass"
                                                                       :write-data-connection true}})]
              (is (= "write-host" (get-in response [:write_data_details :host])))
              (is (= secret/protected-password (get-in response [:write_data_details :password])))
              (let [db (t2/select-one :model/Database :id db-id)]
                (is (= {:host "write-host" :password "write-pass" :write-data-connection true}
                       (:write_data_details db)))))))))
    (testing "Superusers can clear write_data_details by setting it to nil"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {db-id :id} {:engine :h2
                                                    :details {:host "localhost"}
                                                    :write_data_details {:host "write-host"}}]
          (with-redefs [driver/can-connect? (constantly true)]
            (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id)
                                  {:write_data_details nil})
            (let [db (t2/select-one :model/Database :id db-id)]
              (is (nil? (:write_data_details db))))))))
    (testing "Sensitive fields are preserved when protected-password is sent"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {db-id :id} {:engine :h2
                                                    :details {:host "localhost"}
                                                    :write_data_details {:host "write-host"
                                                                         :password "original-pass"}}]
          (with-redefs [driver/can-connect? (constantly true)]
            (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id)
                                  {:write_data_details {:host "new-write-host"
                                                        :password secret/protected-password
                                                        :write-data-connection true}})
            (let [db (t2/select-one :model/Database :id db-id)]
              (is (= "new-write-host" (get-in db [:write_data_details :host])))
              (is (= "original-pass" (get-in db [:write_data_details :password]))))))))
    (testing "Returns 402 without :writable-connection feature"
      (with-redefs [premium-features/has-feature? (constantly false)]
        (mt/with-temp [:model/Database {db-id :id} {:engine :h2
                                                    :details {:host "localhost"}}]
          (mt/user-http-request :crowberto :put 402 (format "database/%d" db-id)
                                {:write_data_details {:host "write-host"}}))))))

(deftest put-validates-write-data-details-connection-test
  (when config/ee-available?
    (testing "PUT /api/database/:id returns 400 when write connection test fails"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {db-id :id} {:engine  :h2
                                                    :details {:host "localhost"}}]
          (with-redefs [driver/can-connect? (fn [_engine details]
                                              (if (:write-data-connection details)
                                                (throw (Exception. "Write connection failed"))
                                                true))]
            (let [response (mt/user-http-request :crowberto :put 400 (format "database/%d" db-id)
                                                 {:write_data_details {:host "totally-bogus-host"
                                                                       :write-data-connection true}})]
              (is (= "Write connection failed" (:message response))))))))))

(deftest write-data-details-guardrails-test
  (testing "PUT /api/database/:id write_data_details guardrails"
    (testing "write-data-connection must not be truthy in details"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {db-id :id} {:engine  :h2
                                                    :details {:host "localhost"}}]
          (is (= "write-data-connection must not be set in details"
                 (mt/user-http-request :crowberto :put 400 (format "database/%d" db-id)
                                       {:details {:host                  "localhost"
                                                  :write-data-connection true}}))))))
    (testing "write-data-connection must be truthy in write_data_details"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {db-id :id} {:engine  :h2
                                                    :details {:host "localhost"}}]
          (is (= "write-data-connection must be set in write_data_details"
                 (mt/user-http-request :crowberto :put 400 (format "database/%d" db-id)
                                       {:write_data_details {:host "write-host"}}))))))
    (testing "Destination-database must be false in write_data_details"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {db-id :id} {:engine  :h2
                                                    :details {:host "localhost"}}]
          (is (= "destination-database must be false in write_data_details"
                 (mt/user-http-request :crowberto :put 400 (format "database/%d" db-id)
                                       {:write_data_details {:host                  "write-host"
                                                             :write-data-connection true
                                                             :destination-database  true}}))))))
    (testing "Fields hidden for write connections must not be in write_data_details"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {db-id :id} {:engine  :h2
                                                    :details {:host "localhost"}}]
          (is (str/includes?
               (mt/user-http-request :crowberto :put 400 (format "database/%d" db-id)
                                     {:write_data_details {:host                  "write-host"
                                                           :write-data-connection true
                                                           :auto_run_queries      true}})
               "write_data_details must not contain fields hidden for write connections")))))
    (testing "Cannot set write_data_details on a destination database"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {router-id :id} {:engine  :h2
                                                        :details {:host "localhost"}}
                       :model/Database {dest-id :id} {:engine             :h2
                                                      :details            {:host "localhost"}
                                                      :router_database_id router-id}]
          (is (= "Cannot configure a write connection on a destination database"
                 (mt/user-http-request :crowberto :put 400 (format "database/%d" dest-id)
                                       {:write_data_details {:host                  "write-host"
                                                             :write-data-connection true}}))))))
    (testing "Cannot set write_data_details on a router database"
      (mt/with-premium-features #{:writable-connection}
        (mt/with-temp [:model/Database {router-id :id} {:engine  :h2
                                                        :details {:host "localhost"}}
                       :model/Database {_dest-id :id} {:engine :h2
                                                       :details {:host "localhost"}
                                                       :router_database_id router-id}]
          (is (= "Cannot configure a write connection on a router database"
                 (mt/user-http-request :crowberto :put 400 (format "database/%d" router-id)
                                       {:write_data_details {:host "write-host"
                                                             :write-data-connection true}}))))))))
