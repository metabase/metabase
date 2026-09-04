(ns metabase.mcp.v2.queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.queries :as v2.queries]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;;; ------------------------------------------------ Query handles (GHY-4136) -------------------------------------

(defn- thrown
  "Return `[status-code message]` from the exception `thunk` throws, or nil if it doesn't throw."
  [thunk]
  (try (thunk) nil
       (catch clojure.lang.ExceptionInfo e [(:status-code (ex-data e)) (ex-message e)])))

(defn- mbql-handle!
  "Mint a handle for an orders-sourced MBQL query owned by `uid` in session `sid`."
  [sid uid & [prompt]]
  (v2.queries/mint-query-handle! sid uid
                                 (v2.queries/encode-serialized-query
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
          (let [h        (v2.queries/mint-query-handle! sid uid (v2.queries/encode-serialized-query q) "show orders")
                resolved (v2.queries/resolve-query-handle! sid uid h)]
            (is (string? h))
            (is (= "show orders" (:prompt resolved)))
            ;; handles store base64 JSON, so the resolved query is the JSON round-trip of what was minted
            (is (= (-> q json/encode json/decode+kw) (:query resolved)))))
        (testing "prompt is optional"
          (let [h (v2.queries/mint-query-handle! sid uid (v2.queries/encode-serialized-query q))]
            (is (nil? (:prompt (v2.queries/resolve-query-handle! sid uid h))))))))))

(deftest handle-ownership-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [uid   (mt/user->id :rasta)
          other (mt/user->id :lucky)
          sid   (str (random-uuid))]
      (mt/with-current-user uid
        (testing "an unknown/expired handle is a teaching error, not a 500"
          (is (= 400 (first (thrown #(v2.queries/resolve-query-handle! sid uid (str (random-uuid))))))))
        (testing "a handle resolves for its owner but not for another user"
          (let [h (mbql-handle! sid uid)]
            (is (nil? (thrown #(v2.queries/resolve-query-handle! sid uid h))))              ; owner: ok
            (is (= 400 (first (thrown #(v2.queries/resolve-query-handle! sid other h)))))))))))  ; other: not found

(deftest handle-guards-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [uid (mt/user->id :rasta)
          sid (str (random-uuid))]
      (mt/with-current-user uid
        (testing "a stored NATIVE query is rejected on the MBQL read path"
          (let [h (v2.queries/mint-query-handle! sid uid
                                                 (v2.queries/encode-serialized-query
                                                  {:stages [{:lib/type "mbql.stage/native" :native "SELECT 1"}]}))]
            (is (= [400 "Native queries are not supported here; use execute_sql instead."]
                   (thrown #(v2.queries/resolve-query-handle! sid uid h))))))
        (testing "a garbage (non-map) stored payload is a teaching error, not a decode 500"
          (let [h (v2.queries/mint-query-handle! sid uid (v2.queries/encode-serialized-query [1 2 3]))]
            (is (= 400 (first (thrown #(v2.queries/resolve-query-handle! sid uid h)))))))
        (testing "a stored query the caller can no longer access throws 403"
          (let [h (mbql-handle! sid uid)]
            (mt/with-no-data-perms-for-all-users!
              (is (= 403 (first (thrown #(v2.queries/resolve-query-handle! sid uid h))))))))))))

(deftest resolve-query-handle-for-save-allows-native-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [uid (mt/user->id :rasta)
          sid (str (random-uuid))]
      (mt/with-current-user uid
        (testing "a stored NATIVE query resolves on the save path (no native reject)"
          (let [native {:database (mt/id)
                        :stages [{:lib/type "mbql.stage/native" :native "SELECT 1"}]}
                h (v2.queries/mint-query-handle! sid uid (v2.queries/encode-serialized-query native))]
            (is (= native (:query (v2.queries/resolve-query-handle-for-save! sid uid h))))))
        (testing "an unknown handle is a teaching error, not a 500"
          (is (= [400 "Query handle not found — it may have expired; run the query again."]
                 (thrown #(v2.queries/resolve-query-handle-for-save! sid uid (str (random-uuid)))))))))))
