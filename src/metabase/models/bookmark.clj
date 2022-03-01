(ns metabase.models.bookmark
  (:require [clojure.string :as str]
            [metabase.db.connection :as mdb]
            [metabase.models :refer [Card Dashboard Collection]]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel CardBookmark :card_bookmark)
(models/defmodel DashboardBookmark :dashboard_bookmark)
(models/defmodel CollectionBookmark :collection_bookmark)

(defn- remove-nil-values [m]
  (into {} (remove (comp nil? second) m)))

(defn- unqualify-key
  [k]
  (-> k
      name
      (str/split #"\.")
      last
      keyword))

(defn- normalize-bookmark-result
  [result]
  (let [lookup {"report_card" "card" "report_dashboard" "dashboard" "collection" "collection"}
        ttype (-> (keys result)
                  first
                  name
                  (str/split #"\.")
                  first
                  lookup
                  keyword)
        normalized-result (zipmap (map unqualify-key (keys result)) (vals result))]
    (-> normalized-result
        (assoc :type ttype)
        (dissoc :created_at))))

(defn bookmarks-for-user
  "Get all bookmarks for a user"
  [id]
  (let [as-null (when (= (mdb/db-type) :postgres) (hx/->integer nil))]
    (->> (db/query
          {:with          [[:bookmark {:union-all [{:select [:card_id
                                                             [as-null :dashboard_id]
                                                             [as-null :collection_id]
                                                             :id
                                                             :created_at]
                                                    :from   [:card_bookmark]
                                                    :where  [:= :user_id id]}
                                                   {:select [[as-null :card_id]
                                                             :dashboard_id
                                                             [as-null :collection_id]
                                                             :id
                                                             :created_at]
                                                    :from   [:dashboard_bookmark]
                                                    :where  [:= :user_id id]}
                                                   {:select [[as-null :card_id]
                                                             [as-null :dashboard_id]
                                                             :collection_id
                                                             :id
                                                             :created_at]
                                                    :from   [:collection_bookmark]
                                                    :where  [:= :user_id id]}]}]]
           :select        [[:bookmark.created_at :created_at]
                           [:card.id (db/qualify Card :item_id)]
                           [:card.name (db/qualify Card :name)]
                           [:card.description (db/qualify Card :description)]
                           [:dashboard.id (db/qualify Dashboard :item_id)]
                           [:dashboard.name (db/qualify Dashboard :name)]
                           [:dashboard.description (db/qualify Dashboard :description)]
                           [:collection.id (db/qualify Collection :item_id)]
                           [:collection.name (db/qualify Collection :name)]
                           [:collection.description (db/qualify Collection :description)]]
           :from          [:bookmark]
           :left-join [[:report_card :card] [:= :bookmark.card_id :card.id]
                       [:report_dashboard :dashboard] [:= :bookmark.dashboard_id :dashboard.id]
                       :collection [:= :bookmark.collection_id :collection.id]]})
         (map remove-nil-values)
         (sort-by :created_at)
         (map normalize-bookmark-result))))
