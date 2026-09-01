(ns metabase.setup.core-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.appearance.core :as appearance]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.models.interface :as mi]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.settings.models.setting :as setting]
   [metabase.setup.core :as setup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest has-user-setup-ignores-internal-user-test
  (mt/with-empty-h2-app-db!
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
        (is (true?
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
      (is (true?
           (setup/has-user-setup)))
      (is (zero? (call-count))))))

(deftest has-example-dashboard-id-setting-test
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? true)
    (testing "The example-dashboard-id setting should be set if the example content is loaded"
      (is (= 1
             (appearance/example-dashboard-id)))))
  (testing "The example-dashboard-id setting should be nil if the example content isn't loaded"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (is (nil? (appearance/example-dashboard-id)))))
  (testing "The example-dashboard-id setting should be reset to nil if the example dashboard is archived"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? true)
      (is (= 1
             (appearance/example-dashboard-id)))
      (t2/update! :model/Dashboard 1 {:archived true})
      (is (nil? (appearance/example-dashboard-id))))))

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
            ;; the v53 migration's legacy plaintext marker; new code never writes it and reads it as "no sentinel"
            (is (= "unencrypted" (t2/select-one-fn :value "setting" :key "encryption-check")))
            (is (not (encryption/possibly-encrypted-string? (t2/select-one-fn :details "metabase_database"))))
            (is (= 1 (t2/count :model/QueryCache)))
            (testing "Adding a key to an existing instance refuses to start rather than encrypting on its own"
              (encryption-test/with-secret-key "key1"
                (reset! (:status mdb.connection/*application-db*) ::setup-finished)
                (is (thrown-with-msg? Exception #"already contains data.*run `enable-encryption`"
                                      (mdb/setup-db! :create-sample-content? false)))
                (is (= "unencrypted" (t2/select-one-fn :value "setting" :key "encryption-check")))
                (is (not (encryption/possibly-encrypted-string? (t2/select-one-fn :details "metabase_database"))))
                (is (= 1 (t2/count :model/QueryCache)))
                (testing "after `enable-encryption` the database is encrypted and starts"
                  (mdb/encrypt-db driver/*driver* (mdb/data-source) nil)
                  (is (encryption/decryptable-string? (:value (t2/select-one "setting" :key "encryption-check"))))
                  (is (encryption/decryptable-string? (:details (t2/select-one "metabase_database"))))
                  (testing "Cache is cleared on encryption"
                    (is (= 0 (t2/count :model/QueryCache))))
                  (reset! (:status mdb.connection/*application-db*) ::setup-finished)
                  (is (= :done (mdb/setup-db! :create-sample-content? false))))))))))
    (testing "Database created with encryption configured is encrypted"
      (encryption-test/with-secret-key "key2"
        (mt/with-temp-empty-app-db [_conn driver/*driver*]
          (mdb/setup-db! :create-sample-content? true)
          (is (encryption/decryptable-string? (t2/select-one-fn :value "setting" :key "encryption-check")))
          (is (encryption/decryptable-string? (t2/select-one-fn :details "metabase_database")))
          (testing "Re-running server works"
            (reset! (:status mdb.connection/*application-db*) ::setup-finished)
            (mdb/setup-db! :create-sample-content? false)
            (is (encryption/decryptable-string? (:value (t2/select-one "setting" :key "encryption-check")))))
          (testing "A missing sentinel on a database whose content decrypts with the key is written back on startup"
            (t2/delete! :setting :key "encryption-check")
            (reset! (:status mdb.connection/*application-db*) ::setup-finished)
            (is (= :done (mdb/setup-db! :create-sample-content? false)))
            (is (string/valid-uuid? (encryption/maybe-decrypt (t2/select-one-fn :value "setting" :key "encryption-check")))))
          (testing "The legacy plaintext \"unencrypted\" marker on such a database is replaced the same way"
            (t2/delete! :setting :key "encryption-check")
            (t2/insert! :setting {:key "encryption-check", :value "unencrypted"})
            (reset! (:status mdb.connection/*application-db*) ::setup-finished)
            (is (= :done (mdb/setup-db! :create-sample-content? false)))
            (is (string/valid-uuid? (encryption/maybe-decrypt (t2/select-one-fn :value "setting" :key "encryption-check")))))
          (testing "Starting without the key throws"
            (encryption-test/with-secret-key nil
              (reset! (:status mdb.connection/*application-db*) ::setup-finished)
              (is (thrown-with-msg? Exception #"MB_ENCRYPTION_SECRET_KEY environment variable was NOT set"
                                    (mdb/setup-db! :create-sample-content? false)))))
          (testing "Different encryption key throws an error"
            (encryption-test/with-secret-key "different-key"
              (reset! (:status mdb.connection/*application-db*) ::setup-finished)
              (is (thrown-with-msg? Exception #"Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains" (mdb/setup-db! :create-sample-content? false)))
              (let [setting-value (:value (t2/select-one "setting" :key "site-uuid-for-version-info-fetching"))] ; need to select directly from "settings" to avoid auto-decryption
                (is (not (string/valid-uuid? setting-value)))))))))))

(defn- set-encryption-check-raw! [value]
  (t2/delete! :setting :key "encryption-check")
  (when value
    (t2/insert! :setting {:key "encryption-check", :value value})))

(deftest sentinel-state-never-triggers-encryption-test
  (testing "a restart must never encrypt a pre-existing plaintext row, whatever state the sentinel is in"
    (encryption-test/with-secret-key "sentinel-state-key-1"
      (mt/with-temp-empty-app-db [_conn :h2]
        (mdb/setup-db! :create-sample-content? true)
        (let [db-id      (t2/select-one-fn :id :metabase_database)
              plaintext  "{\"host\":\"example.com\"}"
              raw-detail #(t2/select-one-fn :details :metabase_database :id db-id)
              restart!   (fn []
                           (reset! (:status mdb.connection/*application-db*) ::setup-finished)
                           (mdb/setup-db! :create-sample-content? false))]
          (is (encryption/decryptable-string? (raw-detail)))
          (t2/update! :metabase_database {:id db-id} {:details plaintext})
          (testing "with the sentinel deleted"
            (set-encryption-check-raw! nil)
            (is (thrown-with-msg? Exception #"not marked as encrypted and already contains data" (restart!)))
            (testing "the plaintext row is untouched and still rejected by the strict read"
              (is (= plaintext (raw-detail)))
              (is (thrown? Exception (:details (t2/select-one :model/Database :id db-id)))))
            (testing "no sentinel was written"
              (is (nil? (t2/select-one-fn :value :setting :key "encryption-check")))))
          (testing "\na plaintext random-uuid sentinel is rejected as a wrong key"
            (set-encryption-check-raw! (str (random-uuid)))
            (is (thrown-with-msg? Exception #"encrypted with a different key" (restart!)))
            (is (= plaintext (raw-detail))))
          (testing "\nthe legacy \"unencrypted\" marker reads as no sentinel: the plaintext row still refuses startup"
            (set-encryption-check-raw! "unencrypted")
            (is (thrown-with-msg? Exception #"not marked as encrypted and already contains data" (restart!)))
            (is (= plaintext (raw-detail)))
            (testing "and no sentinel was written"
              (is (= "unencrypted" (t2/select-one-fn :value :setting :key "encryption-check"))))))))))

(deftest fresh-install-with-encryption-key-test
  (testing "a database created with MB_ENCRYPTION_SECRET_KEY set stores every encrypted-at-rest value encrypted"
    (encryption-test/with-secret-key "fresh-install-test-key-1234"
      (mt/with-temp-empty-app-db [_conn :h2]
        (mdb/setup-db! :create-sample-content? true)
        (testing "encrypted-at-rest columns (read raw, so no model transform can hide a plaintext value)"
          (doseq [[table column] @#'mdb.encryption/encrypted-string-columns
                  {:keys [id value]} (t2/select [table :id [column :value]] {:where [:!= column nil]})]
            (testing (format "%s.%s id %s" (name table) (name column) id)
              (is (encryption/decryptable-string? value)))))
        (testing "encrypted-at-rest bytes columns"
          (doseq [[table column] @#'mdb.encryption/encrypted-bytes-columns
                  {:keys [id value]} (t2/select [table :id [column :value]] {:where [:!= column nil]})]
            (testing (format "%s.%s id %s" (name table) (name column) id)
              (is (encryption/decryptable-bytes? (#'mdb.encryption/maybe-blob->bytes value))))))
        (testing "settings that are encrypted at rest"
          (doseq [{k :key v :value} (t2/select :setting {:where [:!= :value nil]})
                  :let [definition (get @setting/registered-settings (keyword k))]
                  :when (and definition (not= :no (:encryption definition)))]
            (testing k
              (is (encryption/decryptable-string? v)))))))))
