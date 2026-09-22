(ns metabase.metabot.tools.api-call
  "Tools for the experimental, deliberately unguarded `:megabot` profile: a generic
  \"call the Metabase REST API as the current user\" tool, plus two OpenAPI discovery tools.

  - `call_api`             — issue GET/POST/PUT/DELETE/PATCH against the internal `/api` and read the response.
  - `list_api_endpoints`   — a paged, searchable index of every API endpoint (method / path / description).
  - `describe_api_endpoint`— the request/response schema of one endpoint, so a correct `call_api` can be built.

  None of these carry `:scope`/`:capabilities` metadata, so they are neither scope-filtered nor
  scope-checked at call time — matching the other megabot tools.

  Every `call_api` request is dispatched through the *real* production Ring handler
  (`metabase.server.core/make-handler` over `metabase.api-routes.core/routes`, the exact composition
  from `metabase.core.core`), under the already-bound `metabase.api.common/*current-user-id*`. So the
  API layer's own authentication, permission, and sandboxing middleware run unchanged — this profile
  calls the API *as the current user*, it does not bypass anything. Permission failures come back as
  the API's own 4xx response in `:output`, never as a bypass.

  Every write is summarized for both audiences: the model gets a line with the `metabase://` link of
  the card, dashboard, collection, or document it created or changed (ahead of the body, so truncation
  can't hide the id), and the user gets a localized `tool_title` for the chat step (\"Created <link>\",
  \"Moved <link> to trash\", …, or the model's own `summary` for other writes). Reads — GETs and query
  POSTs — are not summarized.

  `metabase.api-routes.core` transitively requires this namespace (its `/metabot` route mounts
  `metabase.metabot.api`), so the routes var is resolved lazily via `requiring-resolve` inside the
  memoized delays to avoid a namespace load cycle."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.tmpl :as te]
   [metabase.server.core :as server]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.string :as u.str]
   [ring.util.codec :as codec])
  (:import
   (jakarta.servlet.http HttpServletResponse)
   (java.io ByteArrayInputStream ByteArrayOutputStream InputStream OutputStream)
   (java.util.concurrent ExecutionException)
   (java.util.concurrent.atomic AtomicBoolean)
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Shared constants / helpers
;;; ──────────────────────────────────────────────────────────────────

(def ^:private open-map
  "A free-form JSON object as the LLM writes it. Deliberately open so the closed-schemas linter and
  runtime instrumentation don't reject arbitrary request bodies / query params."
  [:map {:closed false ::mr/deliberately-open true}])

(def ^:private http-verbs
  "The HTTP methods call_api accepts — the single source for the arg-schema enum and the endpoint filter."
  ["GET" "POST" "PUT" "DELETE" "PATCH"])
(def ^:private method-enum (into [:enum] http-verbs))
(def ^:private http-methods (set http-verbs))

(def ^:private default-timeout-seconds 60)
(def ^:private max-timeout-seconds 300)

(def ^:private max-body-bytes
  "Bound on how many response-body bytes call_api realizes. Well above the LLM-facing output cap (so the
  usual truncation still decides what is shown) but keeps a huge export from being buffered in full."
  (* 4 te/default-max-output-chars))

;;; ──────────────────────────────────────────────────────────────────
;;; Memoized production handler + OpenAPI spec (routes resolved lazily)
;;; ──────────────────────────────────────────────────────────────────

