(ns metabase.mcp.v2.common-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel list-envelope-test
  (is (= {:data [{:id 1} {:id 2}] :returned 2 :total 214}
         (common/list-envelope [{:id 1} {:id 2}] 214)))
  (testing "total is omitted when unknown"
    (is (= {:data [] :returned 0} (common/list-envelope [])))))

(deftest ^:parallel truncation-line-test
  (testing "a truncated page names the narrowing parameter and the next offset"
    (let [line (common/truncation-line {:param "search" :offset 0 :limit 50 :total 214})]
      (is (str/includes? line "`search`"))
      (is (str/includes? line "offset: 50"))))
  (testing "the final page gets no steering line"
    (is (nil? (common/truncation-line {:param "search" :offset 200 :limit 50 :total 214}))))
  (testing "GHY-4137: an exact total reads as a plain count"
    (let [line (common/truncation-line {:param "type" :offset 0 :limit 50 :total 214})]
      (is (str/includes? line "of 214"))
      (is (not (str/includes? line "at least")))))
  (testing "GHY-4137: a floor total (a ranking-capped search count) reads as \"at least N\", so the
            agent doesn't take a capped total for the full match count"
    (let [line (common/truncation-line {:param "type" :offset 0 :limit 50 :total 1000 :total-floor? true})]
      (is (str/includes? line "at least 1000")))))

(deftest ^:parallel teaching-error-test
  (testing "teaching errors surface their message as MCP error content"
    (let [content (try
                    (common/throw-teaching-error "Use `fields` OR `response_format`, not both.")
                    (catch clojure.lang.ExceptionInfo e
                      (common/->mcp-error-content e)))]
      (is (:isError content))
      (is (= "Use `fields` OR `response_format`, not both."
             (-> content :content first :text))))))

