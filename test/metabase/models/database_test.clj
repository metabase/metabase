(ns metabase.models.database-test
  (:require [cheshire.core :refer [decode encode]]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.models :refer [Database Permissions]]
            [metabase.models.database :as database]
            [metabase.models.permissions :as perms]
            [metabase.models.secret :as secret :refer [Secret]]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.user :as user]
            [metabase.server.middleware.session :as mw.session]
            [metabase.task :as task]
            [metabase.task.sync-databases :as task.sync-databases]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db :plugins :test-drivers))

(defn- trigger-for-db [db-id]
  (some (fn [{trigger-key :key, :as trigger}]
          (when (str/ends-with? trigger-key (str \. db-id))
            trigger))
        (:triggers (task/job-info "metabase.task.sync-and-analyze.job"))))

(deftest perms-test
  (testing "After creating a Database, All Users group should get full permissions by default"
    (mt/with-temp Database [db]
      (is (= true
             (perms/set-has-full-permissions? (user/permissions-set (mt/user->id :rasta))
                                              (perms/data-perms-path db))))
      (is (= true
             (perms/set-has-full-permissions? (user/permissions-set (mt/user->id :rasta))
                                              (perms/feature-perms-path :download :full db))))))

  (testing "After deleting a Database, no permissions for the DB should still exist"
    (mt/with-temp Database [{db-id :id}]
      (db/delete! Database :id db-id)
      (is (= [] (db/select Permissions :object [:like (str "%" (perms/data-perms-path db-id) "%")]))))))

(deftest tasks-test
  (testing "Sync tasks should get scheduled for a newly created Database"
    (mt/with-temp-scheduler
      (task/init! ::task.sync-databases/SyncDatabases)
      (mt/with-temp Database [{db-id :id}]
        (is (schema= {:description         (s/eq (format "sync-and-analyze Database %d" db-id))
                      :key                 (s/eq (format "metabase.task.sync-and-analyze.trigger.%d" db-id))
                      :misfire-instruction (s/eq "DO_NOTHING")
                      :state               (s/eq "NORMAL")
                      :may-fire-again?     (s/eq true)
                      :schedule            (s/eq "0 50 * * * ? *")
                      :final-fire-time     (s/eq nil)
                      :data                (s/eq {"db-id" db-id})
                      s/Keyword            s/Any}
                     (trigger-for-db db-id)))

        (testing "When deleting a Database, sync tasks should get removed"
          (db/delete! Database :id db-id)
          (is (= nil
                 (trigger-for-db db-id))))))))

(deftest sensitive-data-redacted-test
  (let [encode-decode (fn [obj] (decode (encode obj)))
        project-id    "random-project-id" ; the actual value here doesn't seem to matter
        ;; this is trimmed for the parts we care about in the test
        pg-db         (database/map->DatabaseInstance
                       {:description nil
                        :name        "testpg"
                        :details     {:additional-options            nil
                                      :ssl                           false
                                      :password                      "Password1234"
                                      :tunnel-host                   "localhost"
                                      :port                          5432
                                      :dbname                        "mydb"
                                      :host                          "localhost"
                                      :tunnel-enabled                true
                                      :tunnel-auth-option            "ssh-key"
                                      :tunnel-port                   22
                                      :tunnel-private-key            "PRIVATE KEY IS HERE"
                                      :user                          "metabase"
                                      :tunnel-user                   "a-tunnel-user"
                                      :tunnel-private-key-passphrase "Password1234"}
                        :id          3})
        bq-db         (database/map->DatabaseInstance
                       {:description nil
                        :name        "testbq"
                        :details     {:use-service-account  nil
                                      :dataset-id           "office_checkins"
                                      :service-account-json "SERVICE-ACCOUNT-JSON-HERE"
                                      :use-jvm-timezone     false
                                      :project-id           project-id}
                        :id          2
                        :engine      :bigquery-cloud-sdk})]
    (testing "sensitive fields are redacted when database details are encoded"
      (testing "details removed for non-admin users"
        (mw.session/with-current-user
          (mt/user->id :rasta)
          (is (= {"description" nil
                  "name"        "testpg"
                  "id"          3}
                 (encode-decode pg-db)))
          (is (= {"description" nil
                  "name"        "testbq"
                  "id"          2
                  "engine"      "bigquery-cloud-sdk"}
                 (encode-decode bq-db)))))

      (testing "details are obfuscated for admin users"
        (mw.session/with-current-user
          (mt/user->id :crowberto)
          (is (= {"description" nil
                  "name"        "testpg"
                  "details"     {"tunnel-user"                   "a-tunnel-user"
                                 "dbname"                        "mydb"
                                 "host"                          "localhost"
                                 "tunnel-auth-option"            "ssh-key"
                                 "tunnel-private-key-passphrase" "**MetabasePass**"
                                 "additional-options"            nil
                                 "tunnel-port"                   22
                                 "user"                          "metabase"
                                 "tunnel-private-key"            "**MetabasePass**"
                                 "ssl"                           false
                                 "tunnel-enabled"                true
                                 "port"                          5432
                                 "password"                      "**MetabasePass**"
                                 "tunnel-host"                   "localhost"}
                  "id"          3}
                 (encode-decode pg-db)))
          (is (= {"description" nil
                  "name"        "testbq"
                  "details"     {"use-service-account"  nil
                                 "dataset-id"           "office_checkins"
                                 "service-account-json" "**MetabasePass**"
                                 "use-jvm-timezone"     false
                                 "project-id"           project-id}
                  "id"          2
                  "engine"      "bigquery-cloud-sdk"}
                 (encode-decode bq-db))))))))

