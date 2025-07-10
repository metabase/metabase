(ns metabase.transform.models.transform
  (:require

   [metabase.driver :as driver]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sync.sync-metadata :as sync-metadata]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/TransformView
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/TransformView [_model] :transform_view)

(t2/deftransforms :model/TransformView
  {:dataset_query mi/transform-metabase-query
   :dataset_query_type mi/transform-keyword
   :status mi/transform-keyword})

;; TODO: This is temporary
(defn- top-schema
  [database-id]
  (-> (t2/query ["select count(id) c, `schema` s from metabase_table where db_id = ? group by `schema` order by count(id) desc, `schema` limit 1" database-id])
      first
      :s))

;; TODO: This is borrowed. Ideally dataset_query submodule should be created in metabase.queries and this and related
;;       functions provided there. Gist is that not only functionality metabase.queries is supposed to manipulate this.
(defn- dataset-query->query
  "Convert the `dataset_query` column of a Card to a MLv2 pMBQL query."
  ([dataset-query]
   (some-> (:database dataset-query)
           lib.metadata.jvm/application-database-metadata-provider
           (dataset-query->query dataset-query)))
  ([metadata-provider dataset-query]
   (some->> dataset-query card.metadata/normalize-dataset-query (lib/query metadata-provider))))

(comment
  ;; best effort until we have failure modes resolved
  (def ccc-mbql ccc)
  ;; best effort removal of trailing semicolons -- we are not going further
  (def ccc-native ccc)

  (mbql? qqq))

;; TODO: query schema: normalized mbql or native query
;; query is native query?

(defn transform-view-name
  "Generate name for transform view. Id should be unique."
  [id]
  (assert (pos-int? id))
  (str "mb_transform_" id))

;; TODO: test for version matching, stub now
#_{:clj-kondo/ignore [:missing-docstring :unresolved-namespace]}
(def dataset-query-current-schema @#'metabase.queries.models.card/current-schema-version)

;;
#_(defn view-exists-in-dwh
    (driver/do-with-connection-with-options))

(defn insert-returning-instance!
  [display-name dataset-query creator]
  (let [query (dataset-query->query dataset-query)
        ;; TODO: I query type necessary? Probably, we can use it eg to enable mbql only if we decide so.
        ;; TODO:
        query-type :mbql
        creator-id (:id creator)
        database-id (:database query)
        ;; FWIW: Confirm driver guard is not necessary with schema
        ;; TODO: Proper way of picking a schema
        most-used-schema (top-schema database-id)
        database (doto (t2/select-one :model/Database :id database-id)
                   (as-> $ (assert (some? $))))
        ;; I think we should not be doing the transform to keyword in this module. However spinning up metadata-provider
        ;; seems to be overkill. TODO: Resolve.
        driver (doto (-> database :engine keyword)
                 (as-> $ (assert (some? $))))
        native (:query (qp.compile/compile-with-inline-parameters query))]
    (when (seq @(def xix (t2/select :model/TransformView :view_schema most-used-schema :view_display_name display-name)))
      (throw (ex-info "View display name in use"
                      {:status 400
                       :view_display_name display-name
                       :view_schema most-used-schema})))
    (t2/with-transaction [_conn]
      (let [transform (t2/insert-returning-instance! :model/TransformView
                                                     {:creator_id creator-id
                                                      :database_id database-id
                                                      :dataset_query dataset-query
                                                      :dataset_query_schema dataset-query-current-schema
                                                      :dataset_query_type query-type
                                                      :status :record_created
                                                      :view_display_name display-name})
            transform-id (doto (:id transform)
                           (as-> $ (assert (pos-int? $))))
            view-name (transform-view-name transform-id)]
        ;; FWIW: Not adding status :view_created as that would result only in additional db call _now_. That will
        ;;       presumably change with async sync and analysis.
        (driver/create-view! driver database-id view-name native)
        ;; TODO: Is it reasonable to do the following in transaction?
        (sync-metadata/sync-new-table-metadata! database {:table-name view-name
                                                          :schema most-used-schema})
        (let [view-table (t2/select-one :model/Table
                                        :db_id database-id
                                        :name view-name)]
          (t2/update! :model/TransformView :id transform-id
                      {:view_name view-name
                       :view_schema (:schema view-table)
                       :view_table_id (:id view-table)
                       :status :view_synced})
          (t2/update! :model/Table :id (:id view-table)
                      {:display_name display-name
                       ;; TODO: This should be handled by analysis!!! (and should be async!!!)
                       :initial_sync_status "complete"})
          (t2/select-one :model/TransformView :id transform-id))))))

