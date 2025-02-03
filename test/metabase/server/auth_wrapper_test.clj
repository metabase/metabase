(ns metabase.server.auth-wrapper-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.http-client :as client]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures
  :once
  (fixtures/initialize :web-server :test-users))

(deftest routes-test
  (when-not config/ee-available?
    (doseq [route ["auth/sso" "api/saml"]]
      (testing (str route " route returns nice error message")
        (binding [client/*url-prefix* ""] ; prevent automatic /api/auth/sso which is a 404
          ;; it's possible that a post or get is the actual route that doesn't exist. The warning handler is simple
          ;; and responds to any request with a helpful error message
          (let [response (mt/user-http-request :rasta :post 400 route)]
            (is (= {:message "The auth/sso endpoint only exists in enterprise builds"
                    :status "ee-build-required"}
                   response))))))))
