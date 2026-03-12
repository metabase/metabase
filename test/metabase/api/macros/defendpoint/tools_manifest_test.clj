(ns metabase.api.macros.defendpoint.tools-manifest-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk]
   [malli.json-schema :as mjs]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.util.malli.registry :as mr]))

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
           (tools-manifest/infer-tool-name :delete "/api/agent" "/v1/table/:id"))))
  (testing "Non-versioned paths strip leading / and api segment"
    (is (= "get_card_query"
           (tools-manifest/infer-tool-name :get "/api" "/card/:id/query")))))

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
  (testing "tool/description replaces description in JSON schema output"
    (let [rewritten (tools-manifest/rewrite-tool-descriptions
                     [:map [:id [:int {:description      "Internal ID"
                                       :tool/description "The ID of the saved question"}]]])
          jss       (mjs/transform rewritten)]
      (is (= "The ID of the saved question"
             (get-in jss [:properties :id :description])))))
  (testing "schemas without tool/description keep original description"
    (let [rewritten (tools-manifest/rewrite-tool-descriptions
                     [:map [:id [:int {:description "Internal ID"}]]])
          jss       (mjs/transform rewritten)]
      (is (= "Internal ID"
             (get-in jss [:properties :id :description]))))))

;;; ------------------------------------------- Nested $ref sanitization ------------------------------------------------

(mr/def ::ref-target-a [:enum "x" "y"])
(mr/def ::ref-target-b [:map [:nested ::ref-target-a]])

(deftest ^:parallel nested-ref-sanitization-test
  (testing "All $ref values are sanitized, including nested ones inside oneOf/definitions"
    (binding [tools-manifest/*definitions* (atom (sorted-map))]
      ;; [:or ...] produces oneOf in JSON Schema, each branch may have its own $ref
      (let [jss (tools-manifest/mjs-collect-tool-definitions
                 [:or ::ref-target-a ::ref-target-b])]
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
        ;; Also check that definitions stored in *definitions* have sanitized nested $refs
        (doseq [[_def-name def-val] @tools-manifest/*definitions*]
          (clojure.walk/postwalk
           (fn [x]
             (when (and (map-entry? x) (= (key x) :$ref))
               (is (not (re-find #"#/\$defs/.*/" (val x)))
                   (str "$ref in definition should not contain unsanitized /: " (val x))))
             x)
           def-val))))))

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
                                 :required   [:id]}
                :responseSchema {:type       "object"
                                 :properties {:name {:type "string"}}
                                 :required   [:name]}
                :annotations    {:readOnlyHint   true
                                 :idempotentHint true}}
               result))))))

;;; ---------------------------------------------- Integration test -------------------------------------------------------

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

;; 3. DELETE with no explicit name — tests name inference + DELETE annotations
(api.macros/defendpoint :delete "/v1/test/:id"
  "Delete a test resource."
  {:tool {}}
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

;; 6. PUT with route + query + body params, no explicit name — tests PUT annotations + name inference + 3-way merge
(api.macros/defendpoint :put "/v1/test-resource/:id"
  "Update a test resource."
  {:tool {}}
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
         clojure.lang.ExceptionInfo
         #"Duplicate tool names detected"
         (tools-manifest/check-tool-uniqueness
          [{:name "foo" :endpoint {:method "GET"  :path "/v1/foo"}}
           {:name "foo" :endpoint {:method "POST" :path "/v1/foo"}}])))))

