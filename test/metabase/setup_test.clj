(ns ^:mb/once metabase.setup-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.core :as mbc]
   [metabase.db :as mdb]
   [metabase.db.schema-migrations-test.impl :as schema-migrations-test.impl]
   [metabase.models :refer [User]]
   [metabase.setup :as setup]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
      (mdb/setup-db!)
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

;; TODO: somehow dedupe this
(defn- install-internal-user! []
  (t2/insert-returning-instances!
   User
   {:id config/internal-mb-user-id
    :first_name "Metabase"
    :last_name "Internal"
    :email "internal@metabase.com"
    :password (str (random-uuid))
    :is_active false
    :is_superuser false
    :login_attributes nil
    :sso_source nil
    :type :internal}))

(defmacro with-internal-user-restoration! [& body]
  `(let [has-internal-user?# (t2/select-one User :id config/internal-mb-user-id)]
     (try
       (t2/delete! User :id config/internal-mb-user-id)
       ~@body
       (finally
         (t2/delete! User :id config/internal-mb-user-id)
         (when has-internal-user?#
           (install-internal-user!))))))

(deftest has-user-setup-ignores-internal-user
  (with-internal-user-restoration!
    (let [user-ids-minus-internal (t2/select-fn-set :id User {:where [:not= :id config/internal-mb-user-id]})]
      (is (true? (setup/has-user-setup)))
      (is (false? (contains? user-ids-minus-internal config/internal-mb-user-id))
          "Selecting Users with a clause to ignore internal users does not return the internal user.")))
  (is (= (setup/has-user-setup)
         (with-internal-user-restoration!
           ;; there's no internal-user in this block
           (setup/has-user-setup)))))

(deftest internal-user-is-unmodifiable-via-api-test
  ;; ensure the internal user exists for these test assertions
  (with-internal-user-restoration!
    (testing "GET /api/user"
      ;; since the Internal user is deactivated, we only need to check in the `:include_deactivated` `true`
      (let [{:keys [data total]} (mt/user-http-request :crowberto :get 200 "user", :include_deactivated true)]
        (testing "does not return the internal user"
          (is (not (some #{"internal@metabase.com"} (map :email data)))))
        (testing "does not count the internal user"
          (is (= total (count data))))))
    (testing "User Endpoints with :id"
      (doseq [[method endpoint status-code] [[:get "user/:id" 400]
                                             [:put "user/:id" 400]
                                             [:put "user/:id/reactivate" 400]
                                             [:delete "user/:id" 400]
                                             [:put "user/:id/modal/qbnewb" 400]
                                             [:post "user/:id/send_invite" 400]]]
        (let [endpoint (str/replace endpoint #":id" (str config/internal-mb-user-id))
              testing-details-string (str/join " " [(u/upper-case-en (name :get))
                                                    endpoint
                                                    "does not allow modifying the internal user"])]
          (testing testing-details-string
            (is (= "Not able to modify the internal user"
                   (mt/user-http-request :crowberto method status-code endpoint)))))))))