#_{:clj-kondo/ignore [:metabase/modules]}
(def ^:private api-handler
  "The real production Ring handler (full middleware onion), built once. This is the exact
  composition `metabase.core.core` builds for the running server, so JSON body/param parsing,
  current-user binding, exception→API-error conversion and streamed-JSON serialization all apply."
  (delay (server/make-handler
          (server/make-routes (requiring-resolve 'metabase.api-routes.core/routes)))))

#_{:clj-kondo/ignore [:metabase/modules]}
(def ^:private full-spec
  "The complete OpenAPI object (same generator that serves `/api/docs/openapi.json`), built once."
  (delay (api/root-open-api-object (requiring-resolve 'metabase.api-routes.core/routes))))

(defn- first-line [s]
  (-> (str s) (str/split #"\n" 2) first str/trim (te/ellipsize 140)))

(def ^:private endpoint-index
  "A compact, sorted index of every endpoint: `[{:method \"GET\" :path \"/api/…\" :description \"…\"} …]`."
  (delay
    (->> (for [[path ops] (:paths @full-spec)
               [m op]     ops
               :let       [method (u/upper-case-en (name m))]
               :when      (contains? http-methods method)]
           {:method      method
            :path        path
            :description (first-line (:description op))})
         (sort-by (juxt :path :method))
         vec)))

(def ^:private spec-schemas
  "The flat `components/schemas` map, keyed by string schema name (for `$ref` resolution)."
  (delay (into {} (map (fn [[k v]] [(name k) v])) (get-in @full-spec [:components :schemas]))))

;;; ──────────────────────────────────────────────────────────────────
;;; call_api
;;; ──────────────────────────────────────────────────────────────────

(defn- current-auth-context
  "Auth keys for the in-process request, read from the already-bound current-user dynamic vars (the
  same ones the megabot query tools rely on). `enforce-authentication` reads `:metabase-user-id` off
  the request; `do-with-current-user` derives `*current-user*`/permissions from the id but needs the
  superuser/group-manager flags passed explicitly (they default to false otherwise)."
  []
  {:metabase-user-id  api/*current-user-id*
   :is-superuser?     api/*is-superuser?*
   :is-group-manager? api/*is-group-manager?*
   :user-locale       i18n/*user-locale*})

(defn- split-path
  "Normalize an API path to `[uri inline-query-string]`. Strips any scheme/host, ensures a leading
  slash and the `/api` prefix, and separates an inline `?query`."
  [path]
  (let [p        (-> (str path) str/trim (str/replace #"^https?://[^/]+" ""))
        p        (if (str/starts-with? p "/") p (str "/" p))
        [uri qs] (str/split p #"\?" 2)
        uri      (if (or (= uri "/api") (str/starts-with? uri "/api/")) uri (str "/api" uri))]
    [uri qs]))

(defn- build-request [method path query-params body]
  (let [[uri inline-qs] (split-path path)
        ;; a map form-encodes as `k=v` pairs, repeating the key for sequential values
        qs              (when-let [parts (seq (remove str/blank? [inline-qs (codec/form-encode query-params)]))]
                          (str/join "&" parts))]
    (merge (current-auth-context)
           {:request-method method
            :uri            uri
            :query-string   qs
            :remote-addr    "127.0.0.1"
            :headers        {"content-type" "application/json"}
            :body           (ByteArrayInputStream. (.getBytes ^String (json/encode (or body {})) "UTF-8"))})))

(defn- invoke*
  "Call the async 3-arity handler synchronously, returning the Ring response map."
  [request]
  (let [p (promise)]
    (@api-handler request (fn [resp] (deliver p resp)) (fn [e] (deliver p e)))
    (let [r @p]
      (if (instance? Throwable r) (throw r) r))))

(defn- bounded-output-stream
  "An `OutputStream` that buffers at most `cap` bytes. Writes past the cap are silently discarded (it
  never throws — the QP would turn a throw into a 500 error response) and `on-cap` is called once, on
  the first overflow. Returns `{:os <OutputStream> :read-bytes (fn []) :capped? (fn [])}`."
  [cap on-cap]
  (let [cap          (long cap)
        baos         (ByteArrayOutputStream.)
        capped?      (AtomicBoolean. false)
        overflow!    (fn [] (when (.compareAndSet capped? false true) (on-cap)))
        write-bytes! (fn [^bytes b off len]
                       (let [len (long len)
                             n   (-> (- cap (.size baos)) (max 0) (min len))]
                         (when (pos? n) (.write baos b (int off) (int n)))
                         (when (< n len) (overflow!))))
        os           (proxy [OutputStream] []
                       (write
                         ([x]
                          (if (bytes? x)
                            (write-bytes! x 0 (alength ^bytes x))
                            (if (< (.size baos) cap) (.write baos (int x)) (overflow!))))
                         ([b off len]
                          (write-bytes! b off len))))]
    {:os         os
     :read-bytes #(.toByteArray baos)
     :capped?    #(.get capped?)}))

(defn- realize-streaming-response
  "Realize a `StreamingResponse` body to a string (or bytes for binary), capturing a late-set HTTP
  status (query endpoints call `write-error!` → 403 after `respond` has already returned).

  At most `max-body-bytes` are buffered: on overflow `::cap-exceeded` is put on `canceled-chan`, which
  cancels a running QP query (it is bound as `qp.pipeline/*canceled-chan*`). The producer then reports
  the cancellation via `write-error!` → `setStatus 500`, so status changes are ignored once capped."
  [^StreamingResponse sr content-type canceled-chan]
  (let [{:keys [os read-bytes capped?]} (bounded-output-stream max-body-bytes #(a/>!! canceled-chan ::cap-exceeded))
        f             (.f sr)
        status-atom   (atom nil)
        mock-response (reify HttpServletResponse
                        (isCommitted [_] false)
                        (setStatus [_ status] (when-not (capped?) (reset! status-atom status)))
                        (setContentType [_ _])
                        (setHeader [_ _ _]))]
    (binding [streaming-response/*response* mock-response]
      (f os canceled-chan))
    {:body       (let [^bytes ba (read-bytes)]
                   (if (and content-type (re-find #"json|text" content-type))
                     (String. ba "UTF-8")
                     ba))
     :status     @status-atom
     :truncated? (capped?)}))

(defn- coerce-body
  "Turn the raw Ring `:body` (InputStream / byte[] / StreamingResponse / other) into a realized
  value, mirroring the test HTTP client's coercion. Reads at most `max-body-bytes`; assocs
  `::truncated?` when the body was cut short."
  [response canceled-chan]
  (let [body (:body response)
        ct   (get-in response [:headers "Content-Type"])]
    (cond
      (instance? InputStream body)
      (with-open [^InputStream is body]
        (let [ba (.readNBytes is (int max-body-bytes))]
          (assoc response
                 :body        (String. ba "UTF-8")
                 ::truncated? (not= -1 (.read is)))))

      (bytes? body)
      (let [^bytes b body
            n        (min (alength b) (long max-body-bytes))]
        (assoc response
               :body        (String. b 0 (int n) "UTF-8")
               ::truncated? (> (alength b) n)))

      (instance? StreamingResponse body)
      (let [{:keys [body status truncated?]} (realize-streaming-response body ct canceled-chan)]
        (cond-> (assoc response :body body ::truncated? truncated?)
          status (assoc :status status)))

      :else response)))

(defn- run-request
  "Dispatch `req` and realize its body, returning the coerced response, or `::timeout` if both together
  take longer than `timeout-ms`. Runs in a `future` so a server-set thread-interrupt flag can't leak into
  the agent thread. On timeout, `::timeout` goes on the canceled-chan (cancelling a streaming QP query)
  and the future is cancelled (interrupting a blocked synchronous endpoint)."
  [req timeout-ms]
  (let [cc  (a/promise-chan)
        fut (future (coerce-body (invoke* req) cc))]
    (try
      (deref fut timeout-ms ::timeout)
      (catch ExecutionException e
        (throw (or (.getCause e) e)))
      (finally
        (when-not (realized? fut)
          (a/>!! cc ::timeout)
          (future-cancel fut))))))

(def ^:private entity-path-re
  "API paths of the content megabot links to: `/api/<entity>[/<id>][/<sub-resource>]`."
  #"^/api/(card|dashboard|collection|document)(?:/(\d+))?(/.*)?$")

(def ^:private entity-models
  {"card"       :model/Card
   "dashboard"  :model/Dashboard
   "collection" :model/Collection
   "document"   :model/Document})

(def ^:private read-post-re
  "POSTs that only read: running or exporting a query (`/api/dataset…`, `…/query…`), a dashboard PDF, parameter and
  action-form values, and dry runs — checks, validations, previews, and tests."
  (re-pattern (str "^/api/dataset|/query(?:/|$)|/pdf$|/(?:execute/|breakout-)values$|/parameter/(?:values|search|remapping)"
                   "|/move-dashboard-question-candidates$|/(?:check|validate|preview|test)(?:[-_/]|$)")))

(defn- read-call?
  "Whether a call only reads: every GET, plus the POSTs matched by [[read-post-re]]."
  [m uri]
  (or (= m :get)
      (and (= m :post) (boolean (re-find read-post-re uri)))))

(defn- write-target
  "The card, dashboard, collection, or document a write addresses, or nil. Its current name (and card type) is read
  before the call: a DELETE leaves nothing to read afterwards, and a failed write should still name what it touched.
  A write further down than a direct sub-resource (running a dashcard action) doesn't address the entity itself, so
  it is not named."
  [uri]
  (when-let [[_ entity id-str sub] (re-matches entity-path-re uri)]
    (let [path-id (some-> id-str parse-long)]
      {:entity  entity
       :path-id path-id
       :sub     sub
       :before  (when (and path-id (or (nil? sub) (re-matches #"/[^/]+" sub)))
                  (try
                    (metabot.db/entity-summary (entity-models entity) path-id)
                    (catch Exception _ nil)))})))

(defn- entity-link-type
  "The `metabase://` link type of an entity; a card links by its type."
  [entity card-type]
  (if (= entity "card")
    (if (#{"model" "metric"} card-type) card-type "question")
    entity))

(defn- response-json
  "The response body as a JSON object, or nil when it isn't one or was cut short."
  [^String body-str capped?]
  (when (and (not capped?) (str/starts-with? (str/triml body-str) "{"))
    (try
      (json/decode+kw body-str)
      (catch Exception _ nil))))

(defn- entity-change
  "What a successful write did to its target: `{:verb :link-type :id :name}`, or nil when it didn't create or change
  one. A POST that returns a new id created something (`POST /api/card`, `POST /api/card/:id/copy`); any other write
  to `/api/<entity>/<id>` or a direct sub-resource of it changed that entity — `PUT /api/dashboard/:id/cards` or
  `DELETE /api/dashboard/:id/public_link` updates the dashboard rather than deleting it. A write further down
  (`POST /api/dashboard/:id/dashcard/:dashcard-id/execute` runs an action) isn't a change to the entity."
  [m {:keys [entity path-id sub before]} request-body response]
  (let [new-id   (let [id (:id response)] (when (and (pos-int? id) (not= id path-id)) id))
        archived (some-> (or (find request-body :archived) (find request-body "archived")) val)
        verb     (cond
                   (and (= m :post) new-id (or (nil? path-id) sub)) :created
                   (nil? path-id)                                   nil
                   (and sub (not (re-matches #"/[^/]+" sub)))       nil
                   sub                                              :updated
                   (= m :delete)                                    :deleted
                   (true? archived)                                 :trashed
                   (false? archived)                                :restored
                   :else                                            :updated)
        ;; whether the response body is the entity itself, rather than a sub-resource of it
        own?     (or (= verb :created) (nil? sub))
        from     (fn [k] (or (when own? (get response k))
                             (when-not (= verb :created) (get before k))))]
    (when verb
      {:verb      verb
       :link-type (entity-link-type entity (some-> (from :type) name))
       :id        (if (= verb :created) new-id path-id)
       :name      (from :name)})))

(defn entity-change-line
  "The model-facing summary of an entity change, with the link to share. Shared with megabot's `save_result`, so every
  megabot write reports its changes in the same format."
  [{:keys [verb link-type id] entity-name :name}]
  (let [label (str link-type " " id (when-not (str/blank? entity-name) (str " \"" entity-name "\"")))
        link  (str " Link it as " (te/link (if (str/blank? entity-name) label entity-name)
                                           "metabase://" link-type "/" id) ".")]
    (case verb
      :created  (str "Created " label "." link)
      :updated  (str "Updated " label "." link)
      :trashed  (str "Moved " label " to the trash." link)
      :restored (str "Restored " label "." link)
      :deleted  (str "Deleted " label "."))))

(defn- display-name [entity-name]
  (if (str/blank? entity-name) (tru "Untitled") entity-name))

(defn- entity-link [{:keys [link-type id] entity-name :name}]
  (te/link (display-name entity-name) "metabase://" link-type "/" id))

(defn- entity-change-title
  "The user-facing step label for an entity change. The link renders with the entity's icon, so the type isn't
  spelled out; a deleted entity has nothing to link to."
  [{:keys [verb] :as change}]
  (case verb
    :created  (tru "Created {0}" (entity-link change))
    :updated  (tru "Updated {0}" (entity-link change))
    :trashed  (tru "Moved {0} to trash" (entity-link change))
    :restored (tru "Restored {0}" (entity-link change))
    :deleted  (tru "Deleted {0}" (display-name (:name change)))))

(defn- failure-title
  "The user-facing step label for a write that failed, naming the existing entity it addressed when there is one."
  [{:keys [entity path-id before]} summary]
  (cond
    before                     (tru "Couldn''t change {0}"
                                    (entity-link {:link-type (entity-link-type entity (some-> (:type before) name))
                                                  :id        path-id
                                                  :name      (:name before)}))
    (not (str/blank? summary)) (tru "Failed: {0}" summary)
    :else                      (tru "A change failed")))

(defn- success-title
  "The user-facing step label for a write that isn't to a card, dashboard, collection, or document."
  [summary]
  (if (str/blank? summary) (tru "Made a change") summary))

(defn- with-title [result title]
  (cond-> result
    title (assoc :data-parts [(streaming/tool-title-part title)])))

(mu/defn ^{:tool-name "call_api"}
  call-api-tool
  "Call the Metabase REST API as the current user and read the response. This is the general way to
  do anything the product can do — build dashboards, run actions, trigger sync, create alerts, manage
  collections, and so on. `method` is GET/POST/PUT/DELETE/PATCH. `path` is an internal API path such as
  \"/api/collection\" or just \"/collection\" (the /api prefix is added if missing). `query_params` is an
  optional map of query-string parameters — use `limit`/`offset` on list endpoints to keep responses
  small. `body` is an optional JSON object for writes. `timeout_seconds` optionally bounds how long to
  wait for the response (default 60, max 300). `summary` labels a write for the user: a few words, past
  tense, in the user's language, e.g. \"Turned on nightly sync for Sample Database\". Writes to cards,
  dashboards, collections, and documents are labeled automatically, and their response starts with a
  line giving the metabase:// link to share. Permissions are enforced exactly as for a normal request:
  a forbidden call comes back as the API's own 401/403. Discover paths and shapes first with
  list_api_endpoints and describe_api_endpoint. For reading rows of query results, prefer
  run_warehouse_sql / run_warehouse_query; to save a result you rendered, use save_result."
  [{:keys [method path query_params body timeout_seconds summary]}
   :- [:map {:closed true}
       [:method          method-enum]
       [:path            :string]
       [:query_params    {:optional true} open-map]
       [:body            {:optional true} open-map]
       [:timeout_seconds {:optional true} :int]
       [:summary         {:optional true} :string]]]
  (let [m      (keyword (u/lower-case-en method))
        [uri]  (split-path path)
        write? (not (read-call? m uri))
        target (when write? (write-target uri))]
    (cond
      (and (not= m :get) (metabot.settings/megabot-api-read-only?))
      (cond-> {:output "Refused: call_api is in read-only mode on this instance — only GET is allowed."}
        write? (with-title (failure-title target summary)))

      :else
      (try
        (let [timeout-s (-> (or timeout_seconds default-timeout-seconds) (max 1) (min max-timeout-seconds))
              req       (build-request m path query_params body)
              resp      (run-request req (* 1000 timeout-s))]
          (if (= ::timeout resp)
            (cond-> {:output            (format (str "call_api timed out after %ds — the endpoint is slow; narrow the request "
                                                     "(limit/offset, filters), pass a larger timeout_seconds (max %d), "
                                                     "or use run_warehouse_sql for query rows.")
                                                timeout-s max-timeout-seconds)
                     :structured-output {:status nil :timed-out true :method method :path (:uri req)}}
              write? (with-title (tru "A change timed out")))
            (let [status     (:status resp)
                  b          (:body resp)
                  capped?    (boolean (::truncated? resp))
                  body-str   (cond
                               (string? b) b
                               (nil? b)    ""
                               (bytes? b)  (if capped?
                                             (str "[binary response, >" (count b) " bytes (truncated)]")
                                             (str "[binary response, " (count b) " bytes]"))
                               :else       (json/encode b))
                  truncated? (or capped? (> (count body-str) te/default-max-output-chars))
                  shown      (u.str/limit-chars body-str te/default-max-output-chars)
                  ok?        (and (int? status) (<= 200 status 299))
                  change     (when (and write? ok? target)
                               (entity-change m target body (response-json body-str capped?)))]
              (with-title
                {:output            (te/lines
                                     (str "HTTP " status)
                                     (some-> change entity-change-line)
                                     shown
                                     (when truncated?
                                       "…[body truncated] — narrow the result with query_params like limit/offset."))
                 :structured-output (cond-> {:status status :method method :path (:uri req)}
                                      change (assoc :entity (select-keys change [:verb :link-type :id :name])))}
                (when write?
                  (cond
                    (not ok?) (failure-title target summary)
                    change    (entity-change-title change)
                    :else     (success-title summary)))))))
        (catch Exception e
          (cond-> {:output (str "API call error: " (ex-message e))}
            write? (with-title (failure-title target summary))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list_api_endpoints
;;; ──────────────────────────────────────────────────────────────────

(def ^:private default-page-size 40)
(def ^:private max-page-size 100)

(mu/defn ^{:tool-name "list_api_endpoints"}
  list-api-endpoints-tool
  "List Metabase REST API endpoints so you can discover what call_api can do. Each result is one line:
  METHOD, path, and a one-line description. `search` filters case-insensitively by substring against
  the method+path+description. `method` narrows to one verb. Results are paged: `page` (1-based,
  default 1) and `page_size` (default 40, max 100); the header line states the total match count and
  the current page so you know whether to request the next page or refine `search`."
  [{:keys [search method page page_size]}
   :- [:map {:closed true}
       [:search    {:optional true} :string]
       [:method    {:optional true} method-enum]
       [:page      {:optional true} :int]
       [:page_size {:optional true} :int]]]
  (try
    (let [matches (cond->> @endpoint-index
                    (not (str/blank? method))
                    (filter #(= (:method %) (u/upper-case-en method)))

                    (not (str/blank? search))
                    (filter (let [q (u/lower-case-en search)]
                              (fn [{:keys [method path description]}]
                                (str/includes?
                                 (u/lower-case-en (str method " " path " " description))
                                 q)))))
          matches (vec matches)
          total   (count matches)
          ps      (-> (or page_size default-page-size) (max 1) (min max-page-size))
          pages   (max 1 (long (Math/ceil (/ (double total) ps))))
          pg      (-> (or page 1) (max 1) (min pages))
          start   (* (dec pg) ps)
          end     (min (+ start ps) total)
          shown   (subvec matches (min start total) end)]
      {:output (te/truncate-output
                (te/lines
                 (format "Matched %d endpoint(s). Page %d/%d, showing %d-%d.%s"
                         total pg pages (if (zero? total) 0 (inc start)) end
                         (if (< pg pages)
                           " Request the next `page`, or refine with `search`."
                           ""))
                 ""
                 (map (fn [{:keys [method path description]}]
                        (format "%-6s %s%s" method path
                                (if (str/blank? description) "" (str "  —  " description))))
                      shown)))})
    (catch Exception e
      {:output (str "Error listing endpoints: " (ex-message e))})))

;;; ──────────────────────────────────────────────────────────────────
;;; describe_api_endpoint
;;; ──────────────────────────────────────────────────────────────────

(def ^:private max-described-schemas
  "Bound on how many referenced component schemas describe_api_endpoint will inline."
  60)

(defn- refs-in-json
  "All schema names referenced via `#/components/schemas/<name>` inside a JSON string."
  [^String s]
  (set (map second (re-seq #"#/components/schemas/([^\"]+)" s))))

(defn- resolve-schemas
  "Transitively collect the component schemas reachable from `seed-refs`, bounded by `max-count`."
  [schemas seed-refs max-count]
  (loop [pending (vec seed-refs)
         seen    #{}
         acc     {}]
    (if (or (empty? pending) (>= (count acc) max-count))
      acc
      (let [nm           (first pending)
            rest-pending (subvec pending 1)]
        (if (or (contains? seen nm) (not (contains? schemas nm)))
          (recur rest-pending (conj seen nm) acc)
          (let [schema     (get schemas nm)
                child-refs (refs-in-json (json/encode schema))]
            (recur (into rest-pending (remove seen child-refs))
                   (conj seen nm)
                   (assoc acc nm schema))))))))

(mu/defn ^{:tool-name "describe_api_endpoint"}
  describe-api-endpoint-tool
  "Show the request and response shape of an API endpoint so you can build a correct call_api call.
  `path` is the endpoint path in its templated form as listed by list_api_endpoints, e.g.
  \"/api/collection/{id}\" (\"/api/collection/:id\" is also accepted). `method` optionally narrows to
  one verb; otherwise every verb on the path is shown. Returns the parameters, request body, and
  responses for each operation, plus the referenced component schemas inlined."
  [{:keys [path method]}
   :- [:map {:closed true}
       [:path   :string]
       [:method {:optional true} method-enum]]]
  (try
    (let [paths      (:paths @full-spec)
          [uri _]    (split-path path)
          templated  (str/replace uri #"/:([^/]+)" "/{$1}")
          ops        (or (get paths templated) (get paths uri))]
      (if-not ops
        {:output (te/lines
                  (str "No endpoint found for path " templated ".")
                  "Use list_api_endpoints (with a search term) to find the exact path.")}
        (let [selected (if (str/blank? method)
                         ops
                         (select-keys ops [(keyword (u/lower-case-en method))]))]
          (if (empty? selected)
            {:output (str "No " method " operation at " templated ". Available: "
                          (str/join ", " (sort (map (comp u/upper-case-en name) (keys ops)))))}
            (let [named    (into {} (map (fn [[m op]] [(u/upper-case-en (name m)) op])) selected)
                  ops-json (json/encode named)
                  used     (resolve-schemas @spec-schemas (refs-in-json ops-json) max-described-schemas)]
              {:output (te/truncate-output
                        (te/lines
                         (str "Endpoint: " templated)
                         ""
                         "Operation(s):"
                         ops-json
                         ""
                         (when (seq used) "Referenced schemas:")
                         (when (seq used) (json/encode used))))})))))
    (catch Exception e
      {:output (str "Error describing endpoint: " (ex-message e))})))
