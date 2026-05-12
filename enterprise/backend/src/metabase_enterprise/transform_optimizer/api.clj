(ns metabase-enterprise.transform-optimizer.api
  "HTTP endpoints for the Transform Optimizer.

  Mounted under `/api/ee/transform-optimizer` by the EE route map. All
  three endpoints (optimize / verify / accept / indexes / drop) are plain
  request/response — no SSE in this branch. We may revisit streaming once
  we have incremental JSON parsing of the LLM tool call, but until then
  the response is buffered server-side anyway and the wire complexity
  isn't paying for itself."
  (:require
   [metabase-enterprise.transform-optimizer.accept :as opt.accept]
   [metabase-enterprise.transform-optimizer.core :as opt.core]
   [metabase-enterprise.transform-optimizer.indexes :as opt.indexes]
   [metabase-enterprise.transform-optimizer.proposal-cache :as opt.cache]
   [metabase-enterprise.transform-optimizer.verify :as opt.verify]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Optimize

(api.macros/defendpoint :post "/:id/optimize"
  "Run the optimizer for `transform-id` and return the full result in one
  JSON payload:

    {:transform           {id, name, source_database_id, target}
     :sql                 <compiled source SQL>
     :summary             <one-paragraph diagnosis>
     :proposals           [{id, name, kind, severity, body | ddl_statement, …}]
     :optimization_degree <0..100>}

  Proposals are cached server-side keyed by (user, transform, proposal id)
  so the verify/accept endpoints can look them up by id alone."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:maybe [:map [:analyze {:optional true} [:maybe :boolean]]]]]
  (let [transform (api/read-check :model/Transform id)
        analyze?  (boolean (:analyze body))]
    (try
      (let [result (opt.core/optimize! (:id transform) :analyze? analyze?)]
        ;; Stash each proposal in the per-user cache so verify/accept can
        ;; resolve a `proposal_id` back to its full payload.
        (opt.cache/put-all! api/*current-user-id* (:id transform) (:proposals result))
        result)
      (catch Exception e
        (log/errorf e "optimize failed (transform-id=%d)" (:id transform))
        (let [data (ex-data e)]
          {:status (or (:status-code data) 502)
           :body   {:error     "optimize_failed"
                    :message   (or (ex-message e) "unknown error")
                    :retryable (boolean (:retryable data))}})))))

;; ---------------------------------------------------------------------------
;; Verify endpoint

(api.macros/defendpoint :post "/:id/proposal/verify"
  "Verify equivalence of the original transform vs the proposal. Materialises
  both into scratch tables and compares via `EXCEPT ALL` in both directions.
  See SUMMARY.md for the response shape.

  Single-transform proposals only — precompute (DAG) verification is
  deferred until DAG accept is in place.

  The proposal payload is resolved server-side from the proposal cache
  populated by `/optimize`, so the FE only sends the `proposal_id`."
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
  populated by `/optimize`. If any id is missing, the whole request is
  rejected (404) — partial accept is too easy to mis-handle on the FE.

  The response includes `ddl_statements` with per-statement execution
  status (`:executed | :failed | :skipped | :pending`) plus the original
  validation tag. Failed DDL does NOT roll back successfully-created
  transforms — `CREATE INDEX IF NOT EXISTS` is idempotent, so the user
  can re-run accept after fixing whatever the problem was."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:proposal_ids  [:sequential :string]]
            [:mode          {:optional true} [:maybe [:enum "new" "replace"]]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (let [transform                  (api/read-check :model/Transform id)
        [proposals missing]        (opt.cache/get-many api/*current-user-id*
                                                       (:id transform)
                                                       (:proposal_ids body))
        mode                       (keyword (or (:mode body) "new"))]
    (cond
      (seq missing)
      {:status 404
       :body   {:error              "proposal_not_found"
                :detail             (str "These proposal ids are not in the optimizer cache "
                                         "(expired or never seen); re-run /optimize.")
                :missing_proposal_ids missing}}

      :else
      (try
        (opt.accept/accept! transform proposals (:collection_id body) mode)
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (if-let [code (:status-code data)]
              {:status code
               :body   (-> data
                           (dissoc :status-code)
                           (assoc :detail (ex-message e)))}
              (throw e))))))))

;; ---------------------------------------------------------------------------
;; Index management on a transform's target + source tables

(api.macros/defendpoint :get "/:id/indexes"
  "List every index on the transform's target table *and* every source
  table it reads from. Each row carries `:schema`/`:table` so the FE can
  group, plus `:is_target_table` for visual separation and
  `:managed_by_optimizer` indicating whether the optimizer registered
  the index for post-run replay (target-table-only)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [transform (api/read-check :model/Transform id)]
    {:transform {:id (:id transform) :target (:target transform)}
     :indexes   (opt.indexes/list-indexes transform)}))

(api.macros/defendpoint :post "/:id/index/drop"
  "Drop the named index from any of the transform's referenced tables
  (target or source). Validates that the index actually exists on one of
  those tables — we won't drop random indices elsewhere on the DB. When
  the dropped index was on the target *and* the optimizer was replaying
  it via `target.post_run_ddl`, the persisted entry is also removed so
  the next transform run doesn't recreate it."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map [:index_name ms/NonBlankString]]]
  (let [transform (api/read-check :model/Transform id)
        result    (opt.indexes/drop-index! transform (:index_name body))]
    (case (:status result)
      :dropped result
      :failed  {:status 502 :body (assoc result :error "drop_failed")}
      :skipped {:status (case (:reason result)
                          :index-not-on-referenced-table 404
                          :unsafe-name                   400
                          :no-database                   404
                          :not-postgres                  422
                          400)
                :body (assoc result :error "drop_skipped")})))

;; ---------------------------------------------------------------------------
;; Route bundle

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-optimizer` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
