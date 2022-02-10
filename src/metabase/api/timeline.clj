(ns metabase.api.timeline
  "/api/timeline endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models.collection :as collection]
            [metabase.models.timeline :refer [Timeline]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [metabase.util :as u]))


(api/defendpoint POST "/"
  "Create a new [[Timeline]]."
  [:as {{:keys [name description icon collection_id archived], :as body} :body}]
  {name          su/NonBlankString
   description   (s/maybe s/Str)
   ;; todo: there are six valid ones. What are they?
   icon          (s/maybe s/Str)
   collection_id (s/maybe su/IntGreaterThanZero)
   archived      (s/maybe s/Bool)}
  (collection/check-write-perms-for-collection collection_id)
  (db/insert! Timeline (assoc body :creator_id api/*current-user-id*)))

(api/defendpoint GET "/:id"
  "Fetch the [[Timeline]] with `id`."
  [id]
  (let [timeline (api/read-check (Timeline id))]
    (hydrate timeline :creator)))

(api/defendpoint PUT "/:id"
  [id :as {{:keys [name description icon collection_id archived] :as timeline-updates} :body}]
  {name          (s/maybe su/NonBlankString)
   description   (s/maybe s/Str)
   ;; todo: there are six valid ones. What are they?
   icon          (s/maybe s/Str)
   collection_id (s/maybe su/IntGreaterThanZero)
   archived      (s/maybe s/Bool)}
  ;; todo: icon is valid
  (let [existing (api/write-check Timeline id)]
    (collection/check-allowed-to-change-collection existing timeline-updates)
    (db/update! Timeline id
      (u/select-keys-when timeline-updates
        :present #{:description :icon :collection_id :archived}
        :non-nil #{:name}))
    (hydrate (Timeline id) :creator)))


;; todo: icons
;; todo: how does updated-at work?
(api/define-routes)
