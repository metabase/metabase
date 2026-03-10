(ns metabase.api.macros.defendpoint.mcp-tools-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.mcp-tools :as mcp-tools]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util.malli.schema :as ms]))

;;; ------------------------------------------------ Name Inference -------------------------------------------------

(deftest ^:parallel infer-tool-name-test
  (testing "GET endpoints get `get_` prefix"
    (is (= "get_table" (mcp-tools/infer-tool-name :get "/v1/table/:id")))
    (is (= "get_table_field_values"
           (mcp-tools/infer-tool-name :get "/v1/table/:id/field/:field-id/values")))
    (is (= "get_metric" (mcp-tools/infer-tool-name :get "/v1/metric/:id"))))
  (testing "POST endpoints derive verb from the path (no method prefix)"
    (is (= "construct_query" (mcp-tools/infer-tool-name :post "/v1/construct-query")))
    (is (= "search" (mcp-tools/infer-tool-name :post "/v1/search")))
    (is (= "execute" (mcp-tools/infer-tool-name :post "/v1/execute"))))
  (testing "version prefix is stripped"
    (is (= "get_foo" (mcp-tools/infer-tool-name :get "/v1/foo")))
    (is (= "get_foo" (mcp-tools/infer-tool-name :get "/v2/foo"))))
  (testing "hyphens are converted to underscores"
    (is (= "construct_query" (mcp-tools/infer-tool-name :post "/v1/construct-query")))))

;;; -------------------------------------------- Annotation Inference -----------------------------------------------

(deftest ^:parallel infer-annotations-test
  (testing "GET defaults to readOnly + idempotent"
    (is (= {:readOnlyHint true, :idempotentHint true}
           (mcp-tools/infer-annotations :get true))))
  (testing "DELETE defaults to destructive"
    (is (= {:destructiveHint true}
           (mcp-tools/infer-annotations :delete true))))
  (testing "POST defaults to not readOnly"
    (is (= {:readOnlyHint false}
           (mcp-tools/infer-annotations :post true))))
  (testing "explicit overrides merge with defaults"
    (is (= {:readOnlyHint true}
           (mcp-tools/infer-annotations :post {:annotations {:read-only? true}}))))
  (testing "multiple overrides"
    (is (= {:readOnlyHint true, :idempotentHint true}
           (mcp-tools/infer-annotations :post {:annotations {:read-only? true, :idempotent? true}})))))

;;; -------------------------------------------- Schema Conversion -------------------------------------------------

(deftest ^:parallel build-input-schema-test
  (testing "route params produce an object schema"
    (let [form {:params {:route {:schema [:map [:id ms/PositiveInt]]}}
                :method :get
                :route  {:path "/v1/table/:id"}}
          result (mcp-tools/build-input-schema form)]
      (is (= :object (:type result)))
      (is (contains? (:properties result) "id"))))

  (testing "query params are included"
    (let [form {:params {:route {:schema [:map [:id ms/PositiveInt]]}
                         :query {:schema [:map [:with-fields {:optional true} [:maybe :boolean]]]}}
                :method :get
                :route  {:path "/v1/table/:id"}}
          result (mcp-tools/build-input-schema form)]
      (is (contains? (:properties result) "id"))
      (is (contains? (:properties result) "with-fields"))))

  (testing "body params are included"
    (let [form {:params {:body {:schema [:map [:query ms/NonBlankString]]}}
                :method :post
                :route  {:path "/v1/execute"}}
          result (mcp-tools/build-input-schema form)]
      (is (= :object (:type result)))
      (is (contains? (:properties result) "query"))))

  (testing "nil when no params"
    (is (nil? (mcp-tools/build-input-schema {:params {} :method :get :route {:path "/v1/ping"}})))))

(deftest ^:parallel build-output-schema-test
  (testing "response schema produces JSON Schema"
    (let [form {:response-schema [:map [:message :string]]}
          result (mcp-tools/build-output-schema form)]
      (is (= :object (:type result)))
      (is (contains? (:properties result) "message"))))

  (testing "streaming response schema uses content schema"
    (let [content [:map [:status [:enum :completed :failed]]]
          form    {:response-schema (streaming-response/streaming-response-schema content)}
          result  (mcp-tools/build-output-schema form)]
      (is (= :object (:type result)))
      (is (contains? (:properties result) "status"))))

  (testing "nil when no response schema"
    (is (nil? (mcp-tools/build-output-schema {})))))

