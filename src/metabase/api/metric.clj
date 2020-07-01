(ns metabase.api.metric
  "/api/metric endpoints."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [metabase
             [events :as events]
             [related :as related]
             [util :as u]]
            [metabase.api
             [common :as api]
             [query-description :as qd]]
            [metabase.mbql.normalize :as normalize]
            [metabase.models
             [interface :as mi]
             [metric :as metric :refer [Metric]]
             [revision :as revision]
             [table :refer [Table]]]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(api/defendpoint POST "/"
  "Create a new `Metric`."
  [:as {{:keys [name description table_id definition], :as body} :body}]
  {name        su/NonBlankString
   table_id    su/IntGreaterThanZero
   definition  su/Map
   description (s/maybe s/Str)}
  ;; TODO - why can't set the other properties like `show_in_getting_started` when you create a Metric?
  (api/create-check Metric body)
  (let [metric (api/check-500
                (db/insert! Metric
                  :table_id    table_id
                  :creator_id  api/*current-user-id*
                  :name        name
                  :description description
                  :definition  definition))]
    (-> (events/publish-event! :metric-create metric)
        (hydrate :creator))))

(s/defn ^:private hydrated-metric [id :- su/IntGreaterThanZero]
  (-> (api/read-check (Metric id))
      (hydrate :creator)))

(defn- add-query-descriptions
  [metrics] {:pre [(coll? metrics)]}
  (when (some? metrics)
    (for [metric metrics]
      (let [table (Table (:table_id metric))]
        (assoc metric
               :query_description
               (qd/generate-query-description table (:definition metric)))))))

(api/defendpoint GET "/:id"
  "Fetch `Metric` with ID."
  [id]
  (first (add-query-descriptions [(hydrated-metric id)])))

(defn- add-db-ids
  "Add `:database_id` fields to `metrics` by looking them up from their `:table_id`."
  [metrics]
  (when (seq metrics)
    (let [table-id->db-id (db/select-id->field :db_id Table, :id [:in (set (map :table_id metrics))])]
      (for [metric metrics]
        (assoc metric :database_id (table-id->db-id (:table_id metric)))))))

(api/defendpoint GET "/"
  "Fetch *all* `Metrics`."
  [id]
  (as-> (db/select Metric, :archived false, {:order-by [:%lower.name]}) metrics
    (hydrate metrics :creator)
    (add-db-ids metrics)
    (filter mi/can-read? metrics)
    (add-query-descriptions metrics)))

(defn- write-check-and-update-metric!
  "Check whether current user has write permissions, then update Metric with values in `body`. Publishes appropriate
  event and returns updated/hydrated Metric."
  [id {:keys [revision_message archived], :as body}]
  (let [existing   (api/write-check Metric id)
        clean-body (u/select-keys-when body
                     :present #{:description :caveats :how_is_this_calculated :points_of_interest}
                     :non-nil #{:archived :definition :name :show_in_getting_started})
        new-def    (->> clean-body :definition (normalize/normalize-fragment []))
        new-body   (merge
                     (dissoc clean-body :revision_message)
                     (when new-def {:definition new-def}))
        changes    (when-not (= new-body existing)
                     new-body)
        archive?   (:archived changes)]
    (when changes
      (db/update! Metric id changes))
    (u/prog1 (hydrated-metric id)
      (events/publish-event! (if archive? :metric-delete :metric-update)
        (assoc <> :actor_id api/*current-user-id*, :revision_message revision_message)))))

(api/defendpoint PUT "/:id"
  "Update a `Metric` with ID."
  [id :as {{:keys [name definition revision_message archived caveats description how_is_this_calculated
                   points_of_interest show_in_getting_started]
            :as   body} :body}]
  {name                    (s/maybe su/NonBlankString)
   definition              (s/maybe su/Map)
   revision_message        su/NonBlankString
   archived                (s/maybe s/Bool)
   caveats                 (s/maybe s/Str)
   description             (s/maybe s/Str)
   how_is_this_calculated  (s/maybe s/Str)
   points_of_interest      (s/maybe s/Str)
   show_in_getting_started (s/maybe s/Bool)}
  (write-check-and-update-metric! id body))

(api/defendpoint PUT "/:id/important_fields"
  "Update the important `Fields` for a `Metric` with ID.
   (This is used for the Getting Started guide)."
  [id :as {{:keys [important_field_ids]} :body}]
  {important_field_ids [su/IntGreaterThanZero]}
  (api/check-superuser)
  (api/write-check Metric id)
  (api/check (<= (count important_field_ids) 3)
    [400 "A Metric can have a maximum of 3 important fields."])
  (let [[fields-to-remove fields-to-add] (data/diff (set (db/select-field :field_id 'MetricImportantField :metric_id id))
                                                    (set important_field_ids))]

    ;; delete old fields as needed
    (when (seq fields-to-remove)
      (db/simple-delete! 'MetricImportantField {:metric_id id, :field_id [:in fields-to-remove]}))
    ;; add new fields as needed
    (db/insert-many! 'MetricImportantField (for [field-id fields-to-add]
                                             {:metric_id id, :field_id field-id}))
    {:success true}))


(api/defendpoint DELETE "/:id"
  "Archive a Metric. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.)"
  [id revision_message]
  {revision_message su/NonBlankString}
  (log/warn
   (trs "DELETE /api/metric/:id is deprecated. Instead, change its `archived` value via PUT /api/metric/:id."))
  (write-check-and-update-metric! id {:archived true, :revision_message revision_message})
  api/generic-204-no-content)


(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Metric` with ID."
  [id]
  (api/read-check Metric id)
  (revision/revisions+details Metric id))


(api/defendpoint POST "/:id/revert"
  "Revert a `Metric` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id su/IntGreaterThanZero}
  (api/write-check Metric id)
  (revision/revert!
    :entity      Metric
    :id          id
    :user-id     api/*current-user-id*
    :revision-id revision_id))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  (-> id Metric api/read-check related/related))


(api/define-routes)
