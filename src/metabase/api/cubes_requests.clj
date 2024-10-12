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
  (->> (t2/select :cubes_requests)
       (into [])))

(api/defendpoint GET "/:id"
  "Fetch a single cube request by ID."
  [id]
  {id ms/PositiveInt}
  (let [result (t2/select-one :cubes_requests :id id)]
    (if result
      (t2/hydrate result :db)
      result)))

(api/defendpoint POST "/"
  "Create a new cube request."
  [:as {{:keys [description user admin_user verified_status in_semantic_layer requested_fields name type category]} :body}]
  {description ms/NonBlankString
   user        ms/NonBlankString
   admin_user  [:maybe ms/NonBlankString]
   verified_status :boolean
   in_semantic_layer :boolean
   requested_fields [:maybe [:sequential ms/NonBlankString]]
   name        [:maybe ms/NonBlankString]
   type        [:maybe ms/NonBlankString]
   category    [:maybe ms/NonBlankString]}
  (let [cubes-request-data {:description     description
                            :user            user
                            :admin_user      admin_user
                            :verified_status verified_status
                            :in_semantic_layer in_semantic_layer
                            :requested_fields (into-array String requested_fields)
                            :name            name
                            :type            type
                            :category        category}]
    (t2/with-transaction [_conn]
      (let [cubes-request (api/check-500 (t2/insert! :cubes_requests cubes-request-data))]
        cubes-request))))

;; New POST endpoint for /register
(api/defendpoint POST "/register"
  "Register a new cube connection."
  [:as {{:keys [projectName dockerfile dockerContextPath customGitUrl customGitBranch customGitBuildPath apiUrl token apiPort]} :body}]
  {projectName ms/NonBlankString
   dockerfile ms/NonBlankString
   dockerContextPath ms/NonBlankString
   customGitUrl ms/NonBlankString
   customGitBranch ms/NonBlankString
   customGitBuildPath ms/NonBlankString
   apiUrl ms/NonBlankString
   token ms/NonBlankString
   apiPort ms/PositiveInt}
  (let [register-data {:projectName        projectName
                       :dockerfile         dockerfile
                       :dockerContextPath  dockerContextPath
                       :customGitUrl       customGitUrl
                       :customGitBranch    customGitBranch
                       :customGitBuildPath customGitBuildPath
                       :apiUrl             apiUrl
                       :token              token
                       :apiPort            apiPort}]
    (t2/with-transaction [_conn]
      (let [register-result (api/check-500 (t2/insert! :cube_connections register-data))]
        register-result))))

;; New POST endpoint for /deploy
(api/defendpoint POST "/deploy"
  "Deploy a cube by project name."
  [:as {{:keys [projectName]} :body}]
  {projectName ms/NonBlankString}
  (let [deploy-data {:projectName projectName}]
    (t2/with-transaction [_conn]
      ;; Insert deploy logic, if necessary, or trigger relevant actions
      (let [deploy-result (api/check-500 (t2/insert! :cube_deployments deploy-data))]
        deploy-result))))

(derive :event/cubes_requests-update :metabase/event)

(defn- write-check-and-update-cubes-request!
  "Check whether the current user has write permissions, then update `CubesRequest` fields."
  [id {:keys [description user admin_user verified_status in_semantic_layer name type category], :as body}]
  (println "Incoming body for update:" body)

  (let [existing   (api/write-check CubesRequest id)
        selected-fields (u/select-keys-when body
                           :present #{:description :user :admin_user :verified_status :in_semantic_layer :name :type :category})
        changes    (when-not (= selected-fields existing)
                     selected-fields)]

    (when changes
      (let [update-result (t2/update! CubesRequest id changes)]
        (println "Update result:" update-result)))

    (let [updated-entity (t2/select-one CubesRequest :id id)]
      (println "Updated entity fetched after update:" updated-entity)
      (when updated-entity
        (let [hydrated-entity (t2/hydrate updated-entity :db)]
          (events/publish-event! :event/cubes_requests-update
                                 {:object hydrated-entity :user-id api/*current-user-id*})
          hydrated-entity)))))

(api/defendpoint PUT "/:id"
  "Update fields of a `CubesRequest` with ID."
  [id :as {{:keys [description user admin_user verified_status in_semantic_layer requested_fields name type category], :as body} :body}]
  {id                ms/PositiveInt
   description       [:maybe ms/NonBlankString]
   user              [:maybe ms/NonBlankString]
   admin_user        [:maybe ms/NonBlankString]
   verified_status   [:maybe :boolean]
   in_semantic_layer [:maybe :boolean]
   requested_fields  [:maybe [:sequential ms/NonBlankString]]
   name              [:maybe ms/NonBlankString]
   type              [:maybe ms/NonBlankString]
   category          [:maybe ms/NonBlankString]}
  (write-check-and-update-cubes-request! id body))

(api/define-routes)
