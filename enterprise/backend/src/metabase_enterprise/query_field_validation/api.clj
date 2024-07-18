(ns metabase-enterprise.query-field-validation.api
  (:require
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [toucan2.core :as t2]))

(def ^:private valid-sort-columns "Columns that the card errors can be sorted by"
  #{"name" "collection" "created_by" "last_edited_at"}) ;; We don't support sorting by error message for now

(def ^:private default-sort-column "name")

(def ^:private valid-sort-directions
  #{"asc" "desc"})

(def ^:private default-sort-direction "asc")

(def ^:private card-joins
  [[(t2/table-name :model/QueryField) :qf] [:and
                                            [:= :qf.card_id :c.id]
                                            [:= :qf.explicit_reference true]]
   [(t2/table-name :model/Field) :f] [:and
                                      [:= :qf.field_id :f.id]
                                      [:= :f.active false]]])

(defn- cards-with-inactive-fields
  [sort-column sort-direction offset limit]
  (let [sort-dir-kw           (keyword sort-direction)
        additional-joins      (case sort-column
                                "name"           []
                                "collection"     [[(t2/table-name :model/Collection) :coll] [:= :coll.id :c.collection_id]]
                                "created_by"     [[(t2/table-name :model/User) :u] [:= :u.id :c.creator_id]]
                                "last_edited_at" [])
        extra-selects         (case sort-column
                                "name"           [:c.name]
                                "collection"     [[[:max :coll.name]]
                                                  ;; ^^ All these `max`es are silly, but they're necessary since we
                                                  ;; group by card
                                                  [[:not= nil [:max :coll.name]] :is_child_collection]]
                                "created_by"     [:u.first_name :u.last_name :u.email]
                                "last_edited_at" [:c.updated_at])
        order-by-column       (condp = sort-column
                                "collection"     [[:is_child_collection sort-dir-kw]
                                                  [[:max :coll.name] sort-dir-kw]]
                                "created_by"     [[[:coalesce [:|| :u.first_name " " :u.last_name]
                                                    :u.first_name :u.last_name :u.email]
                                                   sort-dir-kw]]
                                [(into extra-selects [sort-dir-kw])])
        card-query            (m/assoc-some
                               {:select    (into [:c.*] extra-selects)
                                :from      [[(t2/table-name :model/Card) :c]]
                                :join      card-joins
                                :left-join additional-joins
                                :where     [:= :c.archived false]
                                :order-by  order-by-column
                                :group-by  :c.id}
                               :limit  limit
                               :offset offset)
        cards                 (t2/select :model/Card card-query)
        card-id->query-fields (when (seq cards)
                                (group-by :card_id (t2/select :model/QueryField
                                                              {:select [:qf.* [:f.name :column_name] [:t.name :table_name]]
                                                               :from   [[(t2/table-name :model/QueryField) :qf]]
                                                               :join   [[(t2/table-name :model/Field) :f] [:= :f.id :qf.field_id]
                                                                        [(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
                                                               :where  [:and
                                                                        [:= :qf.explicit_reference true]
                                                                        [:= :f.active false]
                                                                        [:in :card_id (map :id cards)]]})))

        add-errors            (fn [{:keys [id] :as card}]
                                (assoc-in card
                                          [:errors :inactive-fields]
                                          (for [{:keys [table_name column_name]} (card-id->query-fields id)]
                                            {:table table_name :field column_name})))]
    (map add-errors (t2/hydrate cards :collection :creator))))

(defn- invalid-card-count
  []
  (:count
   (t2/query-one {:select [[[:count [:distinct :c.id]] :count]]
                  :from   [[(t2/table-name :model/Card) :c]]
                  :join   card-joins
                  :where  [:= :c.archived false]})))

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
