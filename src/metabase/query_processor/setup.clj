(ns metabase.query-processor.setup
  (:require
   [clojure.core.async :as a]
   [clojure.core.async.impl.dispatch :as a.impl.dispatch]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(mu/defn- query-type :- [:enum :query :native :internal :mbql/query]
  [query :- ::qp.schema/any-query]
  (or (some-> ((some-fn :lib/type :type) query) keyword)
      (throw (ex-info (i18n/tru "Invalid query: missing or invalid query type (:lib/type or :type)")
                      {:query query, :type qp.error-type/invalid-query}))))

(mu/defn- do-with-resolved-database :- fn?
  [f :- [:=> [:cat ::qp.schema/any-query] :any]]
  (fn [query]
    (f (lib-be/resolve-database query))))

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
      (f query)

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

(mu/defn- do-with-canceled-chan :- fn?
  [f :- [:=> [:cat ::qp.schema/any-query] :any]]
  (fn [query]
    (if qp.pipeline/*canceled-chan*
      (f query)
      (binding [qp.pipeline/*canceled-chan* (a/promise-chan)]
        (f query)))))

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
      (binding [*has-setup* true]
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
