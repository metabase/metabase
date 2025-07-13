(ns metabase.transform.models.transform
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u] [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.models.interface :as mi]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.util.i18n :as i18n]
   [methodical.core :as methodical] [toucan2.core :as t2]))

(doto :model/TransformView
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/TransformView [_model] :transform_view)

(t2/deftransforms :model/TransformView
  {:dataset_query mi/transform-metabase-query
   :dataset_query_type mi/transform-keyword
   :status mi/transform-keyword})

;; TODO: This is temporary, mysql app db compatible
(defn top-schema
  [database-id]
  (-> (t2/query ["select count(id) c, `schema` s from metabase_table where db_id = ? group by `schema` order by count(id) desc, `schema` limit 1" database-id])
      first
      :s))

;; TODO: This is borrowed. Ideally dataset_query submodule should be created in metabase.queries and this and related
;;       functions provided there. Gist is that not only functionality metabase.queries is supposed to manipulate this.
(defn dataset-query->query
  "Convert the `dataset_query` column of a Card to a MLv2 pMBQL query."
  ([dataset-query]
   (if (-> dataset-query :lib/type #{:mbql/query})
     dataset-query
     (some-> (:database dataset-query)
             lib.metadata.jvm/application-database-metadata-provider
             (dataset-query->query dataset-query))))
  ([metadata-provider dataset-query]
   (if (-> dataset-query :lib/type #{:mbql/query})
     dataset-query
     (some->> dataset-query card.metadata/normalize-dataset-query (lib/query metadata-provider)))))

;; TODO: query schema: normalized mbql or native query
;; query is native query?

(def view-name-prefix
  "Prefix for view names. Names `mb_transform_\\d+` in user schemas are reserved for managed views."
  "mb_transform_")

(defn transform-view-name
  "Generate name for transform view. Id should be unique."
  [id]
  (assert (pos-int? id))
  (str view-name-prefix id))

;; TODO: test for version matching, stub now
#_{:clj-kondo/ignore [:missing-docstring :unresolved-namespace]}
(def dataset-query-current-schema @#'metabase.queries.models.card/current-schema-version)

(defn- query-type
  [query]
  (or (and (metabase.lib.util/native-stage? query 0)
           :native)
      :query))

(defn- assert-unique-name!
  "Assert there is no same `name` :model/Table in the `schema`."
  [database schema name]
  ;; Deliberately not checking :model/TransformView. It is guaranteed the name is unique across that table
  ;; as the transform_view.id is used to generate name.
  (when-some [table-ids (not-empty (t2/select-fn-vec :id :model/Table
                                                     :active true
                                                     :db_id (:id database)
                                                     :schema schema
                                                     :name name))]
    (throw (ex-info (i18n/tru "View name in use. `{0}<numbers>+` names are reserved." view-name-prefix)
                    {:status-code 400
                     :database-id (:id database)
                     :database-name (:name database)
                     :schema schema
                     :name name
                     :same-name-table-ids table-ids}))))

(defn- assert-unique-display-name!
  [database schema display-name]
  ;; Deliberately not checking TransformView -- TODO: remove view_display_name from that table
  (when-some [table-ids (not-empty (t2/select-fn-vec :id :model/Table
                                                     :active true
                                                     :db_id (:id database)
                                                     :schema schema
                                                     :display_name display-name))]
    (throw (ex-info (i18n/tru "View display name in use. Display name of a transform must be unique.")
                    {:status-code 400
                     :database-id (:id database)
                     :database-name (:name database)
                     :schema schema
                     :display-name display-name
                     :same-display-name-table-ids table-ids}))))

(defn insert-returning-instance!
  [schema display-name dataset-query creator]
  (let [query (dataset-query->query dataset-query)
        query-type (query-type query)
        creator-id (:id creator)
        database-id (:database query)
        database (doto (t2/select-one :model/Database :id database-id)
                   (as-> $ (assert (some? $))))
        driver (driver.u/database->driver database)
        native (:query (qp.compile/compile-with-inline-parameters query))]
    (t2/with-transaction [_conn]
      (assert-unique-display-name! database schema display-name)
      (let [transform (t2/insert-returning-instance! :model/TransformView
                                                     {:creator_id creator-id
                                                      :database_id database-id
                                                      :dataset_query dataset-query
                                                      :dataset_query_schema dataset-query-current-schema
                                                      :dataset_query_type query-type
                                                      :status :record_created})
            transform-id (doto (:id transform)
                           (as-> $ (assert (pos-int? $))))
            view-name (transform-view-name transform-id)]
        (assert-unique-name! database schema view-name)
        (driver/create-view! driver database-id (str/join "." (remove nil? [schema view-name])) native)
        ;; TODO: Is it reasonable to do the following in transaction?
        ;; NB: Following could take a long time or fail, the same way as analysis
        ;; TODO: All of that should go off thread.
        (sync-metadata/sync-new-table-metadata! database {:table-name view-name
                                                          :schema schema})
        (let [view-table (t2/select-one :model/Table
                                        :db_id database-id
                                        :name view-name)]
          (t2/update! :model/TransformView :id transform-id
                      {:view_name view-name
                       :view_schema (:schema view-table)
                       :status :view_synced})
          (t2/update! :model/Table :id (:id view-table)
                      {:display_name display-name
                       ;; TODO: This should be handled by analysis!!! (and should be async!!!)
                       :initial_sync_status "complete"
                       :transform_id transform-id})
          (t2/select-one :model/TransformView :id transform-id))))))

;; TODO: adjust to new migr
(defn update-transform!
  [transform-id dataset-query creator]
  (let [transform (t2/select-one :model/TransformView :id transform-id)
        view-name (:view_name transform)
        schema-name (:view_schema transform)
        namespaced-view-name (str/join "." (remove nil? [schema-name view-name]))
        query (dataset-query->query dataset-query)
        database-id (:database query)
        compiled (:query (qp.compile/compile-with-inline-parameters query))
        database (t2/select-one :model/Database :id database-id)
        driver (driver.u/database->driver database)]
    ;; TODO: In transaction?
    (driver/drop-view! driver database-id namespaced-view-name)
    (driver/create-view! driver database-id namespaced-view-name compiled)
    ;; If former successful
    (t2/with-transaction [_conn]
      ;; also shutdown the transaction?
      (t2/update! :model/TransformView :id transform-id
                  {:dataset_query dataset-query
                   :creator_id (:id creator)})
      ;; TODO: async
      (sync-metadata/sync-table-metadata! (t2/select-one :model/Table :id (:view_table_id transform))))))
