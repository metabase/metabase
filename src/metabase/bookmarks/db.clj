(ns metabase.bookmarks.db
  "Application database queries for the bookmarks module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::card-bookmark-opts]] and its siblings; queries that do not fit them live in the
  bookmarks-only section at the bottom of this namespace."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.bookmarks.schema :as bookmarks.schema]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- CardBookmark -------------------------------------------------

(mr/def ::card-bookmark-filters
  "Which CardBookmarks a query applies to. Keys mirror the columns of `card_bookmark`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:user_id {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:card_id {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]])

(mr/def ::card-bookmark-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::card-bookmark-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::bookmarks.schema/card-bookmark.column]]
    [:order-by {:optional true} [:sequential ::bookmarks.schema/card-bookmark.column]]]])

;;; ---------------------------------------------- DashboardBookmark ----------------------------------------------

(mr/def ::dashboard-bookmark-filters
  "Which DashboardBookmarks a query applies to. Keys mirror the columns of `dashboard_bookmark`: a scalar matches
  that value and a set matches any of its values."
  [:map {:closed true}
   [:user_id      {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:dashboard_id {:optional true} [:or ::lib.schema.id/dashboard [:set ::lib.schema.id/dashboard]]]])

(mr/def ::dashboard-bookmark-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::dashboard-bookmark-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::bookmarks.schema/dashboard-bookmark.column]]
    [:order-by {:optional true} [:sequential ::bookmarks.schema/dashboard-bookmark.column]]]])

;;; ---------------------------------------------- CollectionBookmark ----------------------------------------------

(mr/def ::collection-bookmark-filters
  "Which CollectionBookmarks a query applies to. Keys mirror the columns of `collection_bookmark`: a scalar matches
  that value and a set matches any of its values."
  [:map {:closed true}
   [:user_id       {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:collection_id {:optional true} [:or ::lib.schema.id/collection [:set ::lib.schema.id/collection]]]])

(mr/def ::collection-bookmark-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::collection-bookmark-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::bookmarks.schema/collection-bookmark.column]]
    [:order-by {:optional true} [:sequential ::bookmarks.schema/collection-bookmark.column]]]])

;;; ----------------------------------------------- DocumentBookmark -----------------------------------------------

(mr/def ::document-bookmark-filters
  "Which DocumentBookmarks a query applies to. Keys mirror the columns of `document_bookmark`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:user_id     {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:document_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::document-bookmark-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::document-bookmark-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::bookmarks.schema/document-bookmark.column]]
    [:order-by {:optional true} [:sequential ::bookmarks.schema/document-bookmark.column]]]])

;;; ---------------------------------------------- ExplorationBookmark ----------------------------------------------

(mr/def ::exploration-bookmark-filters
  "Which ExplorationBookmarks a query applies to. Keys mirror the columns of `exploration_bookmark`: a scalar
  matches that value and a set matches any of its values."
  [:map {:closed true}
   [:user_id        {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:exploration_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::exploration-bookmark-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::exploration-bookmark-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::bookmarks.schema/exploration-bookmark.column]]
    [:order-by {:optional true} [:sequential ::bookmarks.schema/exploration-bookmark.column]]]])

;;; ----------------------------------------------- BookmarkOrdering -----------------------------------------------

(mr/def ::bookmark-ordering-filters
  "Which BookmarkOrderings a query applies to. Keys mirror the columns of `bookmark_ordering`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:user_id {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]])

(mr/def ::bookmark-ordering-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::bookmark-ordering-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::bookmarks.schema/bookmark-ordering.column]]
    [:order-by {:optional true} [:sequential ::bookmarks.schema/bookmark-ordering.column]]]])

;;; ------------------------------------------------------ Reads ------------------------------------------------------

(mu/defn card-bookmark-exists? :- :boolean
  "Whether a CardBookmark matching `opts` exists."
  [opts :- [:maybe ::card-bookmark-opts]]
  (apply t2/exists? :model/CardBookmark (->args opts)))

(mu/defn dashboard-bookmark-exists? :- :boolean
  "Whether a DashboardBookmark matching `opts` exists."
  [opts :- [:maybe ::dashboard-bookmark-opts]]
  (apply t2/exists? :model/DashboardBookmark (->args opts)))

(mu/defn collection-bookmark-exists? :- :boolean
  "Whether a CollectionBookmark matching `opts` exists."
  [opts :- [:maybe ::collection-bookmark-opts]]
  (apply t2/exists? :model/CollectionBookmark (->args opts)))

