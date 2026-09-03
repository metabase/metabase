(ns metabase.native-query-snippets.db
  "Application database queries for the native query snippets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.models.serialization :as serdes]
   [toucan2.core :as t2]))

(defn snippets-by-archived
  "The NativeQuerySnippets whose archived flag is `archived`, in case-insensitive name order."
  [archived]
  (t2/select :model/NativeQuerySnippet :archived archived {:order-by [[:%lower.name :asc]]}))

(defn snippet
  "The NativeQuerySnippet with `id`, or nil."
  [id]
  (t2/select-one :model/NativeQuerySnippet :id id))

(defn snippet-name-exists?
  "Whether a NativeQuerySnippet named `snippet-name` exists."
  [snippet-name]
  (t2/exists? :model/NativeQuerySnippet :name snippet-name))

(defn other-snippet-with-name-exists?
  "Whether a NativeQuerySnippet named `snippet-name` with an entity id other than `entity-id` exists."
  [snippet-name entity-id]
  (t2/exists? :model/NativeQuerySnippet :name snippet-name :entity_id [:!= entity-id]))

(defn insert-snippet!
  "Insert the NativeQuerySnippet `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/NativeQuerySnippet row))

(defn update-snippet!
  "Apply `changes` to the NativeQuerySnippet with `id`."
  [id changes]
  (t2/update! :model/NativeQuerySnippet id changes))

(defn snippet-id-by-name
  "The id of the NativeQuerySnippet named `snippet-name`, or nil."
  [snippet-name]
  (t2/select-one-fn :id :model/NativeQuerySnippet :name snippet-name))

(defn snippet-collection-id
  "The Collection id of the NativeQuerySnippet with `id`, or nil."
  [id]
  (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id id))

(defn exportable-snippets
  "A reducible of the NativeQuerySnippets to export via serdes: unarchived when `skip-archived?`, and either
  in one of `collection-ids`, uncollected when `include-root?`, or matching the serdes-supplied
  `extra-condition` — an additional condition the caller widens the export scope with (e.g. also export as
  a Card dependency, regardless of collection), or nil — in stable export order."
  [collection-ids include-root? skip-archived? extra-condition]
  (t2/reducible-select :model/NativeQuerySnippet
                       (cond-> {:where    [:and
                                           (when skip-archived? [:not :archived])
                                           [:or
                                            (when (seq collection-ids) [:in :collection_id collection-ids])
                                            (when include-root? [:= :collection_id nil])]]
                                :order-by serdes/stable-storage-order}
                         extra-condition (sql.helpers/where :or extra-condition))))