;;; -------------------------------------------- Tool Description ---------------------------------------------------

(deftest ^:parallel tool-description-preference-test
  (testing ":tool/description is preferred over :description"
    (let [form   {:params {:route {:schema [:map
                                            [:field-id {:description "internal desc"
                                                        :tool/description "Field ID in format 't123-0'"}
                                             :string]]}}
                  :method :get
                  :route  {:path "/v1/test/:field-id"}}
          result (mcp-tools/build-input-schema form)]
      (is (= "Field ID in format 't123-0'"
             (get-in result [:properties "field-id" :description]))))))

;;; ------------------------------------------- Endpoint->Tool ------------------------------------------------------

(deftest ^:parallel endpoint->tool-test
  (testing "produces a well-formed tool definition"
    (let [endpoint {:form {:method          :get
                           :route           {:path "/v1/table/:id"}
                           :params          {:route {:schema [:map [:id ms/PositiveInt]]}}
                           :body            []
                           :docstr          "Get a table."
                           :metadata        {:tool true}
                           :response-schema [:map [:id :int] [:name :string]]}}
          tool     (mcp-tools/endpoint->tool endpoint "/api/agent")]
      (is (= "get_table" (:name tool)))
      (is (= "Get a table." (:description tool)))
      (is (= {:readOnlyHint true, :idempotentHint true} (:annotations tool)))
      (is (= :object (get-in tool [:inputSchema :type])))
      (is (= "GET" (get-in tool [:endpoint :method])))
      (is (= "/api/agent/v1/table/{id}" (get-in tool [:endpoint :path])))
      (is (= ["id"] (get-in tool [:endpoint :route-params])))
      (is (some? (:outputSchema tool))))))

;;; ------------------------------------------- Full Manifest -------------------------------------------------------

;; Define test endpoints for manifest generation
(api.macros/defendpoint :get "/v1/test-entity/:id" :- [:map [:id :int] [:name :string]]
  "Get a test entity by ID."
  {:tool true}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  {:id id :name "test"})

(api.macros/defendpoint :post "/v1/test-action" :- [:map [:result :string]]
  "Perform a test action."
  {:tool {:annotations {:read-only? true}}}
  [_route-params
   _query-params
   {:keys [input]} :- [:map [:input :string]]]
  {:result input})

(api.macros/defendpoint :get "/v1/no-tool"
  "Not a tool endpoint."
  {}
  []
  {:ok true})

(deftest ^:parallel tool-manifest-test
  (testing "only includes endpoints with :tool metadata"
    (let [manifest (mcp-tools/tool-manifest 'metabase.api.macros.defendpoint.mcp-tools-test "/api/test")]
      (is (= #{"get_test_entity" "test_action"}
             (set (map :name (:tools manifest)))))
      (is (not (some #(= "get_no_tool" (:name %)) (:tools manifest))))))

  (testing "annotations are correctly applied"
    (let [manifest (mcp-tools/tool-manifest 'metabase.api.macros.defendpoint.mcp-tools-test "/api/test")
          tools    (into {} (map (juxt :name identity)) (:tools manifest))]
      (is (= {:readOnlyHint true, :idempotentHint true}
             (:annotations (get tools "get_test_entity"))))
      (is (= {:readOnlyHint true}
             (:annotations (get tools "test_action"))))))

  (testing "endpoint dispatch info is present"
    (let [manifest (mcp-tools/tool-manifest 'metabase.api.macros.defendpoint.mcp-tools-test "/api/test")
          tools    (into {} (map (juxt :name identity)) (:tools manifest))]
      (is (= "GET" (get-in tools ["get_test_entity" :endpoint :method])))
      (is (= "/api/test/v1/test-entity/{id}" (get-in tools ["get_test_entity" :endpoint :path])))
      (is (= "POST" (get-in tools ["test_action" :endpoint :method]))))))
