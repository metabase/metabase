(ns metabase.query-processor.setup
  (:require
   [clojure.core.async :as a]
   [clojure.core.async.impl.dispatch :as a.impl.dispatch]
   [clojure.set :as set]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.lib.computed :as lib.computed]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ScheduledFuture ScheduledThreadPoolExecutor ThreadFactory TimeUnit)
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(mu/defn- query-type :- [:enum :query :native :internal :mbql/query]
  [query :- ::qp.schema/any-query]
  (or (some-> ((some-fn :lib/type :type) query) keyword)
      (throw (ex-info (i18n/tru "Invalid query: missing or invalid query type (:lib/type or :type)")
                      {:query query, :type qp.error-type/invalid-query}))))

(mu/defn- source-card-id-for-mbql5-query :- [:maybe ::lib.schema.id/card]
  [query :- ::qp.schema/any-query]
  (-> query :stages first :source-card))

(mu/defn- source-card-id-for-legacy-query :- [:maybe ::lib.schema.id/card]
  [query :- ::qp.schema/any-query]
  (let [inner-query         (:query query)
        deepest-inner-query (loop [inner-query inner-query]
                              (let [source-query (:source-query inner-query)]
                                (if source-query
                                  (recur source-query)
                                  inner-query)))
        source-table        (:source-table deepest-inner-query)]
    (lib.util/legacy-string-table-id->card-id source-table)))

(defn- bootstrap-metadatas [{metadata-type :lib/type, id-set :id, :as _metadata-spec}]
  (when (and (seq id-set)
             (= metadata-type :metadata/card))
    (t2/select-fn-vec
     (fn [card]
       {:lib/type    :metadata/card
        :id          (:id card)
        :name        (format "Card #%d" (:id card))
        :database-id (:database_id card)})
     [:model/Card :id :database_id :card_schema]
     :id [:in (set id-set)])))

(deftype ^:private BootstrapMetadataProvider []
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    nil)
  (metadatas [_this metadata-spec]
    (bootstrap-metadatas metadata-spec))
  (setting [_this _setting-key]
    nil))

