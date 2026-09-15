(ns metabase.models.db
  "Application database queries for the models module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (the model machinery still uses
  `toucan2.core`)."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
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

(def ^:private model-row-schema
  "The literal registry keyword of the row/update schema of each model the generic entity helpers below are called
  with (a literal keyword, not a `require`, to avoid a dependency cycle with every module that owns one of these
  models)."
  {:model/Action                   :metabase.actions.schema/action.for-update
   :model/Card                     :metabase.queries.schema/card.update
   :model/Channel                  :metabase.channel.schema/channel.update
   :model/ChannelTemplate          :metabase.channel.schema/channel-template.update
   :model/Collection               :metabase.collections.schema/collection.update
   :model/CustomVizPlugin          :metabase-enterprise.custom-viz-plugin.schema/custom-viz-plugin.update
   :model/Dashboard                :metabase.dashboards.schema/dashboard.update
   :model/DashboardCard            :metabase.dashboards.schema/dashboard-card.update
   :model/DashboardCardSeries      :metabase.dashboards.schema/dashboard-card-series.update
   :model/DashboardTab             :metabase.dashboards.schema/dashboard-tab.update
   :model/Database                 :metabase.warehouses.schema/database.update
   :model/Dimension                :metabase.warehouse-schema.schema/dimension.update
   :model/Document                 :metabase.documents.schema/document.update
   :model/EmbeddingTheme           :metabase.embedding.schema/embedding-theme.update
   :model/Exploration              :metabase.explorations.schema/exploration.update
   :model/Field                    :metabase.warehouse-schema.schema/field.update
   :model/FieldUserSettings        :metabase.warehouse-schema.schema/field-user-settings.update
   :model/FieldValues              :metabase.warehouse-schema.schema/field-values.update
   :model/Glossary                 :metabase.glossary.schema/glossary.update
   :model/HTTPAction               :metabase.actions.schema/httpaction.update
   :model/ImplicitAction           :metabase.actions.schema/implicit-action.update
   :model/Measure                  :metabase.measures.schema/measure.update
   :model/Metabot                  :metabase.metabot.schema/metabot.update
   :model/MetabotPrompt            :metabase.metabot.schema/metabot-prompt.update
   :model/NativeQuerySnippet       :metabase.native-query-snippets.schema/native-query-snippet.update
   :model/Notification             :metabase.notification.schema/notification.update
   :model/NotificationCard         :metabase.notification.schema/notification-card.update
   :model/NotificationHandler      :metabase.notification.schema/notification-handler.update
   :model/NotificationRecipient    :metabase.notification.schema/notification-recipient.update
   :model/NotificationSubscription :metabase.notification.schema/notification-subscription.update
   :model/OsiAiContext             :metabase.osi.schema/osi-ai-context.update
   :model/PythonLibrary            :metabase-enterprise.transforms-python.schema/python-library.update
   :model/QueryAction              :metabase.actions.schema/query-action.update
   :model/Segment                  :metabase.segments.schema/segment.update
   :model/Table                    :metabase.warehouse-schema.schema/table.update
   :model/TableIndex               :metabase.indexes.schema/table-index.update
   :model/Timeline                 :metabase.timeline.schema/timeline.update
   :model/TimelineEvent            :metabase.timeline.schema/timeline-event.update
   :model/Transform                :metabase.transforms.schema/transform.update
   :model/TransformJob             :metabase.transforms.schema/transform-job.update
   :model/TransformJobTransformTag :metabase.transforms.schema/transform-job-transform-tag.update
   :model/TransformTag             :metabase.transforms.schema/transform-tag.update
   :model/TransformTransformTag    :metabase.transforms.schema/transform-transform-tag.update})

(defn- model-schema-key [prefix model]
  (keyword "metabase.models.db" (str prefix "." (name model))))

(doseq [[model schema] model-row-schema]
  (mr/register! (model-schema-key "model-row" model)
                [:map {:closed true} [:model [:= model]] [:row schema]])
  (mr/register! (model-schema-key "model-rows" model)
                [:map {:closed true} [:model [:= model]] [:rows [:sequential schema]]]))

(mr/def ::unregistered-model-row
  "A row of a model not listed in [[model-row-schema]], such as the test-double models `metabase.models.util.spec-update`
  specs are tested with; its keys are that model's."
  [:map {:closed false, ::mr/deliberately-open true, :description "row of an unregistered model"}])

(mr/def ::model-row
  "A `{:model ..., :row ...}` pair naming one of the models the generic entity helpers below are called with, the
  row typed by that model's own update schema."
  (conj (into [:multi {:dispatch :model, :lazy-refs true}]
              (for [model (keys model-row-schema)]
                [model (model-schema-key "model-row" model)]))
        [::mc/default [:map {:closed true} [:model :keyword] [:row ::unregistered-model-row]]]))

(mr/def ::model-rows
  "Like `::model-row`, but for a batch of rows of the same model."
  (conj (into [:multi {:dispatch :model, :lazy-refs true}]
              (for [model (keys model-row-schema)]
                [model (model-schema-key "model-rows" model)]))
        [::mc/default [:map {:closed true} [:model :keyword] [:rows [:sequential ::unregistered-model-row]]]]))

