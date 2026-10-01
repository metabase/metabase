(ns metabase.native-query-snippets.db
  "Application database queries for the native query snippets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The module is proof-gated, so the mutating functions take a proof from [[metabase.proof.core]] as their only
  argument."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.serialization :as serdes]
   [metabase.proof.core :as proof]
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

(mu/defn other-snippet-with-name-exists?
  "Whether a NativeQuerySnippet named `snippet-name` with an entity id other than `entity-id` exists."
  [snippet-name :- :string
   entity-id :- :string]
  (t2/exists? :model/NativeQuerySnippet :name snippet-name :entity_id [:!= entity-id]))

(def ^:private editable-columns
  "The columns a snippet's editors write."
  #{:name :content :description :collection_id :archived})

(defn insert-snippet!
  "Insert the NativeQuerySnippet row that `proof` covers (its editable columns and the creator) and return the inserted
  instance."
  [proof]
  (let [{:keys [changes]} (proof/verify proof {:model        :model/NativeQuerySnippet
                                               :operation    :create
                                               :subject-kind :none
                                               :columns      (conj editable-columns :creator_id)})]
    (t2/insert-returning-instance! :model/NativeQuerySnippet changes)))

(defn update-snippet!
  "Apply the change set that `proof` covers, over the editable columns, to the NativeQuerySnippet it names."
  [proof]
  (let [{:keys [subject changes]} (proof/verify proof {:model        :model/NativeQuerySnippet
                                                       :operation    :update
                                                       :subject-kind :id
                                                       :columns      editable-columns})]
    (t2/update! :model/NativeQuerySnippet subject changes)))

(mu/defn snippet-id-by-name
  "The id of the NativeQuerySnippet named `snippet-name`, or nil."
  [snippet-name :- :string]
  (t2/select-one-fn :id :model/NativeQuerySnippet :name snippet-name))

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

(defn apply-collection-cascade!
  "Apply to the NativeQuerySnippets what a Collection's write implies for them, under the cascade `proof` the collections module
  derived for this model (see `metabase.collections.core/contents-cascade-write`): set their archived flag, or delete
  them."
  [proof]
  (let [{:keys [operation subject changes]} (proof/verify proof {:model        :model/NativeQuerySnippet
                                                                 :operation    #{:update :delete}
                                                                 :subject-kind :where
                                                                 :columns      #{:archived}})]
    (case operation
      :update (t2/update! :model/NativeQuerySnippet (proof/where->conditions subject) changes)
      :delete (t2/delete! :model/NativeQuerySnippet {:where subject}))))
