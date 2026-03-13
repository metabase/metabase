(ns metabase.api.macros.defendpoint.tools-manifest-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.util.malli.registry :as mr])
  (:import (clojure.lang ExceptionInfo)))

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

(deftest ^:parallel prefer-tool-descriptions-test
  (testing "tool/description replaces description in JSON schema output"
    (let [defs (atom (sorted-map))
          jss  (tools-manifest/malli->json-schema
                defs
                [:map [:id [:int {:description      "Internal ID"
                                  :tool/description "The ID of the saved question"}]]])]
      (is (= "The ID of the saved question"
             (get-in jss [:properties :id :description])))))
  (testing "schemas without tool/description keep original description"
    (let [defs (atom (sorted-map))
          jss  (tools-manifest/malli->json-schema
                defs
                [:map [:id [:int {:description "Internal ID"}]]])]
      (is (= "Internal ID"
             (get-in jss [:properties :id :description]))))))

(mr/def ::ref-target-a [:enum "x" "y"])
(mr/def ::ref-target-b [:map [:nested ::ref-target-a]])

(deftest ^:parallel nested-ref-sanitization-test
  (testing "All $ref values are sanitized, including nested ones inside oneOf/definitions"
    (let [defs (atom (sorted-map))
          ;; [:or ...] produces oneOf in JSON Schema, each branch may have its own $ref
          jss  (tools-manifest/malli->json-schema defs [:or ::ref-target-a ::ref-target-b])]
      ;; The top-level schema should be an anyOf (malli :or → anyOf) with $ref entries
      (is (contains? jss :anyOf))
      ;; Every $ref anywhere in the output must use sanitized names (no raw / characters after #/$defs/)
      (let [all-refs (atom [])]
        (clojure.walk/postwalk
         (fn [x]
           (when (and (map-entry? x) (= (key x) :$ref))
             (swap! all-refs conj (val x)))
           x)
         jss)
        (is (seq @all-refs) "should have found $ref entries")
        (doseq [ref @all-refs]
          (is (not (re-find #"#/\$defs/.*/" ref))
              (str "$ref should not contain unsanitized /: " ref))))
      ;; Also check that definitions stored in defs have sanitized nested $refs
      (doseq [[_def-name def-val] @defs]
        (clojure.walk/postwalk
         (fn [x]
           (when (and (map-entry? x) (= (key x) :$ref))
             (is (not (re-find #"#/\$defs/.*/" (val x)))
                 (str "$ref in definition should not contain unsanitized /: " (val x))))
           x)
         def-val)))))

(deftest ^:parallel endpoint->tool-definition-test
  (testing "Basic endpoint conversion"
    (let [defs   (atom (sorted-map))
          form   {:method          :get
                  :route           {:path "/v1/table/:id"}
                  :params          {:route {:binding '{:keys [id]}
                                            :schema  [:map [:id :int]]}}
                  :response-schema [:map [:name :string]]
                  :docstr          "Get a table."
                  :metadata        {:tool {:name "get_table"}}
                  :body            '(nil)}
          result (tools-manifest/endpoint->tool-definition defs "/api/agent" {:form form})]
      (is (= {:name           "get_table"
              :description    "Get a table."
              :endpoint       {:method "GET" :path "/api/agent/v1/table/{id}"}
              :inputSchema    {:type       "object"
                               :properties {:id {:type "integer"}}
                               :required   [:id]}
              :responseSchema {:type       "object"
                               :properties {:name {:type "string"}}
                               :required   [:name]}
              :annotations    {:readOnlyHint   true
                               :idempotentHint true}}
             result))))

  (testing "Scope is included when metadata has :scope"
    (let [defs   (atom (sorted-map))
          form   {:method          :get
                  :route           {:path "/v1/table/:id"}
                  :params          {:route {:binding '{:keys [id]}
                                            :schema  [:map [:id :int]]}}
                  :docstr          "Get a table."
                  :metadata        {:scope "agent:table:read"
                                    :tool  {:name "get_table"}}
                  :body            '(nil)}
          result (tools-manifest/endpoint->tool-definition defs "/api/agent" {:form form})]
      (is (= "agent:table:read" (:scope result)))))

  (testing "Scope is omitted when metadata has no :scope"
    (let [defs   (atom (sorted-map))
          form   {:method          :get
                  :route           {:path "/v1/test"}
                  :docstr          "Test endpoint."
                  :metadata        {:tool {:name "test_no_scope"}}
                  :body            '(nil)}
          result (tools-manifest/endpoint->tool-definition defs "/api/test" {:form form})]
      (is (nil? (:scope result))))))

;; This test verifies the full pipeline with actual defendpoint endpoints.
;; It requires the agent API namespace to be loaded.

;; A registered schema to verify $defs collection in the manifest.
(mr/def ::test-status [:enum "active" "inactive" "pending"])

;; 1. GET with route params and explicit name
(api.macros/defendpoint :get "/v1/test/:id"
  "A test endpoint for tools manifest generation."
  {:tool {:name "test_get_thing"}}
  [{:keys [id]} :- [:map [:id :int]]]
  {:id id})

;; 2. POST with body params and annotation override
(api.macros/defendpoint :post "/v1/test-action"
  "A test POST action."
  {:tool {:name "test_action"
          :annotations {:read-only? true}}}
  [_route-params
   _query-params
   body :- [:map [:name :string]]]
  body)

;; 3. DELETE — tests DELETE annotations
(api.macros/defendpoint :delete "/v1/test/:id"
  "Delete a test resource."
  {:tool {:name "delete_test"}}
  [#_{:clj-kondo/ignore [:unused-binding]}
   {:keys [id]} :- [:map [:id :int]]]
  nil)

;; 4. GET with query params (including tool/description) and response schema
(api.macros/defendpoint :get "/v1/test-search"
  :- [:map [:results [:sequential :string]]]
  "Search for things."
  {:tool {:name "test_search"}}
  [_route-params
   #_{:clj-kondo/ignore [:unused-binding]}
   {:keys [q limit]} :- [:map
                         [:q :string]
                         [:limit {:optional true}
                          [:int {:description      "Max results"
                                 :tool/description "Maximum number of results to return"}]]]]
  {:results []})

;; 5. POST with route + body params, task-support, and registered schema in response
(api.macros/defendpoint :post "/v1/test-resource/:id/action"
  :- [:map [:id :int] [:status ::test-status]]
  "Perform an action on a resource."
  {:tool {:name "test_resource_action"
          :task-support :parallel}}
  [{:keys [id]} :- [:map [:id :int]]
   _query-params
   #_{:clj-kondo/ignore [:unused-binding]}
   body :- [:map [:action :string]]]
  {:id id :status "active"})

;; 6. PUT with route + query + body params — tests PUT annotations + 3-way merge
(api.macros/defendpoint :put "/v1/test-resource/:id"
  "Update a test resource."
  {:tool {:name "test_resource"}}
  [{:keys [id]} :- [:map [:id :int]]
   #_{:clj-kondo/ignore [:unused-binding]}
   {:keys [dry-run]} :- [:map [:dry-run {:optional true} [:maybe :boolean]]]
   body :- [:map [:name :string]]]
  {:id id :name (:name body)})

(deftest ^:parallel check-tool-uniqueness-test
  (testing "No duplicates — no exception"
    (is (nil? (tools-manifest/check-tool-uniqueness
               [{:name "foo" :endpoint {:method "GET" :path "/v1/foo"}}
                {:name "bar" :endpoint {:method "POST" :path "/v1/bar"}}]))))
  (testing "Throws on duplicate tool names"
    (is (thrown-with-msg?
         ExceptionInfo
         #"Duplicate tool names detected"
         (tools-manifest/check-tool-uniqueness
          [{:name "foo" :endpoint {:method "GET"  :path "/v1/foo"}}
           {:name "foo" :endpoint {:method "POST" :path "/v1/foo"}}])))))

(defn- test-manifest []
  (tools-manifest/generate-tools-manifest
   {'metabase.api.macros.defendpoint.tools-manifest-test "/api/test"}))

(defn- test-tool [tool-name]
  (let [manifest (test-manifest)]
    (some #(when (= (:name %) tool-name) %) (:tools manifest))))

(deftest ^:parallel generate-tools-manifest-top-level-test
  (let [manifest (test-manifest)]
    (is (= "https://json-schema.org/draft/2020-12/schema" (:$schema manifest)))
    (is (= "1.0.0" (:version manifest)))
    (is (= 6 (count (:tools manifest))))
    (is (= (mapv :name (:tools manifest))
           (sort (mapv :name (:tools manifest))))
        "tools should be sorted by name")))

;; NOTE: simple registered schemas like ::test-status are inlined by malli
;; rather than producing $defs/$ref. $defs generation is exercised by the
;; real agent API endpoints which use complex recursive schemas.

(deftest ^:parallel generate-tools-manifest-get-with-route-params-test
  (is (= {:name           "test_get_thing"
          :description    "A test endpoint for tools manifest generation."
          :annotations    {:readOnlyHint true :idempotentHint true}
          :endpoint       {:method "GET" :path "/api/test/v1/test/{id}"}
          :inputSchema    {:type       "object"
                           :properties {:id {:type "integer"}}
                           :required   [:id]}}
         (test-tool "test_get_thing"))))

(deftest ^:parallel generate-tools-manifest-post-with-annotation-override-test
  (is (= {:name           "test_action"
          :description    "A test POST action."
          :annotations    {:readOnlyHint true}
          :endpoint       {:method "POST" :path "/api/test/v1/test-action"}
          :inputSchema    {:type       "object"
                           :properties {:name {:type "string"}}
                           :required   [:name]}}
         (test-tool "test_action"))))

(deftest ^:parallel generate-tools-manifest-delete-test
  (is (= {:name           "delete_test"
          :description    "Delete a test resource."
          :annotations    {:destructiveHint true :idempotentHint true}
          :endpoint       {:method "DELETE" :path "/api/test/v1/test/{id}"}
          :inputSchema    {:type       "object"
                           :properties {:id {:type "integer"}}
                           :required   [:id]}}
         (test-tool "delete_test"))))

(deftest ^:parallel generate-tools-manifest-get-with-query-params-test
  (is (= {:name           "test_search"
          :description    "Search for things."
          :annotations    {:readOnlyHint true :idempotentHint true}
          :endpoint       {:method "GET" :path "/api/test/v1/test-search"}
          :inputSchema    {:type       "object"
                           :properties {:q     {:type "string"}
                                        :limit {:type        "integer"
                                                :description "Maximum number of results to return"}}
                           :required   [:q]}
          :responseSchema {:type       "object"
                           :properties {:results {:type "array" :items {:type "string"}}}
                           :required   [:results]}}
         (test-tool "test_search"))))

(deftest ^:parallel generate-tools-manifest-post-with-task-support-test
  (is (= {:name           "test_resource_action"
          :description    "Perform an action on a resource."
          :endpoint       {:method "POST" :path "/api/test/v1/test-resource/{id}/action"}
          :inputSchema    {:type       "object"
                           :properties {:id     {:type "integer"}
                                        :action {:type "string"}}
                           :required   [:id :action]}
          :responseSchema {:type       "object"
                           :properties {:id     {:type "integer"}
                                        :status {:type "string"
                                                 :enum ["active" "inactive" "pending"]}}
                           :required   [:id :status]}
          :execution      {:taskSupport "parallel"}}
         (test-tool "test_resource_action"))))

(deftest ^:parallel generate-tools-manifest-put-with-three-way-merge-test
  (is (= {:name           "test_resource"
          :description    "Update a test resource."
          :annotations    {:destructiveHint false :idempotentHint true}
          :endpoint       {:method "PUT" :path "/api/test/v1/test-resource/{id}"}
          :inputSchema    {:type       "object"
                           :properties {:id      {:type "integer"}
                                        :dry-run {:oneOf [{:type "boolean"} {:type "null"}]}
                                        :name    {:type "string"}}
                           :required   [:id :name]}}
         (test-tool "test_resource"))))
