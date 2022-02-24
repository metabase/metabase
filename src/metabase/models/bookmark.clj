(ns metabase.models.bookmark
  (:require [metabase.db.connection :as mdb]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel CardBookmark :card_bookmark)
(models/defmodel DashboardBookmark :dashboard_bookmark)
(models/defmodel CollectionBookmark :collection_bookmark)

(defn bookmarks-for-user
  "Get all bookmarks for a user"
  [id]
  (let [as-null (when (= (mdb/db-type) :postgres) (hx/->integer nil))]
    (db/query
     ;; todo: does it make sense to create a 'partial-bookmarks-query' fn?
     {:with [[:bookmark {:union-all [{:select [:card_id
                                               [as-null :dashboard_id]
                                               [as-null :collection_id]]
                                      :from [:card_bookmark]
                                      :where [:= :user_id id]}
                                     {:select [[as-null :card_id]
                                               :dashboard_id
                                               [as-null :collection_id]]
                                      :from [:dashboard_bookmark]
                                      :where [:= :user_id id]}
                                     {:select [[as-null :card_id]
                                               [as-null :dashboard_id]
                                               :collection_id]
                                      :from [:collection_bookmark]
                                      :where [:= :user_id id]}]}]]
      :select [:*]
      :from [:bookmark]
      ;; todo: not certain this is correct yet. Even if it is, the shape of the returned data could be cleaned up I think
      :left-join [[:report_card :card] [:= :bookmark.card_id :card.id]
                  [:report_dashboard :dashboard] [:= :bookmark.dashboard_id :dashboard.id]
                  :collection [:= :bookmark.collection_id :collection.id]]})))


(comment

  (db/query {:select [:card_id
                      [nil :dashboard_id]
                      [nil :collection_id]]
             :from CardBookmark
             :where [:= :user_id 1]})
  ;; see collection api L405
  ;; see if I can use the model directly
  (let [as-null (when (= (mdb/db-type) :postgres) (hx/->integer nil))]
    (db/query
     {:with [[:bookmark {:union-all [{:select [:card_id
                                               [as-null :dashboard_id]
                                               [as-null :collection_id]]
                                      :from [:card_bookmark]
                                      :where [:= :user_id 1]}
                                     {:select [[as-null :card_id]
                                               :dashboard_id
                                               [as-null :collection_id]]
                                      :from [:dashboard_bookmark]
                                      :where [:= :user_id 1]}
                                     {:select [[as-null :card_id]
                                               [as-null :dashboard_id]
                                               :collection_id]
                                      :from [:collection_bookmark]
                                      :where [:= :user_id 1]}]}]]
      :select [:*]
      :from [:bookmark]
      :left-join [[:report_card :card] [:= :bookmark.card_id :card.id]
                  [:report_dashboard :dashboard] [:= :bookmark.dashboard_id :dashboard.id]
                  :collection [:= :bookmark.collection_id :collection.id]]}))

  )
