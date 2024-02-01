(ns metabase.models.bookmark
  (:require
   [clojure.string :as str]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.query :as mdb.query]
   [metabase.db.util :as mdb.u]
   [metabase.models.card :refer [Card]]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
;; We'll keep this till we replace all the symbols in our codebase."
(def CardBookmark       "CardBookmark model"       :model/CardBookmark)
(def DashboardBookmark  "DashboardBookmark model"  :model/DashboardBookmark)
(def CollectionBookmark "CollectionBookmark model" :model/CollectionBookmark)
(def BookmarkOrdering   "BookmarkOrdering model"   :model/BookmarkOrdering)

(methodical/defmethod t2/table-name :model/CardBookmark       [_model] :card_bookmark)
(methodical/defmethod t2/table-name :model/DashboardBookmark  [_model] :dashboard_bookmark)
(methodical/defmethod t2/table-name :model/CollectionBookmark [_model] :collection_bookmark)
(methodical/defmethod t2/table-name :model/BookmarkOrdering   [_model] :bookmark_ordering)

(derive :model/CardBookmark :metabase/model)
(derive :model/DashboardBookmark :metabase/model)
(derive :model/CollectionBookmark :metabase/model)
(derive :model/BookmarkOrdering :metabase/model)

(defn- unqualify-key
  [k]
  (-> (str/split (name k) #"\.") peek keyword))

(def BookmarkResult
  "Shape of a bookmark returned for user. Id is a string because it is a concatenation of the model and the model's
  id. This is required for the frontend entity loading system and does not refer to any particular bookmark id,
  although the compound key can be inferred from it."
  [:map {:closed false}
   [:id                               ms/PositiveInt]
   [:model                            [:enum "card" "collection" "dashboard"]]
   [:item_id                          ms/PositiveInt]
   [:name                             ms/NonBlankString]
   [:authority_level {:optional true} [:maybe :string]]
   [:dataset         {:optional true} [:maybe :boolean]]
   [:description     {:optional true} [:maybe :string]]
   [:display         {:optional true} [:maybe :string]]])

(mu/defn ^:private normalize-bookmark-result
  "Normalizes bookmark results. Bookmarks are left joined against the card, collection, and dashboard tables, but only
  points to one of them. Normalizes it so it has just the desired fields."
  [result]

  (let [item (into {} (or (:card result) (:dashboard result) (:collection result)))
        id-str            (str (:type result) "-" (:id item))]
    (assoc item
           :model (:type result)
           :bookmark_id id-str)))

(defn- bookmarks-union-query
  [user-id]
  (let [as-null (when (= (mdb.connection/db-type) :postgres) (h2x/->integer nil))]
    {:union-all [{:select [:card_id
                           [as-null :dashboard_id]
                           [as-null :collection_id]
                           [:card_id :item_id]
                           [(h2x/literal "card") :type]
                           :created_at]
                  :from   [:card_bookmark]
                  :where  [:= :user_id user-id]}
                 {:select [[as-null :card_id]
                           :dashboard_id
                           [as-null :collection_id]
                           [:dashboard_id :item_id]
                           [(h2x/literal "dashboard") :type]
                           :created_at]
                  :from   [:dashboard_bookmark]
                  :where  [:= :user_id user-id]}
                 {:select [[as-null :card_id]
                           [as-null :dashboard_id]
                           :collection_id
                           [:collection_id :item_id]
                           [(h2x/literal "collection") :type]
                           :created_at]
                  :from   [:collection_bookmark]
                  :where  [:= :user_id user-id]}]}))

(defn- add-cards-to-bookmarks [bookmarks]
  (when (seq bookmarks)
    (let [card-ids (map :item_id (filter #(= (:type %) "card") bookmarks))
          cards (when (seq card-ids)
                  (t2/select :model/Card {:where [:in :id card-ids]}))
          card-id->card (into {} (map (fn [card] [(:id card) card]) cards))]
      (for [bookmark bookmarks]
        (if (= (:type bookmark) "card")
          (assoc bookmark :card (card-id->card (:item_id bookmark)))
          bookmark)))))

(defn- add-collections-to-bookmarks [bookmarks]
  (when (seq bookmarks)
    (let [collection-ids (map :item_id (filter #(= (:type %) "collection") bookmarks))
          collections (when (seq collection-ids)
                        (t2/select :model/Collection {:where [:in :id collection-ids]}))
          collection-id->collection (into {} (map (fn [collection] [(:id collection) collection]) collections))]
      (for [bookmark bookmarks]
        (if (= (:type bookmark) "collection")
          (assoc bookmark :collection (collection-id->collection (:item_id bookmark)))
          bookmark)))))

(defn- add-dashboards-to-bookmarks [bookmarks]
  (when (seq bookmarks)
    (let [dashboard-ids (map :item_id (filter #(= (:type %) "dashboard") bookmarks))
          dashboards (when (seq dashboard-ids)
                        (t2/select :model/Dashboard {:where [:in :id dashboard-ids]}))
          dashboard-id->dashboard (into {} (map (fn [dashboard] [(:id dashboard) dashboard]) dashboards))]
      (for [bookmark bookmarks]
        (if (= (:type bookmark) "dashboard")
          (assoc bookmark :dashboard (dashboard-id->dashboard (:item_id bookmark)))
          bookmark)))))


(mu/defn bookmarks-for-user
  "Get all bookmarks for a user. Each bookmark will have a string id made of the model and model-id, a type, and
  item_id, name, and description from the underlying bookmarked item."
  [user-id]
  (->> (mdb.query/query
        {:select    [[:bookmark.created_at        :created_at]
                     [:bookmark.type              :type]
                     [:bookmark.item_id           :item_id]]
         :from      [[(bookmarks-union-query user-id) :bookmark]]
         :left-join [[:report_card :card]                    [:= :bookmark.card_id :card.id]
                     [:report_dashboard :dashboard]          [:= :bookmark.dashboard_id :dashboard.id]
                     ;; use of [[h2x/identifier]] here is a workaround for https://github.com/seancorfield/honeysql/issues/450
                     [:collection :collection]               [:in :collection.id [(h2x/identifier :field :bookmark :collection_id)
                                                                                  (h2x/identifier :field :dashboard :collection_id)]]
                     [:bookmark_ordering :bookmark_ordering] [:and
                                                              [:= :bookmark_ordering.user_id user-id]
                                                              [:= :bookmark_ordering.type :bookmark.type]
                                                              [:= :bookmark_ordering.item_id :bookmark.item_id]]]
         :where     (into [:and]
                          (for [table [:card :dashboard :collection]
                                :let  [field (keyword (str (name table) "." "archived"))]]
                            [:or [:= field false] [:= field nil]]))
         :order-by  [[:bookmark_ordering.ordering (case (mdb.connection/db-type)
                                                    ;; NULLS LAST is not supported by MySQL, but this is default
                                                    ;; behavior for MySQL anyway
                                                    (:postgres :h2) :asc-nulls-last
                                                    :mysql          :asc)]
                     [:created_at :desc]]})
       (add-cards-to-bookmarks)
       (add-collections-to-bookmarks)
       (add-dashboards-to-bookmarks)
       (map normalize-bookmark-result)))

;; type to model
;; id = underlying item id
;; bookmark_id = ... bookmark id
;; bookmark order
;; display

(defn save-ordering!
  "Saves a bookmark ordering of shape `[{:type, :item_id}]`
   Deletes all existing orderings for user so should be given a total ordering."
  [user-id orderings]
  (t2/delete! BookmarkOrdering :user_id user-id)
  (t2/insert! BookmarkOrdering (->> orderings
                                    (map #(select-keys % [:type :item_id]))
                                    (map-indexed #(assoc %2 :user_id user-id :ordering %1)))))
