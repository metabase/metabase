(ns metabase.agent-api.query
  "The query plumbing every Agent API execution path shares: the MBQL-only gate, the sanity check on a
   client-reachable serialized query, the source-table permission re-check, and the userland preparation
   an app query runs under.

   All four have to be the same on every path or they are not guarantees. A middleware default added for
   one endpoint and not the other, or a native-SQL gate one payload shape slips past, is a hole exactly
   where the scope split is supposed to be."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.core :as qp]
   [metabase.warehouse-schema.table :as schema.table]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Native SQL belongs to the SQL-scoped endpoints
;;; ──────────────────────────────────────────────────────────────────

(defn- native-marker?
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
  "True if `query-map` (a decoded, client-reachable query) carries native SQL anywhere in its tree —
   legacy top-level `:type :native`, a legacy nested `:source-query`'s `:native`, or an MBQL 5
   `:mbql.stage/native` stage, including inside joins. A whole-tree scan, because the MBQL endpoints are
   MBQL-only by scope: a native marker at any depth means the payload smuggles raw SQL, however it is
   nested."
  [query-map]
  (boolean (some native-marker? (tree-seq coll? seq query-map))))

(defn check-mbql!
  "Refuse a native query. The MBQL endpoints carry the MBQL scope, not the SQL one, so a handle, a
   continuation token, or a payload that smuggles SQL past one of them would run raw SQL without the
   native-query scope and behind the `execute_sql` kill switch."
  [query-map]
  (when (native-query? query-map)
    (throw (ex-info "This is a native SQL query. Run it with `execute_sql`, which is scoped for raw SQL."
                    {:status-code 400}))))

;;; ──────────────────────────────────────────────────────────────────
;;; The shape of a client-reachable query
;;; ──────────────────────────────────────────────────────────────────

(defn own-limit
  "The `limit:` the caller wrote on `query-map`'s last stage, if any. It caps the whole result set — a
   page reads within it, and never past it."
  [query-map]
  (:limit (last (:stages query-map))))

(defn check-shape!
  "Sanity-check a serialized MBQL query that arrived from a client-reachable payload — a `query_handle`, a
   continuation token, a base64 blob.

   Such a query may have been minted by an older build, so a shape the paging arithmetic cannot read has to
   surface as a refusal the caller can act on rather than as a 500. The `limit` rule is checked here rather
   than at execution so a dry run cannot bless a query a later execution of the same handle would refuse.
   Deep MBQL validation happens in the query processor at execution, as it does for every app query."
  [query-map]
  (let [stages (:stages query-map)]
    (when-not (and (sequential? stages) (seq stages) (every? map? stages))
      (throw (ex-info "This does not name a runnable query: it has no stages." {:status-code 400})))
    ;; `contains?` rather than a nil check, so an explicit null `limit` is refused rather than read as absent.
    (when (contains? (last stages) :limit)
      (let [limit (:limit (last stages))]
        (when-not (and (int? limit) (pos? limit))
          (throw (ex-info (str "A query's `limit` must be a positive integer; " (pr-str limit)
                               " is not. Omit it to read every row.")
                          {:status-code 400})))))))

(defn- source-table-ids
  "Every table `query-map` reads: the source table of every stage, and of every join in every stage."
  [query-map]
  (into #{}
        (comp (filter map?)
              (keep :source-table)
              (filter int?))
        (tree-seq coll? seq query-map)))

(defn- field-ids
  "Every field `query-map` names, anywhere: a filter, a breakout, an expression, an order-by, a join
   condition. A field ref is `[:field <opts> <id>]` once the query is resolved."
  [query-map]
  (into #{}
        (comp (filter vector?)
              (filter (fn [clause]
                        (and (= 3 (count clause))
                             (contains? #{:field "field"} (first clause))
                             (int? (nth clause 2)))))
              (map #(nth % 2)))
        (tree-seq coll? seq query-map)))

(defn- check-columns-visible!
  "Refuse a query that names a column the caller's sandbox hides.

   A column-restricting sandbox is not a permission on the table — the caller may query it — so the table
   check passes and the query still cannot run: the sandbox rewrites the table into a source query without
   that column, and the warehouse rejects the reference. The query processor discovers this at execution.
   A dry run never gets there, and a dry run that says a hidden column is fine is an existence oracle for
   exactly the columns the sandbox was configured to hide."
  [query-map]
  (let [ids (field-ids query-map)]
    (when (seq ids)
      (let [mp        (lib-be/application-database-metadata-provider (:database query-map))
            columns   (keep (fn [id]
                              (when-let [field (lib.metadata/field mp id)]
                                {:id id :name (:name field) :table-id (:table-id field)}))
                            ids)
            by-table  (group-by :table-id (filter :table-id columns))
            visible   (into #{}
                            (mapcat val)
                            (schema.table/batch-filter-sandboxed-fields by-table))
            hidden    (remove visible (mapcat val by-table))]
        (when (seq hidden)
          (throw (ex-info (str "This query references columns you do not have access to: "
                               (str/join ", " (sort (map :name hidden)))
                               ". Read the table's fields and build the query from those.")
                          {:status-code 403})))))))

(defn check-source-permissions!
  "Re-check that the caller may run `query-map`: query permission on every table it reads, and sandbox
   visibility on every column it names.

   The query processor runs both checks when a query executes. This covers what runs before that: a stored
   query outlives the grant it was minted under, and a dry run never reaches the query processor at all. It
   is every stage and every join, not just the first source table — a table the caller cannot query rides in
   behind one they can, and a dry run that blesses it has answered a question the caller was not allowed to
   ask."
  [query-map]
  (doseq [table-id (source-table-ids query-map)]
    (api/query-check :model/Table table-id))
  (check-columns-visible! query-map))

;;; ──────────────────────────────────────────────────────────────────
;;; Execution
;;; ──────────────────────────────────────────────────────────────────

(defn prepare
  "Apply the standard Agent API query preparation: the userland row constraints every app query runs
   under, and the execution info that lands on the `query_execution` audit row."
  [query-map]
  (-> query-map
      (update-in [:middleware :js-int-to-string?] (fnil identity true))
      qp/userland-query-with-default-constraints
      (update :info merge {:executed-by api/*current-user-id*
                           :context     :agent})))
