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
  (testing "Should generate both HTML and JSON files"
    (mt/with-temp-file [temp-file]
      (let [html-file (str temp-file ".html")
            json-file (str temp-file ".json")]
        (try
          (cmd.endpoint-dox/generate-dox! html-file)
          (testing "HTML file should be created"
            (is (.exists (io/file html-file))))
          (testing "JSON file should be created"
            (is (.exists (io/file json-file))))
          (finally
            (when (.exists (io/file json-file))
              (io/delete-file json-file))
            (when (.exists (io/file html-file))
              (io/delete-file html-file))))))))

(deftest generate-dox-html-uses-external-json-test
  (testing "HTML file should use data-url to load external JSON"
    (mt/with-temp-file [temp-file]
      (let [html-file (str temp-file ".html")
            json-file (str temp-file ".json")]
        (try
          (cmd.endpoint-dox/generate-dox! html-file)
          (let [html-content (slurp html-file)]
            (testing "Should use data-url attribute"
              (is (str/includes? html-content "data-url=\"api.json\"")))
            (testing "Should NOT contain inline JSON"
              (is (not (str/includes? html-content "type=\"application/json\""))))
            (testing "Should load Scalar script"
              (is (str/includes? html-content "cdn.jsdelivr.net/npm/@scalar/api-reference"))))
          (finally
            (when (.exists (io/file json-file))
              (io/delete-file json-file))
            (when (.exists (io/file html-file))
              (io/delete-file html-file))))))))

(deftest generate-dox-json-structure-test
  (testing "JSON file should contain valid OpenAPI spec with description"
    (mt/with-temp-file [temp-file]
      (let [html-file (str temp-file ".html")
            json-file (str temp-file ".json")]
        (try
          (cmd.endpoint-dox/generate-dox! html-file)
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
              (io/delete-file json-file))
            (when (.exists (io/file html-file))
              (io/delete-file html-file))))))))

(deftest generate-dox-html-size-test
  (testing "HTML file should be small (no inline JSON)"
    (mt/with-temp-file [temp-file]
      (let [html-file (str temp-file ".html")
            json-file (str temp-file ".json")]
        (try
          (cmd.endpoint-dox/generate-dox! html-file)
          (let [html-size (.length (io/file html-file))
                json-size (.length (io/file json-file))]
            (testing "HTML should be much smaller than JSON"
              (is (< html-size 10000)
                  "HTML file should be less than 10KB"))
            (testing "JSON should contain the bulk of the data"
              (is (> json-size html-size)
                  "JSON file should be larger than HTML file")))
          (finally
            (when (.exists (io/file json-file))
              (io/delete-file json-file))
            (when (.exists (io/file html-file))
              (io/delete-file html-file))))))))
