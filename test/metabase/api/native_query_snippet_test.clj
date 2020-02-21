(ns metabase.api.native-query-snippet-test
  "Tests for /api/native-query-snippet endpoints."
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.test.data.users :refer [user->client]]))

;; GET /api/native-query-snippet
(deftest list-snippets-api-test
  (testing "TODO complete this"
    (is false)))

;; GET /api/native-query-snippet/:id
(deftest read-snippet-api-test
  (testing "TODO complete this"
    (is false)))

;; POST /api/native-query-snippet
(deftest create-snippet-api-test
  (testing "new snippet field validation"
    (is (= {:errors {:content "value must be a string."}}
           ((user->client :rasta) :post 400 "native-query-snippet" {})))
    (is (= {:errors {:database_id "value must be an integer greater than zero."}}
           ((user->client :rasta) :post 400 "native-query-snippet" {:content "NULL"})))
    (let [response ((user->client :rasta)
                    :post 400 "native-query-snippet"
                    {:content "NULL", :database_id 1})]
      (is (str/starts-with? (get-in response [:errors :name])
                            "Value does not match schema: ")))))

;; PUT /api/native-query-snippet/:id
(deftest update-snippet-api-test
  (testing "TODO complete this"
    (is false)))