(mu/defn document-bookmark-exists? :- :boolean
  "Whether a DocumentBookmark matching `opts` exists."
  [opts :- [:maybe ::document-bookmark-opts]]
  (apply t2/exists? :model/DocumentBookmark (->args opts)))

(mu/defn exploration-bookmark-exists? :- :boolean
  "Whether an ExplorationBookmark matching `opts` exists."
  [opts :- [:maybe ::exploration-bookmark-opts]]
  (apply t2/exists? :model/ExplorationBookmark (->args opts)))

;;; ------------------------------------------------------ Writes ------------------------------------------------------

(mu/defn delete-card-bookmarks! :- :int
  "Delete every CardBookmark matching `opts`, returning the number deleted."
  [opts :- [:maybe ::card-bookmark-opts]]
  (apply t2/delete! :model/CardBookmark (->args opts)))

(mu/defn delete-dashboard-bookmarks! :- :int
  "Delete every DashboardBookmark matching `opts`, returning the number deleted."
  [opts :- [:maybe ::dashboard-bookmark-opts]]
  (apply t2/delete! :model/DashboardBookmark (->args opts)))

(mu/defn delete-collection-bookmarks! :- :int
  "Delete every CollectionBookmark matching `opts`, returning the number deleted."
  [opts :- [:maybe ::collection-bookmark-opts]]
  (apply t2/delete! :model/CollectionBookmark (->args opts)))

(mu/defn delete-document-bookmarks! :- :int
  "Delete every DocumentBookmark matching `opts`, returning the number deleted."
  [opts :- [:maybe ::document-bookmark-opts]]
  (apply t2/delete! :model/DocumentBookmark (->args opts)))

(mu/defn delete-exploration-bookmarks! :- :int
  "Delete every ExplorationBookmark matching `opts`, returning the number deleted."
  [opts :- [:maybe ::exploration-bookmark-opts]]
  (apply t2/delete! :model/ExplorationBookmark (->args opts)))

(mu/defn delete-bookmark-orderings! :- :int
  "Delete every BookmarkOrdering matching `opts`, returning the number deleted."
  [opts :- [:maybe ::bookmark-ordering-opts]]
  (apply t2/delete! :model/BookmarkOrdering (->args opts)))

(mu/defn insert-bookmark-orderings! :- [:maybe :int]
  "Insert the BookmarkOrdering `rows`."
  [rows :- [:sequential (mut/select-keys ::bookmarks.schema/bookmark-ordering.update [:user_id :type :item_id :ordering])]]
  (t2/insert! :model/BookmarkOrdering rows))

;;; ------------------------------- Queries used only by the bookmarks module -------------------------------

;;; Generic (model, id, user-id) tier. The REST API and the MCP `bookmark_content` tool both take the
;;; model as a runtime string, so they dispatch here rather than naming a per-model fn at the call site.

(defn- unknown-bookmark-model!
  "Throws a consistent error for a `model` string none of the generic (model, id, user-id) fns recognize."
  [model]
  (throw (ex-info (str "Unknown bookmarkable model: " (pr-str model)) {:model model})))

(defn bookmark-exists?
  "Whether the User with `user-id` has a bookmark on (`model`, `id`). `model` is a bookmarkable model string.
  Throws for an unrecognized `model`."
  [model id user-id]
  (case model
    "card"        (card-bookmark-exists? {:card_id id :user_id user-id})
    "dashboard"   (dashboard-bookmark-exists? {:dashboard_id id :user_id user-id})
    "collection"  (collection-bookmark-exists? {:collection_id id :user_id user-id})
    "document"    (document-bookmark-exists? {:document_id id :user_id user-id})
    "exploration" (exploration-bookmark-exists? {:exploration_id id :user_id user-id})
    (unknown-bookmark-model! model)))

(def ^:private model->bookmark-model+item-key
  {"card"        [:model/CardBookmark        :card_id]
   "dashboard"   [:model/DashboardBookmark   :dashboard_id]
   "collection"  [:model/CollectionBookmark  :collection_id]
   "document"    [:model/DocumentBookmark    :document_id]
   "exploration" [:model/ExplorationBookmark :exploration_id]})

