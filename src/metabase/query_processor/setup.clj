(ns metabase.query-processor.setup
  (:require
   [clojure.core.async :as a]
   [clojure.core.async.impl.dispatch :as a.impl.dispatch]
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.models.setting :as setting]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(mu/defn- query-type :- [:enum :query :native :internal :mbql/query]
  [query :- ::qp.schema/query]
  (or (some-> ((some-fn :lib/type :type) query) keyword)
      (throw (ex-info (i18n/tru "Invalid query: missing or invalid query type (:lib/type or :type)")
                      {:query query, :type qp.error-type/invalid-query}))))

(mu/defn- source-card-id-for-pmbql-query :- [:maybe ::lib.schema.id/card]
  [query :- ::qp.schema/query]
  (-> query :stages first :source-card))

(mu/defn- source-card-id-for-legacy-query :- [:maybe ::lib.schema.id/card]
  [query :- ::qp.schema/query]
  (let [inner-query         (:query query)
        deepest-inner-query (loop [inner-query inner-query]
                              (let [source-query (:source-query inner-query)]
                                (if source-query
                                  (recur source-query)
                                  inner-query)))
        source-table        (:source-table deepest-inner-query)]
    (lib.util/legacy-string-table-id->card-id source-table)))

(defn- bootstrap-metadatas [metadata-type ids]
  (when (and (seq ids)
             (= metadata-type :metadata/card))
    (t2/select-fn-vec
     (fn [card]
       {:lib/type    :metadata/card
        :id          (:id card)
        :name        (format "Card #%d" (:id card))
        :database-id (:database_id card)})
     [:model/Card :id :database_id]
     :id [:in (set ids)])))

(deftype ^:private BootstrapMetadataProvider []
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    nil)
  (metadatas [_this metadata-type ids]
    (bootstrap-metadatas metadata-type ids))
  (tables [_this]
    nil)
  (metadatas-for-table [_this _metadata-type _table-id]
    nil)
  (metadatas-for-card [_this _metadata-type _card-id]
    nil)
  (setting [_this _setting-key]
    nil))

(mu/defn- bootstrap-metadata-provider :- ::lib.schema.metadata/metadata-provider
  "A super-basic metadata provider used only for resolving the database ID associated with a source Card, only for
  queries that use the [[lib.schema.id/saved-questions-virtual-database-id]] e.g.

    {:database -1337, :type :query, :query {:source-table \"card__1\"}}

  Once the *actual* Database ID is resolved, we will create a
  real [[metabase.lib.metadata.jvm/application-database-metadata-provider]]. (The App DB provider needs to be
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
  [query :- ::qp.schema/query]
  (case (query-type query)
    :mbql/query
    (source-card-id-for-pmbql-query query)

    (:query :native)
    (source-card-id-for-legacy-query query)

    #_else
    (throw (ex-info (i18n/tru "Invalid query: cannot use the Saved Questions Virtual Database ID unless query has a source Card")
                    {:query query, :type qp.error-type/invalid-query}))))

(mu/defn- resolve-database-id :- [:maybe ::lib.schema.id/database]
  [query :- ::qp.schema/query]
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
  [f :- [:=> [:cat ::qp.schema/query] :any]]
  (mu/fn
    [query :- ::qp.schema/query]
    (let [query       (set/rename-keys query {"database" :database})
          database-id (resolve-database-id query)
          query       (cond-> query
                        database-id (assoc :database database-id))]
      (f query))))

(mu/defn- maybe-attach-metadata-provider-to-query :- ::qp.schema/query
  [query :- ::qp.schema/query]
  (cond-> query
    (= (:lib/type query) :mbql/query) (assoc :lib/metadata (qp.store/metadata-provider))))

(mu/defn- do-with-metadata-provider :- fn?
  [f :- [:=> [:cat ::qp.schema/query] :any]]
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
  [f :- [:=> [:cat ::qp.schema/query] :any]]
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
  [f :- [:=> [:cat ::qp.schema/query] :any]]
  (fn [query]
    (cond
      setting/*database-local-values*
      (f query)

      (= (query-type query) :internal)
      (f query)

      :else
      (let [{:keys [settings]} (lib.metadata/database (qp.store/metadata-provider))]
        (binding [setting/*database-local-values* (or settings {})]
          (f query))))))

(mu/defn- do-with-canceled-chan :- fn?
  [f :- [:=> [:cat ::qp.schema/query] :any]]
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
  [query :- ::qp.schema/query
   f     :- [:=> [:cat ::qp.schema/query] :any]]
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
