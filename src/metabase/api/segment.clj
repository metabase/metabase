(ns metabase.api.segment
  "/api/segment endpoints."
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision]
   [metabase.models.segment :as segment :refer [Segment]]
   [metabase.related :as related]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/"
  "Create a new `Segment`."
  [:as {{:keys [name description table_id definition], :as body} :body}]
  {name       su/NonBlankString
   table_id   su/IntGreaterThanZero
   definition su/Map
   description (s/maybe s/Str)}
  ;; TODO - why can't we set other properties like `show_in_getting_started` when we create the Segment?
  (api/create-check Segment body)
  (let [segment (api/check-500
                  (first (t2/insert-returning-instances! Segment
                                                         :table_id    table_id
                                                         :creator_id  api/*current-user-id*
                                                         :name        name
                                                         :description description
                                                         :definition  definition)))]
    (-> (events/publish-event! :segment-create segment)
        (t2/hydrate :creator))))

(s/defn ^:private hydrated-segment [id :- su/IntGreaterThanZero]
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
      (events/publish-event! (if archive? :segment-delete :segment-update)
        (assoc <> :actor_id api/*current-user-id*, :revision_message revision_message)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/:id"
  "Update a `Segment` with ID."
  [id :as {{:keys [name definition revision_message archived caveats description points_of_interest
                   show_in_getting_started]
            :as   body} :body}]
  {name                    (s/maybe su/NonBlankString)
   definition              (s/maybe su/Map)
   revision_message        su/NonBlankString
   archived                (s/maybe s/Bool)
   caveats                 (s/maybe s/Str)
   description             (s/maybe s/Str)
   points_of_interest      (s/maybe s/Str)
   show_in_getting_started (s/maybe s/Bool)}
  (write-check-and-update-segment! id body))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema DELETE "/:id"
  "Archive a Segment. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.)"
  [id revision_message]
  {revision_message su/NonBlankString}
  (log/warn
   (trs "DELETE /api/segment/:id is deprecated. Instead, change its `archived` value via PUT /api/segment/:id."))
  (write-check-and-update-segment! id {:archived true, :revision_message revision_message})
  api/generic-204-no-content)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:id/revisions"
  "Fetch `Revisions` for `Segment` with ID."
  [id]
  (api/read-check Segment id)
  (revision/revisions+details Segment id))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:id/revert"
  "Revert a `Segement` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id su/IntGreaterThanZero}
  (api/write-check Segment id)
  (revision/revert!
    :entity      Segment
    :id          id
    :user-id     api/*current-user-id*
    :revision-id revision_id))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:id/related"
  "Return related entities."
  [id]
  (-> (t2/select-one Segment :id id) api/read-check related/related))

(api/define-routes)
