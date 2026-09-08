(ns ^:synchronized metabase-enterprise.billing.api-test
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.billing.api :as billing.api]
   [metabase.permissions.models.permissions :as perms]
   [metabase.test :as mt]))

(defn- clear-billing-status-cache!
  "Billing status is memoized per [token email language], so without this tests see each other's responses."
  []
  (memoize/memo-clear! @#'billing.api/fetch-billing-status*))

(use-fixtures :each (fn [thunk]
                      (clear-billing-status-cache!)
                      (thunk)))

(deftest fetch-billing-status-test
  (testing "Passes through billing status fetched from server"
    (mt/with-temporary-setting-values [premium-embedding-token nil]
      (binding [http/request (fn [& _]
                               {:status 200
                                :body   "{\"version\":\"v1\",\"content\":null}"})]
        (is (= {:version "v1"
                :content nil}
               (mt/user-http-request :crowberto :get 200 "/ee/billing")))))))

(deftest fetch-billing-status-permissions-test
  (testing "GET /api/ee/billing requires admin or `setting` application permission"
    (mt/with-temporary-setting-values [premium-embedding-token nil]
      (binding [http/request (fn [& _]
                               {:status 200
                                :body   "{\"version\":\"v1\",\"content\":null}"})]
        (mt/with-user-in-groups [group {:name "New Group"}
                                 user  [group]]
          (testing "if `advanced-permissions` is disabled, require admins"
            (mt/with-premium-features #{}
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request user :get 403 "/ee/billing")))))
          (testing "if `advanced-permissions` is enabled"
            (mt/with-premium-features #{:advanced-permissions}
              (testing "still fail if user's group doesn't have `setting` permission"
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request user :get 403 "/ee/billing"))))
              (testing "allowed if user's group has `setting` permission"
                (perms/grant-application-permissions! group :setting)
                (is (= {:version "v1"
                        :content nil}
                       (mt/user-http-request user :get 200 "/ee/billing")))))))))))

(deftest fetch-billing-status-error-test
  (testing "When receiving a non json result consume the error and return an empty content blob"
    (mt/with-temporary-setting-values [premium-embedding-token nil]
      (binding [http/request (fn [& _]
                               {:status 404
                                :body   "error"})]
        (is (= {:content nil}
               (mt/user-http-request :crowberto :get 200 "/ee/billing")))))))