(mu/defn- bootstrap-metadata-provider :- ::lib.schema.metadata/metadata-provider
  "A super-basic metadata provider used only for resolving the database ID associated with a source Card, only for
  queries that use the [[lib.schema.id/saved-questions-virtual-database-id]] e.g.

    {:database -1337, :type :query, :query {:source-table \"card__1\"}}

  Once the *actual* Database ID is resolved, we will create a
  real [[metabase.lib-be.metadata.jvm/application-database-metadata-provider]]. (The App DB provider needs to be
  initialized with an actual Database ID)."
  []
  (if (qp.store/initialized?)
    (qp.store/metadata-provider)
    (->BootstrapMetadataProvider)))

(mu/defn- resolve-database-id-for-source-card :- ::lib.schema.id/database
  [source-card-id :- ::lib.schema.id/card]
  (let [card (or (lib.metadata.protocols/card (bootstrap-metadata-provider) source-card-id)
                 (throw (ex-info (i18n/tru "Card {0} does not exist." source-card-id)
                                 {:card-id source-card-id, :type qp.error-type/invalid-query, :status-code 404})))]
    (:database-id card)))

(mu/defn- source-card-id :- ::lib.schema.id/card
  [query :- ::qp.schema/any-query]
  (case (query-type query)
    :mbql/query
    (source-card-id-for-mbql5-query query)

    (:query :native)
    (source-card-id-for-legacy-query query)

    #_else
    (throw (ex-info (i18n/tru "Invalid query: cannot use the Saved Questions Virtual Database ID unless query has a source Card")
                    {:query query, :type qp.error-type/invalid-query}))))

(mu/defn- resolve-database-id :- [:maybe ::lib.schema.id/database]
  [query :- ::qp.schema/any-query]
  (when-not (= (query-type query) :internal)
    (let [database-id (:database query)]
      (cond
        (pos-int? database-id)
        database-id

        (= database-id lib.schema.id/saved-questions-virtual-database-id)
        (resolve-database-id-for-source-card (source-card-id query))

        :else
        (throw (ex-info (i18n/tru "Invalid query: missing or invalid Database ID (:database)")
                        {:query query, :type qp.error-type/invalid-query}))))))

(mu/defn- do-with-resolved-database :- fn?
  [f :- [:=> [:cat ::qp.schema/any-query] :any]]
  (mu/fn
    [query :- ::qp.schema/any-query]
    (let [query       (set/rename-keys query {"database" :database})
          database-id (resolve-database-id query)
          query       (cond-> query
                        database-id (assoc :database database-id))]
      (f query))))

(mu/defn- maybe-attach-metadata-provider-to-query :- ::qp.schema/any-query
  [query :- ::qp.schema/any-query]
  (cond-> query
    (= (:lib/type query) :mbql/query) (assoc :lib/metadata (qp.store/metadata-provider))))

(mu/defn- do-with-metadata-provider :- fn?
  [f :- [:=> [:cat ::qp.schema/any-query] :any]]
  (fn [query]
    (cond
      (qp.store/initialized?)
      (f (maybe-attach-metadata-provider-to-query query))

      (lib.metadata.protocols/metadata-providerable? query)
      (qp.store/with-metadata-provider (lib.metadata/->metadata-provider query)
        (f query))

      (= (query-type query) :internal)
      (f query)

      :else
      (qp.store/with-metadata-provider (:database query)
        (f (maybe-attach-metadata-provider-to-query query))))))

(mu/defn- do-with-driver :- fn?
  [f :- [:=> [:cat ::qp.schema/any-query] :any]]
  (fn [query]
    (cond
      driver/*driver*
      (do
        ;; dev mode: check that we're not doing something crazy like binding `driver/*driver*` to `:h2` and the
        ;; running tests against the Audit App DB with a Postgres app DB. (This was a real test I had to fix.)
        (when (or config/is-dev? config/is-test?)
          (let [expected-driver (driver.u/database->driver (:database query))]
            (when-not (= driver/*driver* expected-driver)
              (log/warnf "driver/*driver* is bound to %s, but Database %d has engine %s. Query may not work as expected."
                         driver/*driver*
                         (:database query)
                         expected-driver))))
        (f query))

      (= (query-type query) :internal)
      (f query)

      :else
      (let [driver (driver.u/database->driver (:database query))]
        (driver/with-driver driver
          (f query))))))

(mu/defn- do-with-database-local-settings :- fn?
  [f :- [:=> [:cat ::qp.schema/any-query] :any]]
  (fn [query]
    (cond
      (setting/database-local-values)
      (f query)

      (= (query-type query) :internal)
      (f query)

      :else
      (let [db (lib.metadata/database (qp.store/metadata-provider))]
        (setting/with-database db
          (f query))))))

(defonce ^:private query-timeout-executor
  ;; one daemon thread for the whole JVM; the scheduled work is a single non-blocking `a/put!`.
  ;; `setRemoveOnCancelPolicy` makes cancelled tasks leave the queue immediately instead of at their deadline.
  (delay
    (doto (ScheduledThreadPoolExecutor. 1
                                        (reify ThreadFactory
                                          (newThread [_ r]
                                            (doto (Thread. ^Runnable r "query-timeout-scheduler")
                                              (.setDaemon true)))))
      (.setRemoveOnCancelPolicy true))))

(defn- schedule-query-timeout-cancel!
  "Schedule a put of `::timeout` to `canceled-chan` after `*query-timeout-ms*`. Driver execution wires this channel
  to `Statement.cancel()` (see [[metabase.driver.sql-jdbc.execute/wire-up-canceled-chan-to-cancel-Statement!]]),
  which for MySQL/MariaDB issues `KILL QUERY` on a side connection — so this is the cross-driver path that actually
  stops a running query on the server when the timeout fires. The timer never reads from `canceled-chan`, since
  callers (notably tests) may bind a regular channel where `alts!`/`<!` would consume the cancel signal away from
  the driver's listener.

  Returns a `ScheduledFuture`; the caller must cancel it when the query completes."
  ^ScheduledFuture [canceled-chan]
  (let [timeout-ms  (long driver.settings/*query-timeout-ms*)
        ;; capture the log4j ThreadContext (an immutable map of strings) at schedule time: the warn below fires on
        ;; the scheduler thread, which otherwise has no query/job attribution for log filtering. Strings only — the
        ;; closure must stay cheap, since it lives until the timeout fires or the query completes.
        log-context (ThreadContext/getImmutableContext)]
    ;; Deliberately a plain fn on a Java scheduler rather than an `a/go` block: `go` conveys the dynamic binding
    ;; frame (including the bound metadata provider and its cache) into a handler parked on an uncancellable
    ;; `a/timeout` channel, pinning ~1MB per QP invocation in the static timer queue until the deadline — which
    ;; OOMed instances under sustained query rates (#75748). A plain fn captures only `canceled-chan` and the
    ;; context strings above, and cancelling the future releases even those as soon as the query finishes.
    (.schedule ^ScheduledThreadPoolExecutor @query-timeout-executor
               ^Runnable (fn []
                           ;; `put!` returns false if the chan is already closed (the pipeline closes it on
                           ;; successful reduction) — don't log a spurious warning for a completed query.
                           (when (a/put! canceled-chan ::timeout)
                             ;; the scheduler thread runs nothing else, so there is no prior context to preserve
                             (ThreadContext/putAll log-context)
                             (try
                               (log/warnf "Query exceeded timeout of %d ms; canceling" timeout-ms)
                               (finally
                                 (ThreadContext/clearMap)))))
               timeout-ms
               TimeUnit/MILLISECONDS)))

(mu/defn- do-with-canceled-chan :- fn?
  [f :- [:=> [:cat ::qp.schema/any-query] :any]]
  (fn [query]
    (binding [qp.pipeline/*canceled-chan* (or qp.pipeline/*canceled-chan* (a/promise-chan))]
      (let [timeout-task (schedule-query-timeout-cancel! qp.pipeline/*canceled-chan*)]
        (try
          (f query)
          (finally
            (.cancel timeout-task false)))))))

(def ^:private setup-middleware
  "Setup middleware has the signature

    (middleware f) => f

  Where f has the signature

    (f query)

  i.e.

    (middleware (f query)) => (f query)"
  [#'do-with-canceled-chan
   #'do-with-database-local-settings
   #'do-with-driver
   #'do-with-metadata-provider
   #'do-with-resolved-database])
;;; ↑↑↑ SETUP MIDDLEWARE ↑↑↑ happens from BOTTOM to TOP e.g. [[do-with-resolved-database]] is the first to do its thing

(def ^:private ^:dynamic *has-setup*
  "This is here so we can skip calling the setup middleware if it's already done. Not super important, since the setup
  middleware should all no-op, but it keeps the stacktraces tidier so we do not have a bunch of calls that don't do
  anything in them."
  false)

(mu/defn do-with-qp-setup
  "Impl for [[with-qp-setup]]."
  [query :- ::qp.schema/any-query
   f     :- [:=> [:cat ::qp.schema/any-query] :any]]
  ;; TODO -- think about whether we should pre-compile this middleware
  (when (a.impl.dispatch/in-dispatch-thread?)
    (throw (ex-info "QP calls are not allowed inside core.async dispatch pool threads."
                    {:type qp.error-type/qp})))
  (if *has-setup*
    (f query)
    (let [f (reduce
             (fn [f middleware]
               (middleware f))
             f
             setup-middleware)]
      (binding [*has-setup*                   true
                lib.computed/*computed-cache* (atom {})]
        (f query)))))

(defmacro with-qp-setup
  "Execute `body` with things like the QP Store, driver, and Database-local Settings resolved and bound as needed, and
  the `query` Database ID correctly resolved.

  This should be used at the highest level possible for all various QP entrypoints that can be called independently,
  e.g. [[metabase.query-processor/process-query]] or [[metabase.query-processor.preprocess/preprocess]]. This is a
  no-op if these things are already bound, so duplicate calls won't negatively affect things.

    (qp.setup/with-qp-setup [query query]
      ...)"
  [[query-binding query] & body]
  `(do-with-qp-setup
    ~query
    (^:once fn* [~query-binding]
      ~@body)))
