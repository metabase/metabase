(ns ^:mb/driver-tests metabase.models.database-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models.database :as database]
   [metabase.models.interface :as mi]
   [metabase.models.secret :as secret]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor.store :as qp.store]
   [metabase.request.core :as request]
   [metabase.task :as task]
   [metabase.task.sync-databases :as task.sync-databases]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :plugins :test-drivers))

(defn- trigger-for-db [db-id]
  (some (fn [{trigger-key :key, :as trigger}]
          (when (str/ends-with? trigger-key (str \. db-id))
            trigger))
        (:triggers (task/job-info "metabase.task.sync-and-analyze.job"))))

(deftest cleanup-permissions-after-delete-db-test
  (mt/with-temp [:model/Database {db-id :id} {}]
    (is (true? (t2/exists? :model/DataPermissions :db_id db-id)))
    (t2/delete! :model/Database db-id)
    (testing "All permissions are deleted when we delete the database"
      (is (false? (t2/exists? :model/DataPermissions :db_id db-id))))))

(deftest tasks-test
  (testing "Sync tasks should get scheduled for a newly created Database"
    (mt/with-temp-scheduler!
      (task/init! ::task.sync-databases/SyncDatabases)
      (mt/with-temp [:model/Database {db-id :id}]
        (is (=? {:description         (format "sync-and-analyze Database %d" db-id)
                 :key                 (format "metabase.task.sync-and-analyze.trigger.%d" db-id)
                 :misfire-instruction "DO_NOTHING"
                 :may-fire-again?     true
                 :schedule            (mt/malli=? some?)
                 :final-fire-time     nil
                 :data                {"db-id" db-id}}
                (trigger-for-db db-id)))

        (testing "When deleting a Database, sync tasks should get removed"
          (t2/delete! :model/Database :id db-id)
          (is (= nil
                 (trigger-for-db db-id))))))))

(deftest can-read-database-setting-test
  (let [encode-decode (comp json/decode json/encode)
        pg-db         (mi/instance
                       :model/Database
                       {:description nil
                        :name        "testpg"
                        :details     {}
                        :settings    {:database-enable-actions          true   ; visibility: :public
                                      :unaggregated-query-row-limit 2000}  ; visibility: :authenticated
                        :id          3})]
    (testing "authenticated users should see settings with authenticated visibility"
      (request/with-current-user
        (mt/user->id :rasta)
        (is (= {"description" nil
                "name"        "testpg"
                "settings"    {"database-enable-actions"          true
                               "unaggregated-query-row-limit" 2000}
                "id"          3}
               (encode-decode pg-db)))))
    (testing "non-authenticated users shouldn't see settings with authenticated visibility"
      (request/with-current-user nil
        (is (= {"description" nil
                "name"        "testpg"
                "settings"    {"database-enable-actions" true}
                "id"          3}
               (encode-decode pg-db)))))))

(deftest driver-supports-actions-and-database-enable-actions-test
  (mt/test-drivers #{:sqlite}
    (testing "Updating database-enable-actions to true should fail if the engine doesn't support actions"
      (mt/with-temp [:model/Database database {:engine :sqlite}]
        (is (= false (driver.u/supports? :sqlite :actions database)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"The database does not support actions."
             (t2/update! :model/Database (:id database) {:settings {:database-enable-actions true}})))))
    (testing "Updating the engine when database-enable-actions is true should fail if the engine doesn't support actions"
      (mt/with-temp [:model/Database database {:engine :h2 :settings {:database-enable-actions true}}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"The database does not support actions."
             (t2/update! :model/Database (:id database) {:engine :sqlite})))))))

