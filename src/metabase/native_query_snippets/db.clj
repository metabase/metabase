(ns metabase.native-query-snippets.db
  "Application database queries for the native query snippets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

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

(mu/defn snippet-id-by-name
  "The id of the NativeQuerySnippet named `snippet-name`, or nil."
  [snippet-name :- :string]
  (t2/select-one-fn :id :model/NativeQuerySnippet :name snippet-name))

(mu/defn snippet-names-and-entity-ids
  "The name and entity id of the NativeQuerySnippets whose name starts with one of `snippet-names`."
  [snippet-names :- [:sequential :string]]
  (t2/select [:model/NativeQuerySnippet :name :entity_id]
             {:where (into [:or] (map (fn [n] [:like :name [:auto/param (str n "%")]])) snippet-names)}))
