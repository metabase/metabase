(ns metabase.api.newmetric
  (:require [metabase.api.common :as api]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.newmetric :refer [Newmetric]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(api/defendpoint POST "/"
  [:as {{:keys [name display_name description card_id measure dimensions] :as body} :body}]
  {card_id      su/IntGreaterThanZero
   name         su/NonBlankString
   display_name (s/maybe s/Str)
   description  (s/maybe s/Str)
   ;; todo: normalize and then check
   ;; measure      mbql.s/Aggregation
   ;; dimensions   [[(s/one su/NonBlankString "name") (s/one mbql.s/Field "clause")]]
   }

  (db/insert! Newmetric body))

;; name display_name card_id measure dimensions archived creator_id created_at updated_at

(api/defendpoint PUT "/:id"
  "Update a `Card`."
  [id :as {{:keys [name display_name description card_id measure dimensions] :as metric-updates} :body}]
  {card_id      su/IntGreaterThanZero
   name         su/NonBlankString
   display_name (s/maybe s/Str)
   description  (s/maybe s/Str)
   measure      any?
   dimensions   any?}
  (db/update! Newmetric metric-updates))

(api/define-routes)
