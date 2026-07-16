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
  (testing "a list with nothing to narrow by still steers to the next offset — without a line the
            caller reads a truncated page as the whole set"
    (is (= "Returned 50 of 214 — continue with `offset: 50`."
           (common/truncation-line {:offset 0 :limit 50 :total 214})))
    (testing "and still goes quiet on the final page"
      (is (nil? (common/truncation-line {:offset 200 :limit 50 :total 214})))))
  (testing "an unknown total cannot be reasoned about, so no line either way"
    (is (nil? (common/truncation-line {:param "search" :offset 0 :limit 50})))
    (is (nil? (common/truncation-line {:offset 0 :limit 50})))))

(deftest ^:parallel list-content-test
  (testing "a truncated page carries the envelope and the steering line, newline-separated"
    (let [text (-> (common/list-content [{:id 1}] 214 {:param :type :offset 0 :limit 1})
                   :content first :text)
          [body line] (str/split-lines text)]
      (is (= {:data [{:id 1}] :returned 1 :total 214} (json/decode+kw body)))
      (is (= "Returned 1 of 214 — narrow with `type`, or continue with `offset: 1`." line))))
  (testing "a list with no narrowing param still steers to the next offset"
    (let [text (-> (common/list-content [{:id 1}] 214 {:offset 0 :limit 1})
                   :content first :text)
          [_ line] (str/split-lines text)]
      (is (= "Returned 1 of 214 — continue with `offset: 1`." line))))
  (testing "an untruncated page is the envelope alone"
    (let [text (-> (common/list-content [{:id 1}] 1 {:offset 0 :limit 50})
                   :content first :text)]
      (is (= {:data [{:id 1}] :returned 1 :total 1} (json/decode+kw text)))
      (is (not (str/includes? text "\n")))))
  (testing "empty-hint replaces the steering line when nothing matched at all"
    (let [text (-> (common/list-content [] 0 {:offset 0 :limit 50 :empty-hint "Nothing here."})
                   :content first :text)]
      (is (= "{\"data\":[],\"returned\":0,\"total\":0}\nNothing here." text))))
  (testing "empty-hint stays quiet when rows exist — an empty page past the end is a paging
            result, not an empty set, and the hint would be a lie"
    (let [text (-> (common/list-content [] 214 {:offset 500 :limit 50 :empty-hint "Nothing here."})
                   :content first :text)]
      (is (not (str/includes? text "Nothing here.")))))
  (testing "empty-hint is opt-in — an empty list without one stays bare"
    (let [text (-> (common/list-content [] 0 {:offset 0 :limit 50})
                   :content first :text)]
      (is (not (str/includes? text "\n"))))))

(deftest ^:parallel teaching-error-test
  (testing "teaching errors surface their message as MCP error content"
    (let [content (try
                    (common/throw-teaching-error "Use `fields` OR `response_format`, not both.")
                    (catch clojure.lang.ExceptionInfo e
                      (common/->mcp-error-content e)))]
      (is (:isError content))
      (is (= "Use `fields` OR `response_format`, not both."
             (-> content :content first :text))))))

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
