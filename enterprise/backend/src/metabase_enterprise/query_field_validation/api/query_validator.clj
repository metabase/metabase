(ns metabase-enterprise.query-field-validation.api.query-validator
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [toucan2.core :as t2]))

(def ^:private valid-sort-columns "Columns that the card errors can be sorted by"
  #{"name" "collection" "created_by" "last_edited_at"}) ;; We don't support sorting by error message for now

(def ^:private default-sort-column "name")

(def ^:private valid-sort-directions
  #{"asc" "desc"})

(def ^:private default-sort-direction "asc")

(def ^:private sort-column->keyfn
  {"name"           :name
   "collection"     (comp :name :collection)
   "created_by"     (comp :common_name :creator)
   "last_edited_at" :updated_at})

(defn- cards-with-inactive-fields
  [sort-column sort-direction]
  (let [card-id->query-fields (group-by :card_id
                                        (t2/select :model/QueryField
                                                   {:select [:qf.* [:f.name :column_name] [:t.name :table_name]]
                                                    :from   [[(t2/table-name :model/QueryField) :qf]]
                                                    :join   [[(t2/table-name :model/Card)  :c] [:= :c.id :qf.card_id]
                                                             [(t2/table-name :model/Field) :f] [:= :f.id :qf.field_id]
                                                             [(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
                                                    :where  [:and
                                                             [:= :c.archived false]
                                                             [:= :f.active false]
                                                             [:= :qf.explicit_reference true]]}))
        card-ids              (keys card-id->query-fields)
        add-errors            (fn [{:keys [id] :as card}]
                                (update-in card
                                           [:errors :inactive-fields]
                                           concat
                                           (for [{:keys [table_name column_name]} (card-id->query-fields id)]
                                             {:table table_name :field column_name})))]
    ;; In theory this second query is unnecessary since we could include Card.* in the SELECT above and do more
    ;; processing in Clojure, but since that increases the Clojure-side processing I'm not convinced it's actually any
    ;; better. The second query also makes it much simpler to add the ORDER BY
    (when (seq card-ids)
      (let [sort-direction-fn ({"asc"  reverse
                                "desc" identity} sort-direction)]
        (mw.offset-paging/page-result
         (sort-direction-fn
          (sort-by (sort-column->keyfn sort-column)
                   (map add-errors (t2/hydrate (t2/select :model/Card :id [:in card-ids])
                                               :collection :creator)))))))))

(api/defendpoint GET "/invalid-cards"
  "List of cards that have an invalid reference in their query. Shape of each card is standard, with the addition of an
  `errors` key."
  [sort_column sort_direction]
  {sort_column    [:maybe (into [:enum] valid-sort-columns)]
   sort_direction [:maybe (into [:enum] valid-sort-directions)]}
  (let [cards (cards-with-inactive-fields (or sort_column default-sort-column)
                                          (or sort_direction default-sort-direction))]
    {:total (count cards)
     :data cards
     :limit mw.offset-paging/*limit*
     :offset mw.offset-paging/*offset*})
)

(api/define-routes)
