(ns metabase-enterprise.query-reference-validation.api
  (:require
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.query-field :as query-field]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [toucan2.core :as t2]))

(def ^:private valid-sort-columns "Columns that the card errors can be sorted by"
  #{"name" "collection" "created_by" "last_edited_at"}) ;; We don't support sorting by error message for now

(def ^:private default-sort-column "name")

(def ^:private valid-sort-directions
  #{"asc" "desc"})

(def ^:private default-sort-direction "asc")

(defn- cards-with-inactive-fields
  [sort-column sort-direction offset limit]
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
                              {:select    (into [:c.*] sorting-selects)
                               :from      [[(t2/table-name :model/Card) :c]]
                               :left-join sorting-joins
                               :where     [:= :c.archived false]
                               :order-by  order-by-clause
                               :group-by  :c.id}
                              :limit  limit
                              :offset offset))
        cards               (t2/select :model/Card card-query)
        id->errors          (query-field/reference-errors cards)
        add-errors          (fn [{:keys [id] :as card}]
                              (assoc card :errors (id->errors id)))]
    (map add-errors (t2/hydrate cards :collection :creator))))

(defn- invalid-card-count
  []
  (:count
   (t2/query-one
    (query-field/cards-with-reference-errors
     {:select [[[:count [:distinct :c.id]] :count]]
      :from   [[(t2/table-name :model/Card) :c]]
      :where  [:= :c.archived false]}))))

(api/defendpoint GET "/invalid-cards"
  "List of cards that have an invalid reference in their query. Shape of each card is standard, with the addition of an
  `errors` key. Supports pagination (`offset` and `limit`), so it returns something in the shape:

  ```
    {:total  200
     :data   [card1, card2, ...]
     :limit  50
     :offset 100
  ```"
  [sort_column sort_direction]
  {sort_column    [:maybe (into [:enum] valid-sort-columns)]
   sort_direction [:maybe (into [:enum] valid-sort-directions)]}
  (let [cards (cards-with-inactive-fields (or sort_column default-sort-column)
                                          (or sort_direction default-sort-direction)
                                          mw.offset-paging/*offset*
                                          mw.offset-paging/*limit*)]
    {:total  (invalid-card-count)
     :data   cards
     :limit  mw.offset-paging/*limit*
     :offset mw.offset-paging/*offset*}))

(api/define-routes api/+check-superuser +auth)
