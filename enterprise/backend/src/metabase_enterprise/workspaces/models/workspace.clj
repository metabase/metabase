(ns metabase-enterprise.workspaces.models.workspace
  "Workspaces are a container that an LLM can use to store and manage state. They are the answer to 'How do we allow LLMs to do stuff, in a safe way?'.

  It has locked down permissions and
   is used to store information that the LLM can use to answer questions or perform tasks. It is not a database, but
   rather a way to manage state in a way that is secure and controlled.



  There's also a concept of a workspace having a user and a workspace having a database. The user has limited access to the database so that they can only
   access the data that is relevant to them. The workspace is a way to manage this access and control what the user can do with the data.

  Workspace users are not the same as Metabase users. They do not have a permission group, They are a separate concept
  that is used to manage access to the workspace and the data within it. Creating a workspace should also create a user.

  Workspaces are independent of one another by design. A workspace can be deleted without affecting other workspaces.
  And they cannot be used together. This is to ensure that the data in one workspace cannot be accessed by another
  workspace user.

  "
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

#_:clj-kondo/ignore ;;nocommit
(require '[malli.core :as mc] '[malli.error :as me] '[malli.util :as mut] '[metabase.util.malli :as mu]
         '[metabase.util.malli.describe :as umd] '[malli.provider :as mp] '[malli.generator :as mg]
         '[malli.transform :as mtx] '[metabase.util.malli.registry :as mr] '[malli.json-schema :as mjs])

(do (mr/def ::workspace
      [:map
       [:name [:string {:min 1}]]
       [:description {:optional true} [:maybe :string]]
       [:created-at [:string {:description "The date and time the workspace was created"}]]
       [:updated-at [:string {:description "The date and time the workspace was last updated"}]]
       ;; each plan, transofrm, and document(<-unsure) is basically an abstract file
       [:plans {:optional true} [:map-of
                                 [:string {:description "The path to the plan" :min 1}]
                                 [:map
                                  [:title :string]
                                  [:description :string]
                                  [:features [:sequential
                                              [:map
                                               [:title :string]
                                               [:description :string]]]]]]]
       [:activity-logs {:optional true} [:map-of
                                         [:int {:description "ID of the activity log" :min 1}]
                                         [:map
                                          [:name [:string {:min 1}]]
                                          ;; needs a plan?
                                          [:steps [:sequential
                                                   [:map
                                                    [:step-id :int]
                                                    [:description :string]
                                                    [:status [:enum :pending :running :completed :failed]]
                                                    [:outcome {:optional true} [:enum :success :error :warning]]
                                                    [:error-message {:optional true} :string]
                                                    [:start-time [:string {:description "When the step started"}]]
                                                    [:end-time {:optional true} [:maybe {:description "When the step ended"} :string]]
                                                    [:created-at [:string {:description "When the step was created"}]]
                                                    [:updated-at [:string {:description "When the step was last updated"}]]]]]]]]
       [:transforms {:optional true} [:map-of
                                      [:string {:min 1
                                                :description "The path/filename to the transform"}]
                                      [:map
                                       [:title :string]
                                       [:description :string]
                                       [:type [:enum :text :code :file]]
                                       [:config {:optional true} [:map]]]]]
       [:documents {:optional true} [:sequential
                                     [:int {:description "ID of a document in app-db" :min 1}]]]
       [:user {:optional true} [:map
                                [:id :int]
                                [:name :string]
                                [:email :string]
                                ;; api-key?
                                ;; db creds?
                                ]]
       [:dwh {:optional true}
        [:map-of
         [:int {:description "dwh id"}]
         [:map
          [:credentials :map]
          [:name :string]
          [:type [:enum :postgres :mysql :bigquery :redshift :snowflake]]]]]
       ;; For permissions, we could keep a set of tables with read/write permissions
       [:permissions {:optional true}
        [:sequential
         [:map
          [:table :string]
          [:permission [:enum :read :write]]]]]])
    (mr/resolve-schema ::workspace))

#_:clj-kondo/ignore ;;nocommit
(require '[malli.core :as mc] '[malli.error :as me] '[malli.util :as mut] '[metabase.util.malli :as mu]
         '[metabase.util.malli.describe :as umd] '[malli.provider :as mp] '[malli.generator :as mg]
         '[malli.transform :as mtx] '[metabase.util.malli.registry :as mr] '[malli.json-schema :as mjs])

(mut/keys (mr/resolve-schema ::workspace))
;; => (:name
;;     :description
;;     :created-at
;;     :updated-at
;;     :plans
;;     :activity-logs
;;     :transforms
;;     :documents
;;     :user
;;     :databases
;;     :permissions)

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(t2/deftransforms :model/Workspace
  {:plans mi/transform-json
   :activity-logs mi/transform-json
   :transforms mi/transform-json
   :documents mi/transform-json
   :user mi/transform-json
   :dwh mi/transform-json
   :permissions mi/transform-json})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))
