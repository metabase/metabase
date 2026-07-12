(ns metabase.agent-api.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.tools :as tools]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical])
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

;;; ──────────────────────────────────────────────────────────────────
;;; Composed writes
;;; ──────────────────────────────────────────────────────────────────

(deftest run-ops!-test
  (testing "ops apply in order and their results come back in order"
    (is (= [1 2 3] (tools/run-ops! [1 2 3] identity))))
  (testing "a failing op aborts the call naming its index and the underlying message"
    (is (thrown-with-msg?
         ExceptionInfo #"Op 1 failed: no such card"
         (tools/run-ops! [:ok :bad :never]
                         (fn [op]
                           (when (= op :bad)
                             (throw (ex-info "no such card" {:status-code 404})))
                           op)))))
  (testing "the failing op's status code and index survive on the ex-data"
    (let [ex (try (tools/run-ops! [:bad] (fn [_] (throw (ex-info "denied" {:status-code 403}))))
                  (catch ExceptionInfo e e))]
      (is (= 403 (:status-code (ex-data ex))))
      (is (= 0 (:op-index (ex-data ex))))))
  (testing "ops after the failing one never run"
    (let [applied (atom [])]
      (try
        (tools/run-ops! [:a :bad :c]
                        (fn [op]
                          (swap! applied conj op)
                          (when (= op :bad) (throw (ex-info "boom" {})))
                          op))
        (catch ExceptionInfo _ nil))
      (is (= [:a :bad] @applied)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Read events
;;; ──────────────────────────────────────────────────────────────────

(defn- captured-events!
  "The `[topic event]` pairs `thunk` publishes. Spies with an aux method rather than redefining
   `publish-event!` — it is a methodical multimethod, and swapping its var out from under the
   namespaces that `defmethod` on it breaks them."
  [thunk]
  (let [published (atom [])
        spy-key   (gensym "captured-events!")]
    (try
      (methodical/add-aux-method-with-unique-key!
       #'events/publish-event! :before :default
       (fn [topic event] (swap! published conj [topic event]))
       spy-key)
      (thunk)
      (finally
        (methodical/remove-aux-method-with-unique-key!
         #'events/publish-event! :before :default spy-key)))
    @published))

(defn- read-event-signature
  "Topic, reader, and entity of a read event — the part that has to match across the two surfaces.
   The payloads themselves carry either the id or the whole instance, and the instance the REST
   handler loads is hydrated where ours is not."
  [pairs topic]
  (for [[t {:keys [object object-id user-id]}] pairs
        :when (= t topic)]
    [t user-id (or object-id (:id object))]))

(deftest publish-read-event-matches-the-browser-get-test
  (testing "a read tool publishes the read event the entity's REST read publishes, for the same user"
    (mt/with-temp [:model/Dashboard  dash {}
                   :model/Collection coll {}]
      (testing "dashboard — the payload carries the id"
        (is (= (read-event-signature
                (captured-events! #(mt/user-http-request :rasta :get 200 (str "dashboard/" (:id dash))))
                :event/dashboard-read)
               (read-event-signature
                (captured-events! #(mt/with-test-user :rasta
                                     (tools/publish-read-event! :model/Dashboard dash)))
                :event/dashboard-read))))
      (testing "collection — the payload carries the instance, because the handler reads more than the id"
        (is (= (read-event-signature
                (captured-events! #(mt/user-http-request :rasta :get 200 (str "collection/" (:id coll) "/items")))
                :event/collection-read)
               (read-event-signature
                (captured-events! #(mt/with-test-user :rasta
                                     (tools/publish-read-event! :model/Collection coll)))
                :event/collection-read)))))))

(deftest publish-read-event-returns-the-object-test
  (mt/with-temp [:model/Dashboard dash {}]
    (is (= dash (mt/with-test-user :rasta (tools/publish-read-event! :model/Dashboard dash))))))

(deftest publish-read-event-card-is-silent-test
  (testing "a card metadata read publishes nothing, exactly as its REST read does — :event/card-read
            comes from the query processor when the card is run"
    (mt/with-temp [:model/Card card {}]
      (is (empty? (captured-events! #(mt/with-test-user :rasta
                                       (tools/publish-read-event! :model/Card card))))))))
