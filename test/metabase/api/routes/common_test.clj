(ns metabase.api.routes.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [ring.mock.request :as ring.mock]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

;; create a simple example of our middleware wrapped around a handler that simply returns the request
(defn- api-key-enforced-handler [request]
  ((#'api.routes.common/enforce-static-api-key (fn [_ respond _] (respond {:success true})))
   request
   identity
   (fn [e] (throw e))))

(defn- request-with-api-key
  "Creates a mock Ring request with the given apikey applied"
  [api-key]
  (-> (ring.mock/request :get "/anyurl")
      (assoc :static-metabase-api-key api-key)))

(deftest enforce-static-api-key-request
  (mt/with-temporary-setting-values [api-key "test-api-key"]
    (testing "no apikey in the request, expect 403"
      (is (= api.response/response-forbidden
             (api-key-enforced-handler
              (ring.mock/request :get "/anyurl")))))

    (testing "valid apikey, expect 200"
      (is (= {:success true}
             (api-key-enforced-handler
              (request-with-api-key "test-api-key")))))

    (testing "invalid apikey, expect 403"
      (is (= api.response/response-forbidden
             (api-key-enforced-handler
              (request-with-api-key "foobar"))))))

  (testing "no apikey is set, expect 403"
    (doseq [api-key-value [nil ""]]
      (testing (str "when key is " ({nil "nil" "" "empty"} api-key-value))
        (mt/with-temporary-setting-values [api-key api-key-value]
          (is (= @#'api.routes.common/key-not-set-response
                 (api-key-enforced-handler
                  (ring.mock/request :get "/anyurl")))))))))
