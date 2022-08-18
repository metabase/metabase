(ns metabase.api.newmetric
  (:require [metabase.api.common :as api]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.newmetric :refer [Newmetric]]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- validate-dimensions!
  [dimensions]
  ;; todo: validate unique names, fields belong to underlying `card_id`, etc.
  (when (s/check [[(s/one su/NonBlankString "name") (s/one mbql.s/Field "clause")]]
                 (into []
                       (map (fn [[name form]]
                              [name (mbql.normalize/normalize-tokens form)]))
                       dimensions))
    (throw (ex-info (tru "Bad dimensions")
                    {:status-code 400
                     :dimensions dimensions}))))

(defn- validate-measure!
  [measure]
  ;; todo: validate field belongs to underlying `card_id`
  (when (s/check mbql.s/Aggregation (mbql.normalize/normalize-tokens measure))
    (throw (ex-info (tru "Bad measure")
                    {:status-code 400
                     :measure measure}))))

(api/defendpoint POST "/"
  [:as {{:keys [name display_name description card_id measure dimensions] :as body} :body}]
  {card_id      su/IntGreaterThanZero
   name         su/NonBlankString
   display_name (s/maybe s/Str)
   description  (s/maybe s/Str)}
  (validate-dimensions! dimensions)
  (validate-measure! measure)
  (db/insert! Newmetric body))

;; name display_name card_id measure dimensions archived creator_id created_at updated_at

(api/defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [name display_name description card_id measure dimensions] :as metric-updates} :body}]
  {card_id      su/IntGreaterThanZero
   name         su/NonBlankString
   display_name (s/maybe s/Str)
   description  (s/maybe s/Str)}
  (validate-dimensions! dimensions)
  (validate-measure! measure)
  (db/update! Newmetric id metric-updates))

(api/define-routes)
