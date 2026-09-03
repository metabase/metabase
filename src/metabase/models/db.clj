(ns metabase.models.db
  "Application database queries for the models module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (the model machinery still uses
  `toucan2.core`)."
  (:require
   [toucan2.core :as t2]
   [toucan2.tools.identity-query :as t2.identity-query]))

(defn entity-by-pk
  "The `model` row whose `pk-column` is `id`, or nil."
  [model pk-column id]
  (t2/select-one model pk-column id))

(defn entity-by-entity-id
  "The `model` row with `entity-id`, or nil."
  [model entity-id]
  (t2/select-one model :entity_id entity-id))

(defn entity-field
  "The `field` of the `model` row with `id`, or nil."
  [model id field]
  (t2/select-one-fn field model :id id))

(defn pk-by-entity-id
  "The `pk-column` of the `model` row with `entity-id`, or nil."
  [model pk-column entity-id]
  (t2/select-one-fn pk-column [model pk-column] :entity_id entity-id))

(defn pk-by-field
  "The primary key of the `model` row whose `field` is `value`, or nil."
  [model field value]
  (t2/select-one-pk model field value))

(defn after-select-via-identity-query
  "`row-map` run through the after-select machinery of `model`."
  [model row-map]
  (t2/select-one model (t2.identity-query/identity-query [row-map])))

(defn entities-reducible
  "A reducible of the `model` rows selected by the Honey SQL `query`."
  [model query]
  (t2/reducible-select model query))

(defn names-reducible
  "A reducible of the id, name, and display name of every `model` row."
  [model]
  (t2/reducible-select [model :id :name :display_name]))

(defn update-entity!
  "Apply `changes` to the `model` row with `id`."
  [model id changes]
  (t2/update! model id changes))

(defn set-display-name!
  "Set the display name of the `model` row with `id`."
  [model id display-name]
  (t2/update! model id {:display_name display-name}))

(defn insert-entity!
  "Insert the `model` `row` and return the inserted instance."
  [model row]
  (t2/insert-returning-instance! model row))

(defn insert-entity-returning-pk!
  "Insert the `model` `row` and return its primary key."
  [model row]
  (t2/insert-returning-pk! model row))

(defn insert-entities!
  "Insert the `model` `rows`."
  [model rows]
  (t2/insert! model rows))

(defn delete-entity!
  "Delete the `model` row with `id`."
  [model id]
  (t2/delete! model id))

(defn delete-entities-with-ids!
  "Delete the `model` rows whose `id-column` is one of `ids`."
  [model id-column ids]
  (t2/delete! model id-column [:in ids]))

(defn delete-children!
  "Delete the `model` rows whose `parent-column` is `parent-id`."
  [model parent-column parent-id]
  (t2/delete! model parent-column parent-id))

(defn delete-children-except!
  "Delete the `model` rows whose `parent-column` is `parent-id` and whose entity id is not one of `entity-ids`."
  [model parent-column parent-id entity-ids]
  (t2/delete! model parent-column parent-id :entity_id [:not-in entity-ids]))

(defn collection-paths-columns
  "The id, entity id, location, and name of every Collection."
  []
  (t2/select [:model/Collection :id :entity_id :location :name]))

(defn dashboard-entity-ids-and-names
  "The entity id and name of every Dashboard."
  []
  (t2/select [:model/Dashboard :entity_id :name]))

(defn document-entity-ids-and-names
  "The entity id and name of every Document."
  []
  (t2/select [:model/Document :entity_id :name]))

(defn field-hierarchy-rows
  "The name and Table id of the Field with `field-id` and each of its ancestors, deepest first."
  [field-id]
  (t2/select :model/Field
             {:with-recursive [[[:parents ^:allow-subquery {:columns [:id :name :parent_id :table_id]}]
                                ^:allow-subquery {:union-all [^:allow-subquery {:from   [[:metabase_field :mf]]
                                                                                :select [:mf.id :mf.name :mf.parent_id :mf.table_id]
                                                                                :where  [:= :id field-id]}
                                                              ^:allow-subquery {:from   [[:metabase_field :pf]]
                                                                                :select [:pf.id :pf.name :pf.parent_id :pf.table_id]
                                                                                :join   [[:parents :p] [:= :p.parent_id :pf.id]]}]}]]
              :from           [:parents]
              :select         [:name :table_id]}))

(defn table-ref-columns
  "The id, Database id, name, and schema of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one [:model/Table :id :db_id :name :schema] :id table-id))

(defn database-name
  "The name of the Database with `database-id`, or nil."
  [database-id]
  (t2/select-one-fn :name [:model/Database :id :name] :id database-id))

(defn database-names
  "The names of every Database."
  []
  (t2/select-fn-vec :name :model/Database))

(defn database-id-by-name
  "The id of the Database named `database-name`, or nil."
  [database-name]
  (t2/select-one-fn :id :model/Database :name database-name))

(defn table-id-by-name
  "The id of the Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [table-name schema database-id]
  (t2/select-one-fn :id :model/Table :name table-name :schema schema :db_id database-id))

(defn insert-inactive-table!
  "Insert an inactive Table named `table-name` in `schema` of the Database with `database-id` and return its id."
  [database-id schema table-name]
  (:id (t2/insert-returning-instance! :model/Table {:db_id  database-id
                                                    :schema schema
                                                    :name   table-name
                                                    :active false})))

(defn field-pk
  "The id of the Field named `field-name` under `parent-id` in the Table with `table-id`, or nil."
  [table-id field-name parent-id]
  (t2/select-one-pk :model/Field :table_id table-id :name field-name :parent_id parent-id))

(defn- field-in-path-query
  [table-id [field & rest]]
  (when field
    ^:allow-subquery {:from   [:metabase_field]
                      :select [:id]
                      :where  [:and
                               [:= :table_id table-id]
                               [:= :name field]
                               [:= :parent_id (field-in-path-query table-id rest)]]}))

(defn field-pk-in-path
  "The id of the Field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil."
  [table-id field-names]
  (when (seq field-names)
    (t2/select-one-pk :model/Field (field-in-path-query table-id field-names))))

(defn insert-inactive-field!
  "Insert an inactive, untyped Field named `field-name` under `parent-id` in the Table with `table-id` and return its
  id."
  [table-id parent-id field-name]
  (t2/insert-returning-pk! :model/Field {:table_id      table-id
                                         :parent_id     parent-id
                                         :name          field-name
                                         :active        false
                                         :base_type     :type/*
                                         :database_type "NULL"}))

(defn metadata-tables
  "The `:metadata/table` rows named `table-name` in `schema` of the Database with `database-id`."
  [database-id schema table-name]
  (t2/select :metadata/table :db_id database-id :schema schema :name table-name))

(defn card-serdes-columns
  "The id, entity id, Collection id, Database id, and schema of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :id :entity_id :collection_id :database_id :card_schema] :id card-id))

(defn measure-serdes-columns
  "The id, entity id, and Table id of the Measure with `measure-id`, or nil."
  [measure-id]
  (t2/select-one [:model/Measure :id :entity_id :table_id] :id measure-id))

(defn segment-serdes-columns
  "The id, entity id, and Table id of the Segment with `segment-id`, or nil."
  [segment-id]
  (t2/select-one [:model/Segment :id :entity_id :table_id] :id segment-id))

(defn entity-by-own-pk
  "The `model` row identified by `id`, using whatever column is that model's own primary key."
  [model id]
  (t2/select-one model (first (t2/primary-keys model)) id))