(deftest ^:parallel generate-tools-manifest-test
  (testing "Generate manifest from test endpoints in this namespace"
    (let [manifest (tools-manifest/generate-tools-manifest
                    {'metabase.api.macros.defendpoint.tools-manifest-test "/api/test"})
          tools-by-name (into {} (map (juxt :name identity)) (:tools manifest))]
      (testing "top-level structure"
        (is (= "https://json-schema.org/draft/2020-12/schema" (:$schema manifest)))
        (is (= "1.0.0" (:version manifest)))
        (is (= 6 (count (:tools manifest))))
        (is (= (mapv :name (:tools manifest))
               (sort (mapv :name (:tools manifest))))
            "tools should be sorted by name"))

      ;; NOTE: simple registered schemas like ::test-status are inlined by malli
      ;; rather than producing $defs/$ref. $defs generation is exercised by the
      ;; real agent API endpoints which use complex recursive schemas.

      (testing "GET endpoint with route params (test_get_thing)"
        (let [tool (get tools-by-name "test_get_thing")]
          (is (some? tool))
          (is (= "A test endpoint for tools manifest generation." (:description tool)))
          (is (= {:method "GET" :path "/api/test/v1/test/{id}"}
                 (:endpoint tool)))
          (is (= {:type       "object"
                  :properties {:id {:type "integer"}}
                  :required   [:id]}
                 (:inputSchema tool)))
          (is (nil? (:responseSchema tool)))
          (is (= {:readOnlyHint true :idempotentHint true}
                 (:annotations tool)))
          (is (nil? (:execution tool)))))

      (testing "POST endpoint with body params and annotation override (test_action)"
        (let [tool (get tools-by-name "test_action")]
          (is (some? tool))
          (is (= "A test POST action." (:description tool)))
          (is (= {:method "POST" :path "/api/test/v1/test-action"}
                 (:endpoint tool)))
          (is (= {:type       "object"
                  :properties {:name {:type "string"}}
                  :required   [:name]}
                 (:inputSchema tool)))
          (is (= {:readOnlyHint true}
                 (:annotations tool)))))

      (testing "DELETE endpoint with inferred name (delete_test)"
        (let [tool (get tools-by-name "delete_test")]
          (is (some? tool))
          (is (= "Delete a test resource." (:description tool)))
          (is (= {:method "DELETE" :path "/api/test/v1/test/{id}"}
                 (:endpoint tool)))
          (is (= {:type       "object"
                  :properties {:id {:type "integer"}}
                  :required   [:id]}
                 (:inputSchema tool)))
          (is (= {:destructiveHint true :idempotentHint true}
                 (:annotations tool)))))

      (testing "GET with query params, tool/description, and response schema (test_search)"
        (let [tool (get tools-by-name "test_search")]
          (is (some? tool))
          (is (= "Search for things." (:description tool)))
          (is (= {:method "GET" :path "/api/test/v1/test-search"}
                 (:endpoint tool)))
          ;; inputSchema merges query params
          (is (= "object" (get-in tool [:inputSchema :type])))
          (is (contains? (get-in tool [:inputSchema :properties]) :q))
          (is (contains? (get-in tool [:inputSchema :properties]) :limit))
          (is (some #{:q} (get-in tool [:inputSchema :required])))
          ;; limit is optional — should not appear in required
          (is (not (some #{:limit} (get-in tool [:inputSchema :required]))))
          ;; tool/description should override the original description
          (is (= "Maximum number of results to return"
                 (get-in tool [:inputSchema :properties :limit :description])))
          ;; response schema
          (is (= {:type       "object"
                  :properties {:results {:type "array" :items {:type "string"}}}
                  :required   [:results]}
                 (:responseSchema tool)))
          (is (= {:readOnlyHint true :idempotentHint true}
                 (:annotations tool)))))

      (testing "POST with route+body, task-support, and registered schema in response (test_resource_action)"
        (let [tool (get tools-by-name "test_resource_action")]
          (is (some? tool))
          (is (= "Perform an action on a resource." (:description tool)))
          (is (= {:method "POST" :path "/api/test/v1/test-resource/{id}/action"}
                 (:endpoint tool)))
          ;; inputSchema merges route id + body action
          (is (= "object" (get-in tool [:inputSchema :type])))
          (is (contains? (get-in tool [:inputSchema :properties]) :id))
          (is (contains? (get-in tool [:inputSchema :properties]) :action))
          (let [required (set (get-in tool [:inputSchema :required]))]
            (is (contains? required :id))
            (is (contains? required :action)))
          ;; task-support → execution.taskSupport
          (is (= {:taskSupport "parallel"} (:execution tool)))
          ;; response schema with registered enum inlined
          (is (some? (:responseSchema tool)))
          (is (= "object" (get-in tool [:responseSchema :type])))
          (is (contains? (get-in tool [:responseSchema :properties]) :id))
          (is (= {:enum ["active" "inactive" "pending"] :type "string"}
                 (get-in tool [:responseSchema :properties :status])))
          ;; POST with no explicit annotations → empty map → annotations key omitted
          (is (not (contains? tool :annotations)))))

      (testing "PUT with route+query+body, inferred name (test_resource)"
        (let [tool (get tools-by-name "test_resource")]
          (is (some? tool))
          (is (= "Update a test resource." (:description tool)))
          (is (= {:method "PUT" :path "/api/test/v1/test-resource/{id}"}
                 (:endpoint tool)))
          ;; inputSchema merges all three param sources
          (is (= "object" (get-in tool [:inputSchema :type])))
          (is (contains? (get-in tool [:inputSchema :properties]) :id))
          (is (contains? (get-in tool [:inputSchema :properties]) :dry-run))
          (is (contains? (get-in tool [:inputSchema :properties]) :name))
          ;; id and name required; dry-run is optional
          (let [required (set (get-in tool [:inputSchema :required]))]
            (is (contains? required :id))
            (is (contains? required :name))
            (is (not (contains? required :dry-run))))
          ;; PUT annotations
          (is (= {:destructiveHint false :idempotentHint true}
                 (:annotations tool))))))))
