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

   Paging is a re-read — raw SQL has no clause to re-window it in the warehouse — which makes the instance's
   row cap a ceiling on how far an `offset` can reach. The arithmetic is [[metabase.agent-api.results/pager]]'s:
   it reads the strategy off the query, not off the tool that holds it."
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
  "Refuse a caller who may not write SQL against this database, and point them at the tool that runs under the
   permissions they do have."
  [database-id]
  (agent-api.query/check-native-permissions!
   database-id
   (str "Answer the question with `execute_query` instead, which runs under the query permissions you do "
        "have.")))

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
  (let [query-map (resolve-query params)
        pager     (results/pager query-map
                                 (or offset 0)
                                 (tools/clamp-limit row_limit results/default-row-limit results/max-row-limit))
        handle    (or query_handle (handles/store-query! api/*current-user-id* query-map))]
    (if validate_only
      {:query_handle handle :validated true}
      (results/page-response pager
                             (results/run-query! (results/window pager query-map))
                             {:handle handle :response-format response_format}))))
