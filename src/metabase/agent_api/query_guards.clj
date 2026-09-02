(ns metabase.agent-api.query-guards
  "Guards that every client-reachable serialized MBQL payload must pass before execution on an
   MBQL-scoped path — whether it arrives as a fresh query, a continuation token, or a stored
   query handle. Opaque payloads could otherwise smuggle native SQL past the MBQL-only scopes
   (bypassing the execute-sql kill switch) or retain access the caller has since lost, so the
   three `!` guards run together at every such entry point.

   Consumers: the agent-api execution paths (`/v2/query`, the handle and continuation-token
   paths) run these guards directly — their former private copies are deleted — and the v2 MCP
   tool surface joins them as the stack lands. One deliberate tightening over the old private
   copy: native detection raw-scans the payload instead of normalize-then-inspect, so a payload
   too malformed to normalize now fails closed instead of falling through to shape validation.

   [[check-mcp-ui-native-query!]] is the odd one out: it is written to guard the ordinary QP endpoints,
   which the MCP Apps iframe reaches with a credential that the endpoint scope middleware cannot narrow.
   It shares the native detection but refuses raw SQL on scope rather than banning it outright. It is
   NOT yet wired into any endpoint — the `:mcp-ui-credential` it keys on, and the scopes claim it spends,
   only exist once the v2 core's session rework lands (the next PR in this stack). It is extracted and
   unit-tested here so that slice can wire it in without also authoring it; until then it is dormant."
  (:require
   [clojure.string :as str]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- token
  "Normalized name of a keyword or string — namespace kept, lowercased, `_` folded to `-`. nil for anything
   else, so junk keys and values fall out rather than throwing.

   Everything this guard matches goes through here because the QP normalizer canonicalizes keys
   case-insensitively and treats `_` and `-` alike: `:SOURCE_QUERY`, `:Source-Query` and `:source-query` all
   reach the query processor as the same edge. Matching them case-exactly, as this did, let a caller walk
   straight past the guard by changing the spelling of a key."
  [x]
  (when (or (keyword? x) (string? x))
    (-> x u/qualified-name u/lower-case-en (str/replace \_ \-))))

(defn- tokenized-entries
  "`node`'s entries as `[token value]` pairs, dropping keys that are neither keyword nor string. A seq rather
   than a map so a node carrying two spellings of one edge (`:source-query` AND `\"source_query\"`) has both
   scanned instead of one silently shadowing the other."
  [node]
  (keep (fn [[k v]] (when-let [t (token k)] [t v])) node))

(defn native-marker?
  "True if `node` is a map carrying a native-SQL marker: a `native` query body (the universal signal across
   legacy and MBQL 5 native forms), a legacy `type: native`, or an MBQL 5 `mbql.stage/native` `lib/type`.
   A `native` key only counts when its value is non-nil, so an explicit-null key from a JSON round-trip is not
   a marker.

   Keys and values are matched through [[token]], so keyword and raw-JSON-string forms, casing, and `_`/`-`
   spelling all collapse together — a payload decoded without keywordizing, or spelled `NATIVE`, trips the
   guard exactly as `:native` does. A legitimate serialized MBQL query carries none of these."
  [node]
  (boolean
   (and (map? node)
        (let [entries (tokenized-entries node)]
          (some (fn [[t v]]
                  (case t
                    "native"   (some? v)
                    "type"     (= "native" (token v))
                    "lib/type" (= "mbql.stage/native" (token v))
                    false))
                entries)))))

