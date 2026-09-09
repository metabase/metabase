(ns metabase.glossary.api
  "REST API endpoints for managing glossary entries."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.glossary.db :as glossary.db]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch all glossary entries, optionally filtered by search term."
  [_route-params
   {:keys [search]} :- [:maybe [:map [:search {:optional true} [:maybe ms/NonBlankString]]]]]
  {:data (t2/hydrate (glossary.db/glossary-entries search) :creator)})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new glossary entry."
  [_route-params
   _query-params
   {:keys [term definition]} :- [:map
                                 [:term ms/NonBlankString]
                                 [:definition ms/NonBlankString]]]
  (api/check-data-analyst)
  (let [glossary (glossary.db/insert-glossary-entry!
                  {:term       term
                   :definition definition
                   :creator_id api/*current-user-id*})]
    (events/publish-event! :event/glossary-create
                           {:object glossary
                            :user-id api/*current-user-id*})
    (t2/hydrate glossary :creator)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an existing glossary entry."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [term definition]} :- [:map
                                 [:term ms/NonBlankString]
                                 [:definition ms/NonBlankString]]]
  (api/check-data-analyst)
  (let [previous-glossary (api/check-404 (glossary.db/glossary-entry id))]
    (glossary.db/update-glossary-entry! id term definition)
    (let [glossary (glossary.db/glossary-entry id)]
      (events/publish-event! :event/glossary-update
                             {:object glossary
                              :previous-object previous-glossary
                              :user-id api/*current-user-id*})
      (t2/hydrate glossary :creator))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a glossary entry."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-data-analyst)
  (let [glossary (api/check-404 (glossary.db/glossary-entry id))]
    (glossary.db/delete-glossary-entry! id)
    (events/publish-event! :event/glossary-delete
                           {:object glossary
                            :user-id api/*current-user-id*}))
  api/generic-204-no-content)
