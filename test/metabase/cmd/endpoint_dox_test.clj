(ns metabase.cmd.endpoint-dox-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.cmd.endpoint-dox :as cmd.endpoint-dox]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest generate-dox-test
  (testing "Should generate a JSON file at the given path"
    (mt/with-temp-file [json-file]
      (try
        (cmd.endpoint-dox/generate-dox! json-file)
        (is (.exists (io/file json-file)))
        (finally
          (when (.exists (io/file json-file))
            (io/delete-file json-file)))))))

(deftest generate-dox-json-structure-test
  (testing "JSON file should contain a valid OpenAPI spec with description"
    (mt/with-temp-file [json-file]
      (try
        (cmd.endpoint-dox/generate-dox! json-file)
        (let [json-content (json/decode (slurp json-file) keyword)]
          (testing "Should have OpenAPI version"
            (is (= "3.1.0" (:openapi json-content))))
          (testing "Should have info section"
            (is (map? (:info json-content))))
          (testing "Should have title"
            (is (= "Metabase API documentation" (get-in json-content [:info :title]))))
          (testing "Should have description from api-intro.md"
            (let [description (get-in json-content [:info :description])]
              (is (string? description))
              (is (str/includes? description "The API is subject to change"))
              (is (str/includes? description "API tutorial"))))
          (testing "Should have servers configuration"
            (is (sequential? (:servers json-content))))
          (testing "Should have components section"
            (is (map? (:components json-content)))))
        (finally
          (when (.exists (io/file json-file))
            (io/delete-file json-file)))))))
