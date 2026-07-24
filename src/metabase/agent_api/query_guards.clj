(ns metabase.agent-api.query-guards
  "Guards that every client-reachable serialized MBQL payload must pass before execution on an
   MBQL-scoped path — whether it arrives as a fresh query, a continuation token, or a stored
   query handle. Opaque payloads could otherwise smuggle native SQL past the MBQL-only scopes
   (bypassing the execute-sql kill switch) or retain access the caller has since lost, so the
   three `!` guards run together at every such entry point."
  (:require
   [metabase.api.common :as api]))

(defn native-marker?
  "True if `node` is a map carrying a native-SQL marker: a `:native` query body (the universal signal
   across legacy and MBQL 5 native forms), a legacy `:type :native`, or an MBQL 5 `:mbql.stage/native`
   `:lib/type`. Membership tests cover the keyword and json-decoded string forms and never coerce, so
   junk values don't throw. A legitimate serialized MBQL query carries none of these."
  [node]
  (and (map? node)
       (or (contains? node :native)
           (contains? #{:native "native"} (:type node))
           (contains? #{:mbql.stage/native "mbql.stage/native"} (:lib/type node)))))

(defn native-query?
  "True if `query-map` (a decoded, client-reachable query) contains native SQL anywhere in its tree —
   legacy top-level `:type :native`, a legacy nested `:source-query`'s `:native`, or an MBQL 5
   `:mbql.stage/native` stage, including inside joins or nested joins.
   A whole-tree scan, because the callers are MBQL-only by scope: a native marker at any depth
   means the payload is smuggling raw SQL, regardless of how it's nested."
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
