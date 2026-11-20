(ns metabase.native-query-snippets.db
  "Application database queries for the native query snippets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.collections.listing :as collections.listing]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn synced-snippets-clause :- [:fn vector?]
  "The clause over the NativeQuerySnippet table aliased `alias` selecting the snippets remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (if (:include-archived? opts)
    [:= 1 1]
    [:= (u/qualified-key alias :archived) false]))

(mu/defn snippets-by-archived
  "The NativeQuerySnippets whose archived flag is `archived`, in case-insensitive name order."
  [archived :- :boolean]
  (t2/select :model/NativeQuerySnippet :archived archived {:order-by [[:%lower.name :asc]]}))

(mu/defn snippet
  "The NativeQuerySnippet with `id`, or nil."
  [id :- ::lib.schema.id/native-query-snippet]
  (t2/select-one :model/NativeQuerySnippet :id id))

(mu/defn snippet-name-exists?
  "Whether a NativeQuerySnippet named `snippet-name` exists."
  [snippet-name :- :string]
  (t2/exists? :model/NativeQuerySnippet :name snippet-name))

(mu/defn insert-snippet!
  "Insert the NativeQuerySnippet `row` and return the inserted instance."
  [row :- ::native-query-snippets.schema/native-query-snippet.update]
  (t2/insert-returning-instance! :model/NativeQuerySnippet row))

(mu/defn update-snippet!
  "Apply `changes` to the NativeQuerySnippet with `id`."
  [id :- ::lib.schema.id/native-query-snippet
   changes :- (mut/select-keys ::native-query-snippets.schema/native-query-snippet.update [:description :collection_id :archived :content :name])]
  (t2/update! :model/NativeQuerySnippet :id id changes))

(mu/defn snippet-ids-by-names :- [:map-of :string pos-int?]
  "The ids of the NativeQuerySnippets named one of `snippet-names`, by name."
  [snippet-names :- [:sequential :string]]
  (into {}
        (map (juxt :name :id))
        (t2/select [:model/NativeQuerySnippet :id :name] :name [:in snippet-names])))

(mu/defn snippet-names-and-entity-ids
  "The name and entity id of the NativeQuerySnippets whose name starts with one of `snippet-names`."
  [snippet-names :- [:sequential :string]]
  (t2/select [:model/NativeQuerySnippet :name :entity_id]
             {:where (into [:or] (map (fn [n] [:like :name [:auto/param (str n "%")]])) snippet-names)}))

(mu/defn synced-snippet-items :- [:sequential ::native-query-snippets.schema/native-query-snippet]
  "The NativeQuerySnippets with `ids`, with their Collection and its ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection :snippets)]
    (-> (t2/select [:model/NativeQuerySnippet :id :name :collection_id] :id [:in ids])
        (t2/hydrate [:collection :effective_ancestors])
        (->> (mapv #(collection.root/hydrate-root-collection % root))))))

(mu/defn dependency-snippet-items :- [:maybe :map]
  "The query of the NativeQuerySnippets the dependencies lists hold for `opts`, as `entity_id`, `name` and `location`:
  none for a sandboxed user or one who creates no query anywhere, else those in the snippet collections the user
  reads, without those in personal collections unless `:include-personal-collections?`, located by their collection."
  [{:keys [user-id include-archived include-personal-collections?] :as opts}
   :- :metabase.dependencies.items/items-opts]
  (when-not (or (perms/sandboxed-user?)
                (not (perms/user-has-highest-permission-anywhere? (perms/user-info user-id) :perms/create-queries)))
    (let [location (collections.listing/collection-location :collection :snippets)]
      {:select    [[:snippet.id :entity_id] [:snippet.name :name] [location :location]]
       :from      [[:native_query_snippet :snippet]]
       :left-join [:collection [:= :snippet.collection_id :collection.id]]
       :where     (into [:and]
                        (remove nil?)
                        [(collections.listing/visible-in-collections-clause :snippet opts include-archived :snippets)
                         (collections.listing/archived-clause :snippet include-archived)
                         (when-not include-personal-collections?
                           (collections.listing/outside-personal-collections-clause :snippet :collection))])})))

(defenterprise snippets-collection-children-query
  "Collection children query for snippets on OSS. Returns all snippets regardless of collection, because snippet
  collections are an EE feature."
  metabase-enterprise.snippet-collections.api.native-query-snippet
  [_collection {:keys [archived?]}]
  {:select [:id :name :entity_id [(h2x/literal "snippet") :model]]
   :from   [[:native_query_snippet :nqs]]
   :where  [:= :archived (boolean archived?)]})

(mu/defn collection-snippet-items :- [:maybe :map]
  "The query of the snippets in `collection` that the collection items listing of `opts` holds, nil when `opts`
  restrict the items to those created by a user, which snippets do not record."
  [collection                :- :map
   {:keys [created-by-id] :as opts} :- :map]
  (when (nil? created-by-id)
    (snippets-collection-children-query collection opts)))
