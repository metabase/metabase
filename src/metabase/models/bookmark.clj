(ns metabase.models.bookmark
  (:require [clojure.string :as str]
            [metabase.db.connection :as mdb]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel CardBookmark :card_bookmark)
(models/defmodel DashboardBookmark :dashboard_bookmark)
(models/defmodel CollectionBookmark :collection_bookmark)

(defn- unqualify-key
  [k]
  (-> (str/split (name k) #"\.") peek keyword))

(def BookmarkResult
  "Shape of a bookmark returned for user. Id is a string because it is a concatenation of the model and the model's
  id. This is required for the frontend entity loading system and does not refer to any particular bookmark id,
  although the compound key can be inferred from it."
  {:id                               s/Str
   :type                             (s/enum :card :collection :dashboard)
   :item_id                          su/IntGreaterThanZero
   :name                             su/NonBlankString
   (s/optional-key :display)         (s/maybe s/Str)
   (s/optional-key :authority_level) (s/maybe s/Str)
   (s/optional-key :description)     (s/maybe s/Str)})

(s/defn ^:private normalize-bookmark-result :- BookmarkResult
  "Normalizes bookmark results. Bookmarks are left joined against the card, collection, and dashboard tables, but only
  points to one of them. Normalizes it so it has an id (concatenation of model and model-id), type, item_id, name, and
  description."
  [result]
  (let [result            (into {} (remove (comp nil? second) result))
        lookup            {"report_card" "card" "report_dashboard" "dashboard" "collection" "collection"}
        ttype             (-> (keys result)
                              first
                              name
                              (str/split #"\.")
                              first
                              lookup
                              keyword)
        normalized-result (zipmap (map unqualify-key (keys result)) (vals result))
        item-id-str       (str (:item_id normalized-result))]
    (merge
     {:id      (str (name ttype) "-" item-id-str)
      :type    ttype}
     (select-keys normalized-result [:item_id :name :description :display :authority_level]))))

(defn- bookmarks-union-query
  [id]
  (let [as-null (when (= (mdb/db-type) :postgres) (hx/->integer nil))]
    {:union-all [{:select [:card_id
                           [as-null :dashboard_id]
                           [as-null :collection_id]
                           :id
                           :created_at]
                  :from   [CardBookmark]
                  :where  [:= :user_id id]}
                 {:select [[as-null :card_id]
                           :dashboard_id
                           [as-null :collection_id]
                           :id
                           :created_at]
                  :from   [DashboardBookmark]
                  :where  [:= :user_id id]}
                 {:select [[as-null :card_id]
                           [as-null :dashboard_id]
                           :collection_id
                           :id
                           :created_at]
                  :from   [CollectionBookmark]
                  :where  [:= :user_id id]}]}))

(s/defn bookmarks-for-user :- [BookmarkResult]
  "Get all bookmarks for a user. Each bookmark will have a string id made of the model and model-id, a type, and
  item_id, name, and description from the underlying bookmarked item."
  [id]
  (->> (db/query
        {:select    [[:bookmark.created_at :created_at]
                     [:card.id (db/qualify 'Card :item_id)]
                     [:card.name (db/qualify 'Card :name)]
                     [:card.display (db/qualify 'Card :display)]
                     [:card.description (db/qualify 'Card :description)]
                     [:card.archived (db/qualify 'Card :archived)]
                     [:dashboard.id (db/qualify 'Dashboard :item_id)]
                     [:dashboard.name (db/qualify 'Dashboard :name)]
                     [:dashboard.description (db/qualify 'Dashboard :description)]
                     [:dashboard.archived (db/qualify 'Dashboard :archived)]
                     [:collection.id (db/qualify 'Collection :item_id)]
                     [:collection.name (db/qualify 'Collection :name)]
                     [:collection.authority_level (db/qualify 'Collection :authority_level)]
                     [:collection.description (db/qualify 'Collection :description)]
                     [:collection.archived (db/qualify 'Collection :archived)]]
         :from      [[(bookmarks-union-query id) :bookmark]]
         :left-join [[Card :card] [:= :bookmark.card_id :card.id]
                     [Dashboard :dashboard] [:= :bookmark.dashboard_id :dashboard.id]
                     [Collection :collection] [:= :bookmark.collection_id :collection.id]]
         :where     (into [:and]
                          (for [table [:card :dashboard :collection]
                                :let [field (keyword (str (name table) "." "archived"))]]
                            [:or [:= field false] [:= field nil]]))
         :order-by [[:created_at :desc]]})
       (map normalize-bookmark-result)))
