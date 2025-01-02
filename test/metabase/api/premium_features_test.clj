(ns metabase.api.premium-features-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.token-check :as token-check]
   [metabase.premium-features.token-check-test :as token-check-test]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest get-token-status-test
  (testing "GET /api/premium-features/token/status"
    (with-redefs [token-check/fetch-token-status (fn [_x]
                                                   {:valid    true
                                                    :status   "fake"
                                                    :features ["test" "fixture"]
                                                    :trial    false})]
      (mt/with-temporary-setting-values [:premium-embedding-token (token-check-test/random-token)]
        (testing "returns correctly"
          (is (= {:valid    true
                  :status   "fake"
                  :features ["test" "fixture"]
                  :trial    false}
                 (mt/user-http-request :crowberto :get 200 "premium-features/token/status"))))

        (testing "requires superusers"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "premium-features/token/status"))))))

    (mt/with-temporary-setting-values [:premium-embedding-token nil]
      (testing "returns 404 if no token is set"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 "premium-features/token/status")))))))
