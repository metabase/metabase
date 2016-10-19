(ns metabase.api.metric
  "/api/metric endpoints."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [hydrate :refer [hydrate]]
                             [interface :as models]
                             [metric :refer [Metric], :as metric]
                             [revision :as revision]
                             [table :refer [Table]])))


(defendpoint POST "/"
  "Create a new `Metric`."
  [:as {{:keys [name description table_id definition]} :body}]
  {name       [Required NonEmptyString]
   table_id   [Required Integer]
   definition [Required Dict]}
  (check-superuser)
  (write-check Table table_id)
  (check-500 (metric/create-metric! table_id name description *current-user-id* definition)))


(defendpoint GET "/:id"
  "Fetch `Metric` with ID."
  [id]
  (check-superuser)
  (read-check (metric/retrieve-metric id)))


(defendpoint GET "/"
  "Fetch *all* `Metrics`."
  [id]
  (filter models/can-read? (-> (db/select Metric, :is_active true)
                               (hydrate :creator))))


(defendpoint PUT "/:id"
  "Update a `Metric` with ID."
  [id :as {{:keys [name description caveats points_of_interest how_is_this_calculated show_in_getting_started definition revision_message]} :body}]
  {name             [Required NonEmptyString]
   revision_message [Required NonEmptyString]
   definition       [Required Dict]}
  (check-superuser)
  (write-check Metric id)
  (metric/update-metric!
    {:id                      id
     :name                    name
     :description             description
     :caveats                 caveats
     :points_of_interest      points_of_interest
     :how_is_this_calculated  how_is_this_calculated
     :show_in_getting_started show_in_getting_started
     :definition              definition
     :revision_message        revision_message}
    *current-user-id*))

(defendpoint PUT "/:id/important_fields"
  "Update the important `Fields` for a `Metric` with ID.
   (This is used for the Getting Started guide)."
  [id :as {{:keys [important_field_ids]} :body}]
  {important_field_ids [Required ArrayOfIntegers]}
  (check-superuser)
  (write-check Metric id)
  (check (<= (count important_field_ids) 3)
    [400 "A Metric can have a maximum of 3 important fields."])
  (let [[fields-to-remove fields-to-add] (data/diff (set (db/select-field :field_id 'MetricImportantField :metric_id id))
                                                    (set important_field_ids))]

    ;; delete old fields as needed
    (when (seq fields-to-remove)
      (db/delete! 'MetricImportantField {:metric_id id, :field_id [:in fields-to-remove]}))
    ;; add new fields as needed
    (db/insert-many! 'MetricImportantField (for [field-id fields-to-add]
                                             {:metric_id id, :field_id field-id}))
    ;; we're done (TODO - Do we want to return anything here?)
    {:success true}))


(defendpoint DELETE "/:id"
  "Delete a `Metric`."
  [id revision_message]
  {revision_message [Required NonEmptyString]}
  (check-superuser)
  (write-check Metric id)
  (metric/delete-metric! id *current-user-id* revision_message)
  {:success true})


(defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Metric` with ID."
  [id]
  (check-superuser)
  (write-check Metric id)
  (revision/revisions+details Metric id))


(defendpoint POST "/:id/revert"
  "Revert a `Metric` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id [Required Integer]}
  (check-superuser)
  (write-check Metric id)
  (revision/revert!
    :entity      Metric
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))


(define-routes)

[]
