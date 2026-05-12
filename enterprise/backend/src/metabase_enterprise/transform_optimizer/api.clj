(ns metabase-enterprise.transform-optimizer.api
  "HTTP endpoints for the Transform Optimizer.

  Mounted under `/api/ee/transform-optimizer` by the EE route map. The
  primary endpoint is the streaming SSE one (`POST /:id/optimize`). Verify
  and accept are simple request/response endpoints — see SUMMARY.md for the
  wire contract.

  Today the optimizer is buffered server-side: we call Claude, wait for the
  full structured response, then re-emit it as a sequence of SSE events.
  The FE contract is preserved (events arrive in the documented order) so
  we can upgrade to incremental LLM streaming later without touching the
  client."
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.transform-optimizer.accept :as opt.accept]
   [metabase-enterprise.transform-optimizer.core :as opt.core]
   [metabase-enterprise.transform-optimizer.indexes :as opt.indexes]
   [metabase-enterprise.transform-optimizer.proposal-cache :as opt.cache]
   [metabase-enterprise.transform-optimizer.verify :as opt.verify]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.server.streaming-response :as sr]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io OutputStream)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; SSE helpers
;;
;; Server-Sent Events frames are:
;;
;;   event: <name>
;;   data: <single line of JSON>
;;
;;   (blank line terminates the frame)
;;
;; The blank line is critical — without it the EventSource on the FE never
;; dispatches the event. We always JSON-encode data (no multi-line payloads).

(defn- write-sse!
  "Write one SSE frame to `os` and flush. Returns `false` if the client is
  gone (EofException) so the caller can stop the stream cleanly."
  [^OutputStream os event-name data]
  (try
    (let [bytes (.getBytes (str "event: " event-name "\n"
                                "data: "  (json/encode data) "\n\n")
                           "UTF-8")]
      (.write os bytes)
      (.flush os)
      true)
    (catch org.eclipse.jetty.io.EofException _
      false)))

(defn- canceled? [canceled-chan]
  (and canceled-chan (a/poll! canceled-chan)))

;; ---------------------------------------------------------------------------
;; Streaming endpoint

