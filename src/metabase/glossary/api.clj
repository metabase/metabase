(ns metabase.glossary.api
  "REST API endpoints for managing glossary entries."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
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
  (let [where (when search
                [:or
                 [:like [:lower :term] [:lower (str "%" search "%")]]
                 [:like [:lower :definition] [:lower (str "%" search "%")]]])]
    {:data (t2/hydrate (t2/select :model/Glossary (cond-> {:order-by [[:term :asc]]}
                                                    where (assoc :where where)))
                       :creator)}))

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
  (let [glossary (t2/insert-returning-instance! :model/Glossary
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
  (let [previous-glossary (api/check-404 (t2/select-one :model/Glossary :id id))]
    (t2/update! :model/Glossary id {:term term :definition definition})
    (let [glossary (t2/select-one :model/Glossary :id id)]
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
  (let [glossary (api/check-404 (t2/select-one :model/Glossary :id id))]
    (t2/delete! :model/Glossary :id id)
    (events/publish-event! :event/glossary-delete
                           {:object glossary
                            :user-id api/*current-user-id*}))
  api/generic-204-no-content)
