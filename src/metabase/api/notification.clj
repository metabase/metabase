(ns metabase.api.notification
  "/api/notification endpoints"
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.models.notification :as models.notification]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api/defendpoint GET "/:id"
  "Get a notification by id."
  [id]
  {id  ms/PositiveInt}
  (-> (t2/select-one :model/Notification id)
      api/check-404
      models.notification/hydrate-notification))

(api/define-routes)
