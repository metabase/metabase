(ns ^:mb/once metabase.setup-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.models.interface :as mi]
   [metabase.public-settings :as public-settings]
   [metabase.setup :as setup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
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
