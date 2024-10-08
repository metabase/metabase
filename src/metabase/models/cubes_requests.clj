(ns metabase.models.cubes_requests
  "This namespace defines the model for the CubesRequest, RegisterCube, and DeployCube entities. It includes functions to handle CRUD operations
   and related business logic for managing cube requests, registrations, and deployments within the application."
  (:require
   [malli.core :as mc]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [metabase.api.common :as api]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def CubesRequest
  "Defines the model name for cube requests using toucan2."
  :model/CubesRequest)

(def RegisterCube
  "Defines the model name for cube registration using toucan2."
  :model/RegisterCube)

(def DeployCube
  "Defines the model name for cube deployment using toucan2."
  :model/DeployCube)

(methodical/defmethod t2/table-name :model/CubesRequest [_model] :cubes_requests)  ;; Updated table name
(methodical/defmethod t2/table-name :model/RegisterCube [_model] :cube_connections)  ;; Table for registration data
(methodical/defmethod t2/table-name :model/DeployCube [_model] :cube_deployments)  ;; Table for deployment data

(methodical/defmethod t2/model-for-automagic-hydration [:default :cubes_requests] [_original-model _k] :model/CubesRequest)
(methodical/defmethod t2/model-for-automagic-hydration [:default :cube_connections] [_original-model _k] :model/RegisterCube)
(methodical/defmethod t2/model-for-automagic-hydration [:default :cube_deployments] [_original-model _k] :model/DeployCube)

;;; ----------------------------------------------- CRUD Operations --------------------------------------------------

(defn- assert-valid-register-cube [{:keys [projectName dockerfile dockerContextPath customGitUrl customGitBranch customGitBuildPath apiUrl token apiPort]}]
  (when-not (mc/validate ms/NonBlankString projectName)
    (throw (ex-info (tru "Project Name must be a non-blank string.") {:projectName projectName})))
  (when-not (mc/validate ms/NonBlankString dockerfile)
    (throw (ex-info (tru "Dockerfile must be a non-blank string.") {:dockerfile dockerfile})))
  (when-not (mc/validate ms/NonBlankString customGitUrl)
    (throw (ex-info (tru "Custom Git URL must be a non-blank string.") {:customGitUrl customGitUrl})))
  (when-not (mc/validate ms/NonBlankString apiUrl)
    (throw (ex-info (tru "API URL must be a non-blank string.") {:apiUrl apiUrl})))
  (when-not (mc/validate ms/NonBlankString token)
    (throw (ex-info (tru "Token must be a non-blank string.") {:token token})))
  (when-not (mc/validate ms/PositiveInt apiPort)
    (throw (ex-info (tru "API Port must be a positive integer.") {:apiPort apiPort}))))

(defn- assert-valid-deploy-cube [{:keys [projectName]}]
  (when-not (mc/validate ms/NonBlankString projectName)
    (throw (ex-info (tru "Project Name must be a non-blank string.") {:projectName projectName}))))

(t2/define-before-insert :model/RegisterCube
  [register_cube]
  (u/prog1 register_cube
    (assert-valid-register-cube register_cube)))

(t2/define-before-insert :model/DeployCube
  [deploy_cube]
  (u/prog1 deploy_cube
    (assert-valid-deploy-cube deploy_cube)))

;;; ----------------------------------------------- Fetch Functions ---------------------------------------------------

(mu/defn retrieve-cube-registrations :- [:sequential (ms/InstanceOf RegisterCube)]
  "Fetch all Cube Registrations."
  []
  (t2/select RegisterCube))

(mu/defn retrieve-cube-deployments :- [:sequential (ms/InstanceOf DeployCube)]
  "Fetch all Cube Deployments."
  []
  (t2/select DeployCube))

(mu/defn create-cube-registration :- (ms/InstanceOf RegisterCube)
  "Register a new Cube Connection."
  [register_data :- [:map 
                     [:projectName ms/NonBlankString]
                     [:dockerfile ms/NonBlankString]
                     [:dockerContextPath ms/NonBlankString]
                     [:customGitUrl ms/NonBlankString]
                     [:customGitBranch ms/NonBlankString]
                     [:customGitBuildPath ms/NonBlankString]
                     [:apiUrl ms/NonBlankString]
                     [:token ms/NonBlankString]
                     [:apiPort ms/PositiveInt]]]
  (t2/with-transaction [_conn]
    (t2/insert-returning-instances! RegisterCube register_data)))

(mu/defn create-cube-deployment :- (ms/InstanceOf DeployCube)
  "Deploy a Cube by Project Name."
  [deploy_data :- [:map [:projectName ms/NonBlankString]]]
  (t2/with-transaction [_conn]
    (t2/insert-returning-instances! DeployCube deploy_data)))

;;; --------------------------------------------- Permission Checking ------------------------------------------------

(defmethod mi/can-write? :model/RegisterCube
  [_instance]
  ;; Always return true to allow all users to write
  true)

(defmethod mi/can-write? :model/DeployCube
  [_instance]
  ;; Always return true to allow all users to write
  true)
