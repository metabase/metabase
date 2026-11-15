(ns metabase.api.macros.defendpoint.open-api-test
  "See additional tests in [[metabase.api.open-api-test]]."
  (:require
   [clojure.test :refer :all]
   [malli.json-schema :as mjs]
   [metabase.api.macros.defendpoint.open-api :as defendpoint.open-api]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.server.core :as server]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(deftest ^:parallel json-schema-conversion-2
  (testing ":json-schema basically works (see definition of :metabase.lib.schema.common/non-blank-string)"
    (is (=? {:$ref        "#/definitions/metabase.lib.schema.common.non-blank-string"
             :definitions {"metabase.lib.schema.common.non-blank-string" {:type "string", :minLength 1}}}
            (mjs/transform ::lib.schema.common/non-blank-string)))))

(mr/def ::non-blank-string
  "Non-blank string."
  ::lib.schema.common/non-blank-string)

(deftest ^:parallel json-schema-conversion-2b
  (testing ":json-schema basically works (nested ref)"
    (is (=? {:$ref "#/definitions/metabase.api.macros.defendpoint.open-api-test.non-blank-string",
             :definitions {"metabase.api.macros.defendpoint.open-api-test.non-blank-string"
                           {:description "Non-blank string."
                            :$ref "#/definitions/metabase.lib.schema.common.non-blank-string"}

                           "metabase.lib.schema.common.non-blank-string"
                           {:type "string", :minLength 1}}}
            (mjs/transform ::non-blank-string)))))

(deftest ^:parallel json-schema-conversion-3
  (testing "maps-with-unique-key do not generate weirdness"
    (is (=? {:description string?
             :type        :array
             :items       {:type       :object
                           :required   ["id"]
                           :properties {"id" {:type :integer}}}}
            (#'defendpoint.open-api/fix-json-schema
             (#'defendpoint.open-api/normalize-raw-json-schema
              (mjs/transform (ms/maps-with-unique-key [:sequential [:map [:id :int]]] :id))))))))

(deftest ^:parallel default-params-are-optional-test
  (testing "a param carrying a :default is advertised as optional, since omitting it is safe"
    (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
      (let [by-name (into {}
                          (map (juxt :name identity))
                          (#'defendpoint.open-api/schema->params*
                           [:map
                            [:required-param :string]
                            [:defaulted-param {:default :api} [:enum :api :x]]
                            [:optional-param {:optional true} :string]]
                           (constantly :query)
                           {}))]
        (is (true?  (get-in by-name ["required-param" :required])))
        (is (false? (get-in by-name ["defaulted-param" :required])))
        (is (false? (get-in by-name ["optional-param" :required])))
        (testing "the default value is still rendered in the param schema"
          (is (= :api (get-in by-name ["defaulted-param" :schema :default]))))))))

(deftest ^:parallel collect-definitions-test
  (binding [defendpoint.open-api/*definitions* (atom [])]
    (is (=? {:properties {"value" {:$ref "#/components/schemas/metabase.lib.schema.common.non-blank-string"}}}
            (#'defendpoint.open-api/mjs-collect-definitions [:map [:value ::lib.schema.common/non-blank-string]])))
    (is (= [{"metabase.lib.schema.common.non-blank-string" {:type        :string
                                                            :minLength   1
                                                            :description "Schema for a string that cannot be blank."}}]
           @@#'defendpoint.open-api/*definitions*))))

(deftest ^:parallel deprecated-endpoint-test
  (testing "Deprecated metadata is included in OpenAPI spec"
    (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
      (let [form {:method :get
                  :route {:path "/test"}
                  :docstr "A deprecated endpoint."
                  :metadata {:deprecated "0.57.0"}
                  :params {}
                  :body []}
            result (#'defendpoint.open-api/path-item "/api/test" form)]
        (is (true? (:deprecated result)))
        (is (= "GET /api/test" (:summary result))))))
  (testing "Non-deprecated endpoints do not have deprecated field"
    (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
      (let [form {:method :get
                  :route {:path "/test"}
                  :docstr "A normal endpoint."
                  :params {}
                  :body []}
            result (#'defendpoint.open-api/path-item "/api/test" form)]
        (is (nil? (:deprecated result)))
        (is (= "A normal endpoint." (:description result))))))
  (testing "Deprecated with multipart metadata"
    (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
      (let [form {:method :post
                  :route {:path "/upload"}
                  :docstr "A deprecated upload endpoint."
                  :metadata {:deprecated true :multipart true}
                  :params {}
                  :body []}
            result (#'defendpoint.open-api/path-item "/api/upload" form)]
        (is (true? (:deprecated result)))))))

(deftest ^:parallel streaming-response-schema-test
  (testing "server/streaming-response-schema uses content schema for OpenAPI docs"
    (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
      (let [content-schema [:map
                            [:data [:map [:cols [:sequential :any]] [:rows [:sequential :any]]]]
                            [:row_count :int]
                            [:status [:enum "completed" "failed"]]]
            response-schema (server/streaming-response-schema content-schema)
            result (#'defendpoint.open-api/schema->response-obj response-schema)]
        (testing "generates 2XX response"
          (is (contains? result "2XX")))
        (testing "uses content schema properties, not StreamingResponse fn"
          (let [json-schema (get-in result ["2XX" :content "application/json" :schema])]
            (is (= :object (:type json-schema)))
            (is (contains? (:properties json-schema) "data"))
            (is (contains? (:properties json-schema) "row_count"))
            (is (contains? (:properties json-schema) "status"))))))))

(def ^:private no-content-204
  [:map {:openapi/response {:status "204", :description "No content"}}
   [:status [:= 204]]])

(deftest ^:parallel response-override-test
  (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
    (testing "an override documents the status, description and media types it names"
      (is (=? {"200" {:description "Rows as CSV or JSON"
                      :content     {"text/csv"         {:schema {:type :string}}
                                    "application/json" {:schema {:type :array, :items {:type :object}}}}}}
              (#'defendpoint.open-api/schema->response-obj
               [:fn {:openapi/response {:status      "200"
                                        :description "Rows as CSV or JSON"
                                        :content     {"text/csv"         :string
                                                      "application/json" [:sequential :map]}}}
                any?]))))
    (testing "an override without content documents a response with no body"
      (is (= {"204" {:description "No content"}}
             (#'defendpoint.open-api/schema->response-obj no-content-204))))
    (testing "an override without a description takes the description of its body schema"
      (is (=? {"200" {:description "Rows as JSON"}}
              (#'defendpoint.open-api/schema->response-obj
               [:fn {:openapi/response {:status  "200"
                                        :content {"application/json" [:sequential {:description "Rows as JSON"} :map]}}}
                any?]))))
    (testing "an override takes precedence over :openapi/response-schema"
      (is (= {"204" {:description "No content"}}
             (#'defendpoint.open-api/schema->response-obj
              [:map {:openapi/response        {:status "204", :description "No content"}
                     :openapi/response-schema :int}]))))
    (testing "a malformed override is refused"
      (is (thrown? clojure.lang.ExceptionInfo
                   (#'defendpoint.open-api/schema->response-obj [:map {:openapi/response {:status "ok"}}]))))))

(deftest ^:parallel response-override-replaces-2xx-stub-test
  (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
    (testing "an endpoint documenting an exact success status has no 2XX entry left over"
      (is (= #{"204" "4XX" "5XX"}
             (set (keys (:responses (#'defendpoint.open-api/path-item
                                     "/api/test"
                                     {:method          :delete
                                      :route           {:path "/test"}
                                      :docstr          "Delete it."
                                      :params          {}
                                      :response-schema no-content-204
                                      :body            []})))))))
    (testing "an endpoint without a response schema keeps the 2XX stub"
      (is (= #{"2XX" "4XX" "5XX"}
             (set (keys (:responses (#'defendpoint.open-api/path-item
                                     "/api/test"
                                     {:method :get
                                      :route  {:path "/test"}
                                      :docstr "Get it."
                                      :params {}
                                      :body   []})))))))))
