(ns metabase.api.metric
  "/api/metric endpoints."
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [revision :as revision]
                             [metric :refer [Metric] :as metric]
                             [table :refer [Table]])))


(defendpoint POST "/"
  "Create a new `Metric`."
  [:as {{:keys [name description table_id definition] :as body} :body}]
  {name       [Required NonEmptyString]
   table_id   [Required Integer]
   definition [Required Dict]}
  (check-superuser)
  (checkp #(db/exists? Table :id table_id) "table_id" "Table does not exist.")
  (->500 (metric/create-metric table_id name description *current-user-id* definition)))


(defendpoint GET "/:id"
  "Fetch `Metric` with ID."
  [id]
  (check-superuser)
  (->404 (metric/retrieve-metric id)))


(defendpoint PUT "/:id"
  "Update a `Metric` with ID."
  [id :as {{:keys [name description definition revision_message] :as body} :body}]
  {name             [Required NonEmptyString]
   revision_message [Required NonEmptyString]
   definition       [Required Dict]}
  (check-superuser)
  (check-404 (metric/exists-metric? id))
  (metric/update-metric
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
  (check-404 (metric/exists-metric? id))
  (metric/delete-metric id *current-user-id* revision_message)
  {:success true})


(defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Metric` with ID."
  [id]
  (check-superuser)
  (check-404 (metric/exists-metric? id))
  (revision/revisions+details Metric id))


(defendpoint POST "/:id/revert"
  "Revert a `Metric` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id [Required Integer]}
  (check-superuser)
  (check-404 (metric/exists-metric? id))
  (revision/revert
    :entity      Metric
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))


(define-routes)