(defn insert-bookmark!
  "Give `user-id` a bookmark on (`model`, `id`) and return it - the existing one when there already is one.
  Does not read-check the item; callers do. Throws for an unrecognized `model`."
  [model id user-id]
  (let [[bookmark-model item-key] (or (model->bookmark-model+item-key model) (unknown-bookmark-model! model))]
    ;; select-or-insert! rather than insert!: concurrent callers both get the state they asked for instead of
    ;; one losing to the (user_id, item) unique constraint.
    (mdb/select-or-insert! bookmark-model {item-key id :user_id user-id} (constantly {}))))

(defn delete-bookmark!
  "Delete `user-id`'s bookmark on (`model`, `id`). No-op when there is none. Throws for an unrecognized `model`."
  [model id user-id]
  (case model
    "card"        (delete-card-bookmarks! {:card_id id :user_id user-id})
    "dashboard"   (delete-dashboard-bookmarks! {:dashboard_id id :user_id user-id})
    "collection"  (delete-collection-bookmarks! {:collection_id id :user_id user-id})
    "document"    (delete-document-bookmarks! {:document_id id :user_id user-id})
    "exploration" (delete-exploration-bookmarks! {:exploration_id id :user_id user-id})
    (unknown-bookmark-model! model)))

(defn- bookmarks-union-query
  [user-id]
  (let [as-null      (when (= (mdb/db-type) :postgres) (h2x/->integer nil))
        base-queries [^:allow-subquery {:select [:card_id
                                                 [as-null :dashboard_id]
                                                 [as-null :collection_id]
                                                 [as-null :document_id]
                                                 [as-null :exploration_id]
                                                 [:card_id :item_id]
                                                 [(h2x/literal "card") :type]
                                                 :created_at]
                                        :from   [:card_bookmark]
                                        :where  [:= :user_id user-id]}
                      ^:allow-subquery {:select [[as-null :card_id]
                                                 :dashboard_id
                                                 [as-null :collection_id]
                                                 [as-null :document_id]
                                                 [as-null :exploration_id]
                                                 [:dashboard_id :item_id]
                                                 [(h2x/literal "dashboard") :type]
                                                 :created_at]
                                        :from   [:dashboard_bookmark]
                                        :where  [:= :user_id user-id]}
                      ^:allow-subquery {:select [[as-null :card_id]
                                                 [as-null :dashboard_id]
                                                 :collection_id
                                                 [as-null :document_id]
                                                 [as-null :exploration_id]
                                                 [:collection_id :item_id]
                                                 [(h2x/literal "collection") :type]
                                                 :created_at]
                                        :from   [:collection_bookmark]
                                        :where  [:= :user_id user-id]}
                      ^:allow-subquery {:select [[as-null :card_id]
                                                 [as-null :dashboard_id]
                                                 [as-null :collection_id]
                                                 :document_id
                                                 [as-null :exploration_id]
                                                 [:document_id :item_id]
                                                 [(h2x/literal "document") :type]
                                                 :created_at]
                                        :from   [:document_bookmark]
                                        :where  [:= :user_id user-id]}]]
    ;; While explorations are disabled, `exploration_bookmark` is left out of the union so residue rows never reach
    ;; the listing. The `exploration_id` column stays so the joins in [[bookmark-rows-for-user]] resolve.
    {:union-all base-queries}))

(mr/def ::bookmark-row
  "A bookmark row left joined against the Card, Dashboard, Collection, Document, and Exploration tables."
  [:map {:closed true}
   [:created_at                (ms/InstanceOfClass java.time.temporal.Temporal)]
   [:type                      [:enum "card" "collection" "dashboard" "document" "exploration"]]
   [:item_id                   ms/PositiveInt]
   [:report_card.name          [:maybe :string]]
   [:report_card.card_type     [:maybe :string]]
   [:report_card.display       [:maybe :string]]
   [:report_card.description   [:maybe :string]]
   [:report_card.archived      [:maybe :boolean]]
   [:report_dashboard.name        [:maybe :string]]
   [:report_dashboard.description [:maybe :string]]
   [:report_dashboard.archived    [:maybe :boolean]]
   [:collection.name              [:maybe :string]]
   [:collection.authority_level   [:maybe :string]]
   [:collection.is_remote_synced  [:maybe :boolean]]
   [:collection.description       [:maybe :string]]
   [:collection.archived          [:maybe :boolean]]
   [:document.name     [:maybe :string]]
   [:document.archived [:maybe :boolean]]
   [:exploration.name        [:maybe :string]]
   [:exploration.description [:maybe :string]]
   [:exploration.archived    [:maybe :boolean]]])