(api.macros/defendpoint :post "/:id/optimize"
  "Stream optimization proposals for the given transform as SSE events.

  Emits, in order:
    event: summary    — `{text}`
    event: proposal   — one per proposal, in `depends_on` topological order
    event: done       — `{optimization_degree}`

  On failure: a single `event: error` frame then closes the stream."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:maybe [:map [:analyze {:optional true} [:maybe :boolean]]]]]
  (let [transform (api/read-check :model/Transform id)
        analyze?  (boolean (:analyze body))]
    (sr/streaming-response {:content-type "text/event-stream; charset=UTF-8"
                            :headers      {"Cache-Control" "no-cache"
                                           "X-Accel-Buffering" "no"}}
                           [^OutputStream os canceled-chan]
      (try
        (let [result (opt.core/optimize! (:id transform) :analyze? analyze?)]
          ;; Cache every proposal under (user, transform, proposal-id) so
          ;; verify/accept can look them up by id alone (FE never re-sends
          ;; the body). The cache is short-lived (1 h) and per-user.
          (opt.cache/put-all! api/*current-user-id* (:id transform) (:proposals result))

          (when-not (canceled? canceled-chan)
            (write-sse! os "summary" {:text (or (:summary result) "")}))

          (loop [[p & more] (:proposals result)]
            (cond
              (canceled? canceled-chan) :canceled
              (nil? p)                  :done
              :else (do (write-sse! os "proposal" p)
                        (recur more))))

          (when-not (canceled? canceled-chan)
            (write-sse! os "done" {:optimization_degree (:optimization_degree result)})))
        (catch Exception e
          (log/errorf e "optimize streaming failed (transform-id=%d)" (:id transform))
          (write-sse! os "error"
                      {:message   (or (ex-message e) "unknown error")
                       :retryable (boolean (-> e ex-data :retryable))}))))))

;; ---------------------------------------------------------------------------
;; Verify endpoint

(api.macros/defendpoint :post "/:id/proposal/verify"
  "Verify equivalence of the original transform vs the proposal. Materialises
  both into scratch tables and compares via `EXCEPT ALL` in both directions.
  See SUMMARY.md for the response shape.

  Single-transform proposals only — precompute (DAG) verification is
  deferred until DAG accept is in place.

  The proposal payload is resolved server-side from the proposal cache
  populated by the streaming `/optimize` endpoint, so the FE only sends
  the `proposal_id`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map [:proposal_id :string]]]
  (let [transform (api/read-check :model/Transform id)
        pid       (:proposal_id body)
        proposal  (opt.cache/get-one api/*current-user-id* (:id transform) pid)]
    (cond
      (nil? proposal)
      {:status 404
       :body   {:error  "proposal_not_found"
                :detail (str "Proposal " (pr-str pid)
                             " is not in the optimizer cache (it may have expired or this is a different "
                             "process). Re-run /optimize to repopulate it.")}}

      :else
      (try
        (opt.verify/verify transform proposal)
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (if-let [code (:status-code data)]
              {:status code
               :body   (-> data
                           (dissoc :status-code)
                           (assoc :error (or (:error data) "verify_failed")
                                  :detail (ex-message e)))}
              (throw e))))))))

;; ---------------------------------------------------------------------------
;; Accept endpoint

(api.macros/defendpoint :post "/:id/proposal/accept"
  "Apply the proposal set: create new transforms for proposals that
  carry a body, *and* run every validated `CREATE INDEX` statement
  attached to those proposals against the source database. Single
  rewrites pass an array of one id; precompute DAGs pass N ids in
  dependency order (caller's responsibility — we create them in the
  order given).

  Each proposal payload is resolved server-side from the proposal cache
  populated by the streaming `/optimize` endpoint. If any id is missing,
  the whole request is rejected (404) — partial accept is too easy to
  mis-handle on the FE.

  The response includes `ddl_statements` with per-statement execution
  status (`:executed | :failed | :skipped`) plus the original
  validation tag. Failed DDL does NOT roll back successfully-created
  transforms — `CREATE INDEX IF NOT EXISTS` is idempotent, so the user
  can re-run accept after fixing whatever the problem was."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:proposal_ids  [:sequential :string]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (let [transform                  (api/read-check :model/Transform id)
        [proposals missing]        (opt.cache/get-many api/*current-user-id*
                                                       (:id transform)
                                                       (:proposal_ids body))]
    (if (seq missing)
      {:status 404
       :body   {:error              "proposal_not_found"
                :detail             (str "These proposal ids are not in the optimizer cache "
                                         "(expired or never seen); re-run /optimize.")
                :missing_proposal_ids missing}}
      (opt.accept/accept! transform proposals (:collection_id body)))))

;; ---------------------------------------------------------------------------
;; Index management on a transform's target table

(api.macros/defendpoint :get "/:id/indexes"
  "List every index on the transform's target table. Each entry carries
  the index name, definition (raw `pg_get_indexdef`), key + INCLUDE
  columns, access method, partial predicate, and a
  `managed_by_optimizer` flag indicating whether the optimizer registered
  the index for post-run replay."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [transform (api/read-check :model/Transform id)]
    {:transform {:id (:id transform) :target (:target transform)}
     :indexes   (opt.indexes/list-indexes transform)}))

(api.macros/defendpoint :post "/:id/index/drop"
  "Drop the named index from the transform's target table. Validates
  that the index actually exists on that table — we don't drop random
  indices on the source DB. If the optimizer was managing this index
  (i.e. it appears in `target.post_run_ddl`), the persisted entry is
  also removed so the next transform run doesn't recreate it."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map [:index_name ms/NonBlankString]]]
  (let [transform (api/read-check :model/Transform id)
        result    (opt.indexes/drop-index! transform (:index_name body))]
    (case (:status result)
      :dropped result
      :failed  {:status 502 :body (assoc result :error "drop_failed")}
      :skipped {:status (case (:reason result)
                          :index-not-on-target 404
                          :unsafe-name         400
                          :no-database         404
                          :not-postgres        422
                          400)
                :body (assoc result :error "drop_skipped")})))

;; ---------------------------------------------------------------------------
;; Route bundle

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-optimizer` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
