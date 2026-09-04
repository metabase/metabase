(ns metabase.bookmarks.models.bookmark
  (:require
   [clojure.string :as str]
   [metabase.bookmarks.db :as bookmarks.db]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CardBookmark        [_model] :card_bookmark)
(methodical/defmethod t2/table-name :model/DashboardBookmark   [_model] :dashboard_bookmark)
(methodical/defmethod t2/table-name :model/CollectionBookmark  [_model] :collection_bookmark)
(methodical/defmethod t2/table-name :model/BookmarkOrdering    [_model] :bookmark_ordering)
(methodical/defmethod t2/table-name :model/DocumentBookmark    [_model] :document_bookmark)
(methodical/defmethod t2/table-name :model/ExplorationBookmark [_model] :exploration_bookmark)

(derive :model/CardBookmark :metabase/model)
(derive :model/DashboardBookmark :metabase/model)
(derive :model/CollectionBookmark :metabase/model)
(derive :model/BookmarkOrdering :metabase/model)
(derive :model/DocumentBookmark :metabase/model)
(derive :model/ExplorationBookmark :metabase/model)

(defn- unqualify-key
  [k]
  (-> (str/split (name k) #"\.") peek keyword))

(def BookmarkResult
  "Shape of a bookmark returned for user. Id is a string because it is a concatenation of the model and the model's
  id. This is required for the frontend entity loading system and does not refer to any particular bookmark id,
  although the compound key can be inferred from it."
  [:map {:closed true}
   [:id                                  :string]
   [:type [:enum "card" "collection" "dashboard" "document" "exploration"]]
   [:item_id                             ms/PositiveInt]
   [:name                                ms/NonBlankString]
   [:authority_level    {:optional true} [:maybe :string]]
   [:is_remote_synced   {:optional true} :boolean]
   [:card_type          {:optional true} [:maybe ::queries.schema/card-type]]
   [:description        {:optional true} [:maybe :string]]
   [:display            {:optional true} [:maybe :string]]])

(mu/defn- normalize-bookmark-result :- BookmarkResult
  "Normalizes bookmark results. Bookmarks are left joined against the card, collection, dashboard, document,
  and exploration tables, but only points to one of them. Normalizes it so it has just the desired fields."
  [result]
  (let [result            (cond-> (into {} (remove (comp nil? second) result))
                            ;; If not a collection then remove collection properties
                            ;; to avoid shadowing the "real" properties.
                            (not= (:type result) "collection")
                            (dissoc :collection.description :collection.name)
                            ;; If not a document then remove document properties
                            ;; to avoid shadowing the "real" properties.
                            (not= (:type result) "document")
                            (dissoc :document.name)
                            ;; If not an exploration then remove exploration properties
                            ;; to avoid shadowing the "real" properties.
                            (not= (:type result) "exploration")
                            (dissoc :exploration.name :exploration.description))
        normalized-result (zipmap (map unqualify-key (keys result)) (vals result))
        id-str            (str (:type normalized-result) "-" (:item_id normalized-result))
        normalized-result (cond-> normalized-result
                            (:card_type normalized-result) (update :card_type keyword))]
    (-> normalized-result
        (select-keys [:item_id :type :name :card_type :description :display
                      :authority_level :is_remote_synced])
        (assoc :id id-str))))

(mu/defn bookmarks-for-user :- [:sequential BookmarkResult]
  "Get all bookmarks for a user. Each bookmark will have a string id made of the model and model-id, a type, and
  item_id, name, and description from the underlying bookmarked item.

  Bookmarks whose target `user-id` can no longer read are filtered out."
  [user-id]
  (let [user-scope {:current-user-id user-id
                    :is-superuser?   (perms/is-superuser? user-id)}]
    (->> (bookmarks.db/bookmark-rows-for-user user-id user-scope)
         (map normalize-bookmark-result))))

(defn save-ordering!
  "Saves a bookmark ordering of shape `[{:type, :item_id}]`
   Deletes all existing orderings for user so should be given a total ordering."
  [user-id orderings]
  (bookmarks.db/delete-bookmark-orderings-for-user! user-id)
  (bookmarks.db/insert-bookmark-orderings! (->> orderings
                                                (map #(select-keys % [:type :item_id]))
                                                (map-indexed #(assoc %2 :user_id user-id :ordering %1)))))

(t2/define-before-insert :model/CollectionBookmark [bookmark]
  (collection/check-allowed-content :model/CollectionBookmark (:collection_id bookmark))
  bookmark)

(t2/define-before-update :model/CollectionBookmark [model]
  (collection/check-allowed-content :model/CollectionBookmark (:collection_id (t2/changes model)))
  model)
