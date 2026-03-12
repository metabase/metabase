(ns metabase.api.macros.defendpoint.tools-manifest-test
  (:require
   [clojure.test :refer :all]
   [malli.json-schema :as mjs]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]))

;;; --------------------------------------------------- Name inference ----------------------------------------------------

(deftest ^:parallel infer-tool-name-test
  (testing "GET endpoints get a get_ prefix"
    (is (= "get_table"
           (tools-manifest/infer-tool-name :get "/api/agent" "/v1/table/:id"))))
  (testing "POST endpoints don't get a prefix"
    (is (= "search"
           (tools-manifest/infer-tool-name :post "/api/agent" "/v1/search"))))
  (testing "Path params are stripped"
    (is (= "get_table_field_values"
           (tools-manifest/infer-tool-name :get "/api/agent" "/v1/table/:id/field/:field-id/values"))))
  (testing "Hyphens are converted to underscores"
    (is (= "construct_query"
           (tools-manifest/infer-tool-name :post "/api/agent" "/v1/construct-query"))))
  (testing "DELETE endpoints get a delete_ prefix"
    (is (= "delete_table"
           (tools-manifest/infer-tool-name :delete "/api/agent" "/v1/table/:id")))))

;;; ------------------------------------------------- Annotation inference ------------------------------------------------

(deftest ^:parallel infer-annotations-test
  (testing "GET defaults"
    (is (= {:readOnlyHint   true
            :idempotentHint true}
           (tools-manifest/infer-annotations :get nil))))
  (testing "DELETE defaults"
    (is (= {:destructiveHint true
            :idempotentHint  true}
           (tools-manifest/infer-annotations :delete nil))))
  (testing "PUT defaults"
    (is (= {:destructiveHint false
            :idempotentHint  true}
           (tools-manifest/infer-annotations :put nil))))
  (testing "POST defaults (empty — MCP defaults apply)"
    (is (= {}
           (tools-manifest/infer-annotations :post nil))))
  (testing "Explicit annotations override defaults"
    (is (= {:readOnlyHint   true
            :idempotentHint true}
           (tools-manifest/infer-annotations :post {:read-only? true :idempotent? true})))))

;;; ------------------------------------------- Tool description rewriting ------------------------------------------------

(deftest ^:parallel rewrite-tool-descriptions-test
  (are [description schema expected]
    (testing description
      (let [rewritten (tools-manifest/rewrite-tool-descriptions schema)
            jss       (mjs/transform rewritten)]
        (is (= expected
               (get-in jss [:properties :id :description])))))
    "tool/description replaces description in JSON schema output"
    [:map [:id [:int {:description      "Internal ID"
                      :tool/description "The ID of the saved question"}]]]
    "The ID of the saved question"

    "schemas without tool/description keep original description"
    [:map [:id [:int {:description "Internal ID"}]]]
    "Internal ID"))

;;; ------------------------------------------- endpoint->tool-definition -------------------------------------------------

(deftest ^:parallel endpoint->tool-definition-test
  (testing "Basic endpoint conversion"
    (binding [tools-manifest/*definitions* (atom (sorted-map))]
      (let [form   {:method          :get
                    :route           {:path "/v1/table/:id"}
                    :params          {:route {:binding '{:keys [id]}
                                              :schema  [:map [:id :int]]}}
                    :response-schema [:map [:name :string]]
                    :docstr          "Get a table."
                    :metadata        {:tool {:name "get_table"}}
                    :body            '(nil)}
            result (tools-manifest/endpoint->tool-definition "/api/agent" {:form form})]
        (is (= {:name           "get_table"
                :description    "Get a table."
                :endpoint       {:method "GET" :path "/api/agent/v1/table/{id}"}
                :inputSchema    {:type       "object"
                                 :properties {:id {:type "integer"}}
                                 :required   ["id"]}
                :responseSchema {:type       "object"
                                 :properties {:name {:type "string"}}
                                 :required   ["name"]}
                :annotations    {:readOnlyHint   true
                                 :idempotentHint true}}
               result))))))

;;; ---------------------------------------------- Integration test -------------------------------------------------------

;; This test verifies the full pipeline with actual defendpoint endpoints.
;; It requires the agent API namespace to be loaded.

(api.macros/defendpoint :get "/v1/test/:id"
  "A test endpoint for tools manifest generation."
  {:tool {:name "test_get_thing"}}
  [{:keys [id]} :- [:map [:id :int]]]
  {:id id})

(api.macros/defendpoint :post "/v1/test-action"
  "A test POST action."
  {:tool {:name "test_action"
          :annotations {:read-only? true}}}
  [_route-params
   _query-params
   body :- [:map [:name :string]]]
  body)

(deftest ^:parallel check-tool-uniqueness-test
  (testing "No duplicates — no exception"
    (is (nil? (tools-manifest/check-tool-uniqueness
               [{:name "foo" :endpoint {:method "GET" :path "/v1/foo"}}
                {:name "bar" :endpoint {:method "POST" :path "/v1/bar"}}]))))
  (testing "Throws on duplicate tool names"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Duplicate tool names detected"
         (tools-manifest/check-tool-uniqueness
          [{:name "foo" :endpoint {:method "GET"  :path "/v1/foo"}}
           {:name "foo" :endpoint {:method "POST" :path "/v1/foo"}}])))))

(deftest ^:parallel generate-tools-manifest-test
  (testing "Generate manifest from test endpoints in this namespace"
    (let [manifest (tools-manifest/generate-tools-manifest
                    {'metabase.api.macros.defendpoint.tools-manifest-test "/api/test"})]
      (is (= "https://json-schema.org/draft/2020-12/schema" (:$schema manifest)))
      (is (= "1.0.0" (:version manifest)))
      (is (= 2 (count (:tools manifest))))
      (let [tools-by-name (into {} (map (juxt :name identity)) (:tools manifest))]
        (testing "GET endpoint"
          (let [tool (get tools-by-name "test_get_thing")]
            (is (some? tool))
            (is (= "A test endpoint for tools manifest generation." (:description tool)))
            (is (= {:method "GET" :path "/api/test/v1/test/{id}"}
                   (:endpoint tool)))
            (is (= {:readOnlyHint true :idempotentHint true}
                   (:annotations tool)))))
        (testing "POST endpoint with annotation override"
          (let [tool (get tools-by-name "test_action")]
            (is (some? tool))
            (is (= {:method "POST" :path "/api/test/v1/test-action"}
                   (:endpoint tool)))
            (is (= {:readOnlyHint true}
                   (:annotations tool)))))))))