(deftest ^:parallel error-redaction-test
  (let [text #(-> % :content first :text)]
    (testing "GHY-4137: only deliberately caller-facing errors surface their message — client
              (4xx) status codes or an explicit ::error-code"
      (doseq [[label e expected] [["teaching 400"  (ex-info "Use fields OR response_format." {:status-code 400})       "Use fields OR response_format."]
                                  ["not-found 404" (ex-info "card 7 not found." {:status-code 404})                    "card 7 not found."]
                                  ["scope 403"     (ex-info "Insufficient scope." {:status-code 403
                                                                                   ::common/error-code common/error-code-invalid-request}) "Insufficient scope."]]]
        (testing label
          (is (= expected (text (common/->mcp-error-content e)))))))
    (testing "GHY-4137: 402 (missing premium feature) and 409 (conflict) are deliberate
              caller-facing errors too — a premium-feature check names the missing feature, a
              conflict names the clashing state, and neither may be redacted to a generic error"
      (doseq [[label e expected]
              [["premium-feature 402" (ex-info "Transforms is a paid feature not available on this instance."
                                               {:status-code 402}) "Transforms is a paid feature not available on this instance."]
               ["conflict 409"        (ex-info "A snippet named \"totals\" already exists in this collection."
                                               {:status-code 409}) "A snippet named \"totals\" already exists in this collection."]]]
        (testing label
          (is (= expected (text (common/->mcp-error-content e)))))))
    (testing "internal failures are redacted to a generic message — their real text may embed SQL,
              schema, or connection detail and must never reach the client"
      (doseq [[label e] [["projection 500 invariant" (ex-info "No projection registered for type: widget" {:status-code 500})]
                         ["ex-info with no status-code (library wrap)" (ex-info "Error executing query: SELECT * FROM secret_accounts" {:query {}})]
                         ["JDBC SQLException" (java.sql.SQLException. "ERROR: relation \"secret_accounts\" does not exist")]
                         ["NPE naming an internal class" (NullPointerException. "metabase.driver.internal.Foo is null")]]]
        (testing label
          (let [content (common/->mcp-error-content e)]
            (is (:isError content))
            (is (= "Internal error" (text content)))
            (is (= common/error-code-internal (::common/error-code content))
                "internal errors carry the internal JSON-RPC code")))))
    (testing "an explicit internal ::error-code never surfaces its message even on an ex-info"
      (is (= "Internal error"
             (text (common/->mcp-error-content
                    (ex-info "leaky internal detail" {::common/error-code common/error-code-internal}))))))))

(deftest ^:parallel success-content-test
  (testing "read responses default to text-only"
    (is (= {:content [{:type "text" :text "hi"}]} (common/success-content "hi"))))
  (testing "structuredContent is emitted only when explicitly passed"
    (is (= {:ok true} (:structuredContent (common/success-content "hi" {:ok true}))))))

(deftest ^:parallel response-format-test
  (is (= :concise (common/response-format {})))
  (is (= :concise (common/response-format {:response_format "concise"})))
  (is (= :detailed (common/response-format {:response_format "detailed"})))
  (is (thrown-with-msg? Exception #"concise"
                        (common/response-format {:response_format "verbose"}))))

(deftest ^:parallel resolve-id-test
  (testing "numeric ids pass through without a lookup"
    (is (= 7 (common/resolve-id-or-404 :model/Card 7))))
  (testing "anything that is neither numeric nor a 21-char entity_id is a teaching error"
    (is (thrown-with-msg? Exception #"entity_id"
                          (common/resolve-id-or-404 :model/Card "abc")))))

(deftest ^:parallel resolve-and-read-collapses-existence-test
  (testing "\"exists but unreadable\" throws the same not-found error as \"doesn't exist\""
    (let [denied  (try (common/resolve-and-read :model/Card 7
                                                (fn [_] (throw (ex-info "You don't have permission." {:status-code 403}))))
                       (catch Exception e (ex-message e)))
          missing (try (common/resolve-and-read :model/Card 7
                                                (fn [_] (throw (ex-info "Not found." {:status-code 404}))))
                       (catch Exception e (ex-message e)))]
      (is (= denied missing))
      (is (str/includes? denied "not found")))))

(deftest ^:parallel entity-id?-test
  (testing "a genuine 21-char entity_id is recognized"
    (is (true? (common/entity-id? (u/generate-nano-id)))))
  (testing "numeric ids and short strings are not entity_ids"
    (is (false? (common/entity-id? 7)))
    (is (false? (common/entity-id? "abc")))))

(deftest resolve-id-or-404-resolves-entity-id-test
  (testing "a valid entity_id translates to the object's numeric id"
    (mt/with-temp [:model/Collection {coll-id :id eid :entity_id} {}]
      (is (= coll-id (common/resolve-id-or-404 :model/Collection eid))))))

(deftest resolve-and-read-happy-path-test
  (mt/with-temp [:model/Collection coll {}]
    (let [eid (:entity_id coll)]
      (testing "returns the object when the read check yields it"
        (is (= coll (common/resolve-and-read :model/Collection eid (fn [_] coll)))))
      (testing "a nil read check collapses to the not-found error"
        (is (thrown-with-msg? Exception #"not found"
                              (common/resolve-and-read :model/Collection eid (fn [_] nil))))))))

(deftest resolve-id-or-404-entity-id-404-collapse-test
  (testing "a well-formed entity_id that resolves to no row throws the collapsed not-found error"
    (let [eid (u/generate-nano-id)]
      (is (common/entity-id? eid))
      (is (thrown-with-msg? Exception #"not found"
                            (common/resolve-id-or-404 :model/Collection eid))))))

(deftest ^:parallel resolve-collection-id-test
  (is (nil? (common/resolve-collection-id nil)))
  (is (nil? (common/resolve-collection-id "root")))
  (is (= 99 (common/resolve-collection-id "trash" {:trash-collection-id 99})))
  (is (thrown? Exception (common/resolve-collection-id "trash"))))

(deftest ^:parallel select-fields-test
  (let [row {:id 5 :name "Fin" :description "d" :location "/" :archived false}]
    (testing "narrows to the requested paths"
      (is (= {:id 5 :name "Fin"} (common/select-fields :collection row ["id" "name"]))))
    (testing "an unknown path is a teaching error naming the nearest valid paths"
      (is (thrown-with-msg? Exception #"name"
                            (common/select-fields :collection row ["nmae"]))))
    (testing "mutual exclusion with response_format/include"
      (is (thrown-with-msg? Exception #"not both"
                            (common/select-fields :collection row ["id"] {:response-format "detailed"})))))
  (testing "paths are item-relative inside arrays"
    (let [row {:id 1 :parameters [{:id "p1" :name "Cat" :type "category"}
                                  {:id "p2" :name "State" :type "category"}]}]
      (is (= {:parameters [{:name "Cat"} {:name "State"}]}
             (common/select-fields :question row ["parameters.name"])))
      (testing "a whole-subtree path absorbs a deeper path under it, in either order"
        (doseq [fields [["parameters" "parameters.name"]
                        ["parameters.name" "parameters"]]]
          (is (= {:parameters (:parameters row)}
                 (common/select-fields :question row fields))))))))

(deftest ^:parallel projections-test
  (let [row {:id 5 :name "Fin" :description "d" :location "/" :archived false
             :personal_owner_id nil :entity_id "eid" :slug "fin" :created_at "t"}]
    (testing "concise is a subset of the REST response with the same property names"
      (is (= {:id 5 :name "Fin" :description "d" :location "/" :archived false}
             (projections/project :collection :concise row))))
    (testing "the catalog is generated from the detailed projection shape"
      (is (contains? (set (projections/catalog :collection)) "name"))
      (is (contains? (set (projections/catalog :question)) "parameters.name")))))

;; not ^:parallel: the kondo deftest lint treats the `!` suffix as destructive
(deftest check-update-scope-test
  (testing "a scoped token without the update scope is rejected with a teaching message"
    (is (thrown-with-msg? Exception #"method: update"
                          (common/check-update-scope! #{"agent:question:create"}
                                                      "agent:question:update"
                                                      "question_write"))))
  (testing "cookie sessions (unrestricted sentinel) bypass"
    (is (nil? (common/check-update-scope! #{::scope/unrestricted}
                                          "agent:question:update"
                                          "question_write")))))

(deftest ^:parallel dispatch-write-test
  (let [entry {:tool-name       "collection_write"
               :update-scope    "agent:collection:update"
               :create-required [:name]}]
    (testing "create enforces (create)-required fields"
      (is (= [:create {:name "X"}] (common/dispatch-write entry nil {:method "create" :name "X"})))
      (is (thrown-with-msg? Exception #"`name` is required"
                            (common/dispatch-write entry nil {:method "create"}))))
    (testing "update requires id and re-checks the update scope at runtime"
      (is (= [:update 3 {:name "Y"}]
             (common/dispatch-write entry #{::scope/unrestricted} {:method "update" :id 3 :name "Y"})))
      (is (thrown-with-msg? Exception #"`id` is required"
                            (common/dispatch-write entry #{::scope/unrestricted} {:method "update"})))
      (is (thrown-with-msg? Exception #"method: update"
                            (common/dispatch-write entry #{"agent:collection:create"} {:method "update" :id 3}))))
    (testing "an unknown method is a teaching error"
      (is (thrown-with-msg? Exception #"create.*update"
                            (common/dispatch-write entry nil {:method "delete"}))))))

;;; ------------------------------------------------ Query handles (GHY-4136) -------------------------------------

(defn- thrown
  "Return `[status-code message]` from the exception `thunk` throws, or nil if it doesn't throw."
  [thunk]
  (try (thunk) nil
       (catch clojure.lang.ExceptionInfo e [(:status-code (ex-data e)) (ex-message e)])))

(defn- mbql-handle!
  "Mint a handle for an orders-sourced MBQL query owned by `uid` in session `sid`."
  [sid uid & [prompt]]
  (common/mint-query-handle! sid uid
                             (common/encode-serialized-query
                              {:database (mt/id) :stages [{:lib/type "mbql.stage/mbql"
                                                           :source-table (mt/id :orders)}]})
                             prompt))

(deftest handle-round-trip-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [uid (mt/user->id :rasta)
          sid (str (random-uuid))
          q   {:database (mt/id) :stages [{:lib/type "mbql.stage/mbql" :source-table (mt/id :orders)}]}]
      (mt/with-current-user uid
        (testing "mint then resolve returns the stored query and prompt"
          (let [h        (common/mint-query-handle! sid uid (common/encode-serialized-query q) "show orders")
                resolved (common/resolve-query-handle! sid uid h)]
            (is (string? h))
            (is (= "show orders" (:prompt resolved)))
            ;; handles store base64 JSON, so the resolved query is the JSON round-trip of what was minted
            (is (= (-> q json/encode json/decode+kw) (:query resolved)))))
        (testing "prompt is optional"
          (let [h (common/mint-query-handle! sid uid (common/encode-serialized-query q))]
            (is (nil? (:prompt (common/resolve-query-handle! sid uid h))))))))))

(deftest handle-ownership-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [uid   (mt/user->id :rasta)
          other (mt/user->id :lucky)
          sid   (str (random-uuid))]
      (mt/with-current-user uid
        (testing "an unknown/expired handle is a teaching error, not a 500"
          (is (= 400 (first (thrown #(common/resolve-query-handle! sid uid (str (random-uuid))))))))
        (testing "a handle resolves for its owner but not for another user"
          (let [h (mbql-handle! sid uid)]
            (is (nil? (thrown #(common/resolve-query-handle! sid uid h))))              ; owner: ok
            (is (= 400 (first (thrown #(common/resolve-query-handle! sid other h)))))))))))  ; other: not found

(deftest handle-guards-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [uid (mt/user->id :rasta)
          sid (str (random-uuid))]
      (mt/with-current-user uid
        (testing "a stored NATIVE query is rejected on the MBQL read path"
          (let [h (common/mint-query-handle! sid uid
                                             (common/encode-serialized-query
                                              {:stages [{:lib/type "mbql.stage/native" :native "SELECT 1"}]}))]
            (is (= [400 "Native queries are not supported here; use execute_sql instead."]
                   (thrown #(common/resolve-query-handle! sid uid h))))))
        (testing "a garbage (non-map) stored payload is a teaching error, not a decode 500"
          (let [h (common/mint-query-handle! sid uid (common/encode-serialized-query [1 2 3]))]
            (is (= 400 (first (thrown #(common/resolve-query-handle! sid uid h)))))))
        (testing "a stored query the caller can no longer access throws 403"
          (let [h (mbql-handle! sid uid)]
            (mt/with-no-data-perms-for-all-users!
              (is (= 403 (first (thrown #(common/resolve-query-handle! sid uid h))))))))))))
