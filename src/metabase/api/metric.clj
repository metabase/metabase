(ns metabase.api.metric
  "/api/metric endpoints."
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [hydrate :refer [hydrate]]
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
  (checkp #(db/exists? Table :id table_id) "table_id" "Table does not exist.")
  (check-500 (metric/create-metric! table_id name description *current-user-id* definition)))


(defendpoint GET "/:id"
  "Fetch `Metric` with ID."
  [id]
  (check-superuser)
  (check-404 (metric/retrieve-metric id)))

(defendpoint GET "/"
  "Fetch all `Metrics`. You must be a superuser to do this."
  [id]
  (check-superuser)
  (check-404 (-> (db/select Metric, :is_active true)
                 (hydrate :creator))))


(defendpoint PUT "/:id"
  "Update a `Metric` with ID."
  [id :as {{:keys [name description definition revision_message]} :body}]
  {name             [Required NonEmptyString]
   revision_message [Required NonEmptyString]
   definition       [Required Dict]}
  (check-superuser)
  (check-404 (metric/exists? id))
  (metric/update-metric!
    {:id               id
     :name             name
     :description      description
     :definition       definition
     :revision_message revision_message}
    *current-user-id*))


(defendpoint DELETE "/:id"
  "Delete a `Metric`."
  [id revision_message]
  {revision_message [Required NonEmptyString]}
  (check-superuser)
  (check-404 (metric/exists? id))
  (metric/delete-metric! id *current-user-id* revision_message)
  {:success true})


(defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Metric` with ID."
  [id]
  (check-superuser)
  (check-404 (metric/exists? id))
  (revision/revisions+details Metric id))


(defendpoint POST "/:id/revert"
  "Revert a `Metric` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id [Required Integer]}
  (check-superuser)
  (check-404 (metric/exists? id))
  (revision/revert!
    :entity      Metric
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))


(define-routes)
