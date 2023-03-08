(ns metabase.query-processor.store.app-db-provider
  "A [[metabase.query-processor.store.interface/QPStoreProvider]] using the application database. This is the default
  provider."
  (:require
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor.store.interface :as qp.store.interface]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

(defn- app-db-fetch-database [database-id]
  (t2/select-one (into [Database] qp.store.interface/database-columns-to-fetch)
                 :id database-id))

(defn- app-db-fetch-tables [database-id table-ids]
  (t2/select (into [Table] qp.store.interface/table-columns-to-fetch)
             :db_id database-id
             :id    [:in (set table-ids)]))

(defn- app-db-fetch-fields [database-id field-ids]
  (t2/select
   Field
   {:select    (for [column-kw qp.store.interface/field-columns-to-fetch]
                 [(keyword (str "field." (name column-kw)))
                  column-kw])
    :from      [[:metabase_field :field]]
    :left-join [[:metabase_table :table] [:= :field.table_id :table.id]]
    :where     [:and
                [:in :field.id (set field-ids)]
                [:= :table.db_id database-id]]}))

(p/defrecord+ AppDBProvider []
  qp.store.interface/QPStoreProvider
  (fetch-database [_this database-id]           (app-db-fetch-database database-id))
  (fetch-tables   [_this database-id table-ids] (app-db-fetch-tables database-id table-ids))
  (fetch-fields   [_this database-id field-ids] (app-db-fetch-fields database-id field-ids))

  pretty/PrettyPrintable
  (pretty [_this]
    `(->AppDBProvider)))
