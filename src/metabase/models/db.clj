(ns metabase.models.db
  "Application database queries for the models module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (the model machinery still uses
  `toucan2.core`)."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.identity-query :as t2.identity-query]))

(mu/defn entity-by-pk
  "The `model` row whose `pk-column` is `id`, or nil."
  [model     :- [:or :keyword symbol?]
   pk-column :- :keyword
   id        :- [:or :int :string]]
  (t2/select-one model pk-column id))

(mu/defn entity-by-entity-id
  "The `model` row with `entity-id`, or nil."
  [model     :- [:or :keyword symbol?]
   entity-id :- :string]
  (t2/select-one model :entity_id entity-id))

(mu/defn entity-field
  "The `field` of the `model` row with `id`, or nil."
  [model :- [:or :keyword symbol?]
   id    :- ms/PositiveInt
   field :- :keyword]
  (t2/select-one-fn field model :id id))

(mu/defn pk-by-entity-id
  "The `pk-column` of the `model` row with `entity-id`, or nil."
  [model     :- [:or :keyword symbol?]
   pk-column :- :keyword
   entity-id :- :string]
  (t2/select-one-fn pk-column [model pk-column] :entity_id entity-id))

(mu/defn pk-by-field
  "The primary key of the `model` row whose `field` is `value`, or nil."
  [model :- [:or :keyword symbol?]
   field :- :keyword
   value :- [:maybe [:or :string :int :boolean :keyword]]]
  (t2/select-one-pk model field value))

(mu/defn after-select-via-identity-query
  "`row-map` run through the after-select machinery of `model`.

  `row-map` is a model instance row and so is generic across models; typed as a plain keyword-keyed map
  rather than a closed schema."
  [model   :- [:or :keyword symbol?]
   row-map :- [:map-of :keyword [:maybe :some]]]
  (t2/select-one model (t2.identity-query/identity-query [row-map])))

(mu/defn entities-reducible
  "A reducible of the `model` rows additionally matching the Honey SQL `extra-where` when given — the serdes
  extract-query nested-fetch hook passes a dynamic foreign-key-column + id-list condition here that varies per
  model/transform and can't be expressed as fixed data — ordered by `order-by` (or unordered when nil)."
  [model       :- [:or :keyword symbol?]
   extra-where :- [:maybe vector?]
   order-by    :- [:maybe vector?]]
  (t2/reducible-select model (cond-> {}
                               extra-where (assoc :where extra-where)
                               order-by    (assoc :order-by order-by))))

(mu/defn entities-in-collections-reducible
  "A reducible of the `model` rows whose `:collection_id` is in `collection-set` (nil in the set counts as the root
  collection), additionally matching the Honey SQL `extra-where` when given (see [[entities-reducible]] for why this
  stays a raw clause), ordered by `order-by` (or unordered when nil)."
  [model          :- [:or :keyword symbol?]
   collection-set :- [:or [:set [:maybe ms/PositiveInt]] [:sequential [:maybe ms/PositiveInt]]]
   extra-where    :- [:maybe vector?]
   order-by       :- [:maybe vector?]]
  (t2/reducible-select model
                       (cond-> {:where [:and
                                        [:or
                                         [:in :collection_id collection-set]
                                         (when (some nil? collection-set)
                                           [:= :collection_id nil])]
                                        extra-where]}
                         order-by (assoc :order-by order-by))))

(mu/defn table-names-reducible
  "A reducible of the id, name, and display name of every Table."
  []
  (t2/reducible-select [:model/Table :id :name :display_name]))

(mu/defn field-names-reducible
  "A reducible of the id, name, and display name of every Field."
  []
  (t2/reducible-select [:model/Field :id :name :display_name]))

(mu/defn update-entity!
  "Apply `changes` to the `model` row with `id`, returning the number updated.

  Generic across models, so `changes` is typed as a plain keyword-keyed map rather than a closed schema."
  [model   :- [:or :keyword symbol?]
   id      :- [:or :int :string]
   changes :- [:map-of :keyword [:maybe :some]]]
  (t2/update! model id changes))

(mu/defn set-table-display-name!
  "Set the display name of the Table with `id`, returning the number updated."
  [id           :- ::lib.schema.id/table
   display-name :- :string]
  (t2/update! :model/Table id {:display_name display-name}))

