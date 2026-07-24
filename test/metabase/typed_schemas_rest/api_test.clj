(ns metabase.typed-schemas-rest.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.core :as typed-schemas]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- without-generated-at
  [typescript]
  (str/replace typescript #"generatedAt: \"[^\"]+\"" "generatedAt: \"<generated-at>\""))

(deftest typescript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/typescript")]
    (is (= "text/typescript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "const questions = "))
    (is (str/includes? (:body response) "\nconst schema = {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 2"))
    (is (str/includes? (:body response) "\n  questions: questions"))
    (is (str/includes? (:body response) "\n  tables: tables"))
    (is (str/includes? (:body response) "\n  metrics: metrics"))
    (is (str/ends-with? (:body response) "export default schema;\n"))
    (is (not (str/includes? (:body response) "\"schemaVersion\"")))
    (is (not (str/includes? (:body response) "operators: [ ]")))
    (is (not (str/includes? (:body response) "parameters: [ ]")))
    (is (not (str/includes? (:body response) "verified: false")))))

(deftest query-params-are-decoded-at-endpoint-test
  (with-redefs [typed-schemas/build-semantic-schema identity
                typed-schemas/render-typescript pr-str]
    (let [response (-> (mt/user-http-request-full-response
                        :crowberto
                        :get
                        200
                        "typed-schemas/v1/typescript?include-models=true&library-collections=1,2")
                       :body
                       read-string)]
      (is (true? (:include-models? response)))
      (is (= [{:id 1} {:id 2}] (:library-collection-refs response))))))

(deftest database-filter-test
  (let [database-id      (mt/id)
        database-name    (t2/select-one-fn :name :model/Database :id database-id)
        schema-by-id     (:body (mt/user-http-request-full-response
                                 :crowberto :get 200 "typed-schemas/v1/typescript" :database database-id))
        schema-by-name   (:body (mt/user-http-request-full-response
                                 :crowberto :get 200 "typed-schemas/v1/typescript" :database database-name))
        missing-schema   (:body (mt/user-http-request-full-response
                                 :crowberto :get 200 "typed-schemas/v1/typescript" :database "__missing_database__"))]
    (testing "a database id and name select the same generated schema"
      (is (= (without-generated-at schema-by-id)
             (without-generated-at schema-by-name))))
    (testing "a matching database includes its real tables"
      (is (str/includes? schema-by-id "  venues: {"))
      (is (str/includes? schema-by-id "name: \"Venues\"")))
    (testing "a non-matching database name returns an empty semantic schema"
      (is (str/includes? missing-schema "schemaVersion: 2"))
      (is (str/includes? missing-schema "const questions = { }"))
      (is (str/includes? missing-schema "const tables = { }"))
      (is (str/includes? missing-schema "const metrics = { }")))))

(deftest collection-and-database-query-params-are-mutually-exclusive-test
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/typescript?library-collections=1,2&database=1"))
