(ns metabase.agent-api.query-guards
  "Guards that every client-reachable serialized MBQL payload must pass before execution on an
   MBQL-scoped path — whether it arrives as a fresh query, a continuation token, or a stored
   query handle. Opaque payloads could otherwise smuggle native SQL past the MBQL-only scopes
   (bypassing the execute-sql kill switch) or retain access the caller has since lost, so the
   three `!` guards run together at every such entry point.

   [[check-mcp-ui-native-query!]] is the odd one out: it guards the ordinary QP endpoints, which the MCP Apps
   iframe reaches with a credential that the endpoint scope middleware cannot narrow. It shares the native
   detection but refuses raw SQL on scope rather than banning it outright."
  (:require
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.metabot.scope :as metabot.scope]))

(defn native-marker?
  "True if `node` is a map carrying a native-SQL marker: a `:native` query body (the universal signal
   across legacy and MBQL 5 native forms), a legacy `:type :native`, or an MBQL 5 `:mbql.stage/native`
   `:lib/type`. Keys and values are each matched in both their keyword and their raw-JSON-string form,
   since a caller may hand over a payload that was decoded without keywordizing. Membership tests never
   coerce, so junk values don't throw. A legitimate serialized MBQL query carries none of these."
  [node]
  (boolean
   (and (map? node)
        (or (contains? node :native)
            (contains? node "native")
            (some #{:native "native"} [(:type node) (get node "type")])
            (some #{:mbql.stage/native "mbql.stage/native"} [(:lib/type node) (get node "lib/type")])))))

(defn native-query?
  "True if `query-map` (a decoded, client-reachable query) contains native SQL anywhere in its tree —
   legacy top-level `:type :native`, a legacy nested `:source-query`'s `:native`, or an MBQL 5
   `:mbql.stage/native` stage, including inside joins or nested joins.
   A whole-tree scan, because the callers are MBQL-only by scope: a native marker at any depth
   means the payload is smuggling raw SQL, regardless of how it's nested.

   Deliberately does not normalize first. `lib-be/normalize-query` swallows its own failures and returns
   `{}`, and it needs the referenced database's metadata to resolve, so a normalize-then-inspect check
   silently reports \"not native\" for anything it cannot parse or look up. Matching raw markers keeps the
   guard total, independent of app-DB state, and failing closed."
  [query-map]
  (boolean (some native-marker? (tree-seq coll? seq query-map))))

(defn reject-native-query!
  "Throw a 400 if `query-map` is a native query.

  The MBQL execution paths are gated by the MBQL-execution scopes (`agent:query` /
  `agent:query:execute`), not `agent:sql:execute`. The opaque base64 payloads they accept (a
  query_handle, a continuation token) could carry a native query — legacy top-level `:type :native`
  or an MBQL 5 native stage; allowing either would let a token without the SQL-execution scope run
  raw SQL, defeating the scope split and bypassing the execute-sql kill switch. Force native
  execution onto the SQL-execution path, which is correctly scoped."
  [query-map]
  (when (native-query? query-map)
    (throw (ex-info "Native queries are not supported here; use execute_sql instead."
                    {:status-code 400 :query-map query-map}))))

(defn validate-serialized-query!
  "Sanity-check a decoded MBQL query map from a client-reachable base64 payload (query_handle or token).
   Require `:stages` to be a non-empty sequence of maps, and the last-stage `:limit` (if present) a
   positive integer; otherwise downstream paging arithmetic would throw on the malformed shape and
   surface a 500 instead of a clean 400.
   Deep MBQL validation still happens in the QP at execution."
  [query-map]
  (let [stages (:stages query-map)]
    (when-not (and (sequential? stages) (seq stages) (every? map? stages))
      (throw (ex-info "Invalid query: expected a serialized MBQL query with a non-empty :stages of maps."
                      {:status-code 400 :query-map query-map})))
    ;; `contains?` (not `when-let`) so an explicit `false`/`nil` limit is caught, not skipped.
    (when (contains? (last stages) :limit)
      (let [limit (:limit (last stages))]
        (when-not (and (int? limit) (pos? limit))
          (throw (ex-info "Invalid query: last-stage :limit must be a positive integer."
                          {:status-code 400 :query-map query-map})))))))

(defn check-mcp-ui-native-query!
  "Throw a 403 if `request` is authenticated by an MCP Apps UI credential that may not run `query` as raw SQL.

  The iframe's credential is stamped `::scope/unrestricted` on purpose — none of the routes on its allowlist declare
  a `:scope`, so a narrower stamp would 403 the iframe at bootstrap. That makes the endpoint scope middleware unable
  to stop a credential lifted out of the resource HTML from POSTing native SQL to the query endpoints. The minting
  session's real scopes ride along on the credential instead, and this is where they are spent: raw SQL needs
  `agent:sql:run` and the `mcp-execute-sql-enabled` kill switch, the same two gates `execute_sql` itself consults.

  Native is refused rather than banned because `execute_sql` handles legitimately hold raw SQL and are visualizable
  by design. Non-native queries, and requests authenticated any other way, pass straight through."
  [request query]
  ;; Keyed on the credential, not on its scopes claim, so a credential carrying no claim is refused rather than
  ;; waved through — a rolling deploy can hand this node one minted before the claim existed.
  (when-let [claims (:mcp-ui-credential request)]
    (when (native-query? query)
      (when-not (agent-api.settings/mcp-execute-sql-enabled)
        (throw (ex-info (str "Running raw SQL is disabled on this instance — an admin can re-enable it "
                             "with the mcp-execute-sql-enabled setting.")
                        {:status-code 403})))
      (let [token-scopes (:token-scopes claims)]
        (when-not (or (contains? token-scopes ::scope/unrestricted)
                      (scope/scope-satisfied? token-scopes metabot.scope/agent-sql-run))
          (throw (ex-info (str "Running raw SQL requires the " metabot.scope/agent-sql-run
                               " scope, which this client was not granted.")
                          {:status-code 403})))))))

(defn check-token-query-permissions!
  "Re-validate the current user's permissions on a stored or client-supplied query.

  The payload could in principle name a different source table than the one the original call was
  authorized against (a user's data perms can also change between calls). The QP middleware would
  catch this at execution time, but running the explicit `api/query-check` first gives a cleaner
  403 and avoids spinning up the streaming response just to abort."
  [query-map]
  (when-let [table-id (get-in query-map [:stages 0 :source-table])]
    (when (int? table-id)
      (api/query-check :model/Table table-id))))
