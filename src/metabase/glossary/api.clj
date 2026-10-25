(ns metabase.glossary.api
  "REST API endpoints for managing glossary entries."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.glossary.core :as glossary.core]
   [metabase.glossary.db :as glossary.db]
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
            [:term ms/NonBlankString]
            [:definition ms/NonBlankString]]]
  (api/create-check :model/Glossary body)
  (t2/hydrate (glossary.core/create-entry! api/*current-user-id* body) :creator))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an existing glossary entry."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   body :- [:map {:closed true}
            [:term ms/NonBlankString]
            [:definition ms/NonBlankString]]]
  (api/update-check (api/check-404 (glossary.db/glossary-entry id)) body)
  (t2/hydrate (glossary.core/update-entry! api/*current-user-id* id body) :creator))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a glossary entry."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/write-check (glossary.db/glossary-entry id))
  (glossary.core/delete-entry! api/*current-user-id* id)
  api/generic-204-no-content)
