(ns metabase.bookmarks.db
  "Application database queries for the bookmarks module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.bookmarks.schema :as bookmarks.schema]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn card-bookmark-exists? :- :boolean
  "Whether the User with `user-id` has a CardBookmark for the Card with `card-id`."
  [card-id :- ::lib.schema.id/card
   user-id :- ::lib.schema.id/user]
  (t2/exists? :model/CardBookmark :card_id card-id :user_id user-id))

(mu/defn dashboard-bookmark-exists? :- :boolean
  "Whether the User with `user-id` has a DashboardBookmark for the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard
   user-id      :- ::lib.schema.id/user]
  (t2/exists? :model/DashboardBookmark :dashboard_id dashboard-id :user_id user-id))

(mu/defn collection-bookmark-exists? :- :boolean
  "Whether the User with `user-id` has a CollectionBookmark for the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection
   user-id       :- ::lib.schema.id/user]
  (t2/exists? :model/CollectionBookmark :collection_id collection-id :user_id user-id))

(mu/defn document-bookmark-exists? :- :boolean
  "Whether the User with `user-id` has a DocumentBookmark for the Document with `document-id`."
  [document-id :- ms/PositiveInt
   user-id     :- ::lib.schema.id/user]
  (t2/exists? :model/DocumentBookmark :document_id document-id :user_id user-id))

(mu/defn exploration-bookmark-exists? :- :boolean
  "Whether the User with `user-id` has an ExplorationBookmark for the Exploration with `exploration-id`."
  [exploration-id :- ms/PositiveInt
   user-id        :- ::lib.schema.id/user]
  (t2/exists? :model/ExplorationBookmark :exploration_id exploration-id :user_id user-id))

(mu/defn insert-card-bookmark! :- (mut/optional-keys ::bookmarks.schema/card-bookmark)
  "Insert a CardBookmark for the Card with `card-id` and the User with `user-id`, returning the inserted instance."
  [card-id :- ::lib.schema.id/card
   user-id :- ::lib.schema.id/user]
  (t2/insert-returning-instance! :model/CardBookmark {:card_id card-id :user_id user-id}))

(mu/defn insert-dashboard-bookmark! :- (mut/optional-keys ::bookmarks.schema/dashboard-bookmark)
  "Insert a DashboardBookmark for the Dashboard with `dashboard-id` and the User with `user-id`, returning the
  inserted instance."
  [dashboard-id :- ::lib.schema.id/dashboard
   user-id      :- ::lib.schema.id/user]
  (t2/insert-returning-instance! :model/DashboardBookmark {:dashboard_id dashboard-id :user_id user-id}))

(mu/defn insert-collection-bookmark! :- (mut/optional-keys ::bookmarks.schema/collection-bookmark)
  "Insert a CollectionBookmark for the Collection with `collection-id` and the User with `user-id`, returning the
  inserted instance."
  [collection-id :- ::lib.schema.id/collection
   user-id       :- ::lib.schema.id/user]
  (t2/insert-returning-instance! :model/CollectionBookmark {:collection_id collection-id :user_id user-id}))

(mu/defn insert-document-bookmark! :- (mut/optional-keys ::bookmarks.schema/document-bookmark)
  "Insert a DocumentBookmark for the Document with `document-id` and the User with `user-id`, returning the inserted
  instance."
  [document-id :- ms/PositiveInt
   user-id     :- ::lib.schema.id/user]
  (t2/insert-returning-instance! :model/DocumentBookmark {:document_id document-id :user_id user-id}))

(mu/defn insert-exploration-bookmark! :- (mut/optional-keys ::bookmarks.schema/exploration-bookmark)
  "Insert an ExplorationBookmark for the Exploration with `exploration-id` and the User with `user-id`, returning the
  inserted instance."
  [exploration-id :- ms/PositiveInt
   user-id        :- ::lib.schema.id/user]
  (t2/insert-returning-instance! :model/ExplorationBookmark {:exploration_id exploration-id :user_id user-id}))

(mu/defn delete-card-bookmark! :- :int
  "Delete the CardBookmark of the User with `user-id` for the Card with `card-id`."
  [card-id :- ::lib.schema.id/card
   user-id :- ::lib.schema.id/user]
  (t2/delete! :model/CardBookmark :card_id card-id :user_id user-id))

(mu/defn delete-dashboard-bookmark! :- :int
  "Delete the DashboardBookmark of the User with `user-id` for the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard
   user-id      :- ::lib.schema.id/user]
  (t2/delete! :model/DashboardBookmark :dashboard_id dashboard-id :user_id user-id))

(mu/defn delete-collection-bookmark! :- :int
  "Delete the CollectionBookmark of the User with `user-id` for the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection
   user-id       :- ::lib.schema.id/user]
  (t2/delete! :model/CollectionBookmark :collection_id collection-id :user_id user-id))

(mu/defn delete-document-bookmark! :- :int
  "Delete the DocumentBookmark of the User with `user-id` for the Document with `document-id`."
  [document-id :- ms/PositiveInt
   user-id     :- ::lib.schema.id/user]
  (t2/delete! :model/DocumentBookmark :document_id document-id :user_id user-id))

(mu/defn delete-exploration-bookmark! :- :int
  "Delete the ExplorationBookmark of the User with `user-id` for the Exploration with `exploration-id`."
  [exploration-id :- ms/PositiveInt
   user-id        :- ::lib.schema.id/user]
  (t2/delete! :model/ExplorationBookmark :exploration_id exploration-id :user_id user-id))

(mu/defn delete-bookmark-orderings-for-user! :- :int
  "Delete the BookmarkOrderings of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/BookmarkOrdering :user_id user-id))

(mu/defn insert-bookmark-orderings! :- :int
  "Insert the BookmarkOrdering `rows`."
  [rows :- [:sequential (mut/select-keys ::bookmarks.schema/bookmark-ordering.update [:user_id :type :item_id :ordering])]]
  (t2/insert! :model/BookmarkOrdering rows))

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
    {:union-all (conj base-queries
                      ^:allow-subquery {:select [[as-null :card_id]
                                                 [as-null :dashboard_id]
                                                 [as-null :collection_id]
                                                 [as-null :document_id]
                                                 :exploration_id
                                                 [:exploration_id :item_id]
                                                 [(h2x/literal "exploration") :type]
                                                 :created_at]
                                        :from   [:exploration_bookmark]
                                        :where  [:= :user_id user-id]})}))

(mu/defn bookmark-rows-for-user :- [:sequential :map]
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
