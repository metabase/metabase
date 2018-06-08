(ns metabase.api.metric
  "/api/metric endpoints."
  (:require [clojure.data :as data]
            [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models
             [interface :as mi]
             [metric :as metric :refer [Metric]]
             [revision :as revision]
             [table :refer [Table]]]
            [metabase.related :as related]
            [metabase.util.schema :as su]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(api/defendpoint POST "/"
  "Create a new `Metric`."
  [:as {{:keys [name description table_id definition]} :body}]
  {name       su/NonBlankString
   table_id   su/IntGreaterThanZero
   definition su/Map}
  (api/check-superuser)
  (api/write-check Table table_id)
  (api/check-500 (metric/create-metric! table_id name description api/*current-user-id* definition)))


(api/defendpoint GET "/:id"
  "Fetch `Metric` with ID."
  [id]
  (api/check-superuser)
  (api/read-check (metric/retrieve-metric id)))

(defn- add-db-ids
  "Add `:database_id` fields to METRICS by looking them up from their `:table_id`."
  [metrics]
  (when (seq metrics)
    (let [table-id->db-id (db/select-id->field :db_id Table, :id [:in (set (map :table_id metrics))])]
      (for [metric metrics]
        (assoc metric :database_id (table-id->db-id (:table_id metric)))))))

(api/defendpoint GET "/"
  "Fetch *all* `Metrics`."
  [id]
  (as-> (db/select Metric, :archived false, {:order-by [:%lower.name]}) <>
    (hydrate <> :creator)
    (add-db-ids <>)
    (filter mi/can-read? <>)))


(api/defendpoint PUT "/:id"
  "Update a `Metric` with ID."
  [id :as {{:keys [definition name revision_message], :as body} :body}]
  {name             su/NonBlankString
   revision_message su/NonBlankString
   definition       su/Map}
  (api/check-superuser)
  (api/write-check Metric id)
  (metric/update-metric!
   (assoc (select-keys body #{:caveats :definition :description :how_is_this_calculated :name :points_of_interest
                              :revision_message :show_in_getting_started})
     :id id)
   api/*current-user-id*))

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
  "Delete a `Metric`."
  [id revision_message]
  {revision_message su/NonBlankString}
  (api/check-superuser)
  (api/write-check Metric id)
  (metric/delete-metric! id api/*current-user-id* revision_message)
  {:success true}) ; TODO - why doesn't this return a 204 'No Content'?


(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Metric` with ID."
  [id]
  (api/check-superuser)
  (api/write-check Metric id)
  (revision/revisions+details Metric id))


(api/defendpoint POST "/:id/revert"
  "Revert a `Metric` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id su/IntGreaterThanZero}
  (api/check-superuser)
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
