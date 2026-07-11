(ns metabase.agent-api.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.tools :as tools]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Teaching errors
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel teaching-error-test
  (testing "throws an ex-info carrying :status-code, default 400"
    (let [ex (try (tools/teaching-error "fix it this way") (catch ExceptionInfo e e))]
      (is (= "fix it this way" (ex-message ex)))
      (is (= 400 (:status-code (ex-data ex))))))
  (testing "explicit status and extra data"
    (let [ex (try (tools/teaching-error "nope" 403 {:field :name}) (catch ExceptionInfo e e))]
      (is (= 403 (:status-code (ex-data ex))))
      (is (= :name (:field (ex-data ex))))))
  (testing "permission-error is a 403"
    (let [ex (try (tools/permission-error "grant author:write") (catch ExceptionInfo e e))]
      (is (= 403 (:status-code (ex-data ex)))))))

(deftest ^:parallel check-exactly-one!-test
  (testing "exactly one present returns params unchanged"
    (is (= {:query {:a 1}}
           (tools/check-exactly-one! {:query {:a 1}} [:query :query_handle]))))
  (testing "none present names the fix"
    (is (thrown-with-msg?
         ExceptionInfo #"Provide exactly one of `query`, `query_handle`"
         (tools/check-exactly-one! {} [:query :query_handle]))))
  (testing "several present names the fix (both query and query_handle)"
    (is (thrown-with-msg?
         ExceptionInfo #"Provide only one of `query`, `query_handle`"
         (tools/check-exactly-one! {:query {} :query_handle "abc"} [:query :query_handle]))))
  (testing "nil-valued keys count as absent"
    (is (thrown-with-msg?
         ExceptionInfo #"Provide exactly one"
         (tools/check-exactly-one! {:query nil :query_handle nil} [:query :query_handle])))))

