(ns metabase.api.native-query-snippet-test
  "Tests for /api/native-query-snippet endpoints."
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
            [metabase.test.data :as data]
            [metabase.test.data.users :refer [fetch-user user->client]]
            [toucan.util.test :as tt]))

;; GET /api/native-query-snippet
(deftest list-snippets-api-test
  (testing "list returns all snippets"
    (let [rasta (fetch-user :rasta)]
      (tt/with-temp* [NativeQuerySnippet [snippet-1 {:content     "1"
                                                     :creator_id  (:id rasta)
                                                     :database_id (data/id)
                                                     :description "Test snippet 1"
                                                     :name        "snippet_1"}]
                      NativeQuerySnippet [snippet-2 {:content     "2"
                                                     :creator_id  (:id rasta)
                                                     :database_id (data/id)
                                                     :description "Test snippet 2"
                                                     :name        "snippet_2"}]]
        (let [test-fields       [:content :creator_id :database_id :description :name]
              snippets-from-api (->> ((user->client :crowberto) :get 200 "native-query-snippet")
                                     (map #(select-keys % test-fields))
                                     set)]
          (is (contains? snippets-from-api (select-keys snippet-1 test-fields)))
          (is (contains? snippets-from-api (select-keys snippet-2 test-fields))))))))

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