(mu/defn set-field-display-name!
  "Set the display name of the Field with `id`, returning the number updated."
  [id           :- ::lib.schema.id/field
   display-name :- :string]
  (t2/update! :model/Field id {:display_name display-name}))

(mu/defn insert-entity!
  "Insert the `model` `row` and return the inserted instance.

  Generic across models, so `row` is typed as a plain keyword-keyed map rather than a closed schema."
  [model :- [:or :keyword symbol?]
   row   :- [:map-of :keyword [:maybe :some]]]
  (t2/insert-returning-instance! model row))

(mu/defn insert-entity-returning-pk!
  "Insert the `model` `row` and return its primary key.

  Generic across models, so `row` is typed as a plain keyword-keyed map rather than a closed schema."
  [model :- [:or :keyword symbol?]
   row   :- [:map-of :keyword [:maybe :some]]]
  (t2/insert-returning-pk! model row))

(mu/defn insert-entities!
  "Insert the `model` `rows`, returning the number inserted."
  [model :- [:or :keyword symbol?]
   rows  :- [:sequential :map]]
  (t2/insert! model rows))

(mu/defn delete-entity!
  "Delete the `model` row with `id`, returning the number deleted."
  [model :- [:or :keyword symbol?]
   id    :- [:maybe [:or :int :string]]]
  (t2/delete! model id))

(mu/defn delete-entities-with-ids!
  "Delete the `model` rows whose `id-column` is one of `ids`, returning the number deleted."
  [model     :- [:or :keyword symbol?]
   id-column :- :keyword
   ids       :- [:sequential [:or :int :string]]]
  (t2/delete! model id-column [:in ids]))

(mu/defn delete-children!
  "Delete the `model` rows whose `parent-column` is `parent-id`, returning the number deleted."
  [model         :- [:or :keyword symbol?]
   parent-column :- :keyword
   parent-id     :- [:or :int :string]]
  (t2/delete! model parent-column parent-id))

(mu/defn delete-children-except!
  "Delete the `model` rows whose `parent-column` is `parent-id` and whose entity id is not one of `entity-ids`,
  returning the number deleted."
  [model         :- [:or :keyword symbol?]
   parent-column :- :keyword
   parent-id     :- [:or :int :string]
   entity-ids    :- [:sequential :string]]
  (t2/delete! model parent-column parent-id :entity_id [:not-in entity-ids]))

(mu/defn collection-paths-columns
  "The id, entity id, location, and name of every Collection."
  []
  (t2/select [:model/Collection :id :entity_id :location :name]))

(mu/defn dashboard-entity-ids-and-names
  "The entity id and name of every Dashboard."
  []
  (t2/select [:model/Dashboard :entity_id :name]))

(mu/defn document-entity-ids-and-names
  "The entity id and name of every Document."
  []
  (t2/select [:model/Document :entity_id :name]))

