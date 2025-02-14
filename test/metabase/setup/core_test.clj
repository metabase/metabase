(ns metabase.setup.core-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.driver :as driver]
   [metabase.models.interface :as mi]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.setup.core :as setup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest has-user-setup-ignores-internal-user-test
  (mt/with-empty-h2-app-db
    (is (t2/exists? :model/User :id config/internal-mb-user-id)
        "Sense check the internal user exists")
    (testing "`has-user-setup` should return false for an empty instance with only an internal user"
      (is (false? (setup/has-user-setup))))
    (testing "`has-user-setup` should return true as soon as a user is created"
      (mt/with-temp [:model/User _ {}]
        (is (true? (setup/has-user-setup)))))))

(deftest has-user-setup-cached-test
  (testing "The has-user-setup getter should cache truthy results since it can never become falsey"
    ;; make sure some test users are created.
    (mt/initialize-if-needed! :test-users)
    (t2/with-call-count [call-count]
      ;; call has-user-setup several times.
      (dotimes [_ 5]
        (is (= true
               (setup/has-user-setup))))
      ;; `has-user-setup` should have done at most one application database call, as opposed to one call per call to
      ;; the getter
      (is (contains? #{0 1} (call-count)))))
  (testing "Return falsey for an empty instance. Values should be cached for current app DB to support swapping in tests/REPL"
    ;; create a new completely empty database.
    (mt/with-temp-empty-app-db [_conn :h2]
      ;; make sure the DB is setup (e.g., run all the Liquibase migrations)
      (mdb/setup-db! :create-sample-content? true)
      (t2/with-call-count [call-count]
        (dotimes [_ 5]
          (is (= false
                 (setup/has-user-setup))))
        (testing "Should continue doing new DB calls as long as there is no User"
          (is (<= (call-count)
                  10)))))) ;; in dev/test we check settings for an override
  (testing "Switch back to the 'normal' app DB; value should still be cached for it"
    (t2/with-call-count [call-count]
      (is (= true
             (setup/has-user-setup)))
      (is (zero? (call-count))))))

(deftest has-example-dashboard-id-setting-test
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? true)
    (testing "The example-dashboard-id setting should be set if the example content is loaded"
      (is (= 1
             (public-settings/example-dashboard-id)))))
  (testing "The example-dashboard-id setting should be nil if the example content isn't loaded"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (is (nil? (public-settings/example-dashboard-id)))))
  (testing "The example-dashboard-id setting should be reset to nil if the example dashboard is archived"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? true)
      (is (= 1
             (public-settings/example-dashboard-id)))
      (t2/update! :model/Dashboard 1 {:archived true})
      (is (nil? (public-settings/example-dashboard-id))))))

(deftest sample-content-permissions-test
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? true)
    (let [dashboard  (t2/select-one :model/Dashboard :creator_id config/internal-mb-user-id)
          collection (t2/select-one :model/Collection (:collection_id dashboard))
          card       (t2/select-one :model/Card :creator_id config/internal-mb-user-id)]
      (testing "Rasta (as a member of 'All Users') should have sufficient privileges to edit the example content"
        (mt/with-current-user (mt/user->id :rasta)
          (is (true? (mi/can-write? dashboard)))
          (is (true? (mi/can-write? card)))
          (is (true? (mi/can-write? collection))))))
    (let [sample-db       (t2/select-one :model/Database :is_sample true)
          sample-db-table (t2/select-one :model/Table :db_id (:id sample-db))
          sample-db-field (t2/select-one :model/Field :table_id (:id sample-db-table))]
      (testing "Rasta (as a member of 'All Users') should have read but not write privileges to the sample database"
        (mt/with-current-user (mt/user->id :rasta)
          (is (true? (mi/can-read? sample-db)))
          (is (true? (mi/can-read? sample-db-table)))
          (is (true? (mi/can-read? sample-db-field)))
          (is (false? (mi/can-write? sample-db)))
          (is (false? (mi/can-write? sample-db-table)))
          (is (false? (mi/can-write? sample-db-field)))))
      (testing "Crowberto (as an admin member of 'All Users') should have write privileges to the sample database"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (true? (mi/can-write? sample-db)))
          (is (true? (mi/can-write? sample-db-table)))
          (is (true? (mi/can-write? sample-db-field))))))))

(deftest encryption-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (testing "Database can start with no encryption"
      (encryption-test/with-secret-key nil
        (mt/with-temp-empty-app-db [_conn driver/*driver*]
          (mdb/setup-db! :create-sample-content? true)
          (let [cache-backend (i/cache-backend :db)]
            (i/save-results! cache-backend (codecs/to-bytes "cache-key") (codecs/to-bytes "cache-value"))
            (is (= "unencrypted" (t2/select-one-fn :value "setting" :key "encryption-check")))
            (is (not (encryption/possibly-encrypted-string? (t2/select-one-fn :details "metabase_database"))))
            (is (= 1 (t2/count :model/QueryCache)))

            (testing "Adding encryption encrypts database on restart"
              (encryption-test/with-secret-key "key1"
                (reset! (:status mdb.connection/*application-db*) ::setup-finished)
                (mdb/setup-db! :create-sample-content? false)
                (is (encryption/possibly-encrypted-string? (:value (t2/select-one "setting" :key "encryption-check"))))
                (is (encryption/possibly-encrypted-string? (:details (t2/select-one "metabase_database"))))
                (testing "Cache is cleared on encryption"
                  (is (= 0 (t2/count :model/QueryCache))))))))))
    (testing "Database created with encryption configured is encrypted"
      (encryption-test/with-secret-key "key2"
        (mt/with-temp-empty-app-db [_conn driver/*driver*]
          (mdb/setup-db! :create-sample-content? true)
          (is (encryption/possibly-encrypted-string? (t2/select-one-fn :value "setting" :key "encryption-check")))
          (is (encryption/possibly-encrypted-string? (t2/select-one-fn :details "metabase_database")))
          (testing "Re-running server works"
            (reset! (:status mdb.connection/*application-db*) ::setup-finished)
            (mdb/setup-db! :create-sample-content? false)
            (is (encryption/possibly-encrypted-string? (:value (t2/select-one "setting" :key "encryption-check")))))
          (testing "Different encryption key throws an error"
            (encryption-test/with-secret-key "different-key"
              (reset! (:status mdb.connection/*application-db*) ::setup-finished)
              (is (thrown-with-msg? Exception #"Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains" (mdb/setup-db! :create-sample-content? false)))
              (let [setting-value (:value (t2/select-one "setting" :key "site-uuid-for-version-info-fetching"))] ; need to select directly from "settings" to avoid auto-decryption
                (is (not (string/valid-uuid? setting-value)))))))))))
