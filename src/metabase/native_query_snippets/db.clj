(ns metabase.native-query-snippets.db
  "Application database queries for the native query snippets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the native-query-snippets-only section at
  the bottom of this namespace."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.serialization :as serdes]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which NativeQuerySnippets a query applies to. Keys mirror the columns of `native_query_snippet`: a scalar matches
  that value and a set matches any of its values."
  [:map {:closed true}
   [:id            {:optional true} [:or ::lib.schema.id/native-query-snippet [:set ::lib.schema.id/native-query-snippet]]]
   [:name          {:optional true} :string]
   [:archived      {:optional true} :boolean]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::native-query-snippets.schema/native-query-snippet.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::native-query-snippets.schema/native-query-snippet.column
                                              [:tuple ::native-query-snippets.schema/native-query-snippet.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private lower-columns
  "Text columns ordered case-insensitively, so `Zebra` does not sort ahead of `apple`."
  #{:name})

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/NativeQuerySnippet columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts {:lower-columns lower-columns}))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-snippets :- [:sequential ::native-query-snippets.schema/native-query-snippet.partial]
  "The NativeQuerySnippets matching `opts`."
  ([]
   (select-snippets nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-snippet :- [:maybe ::native-query-snippets.schema/native-query-snippet.partial]
  "The first NativeQuerySnippet matching `opts`, or nil."
  ([]
   (select-one-snippet nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn snippet-exists? :- :boolean
  "Whether a NativeQuerySnippet matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (apply t2/exists? :model/NativeQuerySnippet (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-snippet! :- ::native-query-snippets.schema/native-query-snippet
  "Insert the NativeQuerySnippet `row` and return the inserted instance."
  [row :- ::native-query-snippets.schema/native-query-snippet.create]
  (t2/insert-returning-instance! :model/NativeQuerySnippet row))

(mu/defn update-snippets! :- :int
  "Apply `changes` to every NativeQuerySnippet matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::native-query-snippets.schema/native-query-snippet.update]
  (apply t2/update! :model/NativeQuerySnippet (conj (->kv-args opts) changes)))

;;; ------------------------------- Queries used only by the native-query-snippets module -------------------------------

(mu/defn other-snippet-with-name-exists?
  "Whether a NativeQuerySnippet named `snippet-name` with an entity id other than `entity-id` exists."
  [snippet-name :- :string
   entity-id    :- :string]
  (t2/exists? :model/NativeQuerySnippet :name snippet-name :entity_id [:!= entity-id]))

(mu/defn reducible-select-snippets-for-serdes
  "A reducible of the NativeQuerySnippets to export via serdes: unarchived when `skip-archived?`, and either in one
  of `collection-ids`, uncollected when `include-root?`, or — when `filter-column` is given — one of the rows whose
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
