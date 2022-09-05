(ns metabase.models.bookmark
  (:require [clojure.string :as str]
            [metabase.db.connection :as mdb.connection]
            [metabase.models.app :refer [App]]
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
(models/defmodel BookmarkOrdering :bookmark_ordering)

(defn- unqualify-key
  [k]
  (-> (str/split (name k) #"\.") peek keyword))

(def BookmarkResult
  "Shape of a bookmark returned for user. Id is a string because it is a concatenation of the model and the model's
  id. This is required for the frontend entity loading system and does not refer to any particular bookmark id,
  although the compound key can be inferred from it."
  {:id                               s/Str
   :type                             (s/enum "card" "collection" "dashboard")
   :item_id                          su/IntGreaterThanZero
   :name                             su/NonBlankString
   (s/optional-key :dataset)         (s/maybe s/Bool)
   (s/optional-key :display)         (s/maybe s/Str)
   (s/optional-key :authority_level) (s/maybe s/Str)
   (s/optional-key :description)     (s/maybe s/Str)
   (s/optional-key :app_id)          (s/maybe su/IntGreaterThanOrEqualToZero)})

(s/defn ^:private normalize-bookmark-result :- BookmarkResult
  "Normalizes bookmark results. Bookmarks are left joined against the card, collection, and dashboard tables, but only
  points to one of them. Normalizes it so it has an id (concatenation of model and model-id), type, item_id, name, and
  description."
  [result]
  (let [result            (into {} (remove (comp nil? second) result))
        normalized-result (zipmap (map unqualify-key (keys result)) (vals result))
        id-str            (str (:type normalized-result) "-" (:item_id normalized-result))]
    (-> normalized-result
        (select-keys [:item_id :type :name :dataset :description :display :authority_level :app_id])
        (assoc :id id-str))))

(defn- bookmarks-union-query
  [user-id]
  (let [as-null (when (= (mdb.connection/db-type) :postgres) (hx/->integer nil))]
    {:union-all [{:select [:card_id
                           [as-null :dashboard_id]
                           [as-null :collection_id]
                           [:card_id :item_id]
                           [(hx/literal "card") :type]
                           :created_at]
                  :from   [CardBookmark]
                  :where  [:= :user_id user-id]}
                 {:select [[as-null :card_id]
                           :dashboard_id
                           [as-null :collection_id]
                           [:dashboard_id :item_id]
                           [(hx/literal "dashboard") :type]
                           :created_at]
                  :from   [DashboardBookmark]
                  :where  [:= :user_id user-id]}
                 {:select [[as-null :card_id]
                           [as-null :dashboard_id]
                           :collection_id
                           [:collection_id :item_id]
                           [(hx/literal "collection") :type]
                           :created_at]
                  :from   [CollectionBookmark]
                  :where  [:= :user_id user-id]}]}))

(s/defn bookmarks-for-user :- [BookmarkResult]
  "Get all bookmarks for a user. Each bookmark will have a string id made of the model and model-id, a type, and
  item_id, name, and description from the underlying bookmarked item."
  [user-id]
  (->> (db/query
        {:select    [[:bookmark.created_at :created_at]
                     [:bookmark.type :type]
                     [:bookmark.item_id :item_id]
                     [:card.name (db/qualify 'Card :name)]
                     [:card.dataset (db/qualify 'Card :dataset)]
                     [:card.display (db/qualify 'Card :display)]
                     [:card.description (db/qualify 'Card :description)]
                     [:card.archived (db/qualify 'Card :archived)]
                     [:dashboard.name (db/qualify 'Dashboard :name)]
                     [:dashboard.description (db/qualify 'Dashboard :description)]
                     [:dashboard.archived (db/qualify 'Dashboard :archived)]
                     [:collection.name (db/qualify 'Collection :name)]
                     [:collection.authority_level (db/qualify 'Collection :authority_level)]
                     [:collection.description (db/qualify 'Collection :description)]
                     [:collection.archived (db/qualify 'Collection :archived)]
                     [:app.id (db/qualify 'Collection :app_id)]]
         :from      [[(bookmarks-union-query user-id) :bookmark]]
         :left-join [[Card :card] [:= :bookmark.card_id :card.id]
                     [Dashboard :dashboard] [:= :bookmark.dashboard_id :dashboard.id]
                     [Collection :collection] [:= :bookmark.collection_id :collection.id]
                     [App :app] [:= :app.collection_id :collection.id]
                     [BookmarkOrdering :bookmark_ordering] [:and
                                                            [:= :bookmark_ordering.user_id user-id]
                                                            [:= :bookmark_ordering.type :bookmark.type]
                                                            [:= :bookmark_ordering.item_id :bookmark.item_id]]]
         :where     (into [:and]
                          (for [table [:card :dashboard :collection]
                                :let [field (keyword (str (name table) "." "archived"))]]
                            [:or [:= field false] [:= field nil]]))
         :order-by [[:bookmark_ordering.ordering :asc-nulls-last] [:created_at :desc]]})
       (map normalize-bookmark-result)))

(defn save-ordering
  "Saves a bookmark ordering of shape `[{:type, :item_id}]`
   Deletes all existing orderings for user so should be given a total ordering."
  [user-id orderings]
  (db/delete! BookmarkOrdering :user_id user-id)
  (db/insert-many! BookmarkOrdering (->> orderings
                                         (map #(select-keys % [:type :item_id]))
                                         (map-indexed #(assoc %2 :user_id user-id :ordering %1)))))
