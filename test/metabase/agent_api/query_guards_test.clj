(ns metabase.agent-api.query-guards-test
  "Tests for the MBQL-path guards (GHY-4136). The native-detection and shape-validation guards are
   the security boundary that keeps opaque base64 payloads (query handles, continuation tokens) from
   smuggling native SQL past the MBQL-only scopes, so they are exercised exhaustively here.
   `check-token-query-permissions!`'s allow/deny cases need permission fixtures and live in the
   DB-backed round; its no-op branches (which document that only a stage-0 numeric source-table is
   checked) are covered here."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- thrown-status
  "Return the `:status-code` from the ex-data of the exception `thunk` throws, or nil if it doesn't throw."
  [thunk]
  (try (thunk) nil
       (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e)))))

(deftest native-marker?-test
  (testing "every native-marker form is detected"
    (are [node] (true? (query-guards/native-marker? node))
      {:native "SELECT 1"}                    ; universal :native body
      {:native {:query "SELECT 1"}}
      {:type :native}                         ; legacy keyword
      {:type "native"}                        ; legacy json-decoded string
      {:lib/type :mbql.stage/native}          ; MBQL 5 keyword
      {:lib/type "mbql.stage/native"}))       ; MBQL 5 json-decoded string
  (testing "clean MBQL nodes are not markers"
    (are [node] (false? (query-guards/native-marker? node))
      {:type :query}
      {:type "query"}
      {:lib/type :mbql.stage/mbql}
      {:lib/type "mbql.stage/mbql"}
      {:source-table 1}
      {}))
  (testing "non-map and junk values never throw and are never markers"
    (are [node] (false? (query-guards/native-marker? node))
      nil 42 "native" :native [:native] #{:native} '(:native))))

(deftest native-query?-test
  (testing "native SQL is detected at every depth of the tree"
    (are [query-map] (true? (query-guards/native-query? query-map))
      {:type :native :native {:query "SELECT 1"}}                                    ; legacy top-level
      {:database 1 :type :query :query {:source-query {:native "SELECT 1"}}}          ; legacy nested source-query
      {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]}                   ; MBQL 5 native stage
      {:stages [{:lib/type :mbql.stage/mbql
                 :joins [{:stages [{:lib/type :mbql.stage/native :native "x"}]}]}]}   ; native inside a join
      {:stages [{:lib/type :mbql.stage/mbql
                 :joins [{:stages [{:lib/type :mbql.stage/mbql
                                    :joins [{:stages [{:lib/type :mbql.stage/native}]}]}]}]}]})) ; nested join
  (testing "clean MBQL queries are not native"
    (are [query-map] (false? (query-guards/native-query? query-map))
      {:stages [{:lib/type :mbql.stage/mbql :source-table 1}]}
      {:stages [{:lib/type :mbql.stage/mbql :source-table 1
                 :joins [{:stages [{:lib/type :mbql.stage/mbql :source-table 2}]}]}]}
      {:database 1 :type :query :query {:source-table 1}}
      {}
      {:stages []})))

(deftest reject-native-query!-test
  (testing "native queries throw a 400 with a steering message"
    (let [query {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]}]
      (is (= 400 (thrown-status #(query-guards/reject-native-query! query))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"execute_sql"
                            (query-guards/reject-native-query! query)))))
  (testing "clean MBQL queries pass (return nil, do not throw)"
    (is (nil? (query-guards/reject-native-query! {:stages [{:lib/type :mbql.stage/mbql :source-table 1}]})))))

(deftest validate-serialized-query!-test
  (testing "well-formed serialized MBQL passes"
    (are [query-map] (nil? (query-guards/validate-serialized-query! query-map))
      {:stages [{:source-table 1}]}
      {:stages [{:source-table 1} {:filters []}]}
      {:stages [{:source-table 1 :limit 50}]}       ; positive int limit is fine
      {:stages [{:source-table 1 :limit 1}]}))
  (testing "a missing or malformed :stages is a 400, not a downstream 500"
    (are [query-map] (= 400 (thrown-status #(query-guards/validate-serialized-query! query-map)))
      {}                                 ; no :stages
      {:stages nil}
      {:stages []}                       ; empty
      {:stages {:source-table 1}}        ; not sequential
      {:stages [{:source-table 1} 42]})) ; a non-map stage
  (testing "a present-but-invalid last-stage :limit is a 400 (contains?, so explicit false/nil is caught)"
    (are [limit] (= 400 (thrown-status #(query-guards/validate-serialized-query! {:stages [{:limit limit}]})))
      false
      nil
      0
      -1
      "50"
      1.5)))

(deftest check-token-query-permissions!-no-op-test
  (testing "the guard is a no-op when there is no stage-0 numeric source-table"
    ;; Documents the partial coverage: a source-card, a nil source-table, or a non-int value is not
    ;; checked here — the QP is the authoritative backstop at execution (see review finding #3).
    (are [query-map] (nil? (query-guards/check-token-query-permissions! query-map))
      {:stages [{:source-card 10}]}                 ; card source, no source-table
      {:stages [{}]}                                ; nothing to check
      {:stages [{:source-table "card__10"}]}        ; string (virtual) source, not an int
      {:stages []}
      {})))

(deftest check-token-query-permissions!-allow-deny-test
  (testing "passes (does not throw) when the current user can query the stage-0 source table"
    (mt/with-current-user (mt/user->id :rasta)
      (is (nil? (thrown-status #(query-guards/check-token-query-permissions!
                                 {:stages [{:source-table (mt/id :orders)}]}))))))
  (testing "throws 403 when the current user lacks data perms on the source table"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-current-user (mt/user->id :rasta)
        (is (= 403 (thrown-status #(query-guards/check-token-query-permissions!
                                    {:stages [{:source-table (mt/id :orders)}]}))))))))

(defn- ui-request
  "A request map shaped like one the MCP Apps iframe credential authenticated."
  [token-scopes]
  {:mcp-ui-credential {:uid 1 :sid "session" :token-scopes token-scopes}})

(def ^:private legacy-native {:database 1 :type "native" :native {:query "SELECT 1"}})
(def ^:private mbql-5-native {:lib/type "mbql/query" :database 1
                              :stages [{:lib/type "mbql.stage/native" :native "SELECT 1"}]})
(def ^:private mbql-query {:lib/type "mbql/query" :database 1
                           :stages [{:lib/type "mbql.stage/mbql" :source-table 1}]})

(deftest check-mcp-ui-native-query!-test
  (testing "GHY-4318: both query shapes /api/dataset accepts are refused when the minting session lacked
            agent:sql:run — a hand-rolled payload would most naturally use the legacy shape, while execute_sql
            mints MBQL 5"
    (are [query] (= 403 (thrown-status #(query-guards/check-mcp-ui-native-query!
                                         (ui-request #{"agent:content:read" "agent:query:run"})
                                         query)))
      legacy-native
      mbql-5-native))
  (testing "the refusal names the scope the client would need"
    (is (re-find #"agent:sql:run"
                 (try (query-guards/check-mcp-ui-native-query!
                       (ui-request #{"agent:query:run"}) legacy-native)
                      ""
                      (catch clojure.lang.ExceptionInfo e (ex-message e))))))
  (testing "grants that cover agent:sql:run pass"
    (are [scopes] (nil? (thrown-status #(query-guards/check-mcp-ui-native-query!
                                         (ui-request scopes) legacy-native)))
      #{"agent:sql:run"}
      #{"agent:sql:*"}                              ; metabot permissions grant wildcards
      #{:metabase.api.macros.scope/unrestricted}))  ; browser-session MCP clients
  (testing "non-native queries are never gated, whatever the grant"
    (is (nil? (thrown-status #(query-guards/check-mcp-ui-native-query! (ui-request #{}) mbql-query)))))
  (testing "requests not authenticated by a UI credential pass through untouched"
    (is (nil? (thrown-status #(query-guards/check-mcp-ui-native-query! {} legacy-native)))))
  (testing "a credential carrying no scopes claim fails closed — a rolling deploy can mint one"
    (is (= 403 (thrown-status #(query-guards/check-mcp-ui-native-query!
                                {:mcp-ui-credential {:uid 1 :sid "session"}} legacy-native)))))
  (testing "the kill switch outranks the grant"
    (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
      (is (= 403 (thrown-status #(query-guards/check-mcp-ui-native-query!
                                  (ui-request #{"agent:sql:run"}) legacy-native)))))))
