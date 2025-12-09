(ns metabase-enterprise.tenants.e2e-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.test :as mt]))

(deftest tenant-users-can-use-metabase
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (let [email (mt/random-email)
            password (mt/random-hash)]
        (mt/with-temp [:model/Tenant {tenant-id :id} {}
                       :model/User user {:tenant_id tenant-id
                                         :email email
                                         :password password}]
          (mt/user-http-request user :get 200 "user/current"))))))

(deftest tenant-users-can-not-use-metabase-if-their-tenant-is-disabled
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (let [email (mt/random-email)
            password (mt/random-hash)]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:is_active false}
                       :model/User user {:tenant_id tenant-id
                                         :email email
                                         :password password}]
          (is (= "Unauthenticated" (mt/user-http-request user :get 401 "user/current"))))))))

(deftest tenant-users-can-not-use-metabase-if-tenants-feature-unavailable
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (let [email (mt/random-email)
            password (mt/random-hash)]
        (mt/with-temp [:model/Tenant {tenant-id :id} {}
                       :model/User user {:tenant_id tenant-id
                                         :email email
                                         :password password}]
          (mt/with-premium-features #{}
            (is (= "Unauthenticated" (mt/user-http-request user :get 401 "user/current")))))))))