(mu/defn field-hierarchy-rows
  "The name and Table id of the Field with `field-id` and each of its ancestors, deepest first."
  [field-id :- ::lib.schema.id/field]
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

(mu/defn table-ref-columns
  "The id, Database id, name, and schema of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :id :db_id :name :schema] :id table-id))

(mu/defn database-name
  "The name of the Database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one-fn :name [:model/Database :id :name] :id database-id))

(mu/defn database-names
  "The names of every Database."
  []
  (t2/select-fn-vec :name :model/Database))

(mu/defn database-id-by-name
  "The id of the Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one-fn :id :model/Database :name database-name))

(mu/defn table-id-by-name
  "The id of the Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [table-name  :- :string
   schema      :- [:maybe :string]
   database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :id :model/Table :name table-name :schema schema :db_id database-id))

(mu/defn insert-inactive-table!
  "Insert an inactive Table named `table-name` in `schema` of the Database with `database-id` and return its id."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/insert-returning-pk! :model/Table {:db_id  database-id
                                         :schema schema
                                         :name   table-name
                                         :active false}))

(mu/defn field-pk
  "The id of the Field named `field-name` under `parent-id` in the Table with `table-id`, or nil."
  [table-id   :- ::lib.schema.id/table
   field-name :- :string
   parent-id  :- [:maybe ms/PositiveInt]]
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

(mu/defn field-pk-in-path
  "The id of the Field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil."
  [table-id    :- ::lib.schema.id/table
   field-names :- [:sequential :string]]
  (when (seq field-names)
    (t2/select-one-pk :model/Field (field-in-path-query table-id field-names))))

(mu/defn field-in-path
  "The Field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil."
  [table-id    :- [:maybe ::lib.schema.id/table]
   field-names :- [:sequential :string]]
  (when (seq field-names)
    (t2/select-one :model/Field (field-in-path-query table-id field-names))))

(mu/defn insert-inactive-field!
  "Insert an inactive, untyped Field named `field-name` under `parent-id` in the Table with `table-id` and return its
  id."
  [table-id   :- ::lib.schema.id/table
   parent-id  :- [:maybe ms/PositiveInt]
   field-name :- :string]
  (t2/insert-returning-pk! :model/Field {:table_id      table-id
                                         :parent_id     parent-id
                                         :name          field-name
                                         :active        false
                                         :base_type     :type/*
                                         :database_type "NULL"}))

(mu/defn metadata-tables
  "The `:metadata/table` rows named `table-name` in `schema` of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select :metadata/table :db_id database-id :schema schema :name table-name))

(mu/defn card-serdes-columns
  "The id, entity id, Collection id, Database id, and schema of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :id :entity_id :collection_id :database_id :card_schema] :id card-id))

(mu/defn measure-serdes-columns
  "The id, entity id, and Table id of the Measure with `measure-id`, or nil."
  [measure-id :- ::lib.schema.id/measure]
  (t2/select-one [:model/Measure :id :entity_id :table_id] :id measure-id))

(mu/defn segment-serdes-columns
  "The id, entity id, and Table id of the Segment with `segment-id`, or nil."
  [segment-id :- ::lib.schema.id/segment]
  (t2/select-one [:model/Segment :id :entity_id :table_id] :id segment-id))

(mu/defn worktree-remapping-source-entity-id
  "The source entity id -- the one the branch knows the entity by -- that the remote-sync worktree with `worktree-id`
  maps the `model-name` row with `local-entity-id` to, or nil."
  [worktree-id     :- ::lib.schema.id/worktree
   model-name      :- :string
   local-entity-id :- :string]
  (t2/select-one-fn :source_entity_id :model/WorktreeRemapping
                    :worktree_id     worktree-id
                    :type            model-name
                    :local_entity_id local-entity-id))

(mu/defn worktree-remapping-local-entity-id
  "The entity id of the `model-name` row the remote-sync worktree with `worktree-id` checked out for the branch's
  `source-entity-id`, or nil."
  [worktree-id      :- ::lib.schema.id/worktree
   model-name       :- :string
   source-entity-id :- :string]
  (t2/select-one-fn :local_entity_id :model/WorktreeRemapping
                    :worktree_id      worktree-id
                    :type             model-name
                    :source_entity_id source-entity-id))

(mu/defn worktree-remapping-source->local
  "A map of source entity id to local entity id for the `model-name` rows the remote-sync worktree with `worktree-id`
  checked out for `source-entity-ids`."
  [worktree-id       :- ::lib.schema.id/worktree
   model-name        :- :string
   source-entity-ids :- [:sequential :string]]
  (t2/select-fn->fn :source_entity_id :local_entity_id
                    :model/WorktreeRemapping
                    :worktree_id      worktree-id
                    :type             model-name
                    :source_entity_id [:in source-entity-ids]))

(mu/defn worktree-remapping-source-exists?
  "Whether `source-entity-id` is already a source entity id of a `model-name` remapping in the remote-sync worktree
  with `worktree-id`."
  [worktree-id      :- ::lib.schema.id/worktree
   model-name       :- :string
   source-entity-id :- :string]
  (t2/exists? :model/WorktreeRemapping
              :worktree_id      worktree-id
              :type             model-name
              :source_entity_id source-entity-id))

(mu/defn insert-worktree-remapping!
  "Record that the remote-sync worktree with `worktree-id` holds the branch's `model-name` entity `source-entity-id`
  as the local row with `local-entity-id`."
  [worktree-id      :- ::lib.schema.id/worktree
   model-name       :- :string
   source-entity-id :- :string
   local-entity-id  :- :string]
  (t2/insert! :model/WorktreeRemapping
              {:worktree_id      worktree-id
               :type             model-name
               :source_entity_id source-entity-id
               :local_entity_id  local-entity-id}))

(mu/defn entity-by-own-pk
  "The `model` row identified by `id`, using whatever column is that model's own primary key."
  [model :- [:or :keyword symbol?]
   id    :- [:or :int :string]]
  (t2/select-one model (first (t2/primary-keys model)) id))
