(ns metabase.warehouse-schema-rest.natural-keys
  "Tables and Fields named by their natural keys, the references serialization and remote sync name them by: a Table by
  `[db-name schema table-name]` and a Field by `[db-name schema table-name & field-names]`, root Field first. A
  Database name names the oldest Database with that name, as in serialization. A row the current user cannot read is
  not found, as a row that does not exist is."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.resolve :as serialization.resolve]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-rest.db :as warehouse-schema-rest.db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def table-entries
  "The entries of the query params naming a Table: `db`, its Database's name; `schema`, its schema, none when left out;
  and `table`, its name."
  [[:db     ms/NonBlankString]
   [:schema {:optional true} [:maybe ms/NonBlankString]]
   [:table  ms/NonBlankString]])

(def field-entries
  "The entries of the query params naming a Field: those naming its Table, and `field`, its name, repeated for a nested
  Field to name each of its ancestors, root first."
  (conj table-entries [:field (ms/QueryVectorOf ms/NonBlankString)]))

(mr/def ::table-query
  "The query params naming a Table, and nothing else."
  (into [:map {:closed true}] table-entries))

(mr/def ::field-query
  "The query params naming a Field, and nothing else."
  (into [:map {:closed true}] field-entries))

(def natural-key-params
  "The keys of the query params naming a Table or a Field."
  [:db :schema :table :field])

(defn- row-id-or-404
  "The id of the row of `model` that `ref` names, with `fetch` a fn of an id returning its row, throwing a 404 when none
  does or when the current user cannot read it: a name is easy to guess, so a 403 would tell the user that the row
  exists."
  [model ref fetch]
  (let [id (get (serialization.resolve/row-ids serialization/app-db-store model #{ref} {}) ref)]
    (api/check-404 (when (some-> id fetch (t2/hydrate :can_read) mi/can-read?) id))))

(defn table-id
  "The id of the Table that the query params `db`, `schema` and `table` name; throws a 404 when none does, or the
  current user cannot read it."
  [{:keys [db schema table]}]
  (row-id-or-404 :model/Table [db schema table] warehouse-schema-rest.db/table))

(defn field-id
  "The id of the Field that the query params `db`, `schema`, `table` and `field` name; throws a 404 when none does, or
  the current user cannot read it."
  [{:keys [db schema table field]}]
  (row-id-or-404 :model/Field (into [db schema table] field) warehouse-schema-rest.db/field))