;;; ──────────────────────────────────────────────────────────────────
;;; The `_write` recipe
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel validate-write!-test
  (testing "create missing a per-method-required field → teaching error naming field + method"
    (is (thrown-with-msg?
         ExceptionInfo #"name is required for the create method"
         (tools/validate-write! {:method "create"} {"create" [:name] "update" []}))))
  (testing "update without id → teaching error"
    (is (thrown-with-msg?
         ExceptionInfo #"id is required for the update method"
         (tools/validate-write! {:method "update"} {"create" [:name] "update" []}))))
  (testing "unknown method → teaching error naming the valid values"
    (is (thrown-with-msg?
         ExceptionInfo #"method must be one of"
         (tools/validate-write! {:method "delete"} {"create" [] "update" []}))))
  (testing "valid create returns params unchanged"
    (is (= {:method "create" :name "Revenue"}
           (tools/validate-write! {:method "create" :name "Revenue"} {"create" [:name] "update" []}))))
  (testing "valid update returns params unchanged"
    (is (= {:method "update" :id 7 :name "Renamed"}
           (tools/validate-write! {:method "update" :id 7 :name "Renamed"} {"create" [:name] "update" []})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Ref ergonomics
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel classify-ref-test
  (is (= {:kind :id :id 42} (tools/classify-ref 42)))
  (is (= {:kind :entity-id :entity-id "FReCLx5hSWTBU7kjCWfuu"}
         (tools/classify-ref "FReCLx5hSWTBU7kjCWfuu")))
  (is (= {:kind :root} (tools/classify-ref "root")))
  (is (= {:kind :trash} (tools/classify-ref "trash")))
  (is (= {:kind :null} (tools/classify-ref nil)))
  (testing "a non-id string is a teaching error, not a silent pass"
    (is (thrown-with-msg?
         ExceptionInfo #"expected a numeric id or a 21-character entity_id"
         (tools/classify-ref "not-an-id")))))

;;; ──────────────────────────────────────────────────────────────────
;;; response_format projections
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel project-test
  (let [record {:id 1 :name "Orders" :description "the orders table" :row_count 500 :engine "h2"}
        spec   {:concise [:id :name :description]}]
    (testing "nil / concise selects the concise subset with REST property names verbatim"
      (is (= {:id 1 :name "Orders" :description "the orders table"} (tools/project nil spec record)))
      (is (= {:id 1 :name "Orders" :description "the orders table"} (tools/project "concise" spec record))))
    (testing "detailed with no :detailed spec returns the whole record"
      (is (= record (tools/project "detailed" spec record))))
    (testing "detailed honors an explicit :detailed key set"
      (is (= {:id 1 :name "Orders" :row_count 500}
             (tools/project "detailed" (assoc spec :detailed [:id :name :row_count]) record))))
    (testing "project-all maps the projection over a sequence"
      (is (= [{:id 1 :name "Orders" :description "the orders table"}]
             (tools/project-all "concise" spec [record]))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Bounded envelope + steering truncation
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel list-envelope-test
  (testing "the bare envelope carries data + returned, omits total/truncated when absent"
    (is (= {:data [{:id 1}] :returned 1} (tools/list-envelope [{:id 1}]))))
  (testing "total surfaces when known"
    (is (= {:data [{:id 1}] :returned 1 :total 9} (tools/list-envelope [{:id 1}] {:total 9}))))
  (testing "a truncation message flips :truncated and names the narrowing param"
    (let [msg (tools/truncation-message {:total 143 :returned 50 :noun "tables"
                                         :scope "in schema `public`"
                                         :narrow-with [:schema] :offset 0 :limit 50})
          env (tools/list-envelope (repeat 50 {:id 1}) {:total 143 :truncation-message msg})]
      (is (true? (:truncated env)))
      (is (= 143 (:total env)))
      (is (re-find #"`schema`" (:truncation_message env)))
      (is (re-find #"`offset: 50`" (:truncation_message env)))
      (is (re-find #"143 tables in schema `public`" (:truncation_message env))))))

(deftest ^:parallel budget-units-test
  (let [size (fn [n] n)]
    (testing "emits complete units until the budget runs out, then names the remainder — never a half unit"
      (is (= {:included [30 30 30] :omitted [30] :truncated? true}
             (tools/budget-units [30 30 30 30] {:token-budget 90 :size-fn size}))))
    (testing "everything fits → nothing omitted, not truncated"
      (is (= {:included [10 10] :omitted [] :truncated? false}
             (tools/budget-units [10 10] {:token-budget 1000 :size-fn size}))))
    (testing "a single over-budget unit is still included (caller decides whether to slice it)"
      (is (= {:included [500] :omitted [10] :truncated? true}
             (tools/budget-units [500 10] {:token-budget 100 :size-fn size}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; A fixture `<entity>_write` endpoint proving the recipe end to end
;;; ──────────────────────────────────────────────────────────────────

(api.macros/defendpoint :post "/v1/widget-write" :- [:map [:id ms/PositiveInt] [:method :string]]
  "Create or update a widget. name is required for the create method."
  {:scope "agent:author:write"
   :tool  {:name           "widget_write"
           :input-examples [{:method "create" :name "Revenue widget"}
                            {:method "update" :id 12 :archived true}]}}
  [_route-params
   _query-params
   {:keys [method id] :as body}
   :- [:map
       [:method   tools/MethodField]
       [:id       {:optional true} [:maybe tools/IdRef]]
       [:name     {:optional true} [:maybe ms/NonBlankString]]
       [:archived {:optional true} [:maybe :boolean]]]]
  (tools/validate-write! body {"create" [:name] "update" []})
  {:id (or id 1) :method method})

(defn- widget-write-tool []
  (let [manifest (tools-manifest/generate-tools-manifest
                  {'metabase.agent-api.tools-test "/api/test"})]
    (some #(when (= (:name %) "widget_write") %) (:tools manifest))))

(deftest ^:parallel write-recipe-manifest-test
  (let [tool   (widget-write-tool)
        schema (:inputSchema tool)]
    (testing "the generated schema has no top-level combinator (strict clients reject those)"
      (is (= "object" (:type schema)))
      (is (not (contains? schema :oneOf)))
      (is (not (contains? schema :anyOf)))
      (is (not (contains? schema :allOf))))
    (testing "`method` is the only truly-required field: a non-nullable enum"
      (is (= {:type "string" :enum ["create" "update"]}
             (get-in schema [:properties :method])))
      (testing "every other field is nullable (strict transform makes them required-but-nullable)"
        (doseq [k [:id :name :archived]]
          (is (re-find #"null" (pr-str (get-in schema [:properties k])))
              (str k " should carry a null branch")))))
    (testing "input_examples flow schema → manifest"
      (is (= [{:method "create" :name "Revenue widget"}
              {:method "update" :id 12 :archived true}]
             (:inputExamples tool))))
    (testing "a write tool is not read-only"
      (is (false? (get-in tool [:annotations :readOnlyHint])))
      (is (false? (get-in tool [:annotations :destructiveHint]))))
    (testing "the toolset group scope rides along"
      (is (= "agent:author:write" (:scope tool))))))
