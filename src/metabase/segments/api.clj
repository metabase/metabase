(ns metabase.segments.api
  "/api/segment endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.core :as xrays]
   [toucan2.core :as t2]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `Segment`."
  [_route-params
   _query-params
   {:keys [name description table_id definition], :as body} :- [:map
                                                                [:name        ms/NonBlankString]
                                                                [:table_id    ms/PositiveInt]
                                                                [:definition  ms/Map]
                                                                [:description {:optional true} [:maybe :string]]]]
  ;; TODO - why can't we set other properties like `show_in_getting_started` when we create the Segment?
  (api/create-check :model/Segment body)
  (let [segment (api/check-500
                 (first (t2/insert-returning-instances! :model/Segment
                                                        :table_id    table_id
                                                        :creator_id  api/*current-user-id*
                                                        :name        name
                                                        :description description
                                                        :definition  definition)))]
    (events/publish-event! :event/segment-create {:object segment :user-id api/*current-user-id*})
    (t2/hydrate segment :creator)))

(mu/defn- hydrated-segment [id :- ms/PositiveInt]
  (-> (api/read-check (t2/select-one :model/Segment :id id))
      (t2/hydrate :creator)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch `Segment` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (hydrated-segment id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch *all* `Segments`."
  []
  (as-> (t2/select :model/Segment
                   :archived false
                   {:order-by [[:%lower.name :asc]]}) segments
    (filter mi/can-read? segments)
    (t2/hydrate segments :creator :definition_description)))

(defn- write-check-and-update-segment!
  "Check whether current user has write permissions, then update Segment with values in `body`. Publishes appropriate
  event and returns updated/hydrated Segment."
  [id {:keys [revision_message], :as body}]
  (let [existing   (api/write-check :model/Segment id)
        clean-body (u/select-keys-when body
                                       :present #{:description :caveats :points_of_interest}
                                       :non-nil #{:archived :definition :name :show_in_getting_started})
        new-body   (dissoc clean-body :revision_message)
        changes    (when-not (= new-body existing)
                     new-body)]
    (when changes
      (t2/update! :model/Segment id changes))
    (u/prog1 (hydrated-segment id)
      (events/publish-event! :event/segment-update
                             {:object <> :user-id api/*current-user-id* :revision-message revision_message}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a `Segment` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name                    {:optional true} [:maybe ms/NonBlankString]]
            [:definition              {:optional true} [:maybe :map]]
            [:revision_message        ms/NonBlankString]
            [:archived                {:optional true} [:maybe :boolean]]
            [:caveats                 {:optional true} [:maybe :string]]
            [:description             {:optional true} [:maybe :string]]
            [:points_of_interest      {:optional true} [:maybe :string]]
            [:show_in_getting_started {:optional true} [:maybe :boolean]]]]
  (write-check-and-update-segment! id body))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Archive a Segment. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.)"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [revision_message]} :- [:map
                                  [:revision_message ms/NonBlankString]]]
  (log/warn "DELETE /api/segment/:id is deprecated. Instead, change its `archived` value via PUT /api/segment/:id.")
  (write-check-and-update-segment! id {:archived true, :revision_message revision_message})
  api/generic-204-no-content)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/related"
  "Return related entities."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (-> (t2/select-one :model/Segment :id id) api/read-check xrays/related))
