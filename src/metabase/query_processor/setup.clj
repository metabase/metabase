(ns metabase.query-processor.setup
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.models.setting :as setting]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(defn- get-normalized [m k]
  (u/or-with some?
    (get m k)
    (get m (u/qualified-name k))))

(mu/defn ^:private source-card-id-for-pmbql-query :- [:maybe ::lib.schema.id/card]
  [query :- :map]
  (let [[first-stage] (get-normalized query :stages)]
    (get-normalized first-stage :source-card)))

(mu/defn ^:private source-card-id-for-legacy-query :- [:maybe ::lib.schema.id/card]
  [query :- :map]
  (let [inner-query         (get-normalized query :query)
        deepest-inner-query (loop [inner-query inner-query]
                              (let [source-query (get-normalized inner-query :source-query)]
                                (if source-query
                                  (recur source-query)
                                  inner-query)))
        source-table        (get-normalized deepest-inner-query :source-table)]
    (lib.util/legacy-string-table-id->card-id source-table)))

(defn- bootstrap-metadata-provider []
  (if (qp.store/initialized?)
    (qp.store/metadata-provider)
    (reify lib.metadata.protocols/MetadataProvider
      (card [_this card-id]
        (t2/select-one-fn
         (fn [card]
           {:lib/type    :metadata/card
            :database-id (:database_id card)})
         [:model/Card :database_id]
         :id card-id)))))

(mu/defn ^:private resolve-database-id-for-source-card :- ::lib.schema.id/database
  [source-card-id :- ::lib.schema.id/card]
  (let [card (or (lib.metadata.protocols/card (bootstrap-metadata-provider) source-card-id)
                 (throw (ex-info (i18n/tru "Card {0} does not exist." source-card-id)
                                 {:card-id source-card-id, :type qp.error-type/invalid-query, :status-code 404})))]
    (:database-id card)))

(mu/defn ^:private source-card-id :- ::lib.schema.id/card
  [query :- :map]
  (let [query-type (some (fn [k]
                           (keyword (get-normalized query k)))
                         [:lib/type :type])]
    (when-not query-type
      (throw (ex-info (i18n/tru "Invalid query: missing or invalid query type (:lib/type or :type)")
                      {:query query, :type qp.error-type/invalid-query})))
    (or (case query-type
          :mbql/query
          (source-card-id-for-pmbql-query query)

          (:query :native)
          (source-card-id-for-legacy-query query))
        (throw (ex-info (i18n/tru "Invalid query: cannot use the Saved Questions Virtual Database ID unless query has a source Card")
                        {:query query, :type qp.error-type/invalid-query})))))

(mu/defn ^:private resolve-database-id :- ::lib.schema.id/database
  [query :- :map]
  (let [database-id (get-normalized query :database)]
    (cond
      (pos-int? database-id)
      database-id

      (= database-id lib.schema.id/saved-questions-virtual-database-id)
      (resolve-database-id-for-source-card (source-card-id query))

      :else
      (throw (ex-info (i18n/tru "Invalid query: missing or invalid Database ID (:database)")
                      {:query query, :type qp.error-type/invalid-query})))))

(defn- do-with-resolved-database [f]
  (mu/fn
    [query :- :map]
    (let [query       (set/rename-keys query {"database" :database})
          database-id (resolve-database-id query)
          query       (assoc query :database database-id)]
      (f query))))

(defn- maybe-attach-metadata-provider-to-query [query]
  (if (= (:lib/type query) :mbql/query)
    (assoc query :lib/metadata (qp.store/metadata-provider))
    query))

(defn- do-with-metadata-provider [f]
  (fn [query]
    (cond
      (qp.store/initialized?)
      (f (maybe-attach-metadata-provider-to-query query))

      (:lib/metadata query)
      (qp.store/with-metadata-provider (:lib/metadata query)
        (f query))

      :else
      (qp.store/with-metadata-provider (:database query)
        (f (maybe-attach-metadata-provider-to-query query))))))

(defn- do-with-driver [f]
  (fn [query]
    (if driver/*driver*
      (f query)
      (driver/with-driver (driver.u/database->driver (:database query))
        (f query)))))

(defn- do-with-database-local-settings [f]
  (fn [query]
    (if setting/*database-local-values*
      (f query)
      (let [{:keys [settings]} (lib.metadata/database (qp.store/metadata-provider))]
        (binding [setting/*database-local-values* (or settings {})]
          (f query))))))

(def ^:private setup-middleware
  "Setup middleware has the signature

    (middleware f) => f

  Where f has the signature

    (f query)

  i.e.

    (middleware (f query)) => (f query)"
  [#'do-with-database-local-settings
   #'do-with-driver
   #'do-with-metadata-provider
   #'do-with-resolved-database])
;;; ↑↑↑ SETUP MIDDLEWARE ↑↑↑ happens from BOTTOM to TOP e.g. [[do-with-resolved-database]] is the first to do its thing

(defn do-with-qp-setup
  "Impl for [[with-qp-setup]]."
  [query f]
  ;; TODO -- think about whether we should pre-compile this middleware
  (let [f (reduce
           (fn [f middleware]
             (middleware f))
           f
           setup-middleware)]
    (f query)))

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
