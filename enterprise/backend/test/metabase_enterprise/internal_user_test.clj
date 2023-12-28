(ns metabase-enterprise.internal-user-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.internal-user :as ee.internal-user]
   [metabase.config :as config]
   [metabase.models :refer [User]]
   [metabase.setup :as setup]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defmacro with-internal-user-restoration [& body]
  `(let [original-audit-db# (t2/select-one User :id config/internal-mb-user-id)]
     (try
       (t2/delete! User :id config/internal-mb-user-id)
       ~@body
       (finally
         (t2/delete! User :id config/internal-mb-user-id)
         (when original-audit-db#
           (#'ee.internal-user/install-internal-user!))))))

(deftest installation-of-internal-user-test
  (with-internal-user-restoration
    (is (= nil (t2/select-one User :id config/internal-mb-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id config/internal-mb-user-id)))))

(deftest internal-user-installed-one-time-test
  (with-internal-user-restoration
    (is (= nil (t2/select-one User :id config/internal-mb-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id config/internal-mb-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id config/internal-mb-user-id)))))

(deftest has-user-setup-ignores-internal-user
  (with-internal-user-restoration
    (if config/ee-available?
      ;; ee:
      (let [user-ids-minus-internal (t2/select-fn-set :id User {:where [:not= :id config/internal-mb-user-id]})]
        (is (true? (setup/has-user-setup)))
        (is (false? (contains? user-ids-minus-internal config/internal-mb-user-id))
            "Selecting Users with a clause to ignore internal users does not return the internal user."))
      ;; oss:
      (is (= (t2/select-fn-set :id User {:where [:not= :id config/internal-mb-user-id]})
             (t2/select-fn-set :id User))
          "Ignore internal user where clause does nothing in ee mode.")))
  (is (= (setup/has-user-setup)
         (with-internal-user-restoration
           ;; there's no internal-user in this block
           (setup/has-user-setup)))))

(deftest internal-user-is-unmodifiable-via-api-test
  ;; ensure the internal user exists for these test assertions
  (ee.internal-user/ensure-internal-user-exists!)
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
                 (mt/user-http-request :crowberto method status-code endpoint))))))))