(mu/defn bookmark-rows-for-user :- [:sequential ::bookmark-row]
  "The bookmarks of the User with `user-id`, joined against the Card, Dashboard, Collection, Document, and Exploration
  tables, excluding archived items, and filtered to items the target `user-scope` (a map of `:current-user-id` and
  `:is-superuser?`) can still read (re-checked at read time rather than trusted from when the bookmark was created,
  see SEC-669). The `collection_id` join uses [[h2x/identifier]] to work around
  https://github.com/seancorfield/honeysql/issues/450."
  [user-id    :- ::lib.schema.id/user
   user-scope :- [:map {:closed true}
                  [:current-user-id ::lib.schema.id/user]
                  [:is-superuser?   :boolean]]]
  (let [select-fields    [[:bookmark.created_at :created_at]
                          [:bookmark.type              :type]
                          [:bookmark.item_id           :item_id]
                          [:card.name                  :report_card.name]
                          [:card.type                  :report_card.card_type]
                          [:card.display               :report_card.display]
                          [:card.description           :report_card.description]
                          [:card.archived              :report_card.archived]
                          [:dashboard.name             :report_dashboard.name]
                          [:dashboard.description      :report_dashboard.description]
                          [:dashboard.archived         :report_dashboard.archived]
                          [:collection.name              :collection.name]
                          [:collection.authority_level   :collection.authority_level]
                          [:collection.is_remote_synced  :collection.is_remote_synced]
                          [:collection.description       :collection.description]
                          [:collection.archived          :collection.archived]
                          [:document.name :document.name]
                          [:document.archived :document.archived]
                          [:exploration.name        :exploration.name]
                          [:exploration.description :exploration.description]
                          [:exploration.archived    :exploration.archived]]
        left-joins       [[:report_card :card] [:= :bookmark.card_id :card.id]
                          [:report_dashboard :dashboard]          [:= :bookmark.dashboard_id :dashboard.id]
                          [:collection :collection]               [:in :collection.id [(h2x/identifier :field :bookmark :collection_id)
                                                                                       (h2x/identifier :field :dashboard :collection_id)]]
                          [:bookmark_ordering :bookmark_ordering] [:and
                                                                   [:= :bookmark_ordering.user_id user-id]
                                                                   [:= :bookmark_ordering.type :bookmark.type]
                                                                   [:= :bookmark_ordering.item_id :bookmark.item_id]]
                          [:document :document] [:= :bookmark.document_id :document.id]
                          [:exploration :exploration] [:= :bookmark.exploration_id :exploration.id]]
        where-conditions (into [:and]
                               (for [table [:card :dashboard :collection :document :exploration]
                                     :let  [field (keyword (str (name table) "." "archived"))]]
                                 [:or [:= field false] [:= field nil]]))
        visible?         (fn [collection-id-field]
                           (collection/visible-collection-filter-clause collection-id-field
                                                                        {:cte-name :visible_collection_ids}
                                                                        user-scope))
        readable-conditions [:or
                             [:and [:= :bookmark.type (h2x/literal "card")]       (visible? :card.collection_id)]
                             [:and [:= :bookmark.type (h2x/literal "dashboard")]  (visible? :dashboard.collection_id)]
                             [:and [:= :bookmark.type (h2x/literal "collection")] (visible? :collection.id)]
                             [:and [:= :bookmark.type (h2x/literal "document")]   (visible? :document.collection_id)]
                             [:and [:= :bookmark.type (h2x/literal "exploration")] (visible? :exploration.collection_id)]]]
    (mdb/query
     {:with [[:visible_collection_ids (collection/visible-collection-query
                                       {:include-archived-items :all
                                        :permission-level        :read}
                                       user-scope)]]
      :select select-fields
      :from [[(bookmarks-union-query user-id) :bookmark]]
      :left-join left-joins
      :where [:and where-conditions readable-conditions]
      :order-by  [[:bookmark_ordering.ordering (case (mdb/db-type)
                                                 ;; NULLS LAST is not supported by MySQL, but this is default
                                                 ;; behavior for MySQL anyway
                                                 (:postgres :h2) :asc-nulls-last
                                                 :mysql          :asc)]
                  [:created_at :desc]]})))