(deftest ^:parallel sensitive-data-redacted-test
  (let [encode-decode (comp json/decode json/encode)
        project-id    "random-project-id" ; the actual value here doesn't seem to matter
        ;; this is trimmed for the parts we care about in the test
        pg-db         (mi/instance
                       :model/Database
                       {:description nil
                        :name        "testpg"
                        :engine      :postgres
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
                        :settings    {:database-enable-actions true}
                        :id          3})
        bq-db         (mi/instance
                       :model/Database
                       {:description nil
                        :name        "testbq"
                        :details     {:use-service-account  nil
                                      :dataset-id           "office_checkins"
                                      :service-account-json "SERVICE-ACCOUNT-JSON-HERE"
                                      :use-jvm-timezone     false
                                      :project-id           project-id}
                        :settings    {:database-enable-actions true}
                        :id          2
                        :engine      :bigquery-cloud-sdk})]
    (testing "sensitive fields are redacted when database details are encoded"
      (testing "details removed for non-admin users"
        (request/with-current-user
          (mt/user->id :rasta)
          (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider {:database pg-db})
            (is (= {"description" nil
                    "name"        "testpg"
                    "engine"      "postgres"
                    "settings"    {"database-enable-actions" true}
                    "id"          3}
                   (encode-decode pg-db))))
          (is (= {"description" nil
                  "name"        "testbq"
                  "id"          2
                  "engine"      "bigquery-cloud-sdk"
                  "settings"    {"database-enable-actions" true}}
                 (encode-decode bq-db)))))

      (testing "details are obfuscated for admin users"
        (request/with-current-user
          (mt/user->id :crowberto)
          (is (= {"description" nil
                  "name"        "testpg"
                  "engine"      "postgres"
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
                  "settings"    {"database-enable-actions" true}
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
                  "settings"    {"database-enable-actions" true}
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

(defmethod driver/can-connect? :secret-test-driver [& _args] true)

(deftest secrets-in-details-test
  (mt/with-driver :secret-test-driver
    (testing "Existing Secret id and value does not leak"
      (mt/with-temp [:model/Secret {secret-id :id} {:name "secret-name" :kind "secret-kind" :value "secret"}]
        (let [json-details (json/encode {:keystore-value "secret" :host "localhost" :keystore-id secret-id})
              database-table (t2/table-name :model/Database)]
          (mt/with-temp [database-table {db-id :id} {:engine "secret-test-driver"
                                                     :name "Secret Test"
                                                     :created_at (t/instant)
                                                     :updated_at (t/instant)
                                                     :details json-details}]
            (is (= json-details (t2/select-one-fn :details database-table db-id)))
            (is (= {:host "localhost" :keystore-id secret-id} (t2/select-one-fn :details :model/Database db-id)))
            (is (= {:host "localhost" :keystore-id secret-id :keystore-options "uploaded" :keystore-value secret/protected-password}
                   (:details (mt/user-http-request :crowberto :get 200 (format "database/%d" db-id))))
                "API request")))))
    (testing "Existing value no secret id does not leak"
      (let [json-details (json/encode {:keystore-value "secret" :host "localhost"})
            database-table (t2/table-name :model/Database)]
        (mt/with-temp [database-table {db-id :id} {:engine "secret-test-driver"
                                                   :name "Secret Test"
                                                   :created_at (t/instant)
                                                   :updated_at (t/instant)
                                                   :details json-details}]
          (is (= json-details (t2/select-one-fn :details database-table db-id)))
          (is (= {:host "localhost"} (t2/select-one-fn :details :model/Database db-id)))
          (is (= {:host "localhost"}
                 (:details (mt/user-http-request :crowberto :get 200 (format "database/%d" db-id))))
              "API request"))))))

(deftest secret-value-will-not-save-in-details-test
  (mt/with-temp [:model/Database db {:engine "secret-test-driver"
                                     :name "Secret Test"
                                     :details {:keystore-value "secret"}}]
    (let [db-id (:id db)
          secret-id (get-in db [:details :keystore-id])
          expected {:keystore-id secret-id}]
      (is (= expected (t2/select-one-fn (comp json/decode+kw :details) (t2/table-name :model/Database) db-id)))
      (is (=? {:value (u/string-to-bytes "secret") :source :uploaded :version 1}
              (secret/latest-for-id secret-id)))

      (t2/update! :model/Database db-id {:details {:keystore-path "secret-path"}})
      (is (= expected (t2/select-one-fn (comp json/decode+kw :details) (t2/table-name :model/Database) db-id)))
      (is (=? {:value (u/string-to-bytes "secret-path") :source :file-path :version 2}
              (secret/latest-for-id secret-id)))

      (t2/update! :model/Database db-id {:details {:keystore-path "ignore-path" :keystore-value "prefer-value"}})
      (is (= expected (t2/select-one-fn (comp json/decode+kw :details) (t2/table-name :model/Database) db-id)))
      (is (=? {:value (u/string-to-bytes "prefer-value") :source :uploaded :version 3}
              (secret/latest-for-id secret-id)))

      (t2/update! :model/Database db-id {:details {:keystore-options "local"
                                                   :keystore-path "prefer-path"
                                                   :keystore-value "ignore-value"}})
      (is (= expected (t2/select-one-fn (comp json/decode+kw :details) (t2/table-name :model/Database) db-id)))
      (is (=? {:value (u/string-to-bytes "prefer-path") :source :file-path :version 4}
              (secret/latest-for-id secret-id)))

      (t2/update! :model/Database db-id {:details {:keystore-value nil}})
      (is (= {} (t2/select-one-fn (comp json/decode+kw :details) (t2/table-name :model/Database) db-id)))
      (is (=? nil
              (secret/latest-for-id secret-id))))))

(deftest secret-db-test-changes
  (mt/with-driver :secret-test-driver
    (let [original-details {:host "localhost"}
          ;; Operate on the table to ensure handling of secrets in the model does not come into play
          db-table (t2/table-name :model/Database)
          host-and-keystore-id [:map {:closed true}
                                [:keystore-id :int]
                                [:host [:enum "localhost"]]]
          expected-path-response (conj host-and-keystore-id
                                       [:keystore-path [:enum "local.key"]]
                                       [:keystore-options [:enum "local"]])
          secret-key (u/encode-base64 "secret")]
      (mt/with-temp [db-table {db-id :id} {:engine (name :secret-test-driver)
                                           :name "Secret Test"
                                           :created_at (t/instant)
                                           :updated_at (t/instant)
                                           :details (json/encode original-details)}]

        (testing "Initially setting secret value"
          (is (=? (=?/malli expected-path-response)
                  (:details (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id)
                                                  {:details (assoc original-details
                                                                   :keystore-path "local.key"
                                                                   :keystore-options "local")}))))
          (is (=? (=?/malli host-and-keystore-id)
                  (json/decode (:details (t2/select-one db-table db-id)) keyword))
              "Database value")

          (is (=? (=?/malli expected-path-response)
                  (:details (mt/user-http-request :crowberto :get 200 (format "database/%d" db-id))))
              "API request"))

        (testing "Change secret value from local path to uploaded"
          (is (=? (=?/malli (conj host-and-keystore-id
                                  ;; The secret gets passed back on the put for the ui
                                  [:keystore-value [:enum secret-key]]
                                  [:keystore-options [:enum "uploaded"]]))
                  (:details (mt/user-http-request :crowberto :put 200 (format "database/%d" db-id)
                                                  {:details (assoc original-details
                                                                   :keystore-value secret-key
                                                                   :keystore-options "uploaded")}))))

          (is (=? (=?/malli host-and-keystore-id)
                  (json/decode (:details (t2/select-one db-table db-id)) keyword))
              "Database value")

          (is (=? (=?/malli (conj host-and-keystore-id
                                  [:keystore-value [:enum secret/protected-password]]
                                  [:keystore-options [:enum "uploaded"]]))
                  (:details (mt/user-http-request :crowberto :get 200 (format "database/%d" db-id))))
              "API request"))))))

(deftest secret-redaction-to-json-test
  (let [base-details {:host "localhost"}
        expected-uploaded {:keystore-value secret/protected-password
                           :keystore-options "uploaded"}
        expected-path {:keystore-path "stored-secret-path"
                       :keystore-options "local"}
        incoming-value {:keystore-value "incoming-secret-value"}
        incoming-path {:keystore-path "incoming-secret-path"}]
    (mt/with-temp [:model/Secret {uploaded-secret :id} {:name "secret" :value "stored-secret-value" :kind "s" :source "uploaded"}
                   :model/Secret {path-secret :id} {:name "secret" :value "stored-secret-path" :kind "s" :source "file-path"}
                   :model/Secret {other-secret :id} {:name "secret" :value "stored-secret-something" :kind "s" :source "something"}
                   :model/Secret {nil-source-secret :id} {:name "secret" :value "sotred-secret-nil-source" :kind "s"}
                   :model/Database db {:engine (name :secret-test-driver)
                                       :name "Secret Test"
                                       :details base-details}]
      (mt/with-current-user (mt/user->id :crowberto)
        #_{:clj-kondo/ignore [:redundant-nested-call]}
        (are [expected extra-details] (= (merge
                                          base-details
                                          expected)
                                         (-> db
                                             (update :details merge extra-details)
                                             json/encode
                                             json/decode+kw
                                             :details))
          ;; Incoming values gets passed back, as is
          incoming-value
          incoming-value

          incoming-path
          incoming-path

          (merge incoming-path incoming-value)
          (merge incoming-path incoming-value)

          ;; We should pass incoming back as is even if it has a keystore-id
          (merge incoming-path {:keystore-id path-secret})
          (merge incoming-path {:keystore-id path-secret})

          ;; We should pass incoming back as is even if it has a keystore-id
          (merge incoming-value {:keystore-id uploaded-secret})
          (merge incoming-value {:keystore-id uploaded-secret})

          ;; If there's only a keystore-id then we should do a lookup and fill in with redacted secrets
          (assoc expected-uploaded :keystore-id uploaded-secret)
          {:keystore-id uploaded-secret}

          (assoc expected-path :keystore-id path-secret)
          {:keystore-id path-secret}

          (assoc expected-uploaded :keystore-id other-secret)
          {:keystore-id other-secret}

          (assoc expected-uploaded :keystore-id nil-source-secret)
          {:keystore-id nil-source-secret})))))

(deftest secret-db-details-integration-test
  (testing "manipulating secret values in db-details works correctly"
    (mt/with-driver :secret-test-driver
      (binding [api/*current-user-id* (mt/user->id :crowberto)]
        (let [secret-ids  (atom #{})    ; keep track of all secret IDs created with the temp database
              check-db-fn (fn [{:keys [details] :as _database} exp-secret]
                            (is (not (contains? details :password-value))
                                "password-value is always removed")
                            (is (contains? details :password-id) "password-id was added to details")
                            (let [secret-id                                  (:password-id details)
                                  {:keys [created_at updated_at] :as secret} (secret/latest-for-id secret-id)]
                              (swap! secret-ids conj secret-id)
                              (is (some? secret) "Loaded Secret instance by ID")
                              (is (some? created_at) "created_at populated for the secret instance")
                              (is (some? updated_at) "updated_at populated for the secret instance")
                              (doseq [[exp-key exp-val] exp-secret]
                                (testing (format "%s=%s in secret" exp-key exp-val)
                                  (let [v (exp-key secret)
                                        v (if (and (string? exp-val)
                                                   (bytes? v))
                                            (String. ^bytes v "UTF-8")
                                            v)]
                                    (is (= exp-val
                                           v)))))))]
          (testing "values for referenced secret IDs are resolved in a new DB"
            (mt/with-temp [:model/Database {:keys [id details] :as database} {:engine  :secret-test-driver
                                                                              :name    "Test DB with secrets"
                                                                              :details {:host           "localhost"
                                                                                        :password-value "new-password"}}]
              (testing " and saved db-details looks correct"
                (check-db-fn database {:kind    :password
                                       :source  :uploaded
                                       :version 1
                                       :value   "new-password"})
                (testing " updating the value works as expected"
                  (t2/update! :model/Database id {:details (assoc details :password-path "/path/to/my/password-file")})
                  (check-db-fn (t2/select-one :model/Database :id id) {:kind    :password
                                                                       :source  :file-path
                                                                       :version 2
                                                                       :value   "/path/to/my/password-file"}))))
            (testing "Secret instances are deleted from the app DB when the DatabaseInstance is deleted"
              (is (seq @secret-ids) "At least one Secret instance should have been created")
              (doseq [secret-id @secret-ids]
                (testing (format "Secret ID %d should have been deleted after the Database was" secret-id)
                  (is (nil? (t2/select-one :model/Secret :id secret-id))
                      (format "Secret ID %d was not removed from the app DB" secret-id)))))))))))

(deftest user-may-not-update-sample-database-test
  (mt/with-temp [:model/Database {:keys [id] :as _sample-database} {:engine    :h2
                                                                    :is_sample true
                                                                    :name      "Sample Database"
                                                                    :details   {:db "./resources/sample-database.db;USER=GUEST;PASSWORD=guest"}}]
    (testing " updating the engine of a sample database is not allowed"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"The engine on a sample database cannot be changed."
           (t2/update! :model/Database id {:engine :sqlite}))))
    (testing " updating other attributes of a sample database is allowed"
      (t2/update! :model/Database id {:name "My New Name"})
      (is (= "My New Name" (t2/select-one-fn :name :model/Database :id id))))))

(driver/register! ::test, :abstract? true)

(deftest preserve-driver-namespaces-test
  (testing "Make sure databases preserve namespaced driver names"
    (mt/with-temp [:model/Database {db-id :id} {:engine (u/qualified-name ::test)}]
      (is (= ::test
             (t2/select-one-fn :engine :model/Database :id db-id))))))

(deftest identity-hash-test
  (testing "Database hashes are composed of the name and engine"
    (mt/with-temp [:model/Database db {:engine :mysql :name "hashmysql"}]
      (is (= (Integer/toHexString (hash ["hashmysql" :mysql]))
             (serdes/identity-hash db)))
      (is (= "b6f1a9e8"
             (serdes/identity-hash db))))))

(deftest create-database-with-null-details-test
  (testing "Details should get a default value of {} if unspecified"
    (mt/with-model-cleanup [:model/Database]
      (let [db (first (t2/insert-returning-instances! :model/Database (dissoc (mt/with-temp-defaults :model/Database) :details)))]
        (is (partial= {:details {}}
                      db))))))

(deftest ^:parallel after-select-driver-features-realize-db-row-test
  ;; This test is necessary because driver multimethods should be able to assume that the db argument is a Database
  ;; instance, not a transient row. Otherwise a call like `(mi/instance-of :model/Database db)` will return false
  ;; when it should return true.
  (testing "Make sure selecting a database calls `driver/database-supports?` with a database instance"
    (mt/with-temp [:model/Database {db-id :id} {:engine (u/qualified-name ::test)}]
      (mt/with-dynamic-fn-redefs [driver.u/supports? (fn [_ _ db]
                                                       (is (true? (mi/instance-of? :model/Database db))))]
        (is (some? (t2/select-one-fn :features :model/Database :id db-id)))))))

(deftest hydrate-tables-test
  (is (= ["CATEGORIES"
          "CHECKINS"
          "ORDERS"
          "PEOPLE"
          "PRODUCTS"
          "REVIEWS"
          "USERS"
          "VENUES"]
         (-> (mt/db)
             (t2/hydrate :tables)
             :tables
             (#(map :name %))))))
