(ns metabase.api.notify-test
  (:require [clj-http.client :as client]
            [clojure.test :refer :all]
            [metabase.http-client :as http]
            [metabase.middleware.util :as middleware.u]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(deftest unauthenticated-test
  (testing "POST /api/notify/db/:id"
    (testing "endpoint should require authentication"
      (is (= (get middleware.u/response-forbidden :body)
             (http/client :post 403 "notify/db/100"))))))

(deftest not-found-test
  (testing "POST /api/notify/db/:id"
    (testing "database must exist or we get a 404"
      (is (= {:status 404
              :body   "Not found."}
             (try (client/post (http/build-url (format "notify/db/%d" Integer/MAX_VALUE) {})
                               {:accept  :json
                                :headers {"X-METABASE-APIKEY" "test-api-key"
                                          "Content-Type"      "application/json"}})
                  (catch clojure.lang.ExceptionInfo e
                    (select-keys (:object (ex-data e)) [:status :body]))))))))

;; TODO - how can we validate the normal scenario given that it just kicks off a background job?
