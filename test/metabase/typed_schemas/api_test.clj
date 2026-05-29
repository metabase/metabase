(ns metabase.typed-schemas.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.api :as typed-schemas.api]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest column-schema-includes-description-test
  (is (= {:name          "name"
          :displayName   "Name"
          :baseType      "type/Text"
          :effectiveType "type/Text"
          :semanticType  nil
          :jsType        "string"
          :description   "Name of the customer"}
         (#'typed-schemas.api/column-schema {:name         "name"
                                             :display_name "Name"
                                             :base_type    "type/Text"
                                             :description  "Name of the customer"}))))

(deftest metric-dimension-schema-uses-dimension-id-test
  (is (= {:name          "category"
          :displayName   "Category"
          :baseType      "type/Text"
          :effectiveType "type/Text"
          :semanticType  nil
          :jsType        "string"
          :key           "category"
          :id            "550e8400-e29b-41d4-a716-446655440001"
          :fieldId       3815
          :operators     []}
         (#'typed-schemas.api/dimension-schema
          {:id             "550e8400-e29b-41d4-a716-446655440001"
           :name           "category"
           :display-name   "Category"
           :effective-type :type/Text
           :sources        [{:type :field, :field-id 3815}]}))))

(deftest javascript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/javascript")]
    (is (= "text/javascript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "export default {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 1"))
    (is (str/includes? (:body response) "\n  questions: {"))
    (is (str/includes? (:body response) "\n  metrics: {"))
    (is (str/ends-with? (:body response) "};\n"))
    (is (not (str/includes? (:body response) "\"schemaVersion\"")))))

(deftest typescript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/typescript")]
    (is (= "text/typescript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "export default {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 1"))
    (is (str/ends-with? (:body response) "} as const;\n"))))

(deftest json-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/json")]
    (is (= "application/json; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (= 1 (get-in response [:body :schemaVersion])))
    (is (map? (get-in response [:body :questions])))
    (is (map? (get-in response [:body :metrics])))))
