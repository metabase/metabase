(ns metabase.segments.rest.api
  "/api/segment endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.models.interface :as mi]
   [metabase.segments.db :as segments.db]
   [metabase.segments.schema :as segments.schema]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.core :as xrays]
   [toucan2.core :as t2]))

(defn create-segment!
  "Create-check and insert a new Segment and return the hydrated Segment."
  [{:keys [name description definition], :as body}]
  (let [definition (lib-be/normalize-query definition)]
    (api/create-check :model/Segment (assoc body :definition definition))
    (let [segment (api/check-500
                   (segments.db/insert-segment! api/*current-user-id* name description definition))]
      (t2/hydrate segment :creator))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `Segment`. The Segment's table is derived from its `definition`."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:name        ::segments.schema/segment.name]
            [:definition  ::segments.schema/definition]
            [:description {:optional true} [:maybe :string]]]]
  (create-segment! body))

(mu/defn- hydrated-segment [id :- ms/PositiveInt]
  (-> (api/read-check (segments.db/segment id))
      (t2/hydrate :creator)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch `Segment` with ID."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (hydrated-segment id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch *all* `Segments`."
  []
  (-> (mi/readable (segments.db/unarchived-segments))
      (t2/hydrate :creator :definition_description)))

(defn write-check-and-update-segment!
  "Applies `body` to the Segment with `id` after its update check, with `revision_message` as the message of the
  revision, and returns the hydrated Segment."
  [id {:keys [revision_message], :as body}]
  (let [existing   (api/write-check :model/Segment id)
        clean-body (u/select-keys-when body
                                       :present #{:description :caveats :points_of_interest}
                                       :non-nil #{:archived :definition :name :show_in_getting_started})
        new-body   (dissoc clean-body :revision_message)
        changes    (when-not (= new-body existing)
                     new-body)]
    (api/update-check existing new-body)
    (when changes
      (events/with-event-context {:revision-message revision_message}
        (segments.db/update-segment! id (cond-> changes
                                          (:definition changes) (update :definition lib-be/normalize-query)))))
    (hydrated-segment id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a `Segment` with ID."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map {:closed true}
            [:name                    {:optional true} [:maybe ::segments.schema/segment.name]]
            [:definition              {:optional true} [:maybe ::segments.schema/definition]]
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
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :delete "/:id" :- ::api/generic-204-no-content
  "Archive a Segment. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.)"
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   {:keys [revision_message]} :- [:map {:closed true}
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
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (segments.db/segment id) api/read-check xrays/related))
