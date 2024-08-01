(ns metabase-enterprise.query-reference-validation.api
  (:require
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.collection :as collection]
   [metabase.models.query-field :as query-field]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private valid-sort-columns "Columns that the card errors can be sorted by"
  #{"name" "collection" "created_by" "last_edited_at"}) ;; We don't support sorting by error message for now

(def ^:private default-sort-column "name")

(def ^:private valid-sort-directions
  #{"asc" "desc"})

(def ^:private default-sort-direction "asc")

(defn- present [card]
  (-> card
      (select-keys [:id :description :collection_id :name :entity_id :archived :collection_position
                    :display :collection_preview :dataset_query :last_used_at :errors :collection])
      (update :collection (fn present-collection [collection]
                            {:id (:id collection)
                             :name (:name collection)
                             :authority_level (:authority_level collection)
                             :type (:type collection)
                             :effective_ancestors (map #(select-keys % [:id :name :authority_level :type]) (:effective_ancestors collection))}))))

(defn- cards-with-reference-errors
  [{:keys [sort-column sort-direction limit offset collection-ids]}]
  (let [sort-dir-kw         (keyword sort-direction)
        sorting-joins       (case sort-column
                              "name"           []
                              "collection"     [[(t2/table-name :model/Collection) :coll] [:= :coll.id :c.collection_id]]
                              "created_by"     [[(t2/table-name :model/User) :u] [:= :u.id :c.creator_id]]
                              "last_edited_at" [])
        sorting-selects     (case sort-column
                              "name"           [:c.name]
                              "collection"     [[[:max :coll.name]]
                                                ;; ^^ All these `max`es are silly, but they're necessary since we
                                                ;; group by card
                                                [[:not= nil [:max :coll.name]] :is_child_collection]]
                              "created_by"     [:u.first_name :u.last_name :u.email]
                              "last_edited_at" [:c.updated_at])
        order-by-clause     (condp = sort-column
                              "collection" [[:is_child_collection sort-dir-kw]
                                            [[:max :coll.name] sort-dir-kw]]
                              "created_by" [[[:coalesce [:|| :u.first_name " " :u.last_name]
                                              :u.first_name :u.last_name :u.email]
                                             sort-dir-kw]]
                              [(into sorting-selects [sort-dir-kw])])
        card-query          (query-field/cards-with-reference-errors
                             (m/assoc-some
                              ;; TODO this table has a lot of fields... we should whittle down to what we need.
                              {:select    (into [:c.*] sorting-selects)
                               :from      [[(t2/table-name :model/Card) :c]]
                               :left-join sorting-joins
                               :where     [:and
                                           [:= :c.archived false]
                                           [:or
                                            [:in :c.collection_id collection-ids]
                                            (when (contains? collection-ids nil)
                                              [:is :c.collection_id nil])]]
                               :order-by  order-by-clause
                               :group-by  :c.id}
                              :limit  limit
                              :offset offset))
        cards               (t2/select :model/Card card-query)
        id->errors          (query-field/reference-errors cards)
        add-errors          (fn [{:keys [id] :as card}]
                              (assoc card :errors (sort-by (juxt :table :field :type) (id->errors id))))]
    {:data (map (comp present add-errors) (t2/hydrate cards [:collection :effective_ancestors] :creator))
     :total (t2/count :model/Card (dissoc card-query :limit :offset))}))

(api/defendpoint GET "/invalid-cards"
  "List of cards that have an invalid reference in their query. Shape of each card is standard, with the addition of an
  `errors` key. Supports pagination (`offset` and `limit`), so it returns something in the shape:

  ```
    {:total  200
     :data   [card1, card2, ...]
     :limit  50
     :offset 100
  ```"
  [sort_column sort_direction collection_id]
  {sort_column    [:maybe (into [:enum] valid-sort-columns)]
   sort_direction [:maybe (into [:enum] valid-sort-directions)]
   collection_id  [:maybe ms/PositiveInt]}
  (let [collection (if (nil? collection_id)
                     collection/root-collection
                     (t2/select-one :model/Collection :id collection_id))
        collection-ids (conj (collection/descendant-ids collection) collection_id)]
    (merge (cards-with-reference-errors {:sort-column (or sort_column default-sort-column)
                                         :sort-direction (or sort_direction default-sort-direction)
                                         :collection-ids (set collection-ids)
                                         :limit mw.offset-paging/*limit*
                                         :offset mw.offset-paging/*offset*})
           {:limit mw.offset-paging/*limit*
            :offset mw.offset-paging/*offset*})))

(api/define-routes api/+check-superuser +auth)
