(ns metabase.agent-api.execute-sql
  "The v2 `execute_sql` tool: raw SQL, run as the caller, with a handle naming what ran.

   SQL is its own tool rather than a mode of `execute_query`: it needs a permission MBQL does not
   (native-query on the database), it sits behind a kill switch MBQL does not, and it takes an input MBQL
   cannot express. Past the point where the query exists, nothing differs — the same bounded page, the same
   handle, the same steer, all of it in [[metabase.agent-api.results]].

   The handle is what retires the construct-then-save two-step: a run mints it, and a save or a chart takes
   it, so SQL reaches a saved question without a second tool that wraps the string and validates nothing.

   Values for the query's `{{variables}}` travel in `template_tag_values` and are substituted by Metabase's
   **template-tag** machinery — the same one a saved native question's filter widgets use. Read the name
   literally: it is not a promise that any string is safe to hand to the warehouse. A supplied value rides on
   its tag as the tag's default and is typed by its own JSON type, so the stored query carries the SQL *and*
   the values: a page, a save, or a chart taken from the handle reproduces the query the caller saw, and a
   question saved from it keeps those values as its variables' defaults.

   Paging is a re-read: raw SQL has no `:page` clause to re-window it in the warehouse, so an `offset` reads
   `offset + row_limit` rows and drops the ones already seen. The instance's row cap is therefore a ceiling
   on how far `offset` can reach, and a page that ends at it says so and names the SQL-side recovery."
  (:require
   [clojure.string :as str]
   [metabase.agent-api.handles :as handles]
   [metabase.agent-api.query :as agent-api.query]
   [metabase.agent-api.results :as results]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private Params
  "The arguments [[execute-sql]] contracts on. `POST /v2/execute-sql` declares the wire schema, with the
   bounds a client is held to; this is the looser shape the domain function accepts."
  [:map
   [:database_id         {:optional true} [:maybe [:or :int :string]]]
   [:sql                 {:optional true} [:maybe :string]]
   [:query_handle        {:optional true} [:maybe :string]]
   [:template_tag_values {:optional true} [:maybe [:map-of :any :any]]]
   [:validate_only       {:optional true} [:maybe :boolean]]
   [:row_limit           {:optional true} [:maybe :int]]
   [:offset              {:optional true} [:maybe :int]]
   [:response_format     {:optional true} [:maybe :string]]])

;;; ──────────────────────────────────────────────────────────────────
;;; The two gates SQL passes and MBQL does not
;;; ──────────────────────────────────────────────────────────────────

(defn- check-enabled!
  "Refuse when an admin has turned the tool off. The kill switch also removes `execute_sql` from `tools/list`
   ([[metabase.mcp.tools/list-tools]]), so a client normally never reaches this — a client that cached the
   tool list from before the switch was thrown does, and it has to learn that no SQL will fix it."
  []
  (when-not (agent-api.settings/mcp-execute-sql-enabled)
    (tools/teaching-error!
     (str "Raw SQL is disabled on this instance. Nothing in the SQL will change that: answer the question "
          "with `execute_query`, which takes MBQL, or ask an admin to turn `execute_sql` back on.")
     403)))

(defn- check-native-permissions!
  "Refuse a caller who may not write SQL against this database. The query processor checks this again when the
   query runs; this is what stands in front of the paths that never reach it — a `validate_only` dry run, and
   the parse of the SQL's template tags, which would otherwise say which snippets and cards exist to a caller
   who may not query the database at all."
  [database-id]
  (when-not (qp.perms/current-user-has-adhoc-native-query-perms? {:database database-id})
    (tools/teaching-error!
     (str "You do not have permission to run native queries against this database — that is the "
          "\"Native query editing\" permission, and only an admin can grant it. Answer the question with "
          "`execute_query` instead, which runs under the query permissions you do have.")
     403)))

;;; ──────────────────────────────────────────────────────────────────
;;; Template tags
;;; ──────────────────────────────────────────────────────────────────

(defn- value-type
  "The template-tag type a supplied value takes: the type the value already is. A value is substituted as what
   the tag says it is, so `5` bound to a text tag reaches the warehouse as the string \"5\" and a comparison
   against a numeric column fails — the tag has to carry the value's own type for the value to arrive intact."
  [tag-name value]
  (cond
    (boolean? value) :boolean
    (number? value)  :number
    (string? value)  :text
    :else            (tools/teaching-error!
                      (str "The value for `" tag-name "` must be a string, a number, or a boolean; "
                           (pr-str value) " is not. A date is a string — the SQL compares it as the "
                           "database casts it."))))

(defn- check-tag-takes-a-value!
  [tag-name {tag-type :type}]
  (when (#{:snippet :card} tag-type)
    (tools/teaching-error!
     (str "`" tag-name "` is a " (name tag-type) " reference, not a variable, and it takes no value: "
          "Metabase resolves it against the " (name tag-type) " it names."))))

(defn- unknown-tag-message
  [tag-name tags]
  (let [variables (sort (keep (fn [[nm {tag-type :type}]]
                                (when-not (#{:snippet :card} tag-type) nm))
                              tags))]
    (str "This SQL declares no `{{" tag-name "}}` variable. "
         (if (seq variables)
           (str "It declares: " (str/join ", " (map #(str "`" % "`") variables)) ".")
           "It declares no variables at all — write the value into the SQL, or add a `{{variable}}` for it."))))

(defn- with-values
  "`query` with each of `values` on the tag it names, as that tag's type and default.

   The value rides on the tag rather than in the query's `:parameters` because `:parameters` are a property of
   one *execution*, and this query outlives its execution: it is stored under a handle, paged through, saved
   as a question. A default is the one place a value survives all three, and it is where a saved question's
   variable carries its value anyway."
  [query values]
  (if (empty? values)
    query
    (lib/with-template-tags
      query
      (reduce (fn [tags [tag-name value]]
                (let [tag-name (name tag-name)
                      tag      (or (get tags tag-name)
                                   (tools/teaching-error! (unknown-tag-message tag-name tags)))]
                  (check-tag-takes-a-value! tag-name tag)
                  (assoc tags tag-name (assoc tag
                                              :type    (value-type tag-name value)
                                              :default value))))
              ;; SQL that declares no variables carries no tag map at all, and a value for one of the
              ;; variables it does not have is the error this teaches.
              (or (lib/template-tags query) {})
              values))))

;;; ──────────────────────────────────────────────────────────────────
;;; The query a call names
;;; ──────────────────────────────────────────────────────────────────

(defn- check-native!
  "Refuse an MBQL query arriving by handle: `execute_query` is where MBQL runs, and a handle minted there
   names a query this tool has no business re-running under the native-query scope."
  [query-map]
  (when-not (agent-api.query/native-query? query-map)
    (tools/teaching-error!
     "This handle names an MBQL query, not SQL. Run it with `execute_query`.")))

(defn- stored-query
  "The serialized native query a `query_handle` names. It resolved once already, when the handle was minted;
   what has to hold again is that it is still SQL, that its shape is still readable, and — checked by the
   caller — that the user may still run native queries against its database."
  [handle {:keys [database_id template_tag_values]}]
  (when (or database_id (seq template_tag_values))
    (tools/teaching-error!
     (str "A `query_handle` already names its database and its variable values. Send `sql` instead to run "
          "different SQL or to supply different `template_tag_values`.")))
  (let [query-map (or (some-> (handles/read-query api/*current-user-id* handle) lib/normalize)
                      (tools/teaching-error!
                       (str "No query handle " (pr-str handle) ". A handle expires, and it belongs to the "
                            "user who minted it — send the SQL itself in `sql`.")
                       404))]
    (check-native! query-map)
    (agent-api.query/check-shape! query-map)
    query-map))

(defn- built-query
  "The serialized native query a `sql` call names: the SQL, the template tags it declares, and the values the
   call supplied for them."
  [sql {:keys [database_id template_tag_values]}]
  (when-not database_id
    (tools/teaching-error! "`database_id` names the database to run the SQL against, and `sql` needs one."))
  (let [database-id (tools/resolve-id :model/Database database_id)]
    (api/read-check :model/Database database-id)
    (check-native-permissions! database-id)
    (-> (lib/native-query (lib-be/application-database-metadata-provider database-id) sql)
        (with-values template_tag_values)
        lib/prepare-for-serialization)))

(defn- resolve-query
  [{:keys [sql query_handle] :as params}]
  (if query_handle
    (let [query-map (stored-query query_handle params)]
      ;; A stored query outlives the grant it was minted under, so the permission is re-checked on the way
      ;; out of the store and not only on the way in.
      (check-native-permissions! (:database query-map))
      query-map)
    (built-query sql params)))

;;; ──────────────────────────────────────────────────────────────────
;;; Paging
;;; ──────────────────────────────────────────────────────────────────
;;
;; Raw SQL carries no clause the tool can re-window it with, so a page is read by fetching through the offset
;; and dropping what the caller has already seen. The instance's row cap bounds the fetch, and so bounds how
;; far an `offset` reaches; past it the only way on is `LIMIT`/`OFFSET` in the SQL itself.

(defn- page
  "How many rows this page carries and how many the query must fetch to reach it, given the row cap."
  [query-map offset row-limit]
  (let [cap       (results/row-cap query-map)
        available (if cap (- cap offset) row-limit)]
    (when-not (pos? available)
      (tools/teaching-error!
       (str "This instance returns at most " cap " rows for one query, and offset " offset " starts past "
            "that. Page inside the SQL with `LIMIT`/`OFFSET`, or aggregate — a question about that many "
            "rows is not answered by reading them.")))
    (let [row-limit (min row-limit available)]
      {:cap       cap
       :row-limit row-limit
       :fetch     (+ offset row-limit)})))

(defn- capped-message
  "The steer for a full page that ends at the row cap: `offset` cannot reach the rows behind it, so the next
   call is a different query rather than a different offset."
  [{:keys [cap row-limit fetch]} offset]
  (when (and cap (= fetch cap))
    (str "Showing " row-limit " rows from offset " offset ", and more may follow — but this instance returns "
         "at most " cap " rows for one query, so `offset` cannot read past it. Add `LIMIT`/`OFFSET` to the "
         "SQL to read further, or aggregate to answer the question without the rows.")))

(defn- unordered-warning
  "Paging by re-reading is only sound if the SQL orders its rows: without an `ORDER BY` a database may return
   two reads of the same query in different orders, and a page boundary can then repeat one row and skip
   another. The check is on the text and is therefore a caveat, not a verdict — it is attached to a steering
   message, never to a refusal."
  [query-map]
  (when-not (re-find #"(?i)\border\s+by\b" (str (get-in query-map [:stages 0 :native])))
    (str " This SQL has no `ORDER BY`, so its row order is not guaranteed: add one before paging, or a row "
         "can repeat on one page and be missed on the next.")))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(mu/defn execute-sql :- :map
  "Run raw SQL as the caller, and hand back a handle for what ran.

   `validate_only` mints the handle without running anything. It checks what a run would check *around* the
   SQL — the kill switch, native-query permission, the template tags the SQL declares and the values given for
   them — and nothing of the SQL itself: only the warehouse can say whether a `SELECT` parses, and asking it
   is executing it. So a dry run blesses SQL that will fail, and says as much; what it buys is a handle for a
   query the caller wants to chart or save without pulling a page of rows into the model's context first."
  [{:keys [query_handle validate_only row_limit offset response_format] :as params} :- Params]
  (check-enabled!)
  (tools/check-exactly-one! params [:sql :query_handle])
  (let [offset    (or offset 0)
        query-map (resolve-query params)
        paging    (page query-map offset (tools/clamp-limit row_limit
                                                            results/default-row-limit
                                                            results/max-row-limit))
        row-limit (:row-limit paging)
        handle    (or query_handle (handles/store-query! api/*current-user-id* query-map))]
    (if validate_only
      {:query_handle handle :validated true}
      (-> (results/run-query! (assoc query-map :constraints {:max-results           (:fetch paging)
                                                             :max-results-bare-rows (:fetch paging)}))
          ;; The window is cut here rather than in the warehouse: the rows through `offset` were fetched to
          ;; reach the ones the caller asked for, and they are not part of the answer.
          (update-in [:data :rows] #(vec (drop offset %)))
          (results/page-response {:handle          handle
                                  :offset          offset
                                  :row-limit       row-limit
                                  :response-format response_format
                                  :warning         (unordered-warning query-map)
                                  :capped-message  (capped-message paging offset)})))))
