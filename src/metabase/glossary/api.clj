(ns metabase.glossary.api
  "REST API endpoints for managing glossary entries."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.models.glossary :as glossary]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.models.interface :as mi]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch all glossary entries, optionally filtered by search term."
  [_route-params
   {:keys [search]} :- [:maybe [:map {:closed true} [:search {:optional true} [:maybe ms/NonBlankString]]]]]
  {:data      (t2/hydrate (glossary.db/glossary-entries search) :creator)
   :can_write (mi/can-create? :model/Glossary {})})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new glossary entry."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:term ::glossary.schema/glossary.term]
            [:definition ::glossary.schema/glossary.definition]]]
  (api/create-check :model/Glossary body)
  (t2/hydrate (first (glossary/create-glossaries! [(assoc body :creator_id api/*current-user-id*)])) :creator))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an existing glossary entry. `id` is a numeric id or an entity id."
  [{id-or-entity-id :id} :- [:map {:closed true} [:id [:or ms/PositiveInt ms/NanoIdString]]]
   _query-params
   body :- [:map {:closed true}
            [:term ::glossary.schema/glossary.term]
            [:definition ::glossary.schema/glossary.definition]]]
  (let [id (eid-translation/->id-or-404 :model/Glossary id-or-entity-id)]
    (api/update-check (api/check-404 (glossary.db/glossary-entry id)) body)
    (glossary/update-glossaries! [(assoc body :id id)])
    (t2/hydrate (glossary.db/glossary-entry id) :creator)))

(api.macros/defendpoint :delete "/:id" :- ::api/generic-204-no-content
  "Delete a glossary entry. `id` is a numeric id or an entity id."
  [{id-or-entity-id :id} :- [:map {:closed true} [:id [:or ms/PositiveInt ms/NanoIdString]]]]
  (let [id (eid-translation/->id-or-404 :model/Glossary id-or-entity-id)]
    (api/write-check (glossary.db/glossary-entry id))
    (glossary/delete-glossaries! [id])
    api/generic-204-no-content))
