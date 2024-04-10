(ns metabase.api.segment
  "/api/segment endpoints."
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision]
   [metabase.models.segment :as segment :refer [Segment]]
   [metabase.related :as related]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint POST "/"
  "Create a new `Segment`."
  [:as {{:keys [name description table_id definition], :as body} :body}]
  {name        ms/NonBlankString
   table_id    ms/PositiveInt
   definition  ms/Map
   description [:maybe :string]}
  ;; TODO - why can't we set other properties like `show_in_getting_started` when we create the Segment?
  (api/create-check Segment body)
  (let [segment (api/check-500
                 (first (t2/insert-returning-instances! Segment
                                                        :table_id    table_id
                                                        :creator_id  api/*current-user-id*
                                                        :name        name
                                                        :description description
                                                        :definition  definition)))]
    (events/publish-event! :event/segment-create {:object segment :user-id api/*current-user-id*})
    (t2/hydrate segment :creator)))

(mu/defn ^:private hydrated-segment [id :- ms/PositiveInt]
  (-> (api/read-check (t2/select-one Segment :id id))
      (t2/hydrate :creator)))

(api/defendpoint GET "/:id"
  "Fetch `Segment` with ID."
  [id]
  {id ms/PositiveInt}
  (hydrated-segment id))

(api/defendpoint GET "/"
  "Fetch *all* `Segments`."
  []
  (as-> (t2/select Segment, :archived false, {:order-by [[:%lower.name :asc]]}) segments
    (filter mi/can-read? segments)
    (t2/hydrate segments :creator :definition_description)))

(defn- write-check-and-update-segment!
  "Check whether current user has write permissions, then update Segment with values in `body`. Publishes appropriate
  event and returns updated/hydrated Segment."
  [id {:keys [revision_message], :as body}]
  (let [existing   (api/write-check Segment id)
        clean-body (u/select-keys-when body
                     :present #{:description :caveats :points_of_interest}
                     :non-nil #{:archived :definition :name :show_in_getting_started})
        new-def    (->> clean-body :definition (mbql.normalize/normalize-fragment []))
        new-body   (merge
                     (dissoc clean-body :revision_message)
                     (when new-def {:definition new-def}))
        changes    (when-not (= new-body existing)
                     new-body)
        archive?   (:archived changes)]
    (when changes
      (t2/update! Segment id changes))
    (u/prog1 (hydrated-segment id)
      (events/publish-event! (if archive? :event/segment-delete :event/segment-update)
                             {:object <> :user-id api/*current-user-id* :revision-message revision_message}))))

(api/defendpoint PUT "/:id"
  "Update a `Segment` with ID."
  [id :as {{:keys [name definition revision_message archived caveats description points_of_interest
                   show_in_getting_started]
            :as   body} :body}]
  {id                      ms/PositiveInt
   name                    [:maybe ms/NonBlankString]
   definition              [:maybe :map]
   revision_message        ms/NonBlankString
   archived                [:maybe :boolean]
   caveats                 [:maybe :string]
   description             [:maybe :string]
   points_of_interest      [:maybe :string]
   show_in_getting_started [:maybe :boolean]}
  (write-check-and-update-segment! id body))

(api/defendpoint DELETE "/:id"
  "Archive a Segment. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.)"
  [id revision_message]
  {id               ms/PositiveInt
   revision_message ms/NonBlankString}
  (log/warn "DELETE /api/segment/:id is deprecated. Instead, change its `archived` value via PUT /api/segment/:id.")
  (write-check-and-update-segment! id {:archived true, :revision_message revision_message})
  api/generic-204-no-content)

(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Segment` with ID."
  [id]
  {id ms/PositiveInt}
  (api/read-check Segment id)
  (revision/revisions+details Segment id))

(api/defendpoint POST "/:id/revert"
  "Revert a `Segement` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {id          ms/PositiveInt
   revision_id ms/PositiveInt}
  (api/write-check Segment id)
  (revision/revert!
   {:entity      Segment
    :id          id
    :user-id     api/*current-user-id*
    :revision-id revision_id}))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one Segment :id id) api/read-check related/related))

(api/define-routes)
