(ns metabase-enterprise.sandbox.api.user-test
  "Tests that would logically be included in `metabase.api.user-test` but are separate as they are enterprise only."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

(deftest get-user-attributes-test
  (testing "requires sandbox enabled"
    (mt/with-premium-features #{}
      (is (= "Sandboxes is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
           (mt/user-http-request :crowberto :get 402 "mt/user/attributes")))))

  (mt/with-premium-features #{:sandboxes}
    (testing "requires admin"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "mt/user/attributes"))))

    (testing "returns set of user attributes"
      (t2.with-temp/with-temp
        ['User _ {:login_attributes {:foo "bar"}}
         'User _ {:login_attributes {:foo "baz"
                                     :miz "bar"}}]
        (is (= ["foo" "miz"]
               (mt/user-http-request :crowberto :get 200 "mt/user/attributes")))))))


(deftest update-user-attributes-test
  (mt/with-premium-features #{}
    (testing "requires sandbox enabled"
      (is (= "Sandboxes is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
             (mt/user-http-request :crowberto :put 402 (format "mt/user/%d/attributes" (mt/user->id :crowberto)) {})))))

  (mt/with-premium-features #{:sandboxes}
    (testing "requires admin"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (format "mt/user/%d/attributes" (mt/user->id :rasta)) {}))))

    (testing "404 if user does not exist"
      (is (= "Not found."
             (mt/user-http-request :crowberto :put 404 (format "mt/user/%d/attributes" Integer/MAX_VALUE) {}))))

    (testing "Admin can update user attributes"
      (t2.with-temp/with-temp
        ['User {id :id} {}]
        (mt/user-http-request :crowberto :put 200 (format "mt/user/%d/attributes" id) {:login_attributes {"foo" "bar"}})
        (is (= {"foo" "bar"}
               (t2/select-one-fn :login_attributes 'User :id id)))))))
