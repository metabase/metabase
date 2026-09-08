(ns metabase.native-query-snippets.db
  "Application database queries for the native query snippets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn snippets-by-archived :- [:sequential (ms/InstanceOf :model/NativeQuerySnippet)]
  "The NativeQuerySnippets whose archived flag is `archived`, in case-insensitive name order."
  [archived :- :boolean]
  (t2/select :model/NativeQuerySnippet :archived archived {:order-by [[:%lower.name :asc]]}))

(mu/defn snippet :- [:maybe (ms/InstanceOf :model/NativeQuerySnippet)]
  "The NativeQuerySnippet with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/NativeQuerySnippet :id id))

(mu/defn snippet-name-exists? :- :boolean
  "Whether a NativeQuerySnippet named `snippet-name` exists."
  [snippet-name :- :string]
  (t2/exists? :model/NativeQuerySnippet :name snippet-name))

(mu/defn other-snippet-with-name-exists? :- :boolean
  "Whether a NativeQuerySnippet named `snippet-name` with an entity id other than `entity-id` exists."
  [snippet-name :- :string
   entity-id :- :string]
  (t2/exists? :model/NativeQuerySnippet :name snippet-name :entity_id [:!= entity-id]))

(mu/defn insert-snippet! :- (ms/InstanceOf :model/NativeQuerySnippet)
  "Insert the NativeQuerySnippet `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:id {:optional true} :any]
           [:name {:optional true} :any]
           [:description {:optional true} :any]
           [:content {:optional true} :any]
           [:creator_id {:optional true} :any]
           [:archived {:optional true} :any]
           [:created_at {:optional true} :any]
           [:updated_at {:optional true} :any]
           [:collection_id {:optional true} :any]
           [:entity_id {:optional true} :any]
           [:template_tags {:optional true} :any]]]
  (t2/insert-returning-instance! :model/NativeQuerySnippet row))

(mu/defn update-snippet! :- :int
  "Apply `changes` to the NativeQuerySnippet with `id`."
  [id :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:description {:optional true} [:maybe :string]]
               [:collection_id {:optional true} [:maybe ms/PositiveInt]]
               [:archived {:optional true} :boolean]
               [:content {:optional true} :string]
               [:name {:optional true} :string]]]
  (t2/update! :model/NativeQuerySnippet id changes))

(mu/defn snippet-id-by-name :- [:maybe ms/PositiveInt]
  "The id of the NativeQuerySnippet named `snippet-name`, or nil."
  [snippet-name :- :string]
  (t2/select-one-fn :id :model/NativeQuerySnippet :name snippet-name))

(mu/defn snippet-collection-id :- [:maybe ms/PositiveInt]
  "The Collection id of the NativeQuerySnippet with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id id))

(mu/defn exportable-snippets
  "A reducible of the NativeQuerySnippets to export via serdes: unarchived when `skip-archived?`, and either
  in one of `collection-ids`, uncollected when `include-root?`, or matching the serdes-supplied
  `extra-condition` — an additional condition the caller widens the export scope with (e.g. also export as
  a Card dependency, regardless of collection), or nil — in stable export order."
  [collection-ids :- [:maybe [:seqable ms/PositiveInt]]
   include-root? :- :boolean
   skip-archived? :- [:maybe :boolean]
   extra-condition :- [:maybe :any]]
  (t2/reducible-select :model/NativeQuerySnippet
                       (cond-> {:where    [:and
                                           (when skip-archived? [:not :archived])
                                           [:or
                                            (when (seq collection-ids) [:in :collection_id collection-ids])
                                            (when include-root? [:= :collection_id nil])]]
                                :order-by serdes/stable-storage-order}
                         extra-condition (sql.helpers/where :or extra-condition))))
