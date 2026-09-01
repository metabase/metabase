(ns metabase.agent-api.query-guards-test
  "Tests for the MBQL-path guards (GHY-4136). The native-detection and shape-validation guards are
   the security boundary that keeps opaque base64 payloads (query handles, continuation tokens) from
   smuggling native SQL past the MBQL-only scopes, so they are exercised exhaustively here.
   `check-token-query-permissions!`'s allow/deny cases need permission fixtures and are the
   DB-backed deftests toward the end of this namespace; its no-op branches (which document that
   only a stage-0 numeric source-table is checked) are covered by the pure tests."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- thrown-status
  "Return the `:status-code` from the ex-data of the exception `thunk` throws. Returns `::no-throw`
   when `thunk` does not throw and `::no-status` when it throws an `ExceptionInfo` without a
   `:status-code` — two distinct sentinels so an assertion for \"does not throw\" can't be satisfied
   by a throw that merely lacks a status (which would be a 500 to the client, not the clean pass the
   test means to assert)."
  [thunk]
  (try (thunk) ::no-throw
       (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e) ::no-status))))

(deftest ^:parallel native-marker?-test
  (testing "every native-marker form is detected"
    (are [node] (true? (query-guards/native-marker? node))
      {:native "SELECT 1"}                    ; universal :native body
      {:native {:query "SELECT 1"}}
      {:type :native}                         ; legacy keyword
      {:type "native"}                        ; legacy json-decoded string
      {:lib/type :mbql.stage/native}          ; MBQL 5 keyword
      {:lib/type "mbql.stage/native"}))       ; MBQL 5 json-decoded string
  (testing "a payload decoded without keywordizing is detected too"
    (are [node] (true? (query-guards/native-marker? node))
      {"native" "SELECT 1"}
      {"type" "native"}
      {"lib/type" "mbql.stage/native"}))
  (testing "clean MBQL nodes are not markers"
    (are [node] (false? (query-guards/native-marker? node))
      {:type :query}
      {:type "query"}
      {"type" "query"}
      {:lib/type :mbql.stage/mbql}
      {:lib/type "mbql.stage/mbql"}
      {"lib/type" "mbql.stage/mbql"}
      {:source-table 1}
      {}))
  (testing "non-map and junk values never throw and are never markers"
    (are [node] (false? (query-guards/native-marker? node))
      nil 42 "native" :native [:native] #{:native} '(:native))))

(deftest ^:parallel native-query?-test
  (testing "native SQL is detected at every depth of the tree"
    (are [query-map] (true? (query-guards/native-query? query-map))
      {:type :native :native {:query "SELECT 1"}}                                    ; legacy top-level
      {:database 1 :type :query :query {:source-query {:native "SELECT 1"}}}          ; legacy nested source-query
      {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]}                   ; MBQL 5 native stage
      {:stages [{:lib/type :mbql.stage/mbql
                 :joins [{:stages [{:lib/type :mbql.stage/native :native "x"}]}]}]}   ; native inside a join
      {:stages [{:lib/type :mbql.stage/mbql
                 :joins [{:stages [{:lib/type :mbql.stage/mbql
                                    :joins [{:stages [{:lib/type :mbql.stage/native}]}]}]}]}]}   ; nested join
      {"database" 1 "type" "native" "native" {"query" "SELECT 1"}}                     ; decoded without keywordizing
      {"stages" [{"lib/type" "mbql.stage/native" "native" "SELECT 1"}]}
      ;; snake_case source_query: legacy normalization canonicalizes it too, so it reaches the QP
      ;; as a native stage — missing this edge let an MBQL-only-scoped caller run raw SQL.
      {"type" "query" "database" 1 "query" {"source_query" {"native" "SELECT 1"}}}
      {:database 1 :type :query :query {:source_query {:native "SELECT 1"}}}))
  (testing "a payload MBQL 5 normalization cannot make sense of still fails closed"
    ;; The guard cannot delegate detection to `lib-be/normalize-query` + `lib/any-native-stage?`:
    ;; normalization swallows its own failure and hands back `{}`, so a normalize-then-inspect check
    ;; sees no stages and waves these through instead of rejecting them.
    (are [query-map] (true? (query-guards/native-query? query-map))
      {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"} 42]}
      {:stages {:garbage [{:native "SELECT 1"}]}}))
  (testing "clean MBQL queries are not native"
    (are [query-map] (false? (query-guards/native-query? query-map))
      {:stages [{:lib/type :mbql.stage/mbql :source-table 1}]}
      {:stages [{:lib/type :mbql.stage/mbql :source-table 1
                 :joins [{:stages [{:lib/type :mbql.stage/mbql :source-table 2}]}]}]}
      {:database 1 :type :query :query {:source-table 1}}
      {}
      {:stages []}))
  (testing "GHY-4136 C1: a legit query whose caller-named sub-maps contain the key `native` is NOT native.
            `:expressions` is keyed by expression name and `:template-tags` by tag name, so a column or tag
            literally named `native` must not be mistaken for a native-SQL marker — the guard walks only the
            structural query-nesting edges, never these caller-named maps."
    (are [query-map] (false? (query-guards/native-query? query-map))
      {:database 1 :type :query :query {:source-table 1 :expressions {"native" [:+ 1 2]}}}       ; legacy expression named native
      {:database 1 :type :query :query {:source-table 1} :template-tags {"native" {:type :text}}} ; legacy template tag named native
      {:stages [{:lib/type :mbql.stage/mbql :source-table 1 :expressions {"native" [:+ 1 2]}}]}    ; MBQL 5 expression named native
      {"query" {"source-table" 1 "expressions" {"native" [:+ 1 2]}}})))                            ; decoded without keywordizing

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
    ;; checked here — the QP is the authoritative backstop at execution; this guard is a stage-0
    ;; fast path for a cleaner 403, never the enforcement point.
    (are [query-map] (nil? (query-guards/check-token-query-permissions! query-map))
      {:stages [{:source-card 10}]}                 ; card source, no source-table
      {:stages [{}]}                                ; nothing to check
      {:stages [{:source-table "card__10"}]}        ; string (virtual) source, not an int
      {:stages []}
      {})))

(deftest check-token-query-permissions!-allow-deny-test
  (testing "passes (does not throw) when the current user can query the stage-0 source table"
    (mt/with-current-user (mt/user->id :rasta)
      (is (= ::no-throw (thrown-status #(query-guards/check-token-query-permissions!
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
    (are [scopes] (= ::no-throw (thrown-status #(query-guards/check-mcp-ui-native-query!
                                                 (ui-request scopes) legacy-native)))
      #{"agent:sql:run"}
      #{"agent:sql:execute"}                        ; v1's concrete scope keeps working
      #{"agent:sql:*"}                              ; metabot permissions grant wildcards
      #{:metabase.api.macros.scope/unrestricted}))  ; browser-session MCP clients
  (testing "non-native queries are never gated, whatever the grant"
    (is (= ::no-throw (thrown-status #(query-guards/check-mcp-ui-native-query! (ui-request #{}) mbql-query)))))
  (testing "requests not authenticated by a UI credential pass through untouched"
    (is (= ::no-throw (thrown-status #(query-guards/check-mcp-ui-native-query! {} legacy-native)))))
  (testing "a credential carrying no scopes claim fails closed — a rolling deploy can mint one"
    (is (= 403 (thrown-status #(query-guards/check-mcp-ui-native-query!
                                {:mcp-ui-credential {:uid 1 :sid "session"}} legacy-native)))))
  (testing "GHY-4318: a credential explicitly marked `:legacy` skips the gate. Only v1's frozen surface mints
            those (`mcp.session/issue-ui-credential`'s 2-arity), and v1's iframe visualizes execute_sql handles
            that legitimately hold raw SQL — wiring this guard must not change v1's behavior. The marker is
            explicit precisely so the unmarked case above keeps failing closed.

            TRIPWIRE: delete this branch, and this assertion, when v1 retires — together with the 2-arity."
    (is (= ::no-throw (thrown-status #(query-guards/check-mcp-ui-native-query!
                                       {:mcp-ui-credential {:uid 1 :sid "session" :legacy true}}
                                       legacy-native)))))
  (testing "the kill switch outranks the grant"
    (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
      (is (= 403 (thrown-status #(query-guards/check-mcp-ui-native-query!
                                  (ui-request #{"agent:sql:run"}) legacy-native))))))
  (testing "M2: the scope check runs before the kill switch, so an unauthorized caller cannot tell the
            mcp-execute-sql-enabled state apart from the 403 it gets — the message names the missing scope,
            not the kill switch, whether the switch is on or off"
    (doseq [enabled? [true false]]
      (mt/with-temporary-setting-values [mcp-execute-sql-enabled enabled?]
        (let [msg (try (query-guards/check-mcp-ui-native-query! (ui-request #{"agent:query:run"}) legacy-native)
                       ""
                       (catch clojure.lang.ExceptionInfo e (ex-message e)))]
          (is (re-find #"agent:sql:run" msg))
          (is (not (re-find #"mcp-execute-sql-enabled" msg))
              "the scope refusal must not reveal the kill-switch setting to an unauthorized caller"))))))