;; register a dummy "driver" for the sole purpose of running sensitive-fields-test
(driver/register! :test-sensitive-driver, :parent #{:h2})

;; define a couple custom connection properties for this driver, one of which has :type :password
(defmethod driver/connection-properties :test-sensitive-driver
  [_]
  [{:name         "custom-field-1"
    :display-name "Custom Field 1"
    :placeholder  "Not particularly secret field"
    :type         :string
    :required     true}
   {:name         "custom-field-2-secret"
    :display-name "Custom Field 2"
    :placeholder  "Has some secret stuff in it"
    :type         :password
    :required     true}])

(deftest sensitive-fields-test
  (testing "get-sensitive-fields returns the custom :password type field in addition to all default ones"
    (is (= (conj driver.u/default-sensitive-fields :custom-field-2-secret)
           (driver.u/sensitive-fields :test-sensitive-driver))))
  (testing "get-sensitive-fields-for-db returns default fields for null or empty database map"
    (is (= driver.u/default-sensitive-fields
           (database/sensitive-fields-for-db nil)))
    (is (= driver.u/default-sensitive-fields
           (database/sensitive-fields-for-db {})))))

(deftest secret-db-details-integration-test
  (testing "manipulating secret values in db-details works correctly"
    (mt/with-driver :secret-test-driver
      (binding [api/*current-user-id* (mt/user->id :crowberto)]
        (let [secret-ids  (atom #{}) ; keep track of all secret IDs created with the temp database
              check-db-fn (fn [{:keys [details] :as _database} exp-secret]
                            (when (not= :file-path (:source exp-secret))
                              (is (not (contains? details :password-value))
                                  "password-value was removed from details when not a file-path"))
                            (is (some? (:password-created-at details)) "password-created-at was populated in details")
                            (is (= (mt/user->id :crowberto) (:password-creator-id details))
                                "password-creator-id was populated in details")
                            (is (= (some-> (:source exp-secret) name)
                                   (:password-source details))
                                "password-source matches the value from the secret")
                            (is (contains? details :password-id) "password-id was added to details")
                            (let [secret-id                                  (:password-id details)
                                  {:keys [created_at updated_at] :as secret} (secret/latest-for-id secret-id)]
                              (swap! secret-ids conj secret-id)
                              (is (some? secret) "Loaded Secret instance by ID")
                              (is (some? created_at) "created_at populated for the secret instance")
                              (is (some? updated_at) "updated_at populated for the secret instance")
                              (doseq [[exp-key exp-val] exp-secret]
                                (testing (format "%s=%s in secret" exp-key exp-val)
                                  (is (= exp-val (cond-> (exp-key secret)
                                                   (string? exp-val)
                                                   (String.)

                                                   :else
                                                   identity)))))))]
          (testing "values for referenced secret IDs are resolved in a new DB"
            (mt/with-temp Database [{:keys [id details] :as database} {:engine  :secret-test-driver
                                                                       :name    "Test DB with secrets"
                                                                       :details {:host           "localhost"
                                                                                 :password-value "new-password"}}]
              (testing " and saved db-details looks correct"
                (check-db-fn database {:kind    :password
                                       :source  nil
                                       :version 1
                                       :value   "new-password"})
                (testing " updating the value works as expected"
                  (db/update! Database id :details (assoc details :password-path  "/path/to/my/password-file"))
                  (check-db-fn (Database id) {:kind    :password
                                              :source  :file-path
                                              :version 2
                                              :value   "/path/to/my/password-file"}))))
            (testing "Secret instances are deleted from the app DB when the DatabaseInstance is deleted"
              (is (seq @secret-ids) "At least one Secret instance should have been created")
              (doseq [secret-id @secret-ids]
                (testing (format "Secret ID %d should have been deleted after the Database was" secret-id)
                  (is (nil? (db/select-one Secret :id secret-id))
                      (format "Secret ID %d was not removed from the app DB" secret-id)))))))))))

(deftest user-may-not-update-sample-database-test
  (mt/with-temp Database [{:keys [id] :as _sample-database} {:engine    :h2
                                                             :is_sample true
                                                             :name      "Sample Database"
                                                             :details   {:db "./resources/sample-database.db;USER=GUEST;PASSWORD=guest"}}]
    (testing " updating the engine of a sample database is not allowed"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"The engine on a sample database cannot be changed."
           (db/update! Database id :engine :sqlite))))
    (testing " updating other attributes of a sample database is allowed"
      (db/update! Database id :name "My New Name")
      (is (= "My New Name" (db/select-one-field :name Database :id id))))))

(driver/register! ::test, :abstract? true)

(deftest preserve-driver-namespaces-test
  (testing "Make sure databases preserve namespaced driver names"
    (mt/with-temp Database [{db-id :id} {:engine (u/qualified-name ::test)}]
      (is (= ::test
             (db/select-one-field :engine Database :id db-id))))))

(deftest identity-hash-test
  (testing "Database hashes are composed of the name and engine"
    (mt/with-temp Database [db {:engine :mysql :name "hashmysql"}]
      (is (= (Integer/toHexString (hash ["hashmysql" :mysql]))
             (serdes.hash/identity-hash db)))
      (is (= "b6f1a9e8"
             (serdes.hash/identity-hash db))))))
