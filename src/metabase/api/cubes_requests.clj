(ns metabase.api.cubes_requests
  "/api/cubes_requests endpoints."
  (:require
    [compojure.core :refer [PUT GET POST]]
    [metabase.api.common :as api]
    [metabase.events :as events]
    [metabase.models.cubes_requests :as cubes_requests :refer [CubesRequest]]
    [metabase.util :as u]
    [metabase.util.malli.schema :as ms]
    [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api/defendpoint GET "/"
  "Fetch all cubes requests."
  []
  (->> (t2/select :cubes_requests)  ;; Updated table name
       (into [])))  ;; Directly return results

(api/defendpoint GET "/:id"
  "Fetch a single cube request by ID."
  [id]
  {id ms/PositiveInt}
  (let [result (t2/select-one :cubes_requests :id id)]  ;; Updated table name
    ;; Ensure hydration only happens if needed
    (if result
      (t2/hydrate result :db)  ;; Hydrate with necessary data if needed
      result)))

(api/defendpoint POST "/"
  "Create a new cube request."
  [:as {{:keys [description user admin_user verified_status in_semantic_layer]} :body}]
  {description ms/NonBlankString
   user        ms/NonBlankString
   admin_user  ms/NonBlankString
   verified_status :boolean  ;; Changed from :boolean to ms/NonBlankString
   in_semantic_layer :boolean}
  (let [cubes-request-data {:description     description
                            :user            user
                            :admin_user      admin_user
                            :verified_status verified_status
                            :in_semantic_layer in_semantic_layer
                            :creator_id      api/*current-user-id*}]
    (t2/with-transaction [_conn]
      (let [cubes-request (api/check-500 (t2/insert! :cubes_requests cubes-request-data))]  ;; Updated table name
        cubes-request))))  ;; Return the created cube request

(derive :event/cubes_requests-update :metabase/event)

(defn- write-check-and-update-cubes-request!
  "Check whether the current user has write permissions, then update `CubesRequest` fields."
  [id {:keys [description user admin_user verified_status in_semantic_layer], :as body}]
  ;; Logging incoming and existing data for debugging
  (println "Incoming body for update:" body)

  (let [existing   (api/write-check CubesRequest id)  ;; Check write permissions
        selected-fields (u/select-keys-when body       ;; Select fields to update
                           :present #{:description :user :admin_user :verified_status :in_semantic_layer})
        changes    (when-not (= selected-fields existing)  ;; Check if there are changes to apply
                     selected-fields)]

    ;; Apply changes if there are any
    (when changes
      (let [update-result (t2/update! CubesRequest id changes)]
        (println "Update result:" update-result)))  ;; Log the result of the update

    ;; Fetch the updated entity
    (let [updated-entity (t2/select-one CubesRequest :id id)]
      (println "Updated entity fetched after update:" updated-entity)
      (when updated-entity
        (let [hydrated-entity (t2/hydrate updated-entity :db)]
          ;; Ensure the event is correctly published with a valid topic
          (events/publish-event! :event/cubes_requests-update  
                                 {:object hydrated-entity :user-id api/*current-user-id*})
          hydrated-entity)))))

(api/defendpoint PUT "/:id"
  "Update fields of a `CubesRequest` with ID."
  [id :as {{:keys [description user admin_user verified_status in_semantic_layer], :as body} :body}]
  {id                ms/PositiveInt
   description       [:maybe ms/NonBlankString]
   user              [:maybe ms/NonBlankString]
   admin_user        [:maybe ms/NonBlankString]
   verified_status   [:maybe :boolean]  ;; Changed from :boolean to ms/NonBlankString
   in_semantic_layer [:maybe :boolean]}
  (write-check-and-update-cubes-request! id body))

(api/define-routes)
