(ns metabase.mcp.v2.tools.transform-test
  "Contract tests for the `transform_write` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, nil-arg stripping, Malli validation, and teaching-error conversion are exercised for
   free. The transform write/permission stack itself is owned by `metabase.transforms.*`; this
   suite pins the tool's own contract on top of it: the query sources, the target patch, the two
   shapes it refuses to author (python sources, incremental targets), and the readback gate."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.queries :as v2.queries]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the :transform projection the write echo projects through.
   [metabase.mcp.v2.tools.content :as tools.content]
   [metabase.mcp.v2.tools.transform :as tools.transform]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; TODO(slice-17/query): re-add tools.query/keep-me when the query tool lands.
(comment tools.content/keep-me tools.transform/keep-me)

;;; ------------------------------------------------- Harness ------------------------------------------------------

(def ^:private write-scopes
  "The scope transform_write is gated on, plus the one reading a transform back demands — without
   it the tool answers with the GHY-4217 minimal ack instead of the row."
  #{"agent:content:write" "agent:content:read"})

(defn- call-tool!
  "Drive `tool` through the real dispatch seam as `user` with bearer-style `scopes` (nil = internal
   caller, which bypasses the scope gate). `session-id` is fresh per call unless the caller threads
   one through, so query handles are scoped like a real client's."
  ([user scopes tool args] (call-tool! user scopes tool args (str (random-uuid))))
  ([user scopes tool args session-id]
   (mt/with-current-user (mt/user->id user)
     (registry/call-tool scopes session-id tool args))))

(defn- write!
  "Call `transform_write` as an admin holding the write and read-back scopes."
  ([args] (write! :crowberto write-scopes args))
  ([user scopes args] (call-tool! user scopes "transform_write" args)))

(defn- tool-result
  "Decoded success payload of a tool response; throws when the call errored, so a tool-level
   error can never masquerade as a result."
  [response]
  (when (:isError response)
    (throw (ex-info (str "tool call failed: " (-> response :content first :text))
                    {:response response})))
  (-> response :content first :text json/decode+kw))

(defn- tool-error
  "Tool-level error text of a tool response; throws when the call succeeded, so a passing call
   can never satisfy an error assertion."
  [response]
  (when-not (:isError response)
    (throw (ex-info "expected a tool error, got success" {:response response})))
  (-> response :content first :text))

(defmacro ^:private with-transforms
  "Turn on the transforms feature and its setting. The transform read/write checks gate on both
   before the superuser bypass, so without them every transform collapses to not-found."
  [& body]
  `(mt/with-premium-features #{:transforms-basic}
     (mt/with-temp-env-var-value! [~'mb-transforms-enabled true]
       ~@body)))

(defmacro ^:private with-target-db-support
  "Claim `:transforms/table` for whatever driver the test database runs on. The REST create/update
   check stack demands the feature of the target database, and H2 — which this suite deliberately
   stays on, so the mcp module keeps out of the driver-test set — doesn't declare it.

   Touches the test database first, to force the driver namespace to load outside the `with-redefs`:
   the redef swaps a multimethod var for a plain fn, and a driver loading inside that extent would
   hit `defmethod` on something it can't cast, taking the whole suite's database down with it. Only
   reachable when this namespace runs first in a JVM, which is exactly how it runs alone."
  [& body]
  `(let [_#    (mt/db)
         orig# driver/database-supports?]
     (with-redefs [driver/database-supports? (fn [driver# feature# database#]
                                               (or (= feature# :transforms/table)
                                                   (orig# driver# feature# database#)))]
       ~@body)))

(defn- venues-schema []
  (t2/select-one-fn :schema :model/Table :id (mt/id :venues)))

(defn- venues-query
  "A legacy-MBQL query over venues, the shape a transform's `definition` carries."
  []
  {:database (mt/id) :type "query" :query {:source-table (mt/id :venues)}})

(defn- query-definition []
  {:type "query" :query (venues-query)})

(defn- temp-transform-defaults
  "A stored query transform writing to `table-name`."
  [table-name]
  {:name   "existing"
   :source {:type :query :query (venues-query)}
   :target {:type :table :schema (venues-schema) :name table-name}})

;;; -------------------------------------------------- Create ------------------------------------------------------

(deftest transform-write-create-test
  (testing "GHY-4240: create stores the query transform and echoes the concise read projection"
    (with-transforms
      (with-target-db-support
        (let [result (tool-result (write! {:method      "create"
                                           :name        "Gadget products"
                                           :description "Only the gadgets"
                                           :definition  (query-definition)
                                           :target      {:name "mcp_gadget_products" :schema (venues-schema)}}))
              stored (t2/select-one :model/Transform :id (:id result))]
          (try
            (testing "the echo carries the read projection plus the ids and url a follow-up call needs"
              (is (= "Gadget products" (:name result)))
              (is (= "Only the gadgets" (:description result)))
              (is (= "mbql" (:source_type result)))
              (is (= {:type "table" :schema (venues-schema) :name "mcp_gadget_products" :database (mt/id)}
                     (:target result)))
              (is (= [] (:tag_ids result)))
              (is (string? (:entity_id result)))
              (is (re-find #"/data-studio/transforms/\d+$" (:url result))))
            (testing "and the transform is really stored"
              (is (some? stored))
              (is (= :mbql (:source_type stored)))
              (is (= (mt/user->id :crowberto) (:creator_id stored))))
            (finally
              (t2/delete! :model/Transform :id (:id result)))))))))

(defn- native-definition
  "An inline definition carrying raw SQL — the shape an agent that can write content but may not
   author SQL must not be able to store."
  []
  {:type "query" :query {:database (mt/id) :type "native" :native {:query "SELECT 1 AS x"}}})

;; not ^:parallel: mt/with-temporary-setting-values on the shared kill-switch setting
(deftest transform-write-native-definition-gates-test
  (testing "an inline native `definition` passes execute_sql's two gates — the agent:sql:run scope and the
            mcp-execute-sql-enabled kill switch — because a stored native transform is raw SQL the runner
            later executes against the warehouse; accepting it under the content write scope alone would
            rebuild execute_sql, with a warehouse write on top, without either gate"
    (with-transforms
      (with-target-db-support
        (let [args     {:method     "create"
                        :name       "Native gadget"
                        :definition (native-definition)
                        :target     {:name "mcp_native_gadget" :schema (venues-schema)}}
              stored?  #(pos? (t2/count :model/Transform :name "Native gadget"))]
          (try
            (testing "the content write scope alone is refused, naming the missing SQL scope"
              (let [response (write! :crowberto write-scopes args)]
                (is (re-find #"agent:sql:run" (tool-error response)))
                (is (not (stored?)))))
            (testing "with the SQL scope, the kill switch still refuses"
              (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
                (let [response (write! :crowberto (conj write-scopes "agent:sql:run") args)]
                  (is (re-find #"mcp-execute-sql-enabled" (tool-error response)))
                  (is (not (stored?))))))
            (testing "with the SQL scope and the switch on, the native transform is stored"
              (let [result (tool-result (write! :crowberto (conj write-scopes "agent:sql:run") args))]
                (is (= "native" (:source_type result)))
                (is (= :native (t2/select-one-fn :source_type :model/Transform :id (:id result))))))
            (testing "a plain MBQL definition is unaffected: the content write scope alone still creates it"
              (let [result (tool-result (write! :crowberto write-scopes
                                                (assoc args :name "Plain gadget"
                                                       :definition (query-definition)
                                                       :target {:name "mcp_plain_gadget" :schema (venues-schema)})))]
                (is (= "mbql" (:source_type result)))))
            (finally
              (t2/delete! :model/Transform :name [:in ["Native gadget" "Plain gadget"]]))))))))

(deftest transform-write-create-runs-the-permission-check-test
  (testing "GHY-4240: `api/create-check` is the only thing between a caller and a transform on a database
            they have no transforms/native-write permission for — `transforms/create-transform!` performs no
            check of its own. Every other test here runs as :crowberto, for whom the check is vacuous, so
            deleting the line would leave the suite green."
    (with-transforms
      (with-target-db-support
        (mt/with-no-data-perms-for-all-users!
          (let [args {:method     "create"
                      :name       "Perm probe transform"
                      :definition (query-definition)
                      :target     {:name "mcp_perm_probe" :schema (venues-schema)}}]
            (is (some? (tool-error (write! :rasta write-scopes args))))
            (is (zero? (t2/count :model/Transform :name "Perm probe transform"))
                "nothing is written when the check refuses")))))))

(deftest transform-write-create-required-args-test
  (testing "GHY-4240: the create-only requirements are teaching errors naming the missing field"
    (with-transforms
      (is (re-find #"`name` is required when method is \"create\""
                   (tool-error (write! {:method "create" :definition (query-definition)
                                        :target {:name "x" :schema (venues-schema)}}))))
      (is (re-find #"`target` is required when method is \"create\""
                   (tool-error (write! {:method "create" :name "x" :definition (query-definition)}))))
      (testing "and a target without a name is caught before anything is written"
        (is (re-find #"`target.name` is required"
                     (tool-error (write! {:method "create" :name "x" :definition (query-definition)
                                          :target {:schema (venues-schema)}}))))))))

(deftest transform-write-query-source-test
  (testing "GHY-4240: exactly one query source, named in both directions"
    (with-transforms
      (testing "neither"
        (is (re-find #"Pass the transform's query"
                     (tool-error (write! {:method "create" :name "x"
                                          :target {:name "y" :schema (venues-schema)}})))))
      (testing "both"
        (let [error (tool-error (write! {:method       "create"
                                         :name         "x"
                                         :definition   (query-definition)
                                         :query_handle (str (random-uuid))
                                         :target       {:name "y" :schema (venues-schema)}}))]
          (is (re-find #"exactly one query source" error)))))))

(deftest transform-write-refuses-shapes-it-cannot-author-test
  (testing "GHY-4240: a source kind the tool can't author is refused, not silently degraded"
    (with-transforms
      (testing "a python definition"
        (let [error (tool-error (write! {:method     "create"
                                         :name       "x"
                                         :definition {:type           "python"
                                                      :body           "def transform(): pass"
                                                      :source-tables  []
                                                      :source-database (mt/id)}
                                         :target     {:name "y" :schema (venues-schema)}}))]
          (is (re-find #"python transform" error))
          (is (re-find #"query transforms only" error))))
      (testing "an incremental loading strategy on the source"
        (let [error (tool-error (write! {:method     "create"
                                         :name       "x"
                                         :definition (assoc (query-definition)
                                                            :source-incremental-strategy
                                                            {:type "checkpoint"})
                                         :target     {:name "y" :schema (venues-schema)}}))]
          (is (re-find #"source-incremental-strategy" error))))
      (testing "a bare query passed as the definition — legacy MBQL wears the same two keys a source
                map does, so it has to be caught by name rather than failing on the inner query"
        (is (re-find #"is a query, not a transform source"
                     (tool-error (write! {:method     "create"
                                          :name       "x"
                                          :definition (venues-query)
                                          :target     {:name "y" :schema (venues-schema)}})))))
      (testing "and a definition with no recognizable type at all"
        (is (re-find #"`definition.type` is nil"
                     (tool-error (write! {:method     "create"
                                          :name       "x"
                                          :definition {:query (venues-query)}
                                          :target     {:name "y" :schema (venues-schema)}}))))))))

(deftest transform-write-target-conflict-test
  (testing "GHY-4240: a target table that already exists is refused, and the error names it"
    (with-transforms
      (with-target-db-support
        (let [table-name (t2/select-one-fn :name :model/Table :id (mt/id :venues))
              error      (tool-error (write! {:method     "create"
                                              :name       "clobber"
                                              :definition (query-definition)
                                              :target     {:name table-name :schema (venues-schema)}}))]
          (is (re-find #"already exists" error))
          (is (re-find (re-pattern table-name) error)))))))

;; TODO(query-track/execute_sql): restore when the execute_sql tool lands — this test mints a
;; query handle via `call-tool! ... "execute_sql"`, which isn't registered yet. (an execute_sql handle -> native transform)
#_(deftest transform-write-query-handle-source-test
    (testing "GHY-4240: an execute_sql handle saves as a native transform — the agent's write-SQL-then-save flow"
      (with-transforms
        (with-target-db-support
          (let [session-id (str (random-uuid))
                handle     (-> (call-tool! :crowberto nil "execute_sql"
                                           {:database_id (mt/id) :sql "SELECT 1 AS n" :validate_only true}
                                           session-id)
                               tool-result
                               :query_handle)
                result     (tool-result (call-tool! :crowberto write-scopes "transform_write"
                                                    {:method       "create"
                                                     :name         "from a handle"
                                                     :query_handle handle
                                                     :target       {:name "mcp_from_handle" :schema (venues-schema)}}
                                                    session-id))]
            (is (string? handle) "execute_sql mints a handle on validate_only")
            (try
              (is (= "native" (:source_type result)))
              (is (= "mcp_from_handle" (-> result :target :name)))
              (finally
                (t2/delete! :model/Transform :id (:id result)))))))))

;;; ----------------------------------------------- Query handles --------------------------------------------------

(defn- mint-handle!
  "Mint a query_handle for `serialized-query` straight into the handle store, the way an execute
   tool does — reproducing the pMBQL → JSON → string-valued map round-trip the save path has to
   survive. Deferred-tests ledger: when the `execute_sql`/`execute_query` tools land, the
   `#_`-disabled tests in this namespace cover the same ground through the whole tool path; these
   stay as the store-level pin, so the handle branch is never left uncovered."
  [session-id serialized-query]
  (v2.queries/mint-query-handle! session-id (mt/user->id :crowberto)
                                 (v2.queries/encode-serialized-query serialized-query)))

(defn- venues-handle-query
  "The serialized MBQL 5 an execute_query handle carries — `:database` included, which the execute
   pipeline guarantees and `resolve-target` reads to derive the target database."
  []
  {:lib/type "mbql/query"
   :database (mt/id)
   :stages   [{:lib/type "mbql.stage/mbql" :source-table (mt/id :venues)}]})

(defn- native-handle-query
  "The serialized native query an `execute_sql` handle carries."
  []
  (lib/prepare-for-serialization (lib/native-query (mt/metadata-provider) "SELECT 1 AS n")))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest transform-write-create-from-query-handle-test
  (testing "GHY-4240: a query_handle is the other query source — the agent runs a query, then saves
            exactly what ran, without restating the query"
    (with-transforms
      (with-target-db-support
        (mt/with-model-cleanup [:model/Transform :model/McpQueryHandle]
          (let [session-id (str (random-uuid))
                handle     (mint-handle! session-id (venues-handle-query))
                result     (tool-result (call-tool! :crowberto write-scopes "transform_write"
                                                    {:method       "create"
                                                     :name         "From a handle"
                                                     :query_handle handle
                                                     :target       {:name "mcp_from_handle" :schema (venues-schema)}}
                                                    session-id))
                stored     (t2/select-one :model/Transform :id (:id result))]
            (is (= "mbql" (:source_type result)))
            (testing "the handle's query is what got stored, normalized to what a transform holds"
              (is (= (mt/id :venues) (-> stored :source :query :stages first :source-table))))
            (testing "and the target follows the handle's database"
              (is (= {:type "table" :schema (venues-schema) :name "mcp_from_handle" :database (mt/id)}
                     (:target result))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest transform-write-native-query-handle-test
  (testing "GHY-4240: a native handle — the shape execute_sql mints — saves as a native transform, and
            deliberately does NOT re-demand the agent:sql:run scope: minting the handle already passed
            that gate and the kill switch, so re-checking here would make execute_sql's own handles
            unsaveable. Contrast transform-write-native-definition-gates-test, where an inline native
            `definition` has passed no gate yet and so must pass both."
    (with-transforms
      (with-target-db-support
        (mt/with-model-cleanup [:model/Transform :model/McpQueryHandle]
          (let [session-id (str (random-uuid))
                handle     (mint-handle! session-id (native-handle-query))
                result     (tool-result (call-tool! :crowberto write-scopes "transform_write"
                                                    {:method       "create"
                                                     :name         "From a SQL handle"
                                                     :query_handle handle
                                                     :target       {:name "mcp_from_sql_handle" :schema (venues-schema)}}
                                                    session-id))]
            (is (= "native" (:source_type result)))
            (is (= :native (t2/select-one-fn :source_type :model/Transform :id (:id result))))
            (testing "and the SQL that ran is the SQL that got stored"
              (is (= "SELECT 1 AS n"
                     (-> (t2/select-one-fn :source :model/Transform :id (:id result))
                         :query :stages first :native))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest transform-write-update-from-query-handle-test
  (testing "GHY-4240: a query_handle works on update too, so an agent can re-run a query and save the
            corrected version over an existing transform — which here also retypes it mbql -> native"
    (with-transforms
      (with-target-db-support
        (mt/with-model-cleanup [:model/McpQueryHandle]
          (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_handle_swap")]
            (let [session-id (str (random-uuid))
                  handle     (mint-handle! session-id (native-handle-query))
                  result     (tool-result (call-tool! :crowberto write-scopes "transform_write"
                                                      {:method "update" :id id :query_handle handle}
                                                      session-id))]
              (is (= "native" (:source_type result)))
              (is (= :native (t2/select-one-fn :source_type :model/Transform :id id)))
              (testing "and the fields the call didn't name are untouched"
                (is (= "mcp_handle_swap" (-> result :target :name)))
                (is (= (venues-schema) (-> result :target :schema)))))))))))

(deftest transform-write-unknown-query-handle-test
  (testing "GHY-4240: a handle the caller doesn't own (or that has expired) is a teaching error naming
            the recovery, not the sanitized internal error a raw lookup miss would produce"
    (with-transforms
      (with-target-db-support
        (let [error (tool-error (write! {:method       "create"
                                         :name         "no such handle"
                                         :query_handle (str (random-uuid))
                                         :target       {:name "mcp_no_handle" :schema (venues-schema)}}))]
          (is (re-find #"Query handle not found" error))
          (is (re-find #"run the query again" error))
          (is (zero? (t2/count :model/Transform :name "no such handle"))))))))

;;; -------------------------------------------------- Update ------------------------------------------------------

(deftest transform-write-update-swaps-source-test
  (testing "GHY-4240: an update carrying a `definition` replaces the stored query and leaves everything
            else — the read-modify-write flow the definition round-trip exists for"
    (with-transforms
      (with-target-db-support
        (mt/with-temp [:model/Transform {id :id} (assoc (temp-transform-defaults "mcp_swap")
                                                        :description "unchanged")]
          (let [result (tool-result (write! {:method     "update" :id id
                                             :definition {:type  "query"
                                                          :query {:database (mt/id) :type "query"
                                                                  :query {:source-table (mt/id :checkins)}}}}))
                stored (t2/select-one :model/Transform :id id)]
            (is (= "mbql" (:source_type result)))
            (testing "the new query really landed, normalized to what the transform stores"
              (is (= (mt/id :checkins)
                     (-> stored :source :query :stages first :source-table))))
            (testing "and the fields the call didn't name are untouched"
              (is (= "unchanged" (:description result)))
              (is (= "mcp_swap" (-> result :target :name)))
              (is (= (venues-schema) (-> result :target :schema))))
            (testing "the target's database follows the query being stored, not the one it replaced —
                      a stale database in the echo is one the transform does not write, and passing that
                      echo back unchanged would be refused by the target/query database check"
              (is (= (mt/id) (-> result :target :database)))
              (is (= (mt/id) (-> stored :target :database)))
              (testing "so the echoed target round-trips"
                (let [again (tool-result (write! {:method "update" :id id :target (:target result)}))]
                  (is (= (mt/id) (-> again :target :database))))))))))))

;; TODO(query-track/execute_sql): restore when the execute_sql tool lands — this test mints a
;; query handle via `call-tool! ... "execute_sql"`, which isn't registered yet. (a query_handle on update)
#_(deftest transform-write-update-swaps-source-from-handle-test
    (testing "GHY-4240: a query_handle works on update too, so an agent can re-run execute_sql and save the
            corrected SQL over an existing transform — which also retypes it from mbql to native"
      (with-transforms
        (with-target-db-support
          (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_swap_handle")]
            (let [session-id (str (random-uuid))
                  handle     (-> (call-tool! :crowberto nil "execute_sql"
                                             {:database_id (mt/id) :sql "SELECT 2 AS n" :validate_only true}
                                             session-id)
                                 tool-result
                                 :query_handle)
                  result     (tool-result (call-tool! :crowberto write-scopes "transform_write"
                                                      {:method "update" :id id :query_handle handle}
                                                      session-id))]
              (is (= "native" (:source_type result)))
              (is (= :native (:source_type (t2/select-one :model/Transform :id id))))))))))

(deftest transform-write-update-patches-target-test
  (testing "GHY-4240: a target rename keeps the schema — update patches the stored target, it doesn't replace it"
    (with-transforms
      (with-target-db-support
        (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_before")]
          (let [result (tool-result (write! {:method "update" :id id
                                             :target {:name "mcp_after"}}))]
            (is (= "mcp_after" (-> result :target :name)))
            (is (= (venues-schema) (-> result :target :schema)))
            (is (= "table" (-> result :target :type)))))))))

(deftest transform-write-target-round-trips-test
  (testing "GHY-4240: the target a read (or a previous write) hands back can be passed straight back in.
            `type` and `database` are derived rather than authored, but they are on every target an
            agent ever sees, so refusing them at the schema boundary breaks read-modify-write."
    (with-transforms
      (with-target-db-support
        (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_roundtrip")]
          (let [echoed (:target (tool-result (write! {:method "update" :id id :description "touch"})))]
            (is (= #{:type :schema :name :database} (set (keys echoed)))
                "the echo carries the derived keys the input schema therefore has to tolerate")
            (let [after (:target (tool-result (write! {:method "update" :id id
                                                       :target (assoc echoed :name "mcp_roundtrip2")})))]
              (is (= "mcp_roundtrip2" (:name after)))
              (is (= (venues-schema) (:schema after)))
              (is (= (mt/id) (:database after))))))))))

(deftest transform-write-target-tolerates-nested-nulls-test
  (testing "GHY-4240: nulls are only stripped at the top level, so a strict client's fully-populated
            `target` arrives with nulls inside it — those must read as \"didn't touch it\" and not
            clear the stored schema"
    (with-transforms
      (with-target-db-support
        (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_nested_nulls")]
          (let [after (:target (tool-result (write! {:method "update" :id id
                                                     :target {:name                        "mcp_nested_nulls2"
                                                              :schema                      nil
                                                              :type                        nil
                                                              :database                    nil
                                                              :target-incremental-strategy nil}})))]
            (is (= "mcp_nested_nulls2" (:name after)))
            (is (= (venues-schema) (:schema after)))))))))

(deftest transform-write-target-refuses-unauthorable-type-test
  (testing "GHY-4240: a target type this tool can't author is a teaching error naming it, not a
            schema rejection the agent can't act on"
    (with-transforms
      (with-target-db-support
        (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_bad_type")]
          (let [error (tool-error (write! {:method "update" :id id
                                           :target {:name "mcp_bad_type" :type "table-incremental"}}))]
            (is (re-find #"`target.type`" error))
            (is (re-find #"table-incremental" error)))
          (testing "as is an incremental strategy on the target"
            (let [error (tool-error (write! {:method "update" :id id
                                             :target {:name "mcp_bad_type"
                                                      :target-incremental-strategy {:type "append"}}}))]
              (is (re-find #"target-incremental-strategy" error)))))))))

(deftest transform-write-target-refuses-foreign-database-test
  (testing "GHY-4240: the target database follows the query, so a `target.database` that disagrees is
            refused rather than silently ignored"
    (with-transforms
      (with-target-db-support
        (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_foreign_db")]
          (let [error (tool-error (write! {:method "update" :id id
                                           :target {:name "mcp_foreign_db" :database (inc (mt/id))}}))]
            (is (re-find #"`target.database`" error))
            (is (re-find #"follows the query" error))))))))

(deftest transform-write-update-target-conflict-test
  (testing "GHY-4240: renaming onto a table that already exists is refused on update with the same
            teaching error create gives — REST only reports \"A table with that name already exists.\",
            which names neither the table nor the fix"
    (with-transforms
      (with-target-db-support
        (let [table-name (t2/select-one-fn :name :model/Table :id (mt/id :venues))]
          (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_conflict")]
            (let [error (tool-error (write! {:method "update" :id id :target {:name table-name}}))]
              (is (re-find #"already exists" error))
              (is (re-find (re-pattern table-name) error))
              (is (re-find #"Pick a different `target.name`" error))))
          (testing "but a target that isn't moving is left alone, so a transform that has already built
                    its own output table stays editable"
            (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults table-name)]
              (let [result (tool-result (write! {:method      "update" :id id
                                                 :description "touched"
                                                 :target      {:name table-name}}))]
                (is (= "touched" (:description result)))
                (is (= table-name (-> result :target :name)))))))))))

(deftest transform-write-update-fields-test
  (testing "GHY-4240: only the fields passed change, and `clear` unsets description"
    (with-transforms
      (with-target-db-support
        (mt/with-temp [:model/Transform {id :id} (assoc (temp-transform-defaults "mcp_fields")
                                                        :description "before")]
          (let [renamed (tool-result (write! {:method "update" :id id :name "after"}))]
            (is (= "after" (:name renamed)))
            (is (= "before" (:description renamed)))
            (is (= "mcp_fields" (-> renamed :target :name))))
          (let [cleared (tool-result (write! {:method "update" :id id :clear ["description"]}))]
            (is (nil? (:description cleared)))
            (is (nil? (t2/select-one-fn :description :model/Transform :id id)))))))))

(deftest transform-write-update-needs-something-to-do-test
  (testing "GHY-4240: an update naming no field is a teaching error, not a silent no-op write"
    (with-transforms
      (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_noop")]
        (is (re-find #"Nothing to update" (tool-error (write! {:method "update" :id id}))))))))

(deftest transform-write-update-refuses-incremental-target-test
  (testing "GHY-4240: an incremental target is left alone rather than downgraded to a full rebuild"
    (with-transforms
      (mt/with-temp [:model/Transform {id :id}
                     (assoc (temp-transform-defaults "mcp_incremental")
                            :target {:type                        "table-incremental"
                                     :schema                      (venues-schema)
                                     :name                        "mcp_incremental"
                                     :target-incremental-strategy {:type "append"}})]
        (let [error (tool-error (write! {:method "update" :id id :target {:name "mcp_renamed"}}))]
          (is (re-find #"table-incremental target" error))
          (is (re-find #"omit `target`" error)))
        (testing "including when the agent passes the stored target back verbatim, which is how it
                  would actually arrive — the refusal has to survive the round-trip shape"
          (let [error (tool-error (write! {:method "update" :id id
                                           :target {:name                        "mcp_renamed"
                                                    :schema                      (venues-schema)
                                                    :type                        "table-incremental"
                                                    :target-incremental-strategy {:type "append"}}}))]
            (is (re-find #"table-incremental target" error))))))))

(deftest transform-write-update-refuses-incremental-source-test
  (testing "GHY-4240: replacing the query of an incrementally-loading transform would drop the strategy
            off its source, so the update is refused rather than silently degrading it to a full read"
    (with-transforms
      (with-target-db-support
        (let [strategy {:type "checkpoint" :checkpoint-filter-field-id (mt/id :venues :id)}]
          (mt/with-temp [:model/Transform {id :id}
                         (assoc-in (temp-transform-defaults "mcp_checkpoint")
                                   [:source :source-incremental-strategy] strategy)]
            (let [error (tool-error (write! {:method "update" :id id :definition (query-definition)}))]
              (is (re-find #"loads incrementally \(checkpoint\)" error))
              (is (re-find #"omit `definition`" error)))
            (testing "and the stored strategy is untouched"
              (is (= strategy (:source-incremental-strategy
                               (t2/select-one-fn :source :model/Transform :id id)))))
            (testing "while an update that leaves the source alone still goes through"
              (is (= "renamed" (:name (tool-result (write! {:method "update" :id id :name "renamed"}))))))))))))

(deftest transform-write-update-refuses-python-transform-test
  (testing "GHY-4240: addressing a python transform with this tool refuses rather than retyping it"
    (mt/with-premium-features #{:transforms-basic :transforms-python}
      (mt/with-temp-env-var-value! [mb-transforms-enabled true]
        (mt/with-temp [:model/Transform {id :id}
                       {:name   "py"
                        :source {:type            :python
                                 :body            "def transform(): pass"
                                 :source-tables   []
                                 :source-database (mt/id)}
                        :target {:type :table :schema (venues-schema) :name "mcp_py_out"}}]
          (let [error (tool-error (write! {:method "update" :id id :name "renamed"}))]
            (is (re-find #"is a python transform" error))
            (is (re-find #"query transforms only" error))))))))

(deftest transform-write-not-found-test
  (testing "GHY-4240: an unresolvable id collapses to the shared not-found error"
    (with-transforms
      (is (re-find #"not found" (tool-error (write! {:method "update" :id 999999999 :name "x"})))))))

;;; --------------------------------------------------- Scopes -----------------------------------------------------

(deftest transform-write-scope-gate-test
  (testing "GHY-4240: the tool is unreachable without agent:content:write"
    (with-transforms
      (is (re-find #"Insufficient scope"
                   (tool-error (write! :crowberto #{"agent:content:read"}
                                       {:method "update" :id 1 :name "x"}))))
      (testing "and the scope it declares is one the registry actually knows"
        (is (contains? (registry/registered-scopes) "agent:content:write"))))))

(deftest transform-write-readback-requires-read-scopes-test
  (testing "GHY-4240: a write scope alone doesn't double as a read scope — the echo degrades to an ack"
    (with-transforms
      (with-target-db-support
        (mt/with-temp [:model/Transform {id :id} (temp-transform-defaults "mcp_readback")]
          (let [result (tool-result (write! :crowberto #{"agent:content:write"}
                                            {:method "update" :id id :name "renamed"}))]
            (is (= #{:id :url :note} (set (keys result))))
            (is (re-find #"agent:content:read" (:note result)))
            (testing "and the write still happened"
              (is (= "renamed" (t2/select-one-fn :name :model/Transform :id id))))))))))
