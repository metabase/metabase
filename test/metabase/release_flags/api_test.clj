(ns metabase.release-flags.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest get-flags-test
  (testing "GET /api/release-flags"
    (testing "returns all flags"
      (mt/with-temp [:model/ReleaseFlag _ {:flag "get-test" :description "Test" :start_date "2026-01-01" :is_enabled false}]
        (let [resp (mt/user-http-request :rasta :get 200 "release-flags")]
          (is (contains? resp "get-test"))
          (is (= false (get-in resp ["get-test" "is_enabled"]))))))))

(deftest put-flags-test
  (testing "PUT /api/release-flags"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "put-flag" :description "Put test" :start_date "2026-01-01" :is_enabled false}]
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "release-flags" {"put-flag" true}))))
      (testing "superuser can update flag status"
        (let [resp (mt/user-http-request :crowberto :put 200 "release-flags" {"put-flag" true})]
          (is (get-in resp ["put-flag" "is_enabled"]))))
      (testing "returns updated flag map"
        (let [resp (mt/user-http-request :crowberto :put 200 "release-flags" {"put-flag" false})]
          (is (not (get-in resp ["put-flag" "is_enabled"]))))))))
