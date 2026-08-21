#_{:clj-kondo/ignore [:metabase/namespace-name]}
(ns metabase.query-processor
  "Primary entrypoints to running Metabase (MBQL) queries.

    (metabase.query-processor/process-query {:type :query, :database 1, :query {:source-table 2}})

  Various REST API endpoints, such as `POST /api/dataset`, return the results of queries; they usually
  use [[userland-query]] or [[userland-query-with-default-constraints]] (see below)."
  (:refer-clojure :exclude [select-keys])
  (:require
   [medley.core :as m]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.debug :as qp.debug]
   [metabase.query-processor.execute :as qp.execute]
   [metabase.query-processor.middleware.catch-exceptions :as qp.catch-exceptions]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.query-processor.middleware.process-userland-query :as qp.process-userland-query]
   [metabase.query-processor.postprocess :as qp.postprocess]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [select-keys]]))

(def around-middleware
  "Middleware that goes AROUND [[process-query]]. Does extra stuff like handling `:internal` Audit v1 queries or saving
  QueryExecutions (userland queries only)

    (f qp) -> qp

  Where `qp` has the form

    (f query rff)"
  ;; think of the direction stuff happens in as if you were throwing a ball up in the air; as the query-ball goes up the
  ;; around middleware pre-processing stuff happens; then the query is executed, as the "ball of results" comes back
  ;; down any post-processing these around middlewares might do happens in reversed order.
  ;;
  ;; ↓↓↓ POST-PROCESSING ↓↓↓ happens from TOP TO BOTTOM
  [#'qp.middleware.enterprise/handle-audit-app-internal-queries-middleware
   #'qp.process-userland-query/process-userland-query-middleware
   ;; userland queries only: catch Exceptions and return a special error response
   #'qp.catch-exceptions/catch-exceptions])
;; ↑↑↑ PRE-PROCESSING ↑↑↑ happens from BOTTOM TO TOP

(defn- process-query** [query rff]
  (qp.debug/debug> (list `process-query query))
  (let [preprocessed (qp.preprocess/preprocess query)
        compiled     (qp.compile/attach-compiled-query preprocessed)
        rff          (qp.postprocess/post-processing-rff preprocessed rff)]
    (qp.execute/execute compiled rff)))

(def ^:private ^{:arglists '([query rff])} process-query* nil)

(defn- rebuild-process-query-fn! []
  (alter-var-root #'process-query* (constantly
                                    (reduce
                                     (fn [qp middleware]
                                       (if middleware
                                         (middleware qp)
                                         qp))
                                     process-query**
                                     around-middleware))))

(rebuild-process-query-fn!)

(doseq [varr  around-middleware
        :when varr]
  (add-watch varr ::reload (fn [_key _ref _old-state _new-state]
                             (log/infof "%s changed, rebuilding %s" varr `process-query*)
                             (rebuild-process-query-fn!))))

(mu/defn process-query :- [:fn {:error/message "process-query unexpectedly returned nil."} some?]
  "Process an MBQL query. This is the main entrypoint to the magical realm of the Query Processor."
  ([query]
   (process-query query nil))

  ([query :- ::qp.schema/any-query
    rff   :- [:maybe ::qp.schema/rff]]
   (qp.setup/with-qp-setup [query query]
     (let [rff (or rff qp.reducible/default-rff)]
       (process-query* query rff)))))

(mu/defn userland-query :- ::qp.schema/any-query
  "Add middleware options and `:info` to a `query` so it is ran as a 'userland' query, which slightly changes the QP
  behavior:

  1. Exceptions are caught, and a special error shape is returned (see [[catch-exceptions/catch-exceptions]])

  2. A `QueryExecution` is saved in the application database (see
     [[process-userland-query/process-userland-query-middleware]])

  3. A few extra keys like `:running_time` and `:started_at` are added to the QP
     response (see [[process-userland-query/process-userland-query-middleware]])"
  ([query]
   (userland-query query nil))

  ([query :- ::qp.schema/any-query
    info  :- [:maybe ::lib.schema.info/info]]
   (-> query
       (assoc-in [:middleware :userland-query?] true)
       (cond-> info (update :info merge info)))))

(def ^:private userland-query-middleware-options
  "The only `:middleware` options a caller may set on a query they submit
  to [[userland-query-with-default-constraints]]. Everything else in there is the query processor's own plumbing.

  An allowlist rather than a blocklist, because the cost of the two mistakes is not symmetric: forgetting to allow an
  option breaks a feature visibly, while forgetting to block one silently hands out whatever that option controls.
  These two are what the frontend and the embedding SDK actually send."
  #{:js-int-to-string? :ignore-cached-results?})

(mu/defn userland-query-with-default-constraints :- ::qp.schema/any-query
  "Add middleware options and `:info` to a `query` so it is ran as a 'userland' query. QP behavior changes are the same
  as those for [[userland-query]], *plus* the default userland constraints (limits) are applied --
  see [[qp.constraints/add-default-userland-constraints]].

  This ultimately powers most of the REST API entrypoints into the QP, so it makes those defaults actually win: the
  caller's own `:constraints` and any `:middleware` option outside [[userland-query-middleware-options]] are dropped
  first. Those are the two ways the query processor is told to skip the userland row cap -- `add-constraints` merges
  caller `:constraints` over the defaults, and `limit/disable-max-results?` reads its flag straight off `:middleware`
  -- and since the endpoint body schemas are open, a caller who set either read a whole table instead of the first
  `unaggregated-query-row-limit` rows.

  The internal callers that legitimately lift the cap -- [[disable-max-results]] for persisted-model refresh and
  referenced-card compilation, and `lib/disable-default-limit` for transforms -- build their queries in process and
  hand them straight to the QP, so they are unaffected. No client sets either key: `lib/disable-default-limit` used to
  be `^:export`ed to JS so the notebook's native preview could ask for uncapped SQL, and that is gone -- letting a
  client write into the query processor's execution options to change how its own query is displayed was never worth
  the hole it opened."
  ([query]
   (userland-query-with-default-constraints query nil))

  ([query :- ::qp.schema/any-query
    info  :- [:maybe ::lib.schema.info/info]]
   (-> query
       (dissoc :constraints)
       (m/update-existing :middleware select-keys userland-query-middleware-options)
       (userland-query info)
       (assoc-in [:middleware :add-default-userland-constraints?] true))))
;; test
