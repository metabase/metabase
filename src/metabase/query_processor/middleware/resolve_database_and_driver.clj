(ns metabase.query-processor.middleware.resolve-database-and-driver
  (:require
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.models.setting :as setting]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(declare resolve-database-id)

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
                 (throw (ex-info (tru "Card {0} does not exist." source-card-id)
                                 {:card-id source-card-id, :type qp.error-type/invalid-query, :status-code 404})))]
    (:database-id card)))

(mu/defn resolve-database-id :- ::lib.schema.id/database
  "Return the *actual* `:database` ID for a query, even if it is using
  the [[metabase.lib.schema.id/saved-questions-virtual-database-id]]."
  [{database-id :database, :as query}]
  (or
   (when (pos-int? database-id)
     database-id)
   ;; MLv2 query
   (when (= (:lib/type query) :mbql/query)
     (when-let [source-card-id (lib.util/source-card-id query)]
       (resolve-database-id-for-source-card source-card-id)))
   ;; legacy query
   (when (= (:type query) :query)
     (let [most-deeply-nested-source-query (last (take-while some? (iterate :source-query (:query query))))]
       (when-let [card-id (lib.util/legacy-string-table-id->card-id (:source-table most-deeply-nested-source-query))]
         (resolve-database-id-for-source-card card-id))))))

(defn resolve-database
  "If query `:database` ID is the [[metabase.lib.schema.id/saved-questions-virtual-database-id]], resolve it to the
  *actual* Database ID. We need to do this before initializing the QP Store/metadata provider."
  [qp]
  (fn [query rff context]
    (let [query' (assoc query :database (resolve-database-id query))]
      (qp query' rff context))))

(defn resolve-driver-and-database-local-values
  "Middleware that resolves the Database referenced by the query under that `:database` key and stores it in the QP
  Store."
  [qp]
  (fn [query rff context]
    (let [{:keys [settings], driver :engine} (lib.metadata/database (qp.store/metadata-provider))]
      ;; make sure the driver is initialized.
      (try
        (driver/the-initialized-driver driver)
        (catch Throwable e
          (throw (ex-info (tru "Unable to resolve driver for query")
                          {:type qp.error-type/invalid-query}
                          e))))
      (binding [setting/*database-local-values* settings]
        (driver/with-driver driver
          (qp query rff context))))))