(mr/def ::after-select-row
  "A row not yet run through its model's after-select, e.g. a stored revision snapshot whose keys older Metabase versions own."
  [:map {:closed false, ::mr/deliberately-open true,
         :description "shape depends on the model, hydration state, and revision history"}])

(def ^:private AfterSelectEntity
  "A `{:model ..., :row ...}` pair naming any model (including test-only ones derived from `:metabase/model`, and
  ones outside [[model-row-schema]]) and a row of arbitrary shape to run through its after-select machinery."
  [:map {:closed true}
   [:model [:or :keyword symbol?]]
   [:row ::after-select-row]])

(mu/defn after-select-via-identity-query
  "`entity`'s `:row` run through the after-select machinery of `entity`'s `:model`."
  [entity :- AfterSelectEntity]
  (t2/select-one (:model entity) (t2.identity-query/identity-query [(:row entity)])))

(mu/defn entities-reducible
  "A reducible of the `model` rows whose `filter-column` is one of `filter-ids` (every row when `filter-column` is
  nil), ordered ascending by `order-columns` (unordered when empty)."
  [model         :- [:or :keyword symbol?]
   filter-column :- [:maybe :keyword]
   filter-ids    :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   order-columns :- [:maybe [:sequential :keyword]]]
  (t2/reducible-select model (cond-> {}
                               filter-column       (assoc :where [:in filter-column filter-ids])
                               (seq order-columns) (assoc :order-by (mapv (fn [column] [column :asc]) order-columns)))))

(mu/defn entities-in-collections-reducible
  "A reducible of the `model` rows whose `:collection_id` is in `collection-set` (nil in the set counts as the root
  collection) and whose `filter-column` is one of `filter-ids` (unrestricted when `filter-column` is nil), ordered
  ascending by `order-columns` (unordered when empty)."
  [model          :- [:or :keyword symbol?]
   collection-set :- [:or [:set [:maybe ms/PositiveInt]] [:sequential [:maybe ms/PositiveInt]]]
   filter-column  :- [:maybe :keyword]
   filter-ids     :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   order-columns  :- [:maybe [:sequential :keyword]]]
  (t2/reducible-select model
                       (cond-> {:where [:and
                                        [:or
                                         [:in :collection_id collection-set]
                                         (when (some nil? collection-set)
                                           [:= :collection_id nil])]
                                        (when filter-column
                                          [:in filter-column filter-ids])]}
                         (seq order-columns) (assoc :order-by (mapv (fn [column] [column :asc]) order-columns)))))

(mu/defn update-entity!
  "Apply `entity`'s `:row` (a column diff) to `entity`'s `:model` row with `id`, returning the number updated."
  [id     :- [:or :int :string]
   entity :- ::model-row]
  (t2/update! (:model entity) id (:row entity)))

(mu/defn insert-entity!
  "Insert `entity`'s `:row` into `entity`'s `:model` and return the inserted instance."
  [entity :- ::model-row]
  (t2/insert-returning-instance! (:model entity) (:row entity)))

(mu/defn insert-entity-returning-pk!
  "Insert `entity`'s `:row` into `entity`'s `:model` and return its primary key."
  [entity :- ::model-row]
  (t2/insert-returning-pk! (:model entity) (:row entity)))

(mu/defn insert-entities!
  "Insert `entities`'s `:rows` into `entities`'s `:model`, returning the number inserted."
  [entities :- ::model-rows]
  (t2/insert! (:model entities) (:rows entities)))

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
                                ^:allow-subquery {:union-all [^:allow-subquery {:from   [(warehouse-schema-overlay/field-query {:alias :mf, :user-settings? false})]
                                                                                :select [:mf.id :mf.name :mf.parent_id :mf.table_id]
                                                                                :where  [:= :id field-id]}
                                                              ^:allow-subquery {:from   [(warehouse-schema-overlay/field-query {:alias :pf, :user-settings? false})]
                                                                                :select [:pf.id :pf.name :pf.parent_id :pf.table_id]
                                                                                :join   [[:parents :p] [:= :p.parent_id :pf.id]]}]}]]
              :from           [:parents]
              :select         [:name :table_id]}))

(mu/defn table-ref-columns
  "The id, Database id, name, and schema of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :id :db_id :name :schema] :id table-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

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
  (t2/select-one-fn :id :model/Table :name table-name :schema schema :db_id database-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

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
  (t2/select-one-pk :model/Field :table_id table-id :name field-name :parent_id parent-id {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

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
    (t2/select-one-pk :model/Field (assoc (field-in-path-query table-id field-names) :from [(warehouse-schema-overlay/field-query {:user-settings? false})]))))

(mu/defn field-in-path
  "The Field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil."
  [table-id    :- [:maybe ::lib.schema.id/table]
   field-names :- [:sequential :string]]
  (when (seq field-names)
    (t2/select-one :model/Field (assoc (field-in-path-query table-id field-names) :from [(warehouse-schema-overlay/field-query)]))))

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

(mu/defn timeline-ids-of-events
  "The distinct Timeline ids of the TimelineEvents with `event-ids`."
  [event-ids :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :timeline_id [:model/TimelineEvent :timeline_id] :id [:in event-ids]))

(mu/defn entity-by-own-pk
  "The `model` row identified by `id`, using whatever column is that model's own primary key."
  [model :- [:or :keyword symbol?]
   id    :- [:or :int :string]]
  (t2/select-one model (first (t2/primary-keys model)) id))
