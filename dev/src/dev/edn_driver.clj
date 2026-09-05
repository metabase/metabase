(ns dev.edn-driver
  (:require
   [dev.edn-driver.file :as edn-driver.file]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(driver/register! :edn-driver)

(mr/def ::connection-details
  [:map
   [:file ::lib.schema.common/non-blank-string]])

(mr/def ::database
  [:map
   [:details ::connection-details]])

(mr/def ::table
  [:map
   [:name ::lib.schema.common/non-blank-string]])

(doseq [feature driver/features]
  (defmethod driver/database-supports? [:edn feature]
    [_driver _feature _database]
    false))

(doseq [feature [:describe-fields]]
  (defmethod driver/database-supports? [:edn feature]
    [_driver _feature _database]
    true))

(defmethod driver/connection-properties :edn-driver
  [_driver]
  [{:name         "file"
    :display-name "File"
    :placeholder  "/home/cam/metabase/test/metabase/test/data/dataset_definitions/test-data.edn"
    :required     true}])

(mu/defn- details->file :- ::edn-driver.file/file
  [{:keys [^String file], :as _details} :- ::connection-details]
  (edn-driver.file/read-file file))

(mu/defmethod driver/can-connect? :edn-driver
  [_driver :- :keyword
   details :- ::connection-details]
  (some? (details->file details)))

(comment
  (def %file (edn-driver.file/read-file "/home/cam/metabase/test/metabase/test/data/dataset_definitions/test-data.edn")))

(mu/defmethod driver/describe-database :edn-driver :- :metabase.sync.interface/DatabaseMetadata
  [_driver                          :- :keyword
   {:keys [details], :as _database} :- ::database]
  {:tables (into #{}
                 (comp (map edn-driver.file/table-name)
                       (map (fn [table-name]
                              {:schema nil, :name table-name})))
                 (details->file details))})

(comment
  (driver/describe-database
   :edn-driver
   {:details {:file "/home/cam/metabase/test/metabase/test/data/dataset_definitions/test-data.edn"}}))

(comment
  (edn-driver.file/table-with-name %file "venues"))

(mu/defn- table->cols :- [:set :metabase.sync.interface/FieldMetadataEntry]
  [table :- ::edn-driver.file/table]
  (into #{{:table-schema         nil
           :table-name           (edn-driver.file/table-name table)
           :name                 "id"
           :database-type        "type/Integer"
           :base-type            :type/Integer
           :database-position    0
           :database-is-nullable false
           :pk?                  true}}
        (comp (map (fn [col]
                     (merge {:table-schema         nil
                             :table-name           (edn-driver.file/table-name table)
                             :name                 (:field-name col)
                             :database-type        (u/qualified-name (:base-type col))
                             :database-is-nullable (boolean (:not-null? col))}
                            (select-keys col [:base-type :visibility-type]))))
              (map-indexed (fn [i col]
                             (assoc col :database-position (inc i)))))
        (edn-driver.file/table-columns table)))

(mu/defmethod driver/describe-table :edn-driver :- [:map
                                                    [:name   :string]
                                                    [:schema [:maybe :string]]
                                                    [:fields [:set :metabase.sync.interface/FieldMetadataEntry]]]
  [_driver                          :- :keyword
   {:keys [details], :as _database} :- ::database
   {table-name :name, :as _table}   :- ::table]
  (let [file  (details->file details)
        table (edn-driver.file/table-with-name file table-name)]
    {:name   table-name
     :schema nil
     :fields (table->cols table)}))

(comment
  (defn %db []
    (toucan2.core/select-one :model/Database :engine :edn-driver))

  (defn %tables []
    (toucan2.core/select :model/Table :db_id (:id (%db))))

  (defn %table [table-name]
    (m/find-first #(= (:name %) table-name)
                  (%tables)))

  (defn %sync-table! [table-name]
    (metabase.sync.sync-metadata.fields/sync-fields-for-table! (%table table-name)))

  (mu/defn %fields [table :- [:map
                              [:id ::lib.schema.id/table]]]
    (toucan2.core/select :model/Field :table_id (:id table)))

  (mu/defn %field [table-name field-name]
    (let [table (%table table-name)]
      (m/find-first #(= (:name %) field-name)
                    (%fields table))))

  (driver/describe-table
   :edn-driver
   (%db)
   (%table "venues")))

(mu/defmethod driver/mbql->native :edn-driver :- :metabase.query-processor.compile/compiled
  [_driver    :- :keyword
   mbql-query :- ::lib.schema/query]
  {:query mbql-query #_(json/encode mbql-query {:pretty true})})

(defn sort-rows [rows metadata-providerable order-bys]
  ;; (f my-row) => (juxt last) => [(last my-row)] => [1]
  (letfn [(field-id->index [field-id]
            (assert (pos-int? field-id))
            (:position (lib.metadata/field metadata-providerable field-id)))
          (order-bys->spec [order-bys]
            (apply juxt (for [[direction _opts [_field _opts field-id]] order-bys]
                          (let [f #(nth % (field-id->index field-id))]
                            (case direction
                              :asc  f
                              :desc (comp - f))))))]
    (sort-by (order-bys->spec order-bys)
             rows)))

(defmethod driver/execute-reducible-query :edn-driver
  [_driver {{query :query} :qp/compiled, :as _query} _context respond]
  (def %query _query)
  (let [first-stage  (lib/query-stage query 0)
        source-table (:source-table first-stage)
        database     (lib.metadata/database query)
        file         (details->file (:details database))
        table-name   (:name (lib.metadata/table query source-table))
        table        (edn-driver.file/table-with-name file table-name)
        cols         (for [col (table->cols table)]
                       (select-keys col [:name :base-type]))]
    (let [metadata {:cols cols}
          rows     (-> (into []
                             (map-indexed (fn [i row]
                                            (list* (inc i) row)))
                             (edn-driver.file/table-rows table))
                       (sort-rows query (lib/order-bys query 0)))]
      (respond metadata rows))))

(comment
  (defn x []
    (metabase.test/rows
     (mu/disable-enforcement (metabase.query-processor/process-query %query)))))
