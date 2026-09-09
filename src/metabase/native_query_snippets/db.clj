(ns metabase.native-query-snippets.db
  "Application database queries for the native query snippets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.serialization :as serdes]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn snippets-by-archived
  "The NativeQuerySnippets whose archived flag is `archived` in the remote-sync worktree `worktree-id` (nil for the
  main app), in case-insensitive name order."
  ([archived :- :boolean]
   (snippets-by-archived archived nil))
  ([archived    :- :boolean
    worktree-id :- [:maybe ::lib.schema.id/worktree]]
   (t2/select :model/NativeQuerySnippet :archived archived :worktree_id worktree-id {:order-by [[:%lower.name :asc]]})))

(mu/defn snippet
  "The NativeQuerySnippet with `id`, or nil."
  [id :- ::lib.schema.id/native-query-snippet]
  (t2/select-one :model/NativeQuerySnippet :id id))

(mu/defn snippet-name-exists?
  "Whether a NativeQuerySnippet named `snippet-name` exists in the remote-sync worktree `worktree-id` (nil for the
  main app). Snippet names are unique per worktree, not globally."
  ([snippet-name :- :string]
   (snippet-name-exists? snippet-name nil))
  ([snippet-name :- :string
    worktree-id  :- [:maybe ::lib.schema.id/worktree]]
   (t2/exists? :model/NativeQuerySnippet :name snippet-name :worktree_id worktree-id)))

(mu/defn other-snippet-with-name-exists?
  "Whether a NativeQuerySnippet named `snippet-name` with an entity id other than `entity-id` exists in the
  remote-sync worktree `worktree-id` (nil for the main app)."
  ([snippet-name :- :string
    entity-id    :- :string]
   (other-snippet-with-name-exists? snippet-name entity-id nil))
  ([snippet-name :- :string
    entity-id    :- :string
    worktree-id  :- [:maybe ::lib.schema.id/worktree]]
   (t2/exists? :model/NativeQuerySnippet :name snippet-name :entity_id [:!= entity-id] :worktree_id worktree-id)))

(mu/defn insert-snippet!
  "Insert the NativeQuerySnippet `row` and return the inserted instance."
  [row :- ::native-query-snippets.schema/native-query-snippet.update]
  (t2/insert-returning-instance! :model/NativeQuerySnippet row))

(mu/defn update-snippet!
  "Apply `changes` to the NativeQuerySnippet with `id`."
  [id :- ::lib.schema.id/native-query-snippet
   changes :- (mut/select-keys ::native-query-snippets.schema/native-query-snippet.update [:description :collection_id :archived :content :name])]
  (t2/update! :model/NativeQuerySnippet id changes))

(mu/defn snippet-id-by-name
  "The id of the NativeQuerySnippet named `snippet-name` in the remote-sync worktree `worktree-id` (nil for the main
  app), or nil."
  ([snippet-name :- :string]
   (snippet-id-by-name snippet-name nil))
  ([snippet-name :- :string
    worktree-id  :- [:maybe ::lib.schema.id/worktree]]
   (t2/select-one-fn :id :model/NativeQuerySnippet :name snippet-name :worktree_id worktree-id)))

(mu/defn snippet-collection-id
  "The Collection id of the NativeQuerySnippet with `id`, or nil."
  [id :- ::lib.schema.id/native-query-snippet]
  (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id id))

(mu/defn exportable-snippets
  "A reducible of the NativeQuerySnippets to export via serdes: unarchived when `skip-archived?`, and either in one of
  `collection-ids`, uncollected when `include-root?`, or — when `filter-column` is given — one of the rows whose
  `filter-column` is in `filter-ids`, which widens the export scope past the collections (e.g. a snippet exported as
  a Card dependency, regardless of collection). In stable export order."
  [collection-ids :- [:maybe [:sequential ::lib.schema.id/collection]]
   include-root?  :- :boolean
   skip-archived? :- [:maybe :boolean]
   filter-column  :- [:maybe :keyword]
   filter-ids     :- [:maybe [:sequential [:maybe [:or :int :string]]]]]
  (t2/reducible-select :model/NativeQuerySnippet
                       (cond-> {:where    [:and
                                           (when skip-archived? [:not :archived])
                                           [:or
                                            (when (seq collection-ids) [:in :collection_id collection-ids])
                                            (when include-root? [:= :collection_id nil])]]
                                :order-by serdes/stable-storage-order}
                         filter-column (sql.helpers/where :or [:in filter-column filter-ids]))))