(def ^:private native-seq-edges
  "Structural edges whose value is a *sequence* of stage/join maps, as [[token]]s. A native marker may hide in
   any element, so each is scanned. One token covers every spelling the QP accepts — keyword or raw JSON
   string, any casing."
  #{"stages" "joins"})

(def ^:private native-map-edges
  "Structural edges whose value is a nested stage/query *map*, as [[token]]s. `source_query` and
   `source-query` normalize to one token: legacy MBQL normalization canonicalizes both, so a snake_case
   payload still reaches the query processor as a native stage and must trip the guard."
  #{"query" "source-query"})

(defn native-query?
  "True if `query-map` (a decoded, client-reachable query) contains native SQL along its
   query-nesting structure — legacy top-level `:type :native`, a legacy nested `:source-query`'s
   `:native`, or an MBQL 5 `:mbql.stage/native` stage, including inside joins or nested joins.

   Scans only the structural query-nesting edges ([[native-seq-edges]] and [[native-map-edges]]),
   not the whole tree: `:expressions` and `:template-tags` are maps keyed by caller-chosen names, so
   a whole-tree scan would reject a perfectly legitimate query that merely has a column/expression/tag
   named `native`. The callers are MBQL-only by scope, so a native marker anywhere along the query
   structure means the payload is smuggling raw SQL, regardless of how it's nested.

   Deliberately does not normalize first. `lib-be/normalize-query` swallows its own failures and returns
   `{}`, and it needs the referenced database's metadata to resolve, so a normalize-then-inspect check
   silently reports \"not native\" for anything it cannot parse or look up. Matching raw markers keeps the
   guard total, independent of app-DB state, and failing closed: a malformed value hanging off a
   structural edge (e.g. a `:stages` that is a junk map rather than a sequence) is deep-scanned so a
   buried `:native` marker still trips the guard."
  [query-map]
  (letfn [;; A stage/query map is walked only along the structural edges, never into caller-named
          ;; sub-maps like `:expressions`/`:template-tags`.
          (scan-map [node]
            (or (native-marker? node)
                (boolean (some (fn [[t v]]
                                 (cond
                                   (native-seq-edges t) (scan-seq-edge v)
                                   (native-map-edges t) (scan-map-edge v)
                                   :else                false))
                               (tokenized-entries node)))))
          ;; `:stages`/`:joins`: normally a sequence of stage/join maps. A malformed non-sequential
          ;; value is deep-scanned so junk can't smuggle a marker past the guard.
          (scan-seq-edge [node]
            (cond
              (nil? node)        false
              (sequential? node) (boolean (some scan-map node))
              :else              (deep-scan node)))
          ;; `:query`/`:source-query`: normally a nested stage/query map. A malformed non-map value
          ;; is deep-scanned.
          (scan-map-edge [node]
            (cond
              (nil? node) false
              (map? node) (scan-map node)
              :else       (deep-scan node)))
          ;; Fail-closed fallback for a malformed sub-tree: match a marker anywhere within it.
          (deep-scan [node]
            (boolean (some native-marker? (tree-seq coll? seq node))))]
    (scan-map query-map)))

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
    ;; No :query-map in ex-data: the rejection can surface to the client, and echoing the decoded
    ;; payload back would bloat the response (and land it in error logs) for no diagnostic gain.
    (throw (ex-info "Native queries are not supported here; use execute_sql instead."
                    {:status-code 400}))))

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

  NOT yet wired into any endpoint. The `:mcp-ui-credential` request key it dispatches on is attached by
  the v2 core's session rework (the next PR in this stack); until that lands no request carries it, so this
  guard is a no-op wherever it might be called. It is authored and unit-tested here so the session-rework
  slice can drop it into the QP endpoint path without also having to write it. When wiring it in, add it to
  the QP-endpoint request flow for the routes on the MCP-UI credential's allowlist (the `/api/dataset*`
  surface), and delete this paragraph.

  The iframe's credential is stamped `::scope/unrestricted` on purpose — none of the routes on its allowlist declare
  a `:scope`, so a narrower stamp would 403 the iframe at bootstrap. That makes the endpoint scope middleware unable
  to stop a credential lifted out of the resource HTML from POSTing native SQL to the query endpoints. The minting
  session's real scopes are meant to ride along on the credential and be spent here: raw SQL needs an SQL-execution
  scope (`agent:sql:run`, or v1's concrete `agent:sql:execute`) and the `mcp-execute-sql-enabled` kill switch.

  Sequencing: credentials only start carrying a scopes claim with the v2 core's session rework (the
  next PR in this stack). Until then — and for any credential minted before that deploy — the claim
  is absent and a native query over a UI credential fails closed, which the test suite codifies.

  Native is refused rather than banned because `execute_sql` handles legitimately hold raw SQL and are visualizable
  by design. Non-native queries, and requests authenticated any other way, pass straight through."
  [request query]
  ;; Keyed on the credential, not on its scopes claim, so a credential carrying no claim is refused rather than
  ;; waved through — a rolling deploy can hand this node one minted before the claim existed.
  (when-let [claims (:mcp-ui-credential request)]
    (when (native-query? query)
      ;; Scope check first, kill switch second: a client that lacks the SQL-execution scope is refused
      ;; the same way whether or not the instance has raw SQL enabled. Testing the kill switch first
      ;; would leak that config bit — an unauthorized caller could tell `mcp-execute-sql-enabled`'s
      ;; state apart by which 403 message it got back.
      (let [token-scopes (:token-scopes claims)]
        (when-not (or (contains? token-scopes ::scope/unrestricted)
                      (scope/scope-satisfied? token-scopes metabot.scope/agent-sql-run)
                      (scope/scope-satisfied? token-scopes metabot.scope/agent-sql-execute))
          (throw (ex-info (str "Running raw SQL requires the " metabot.scope/agent-sql-run
                               " scope, which this client was not granted.")
                          {:status-code 403}))))
      (when-not (agent-api.settings/mcp-execute-sql-enabled)
        (throw (ex-info (str "Running raw SQL is disabled on this instance — an admin can re-enable it "
                             "with the mcp-execute-sql-enabled setting.")
                        {:status-code 403}))))))

(defn check-token-query-permissions!
  "Re-validate the current user's permissions on a stored or client-supplied query.

  A stage-0 fast path, not the enforcement point: only a numeric first-stage `:source-table` is
  checked here, and the QP middleware remains the authoritative backstop at execution. The payload
  could in principle name a different source table than the one the original call was authorized
  against (a user's data perms can also change between calls); the explicit `api/query-check`
  gives a cleaner 403 and avoids spinning up the streaming response just to abort."
  [query-map]
  (when-let [table-id (get-in query-map [:stages 0 :source-table])]
    (when (int? table-id)
      (api/query-check :model/Table table-id))))
