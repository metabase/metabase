(ns metabase.models.cubes_requests
  "This namespace defines the model for the CubesRequest entity. It includes functions to handle CRUD operations
   and related business logic for managing cube requests within the application."
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
   [metabase.api.common :as api]))  ;; Added this require

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def CubesRequest
  "Defines the model name for cube requests using toucan2."
  :model/CubesRequest)

(methodical/defmethod t2/table-name :model/CubesRequest [_model] :cubes_requests)  ;; Updated table name
(methodical/defmethod t2/model-for-automagic-hydration [:default :cubes_requests] [_original-model _k] :model/CubesRequest)  ;; Updated table name

(doto :model/CubesRequest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.full-perms-for-perms-set))

(t2/deftransforms :model/CubesRequest
  {:parameters mi/transform-json})

;;; ----------------------------------------------- CRUD Operations --------------------------------------------------

(defn- assert-valid-cubes-request [{:keys [description user admin_user verified_status in_semantic_layer requested_fields name type category]}]
  (when-not (mc/validate ms/NonBlankString description)
    (throw (ex-info (tru "Description must be a non-blank string.") {:description description})))
  (when-not (mc/validate ms/NonBlankString user)
    (throw (ex-info (tru "User must be a non-blank string.") {:user user})))
  (when-not (mc/validate [:maybe ms/NonBlankString] admin_user)
    (throw (ex-info (tru "Admin User must be a non-blank string.") {:admin_user admin_user})))
  (when-not (mc/validate :boolean verified_status)
    (throw (ex-info (tru "Verified Status must be a boolean.") {:verified_status verified_status})))
  (when-not (mc/validate :boolean in_semantic_layer)
    (throw (ex-info (tru "In Semantic Layer must be a boolean.") {:in_semantic_layer in_semantic_layer})))
  (when-not (mc/validate [:maybe ms/NonBlankString] name)
    (throw (ex-info (tru "Name must be a non-blank string.") {:name name})))
  (when-not (mc/validate [:maybe ms/NonBlankString] type)
    (throw (ex-info (tru "Type must be a non-blank string.") {:type type})))
  (when-not (mc/validate [:maybe ms/NonBlankString] category)
    (throw (ex-info (tru "Category must be a non-blank string.") {:category category})))
  ;; Validate requested_fields if present
  (when-not (mc/validate [:maybe [:sequential ms/NonBlankString]] requested_fields)
    (throw (ex-info (tru "Requested Fields must be an array of non-blank strings.") {:requested_fields requested_fields}))))

(t2/define-before-insert :model/CubesRequest
  [cubes_request]
  (u/prog1 cubes_request
    (assert-valid-cubes-request cubes_request)))

(t2/define-before-update :model/CubesRequest
  [cubes_request]
  (u/prog1 cubes_request
    (assert-valid-cubes-request cubes_request)))

(t2/define-before-delete :model/CubesRequest
  [cubes_request]
  ;; Add any logic needed before deleting a cube request
  cubes_request)

;;; ----------------------------------------------- Hydration Methods ------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :attributes]
  [_model k cubes_request]
  (mi/instances-with-hydrated-data cubes_request k))

;;; --------------------------------------------- Serialization Methods ----------------------------------------------

(defmethod serdes/extract-one "cubes_requests"  ;; Updated table name
  [_model-name _opts cubes_request]
  (serdes/extract-one-basics "cubes_requests" cubes_request))  ;; Ensure requested_fields is included

(defmethod serdes/load-xform "cubes_requests" [cubes_request]  ;; Updated table name
  (serdes/load-xform-basics cubes_request))

(defmethod serdes/dependencies "cubes_requests" [_cubes_request]  ;; Updated table name
  [])

;;; ----------------------------------------------- Fetch Functions ---------------------------------------------------

(mu/defn retrieve-cubes-requests :- [:sequential (ms/InstanceOf CubesRequest)]
  "Fetch all Cube Requests."
  []
  (t2/select CubesRequest))

(mu/defn retrieve-cubes-request-detail :- [:maybe (ms/InstanceOf CubesRequest)]
  "Fetch a single Cube Request by `id`."
  [cubes_request-id]
  (t2/select-one CubesRequest :id (u/the-id cubes_request-id)))

(mu/defn create-cubes-request-detail :- (ms/InstanceOf CubesRequest)
  "Create a new Cube Request."
  [cubes_request_data :- [:map 
                          [:description ms/NonBlankString]
                          [:user ms/NonBlankString]
                          [:admin_user [:maybe ms/NonBlankString]]
                          [:verified_status :boolean]
                          [:in_semantic_layer :boolean]
                          [:requested_fields [:maybe [:sequential ms/NonBlankString]]]
                          [:name [:maybe ms/NonBlankString]]
                          [:type [:maybe ms/NonBlankString]]
                          [:category [:maybe ms/NonBlankString]]]]  ;; New columns added
  (t2/with-transaction [_conn]
    (t2/insert-returning-instances! CubesRequest cubes_request_data)))

(mu/defn update-cubes-request-detail :- (ms/InstanceOf CubesRequest)
  "Update an existing Cube Request."
  [cubes_request-id :- ms/PositiveInt, cubes_request_data :- [:map 
                                                             [:description [:maybe ms/NonBlankString]]
                                                             [:user [:maybe ms/NonBlankString]]
                                                             [:admin_user [:maybe ms/NonBlankString]]
                                                             [:verified_status [:maybe :boolean]]
                                                             [:in_semantic_layer [:maybe :boolean]]
                                                             [:requested_fields [:maybe [:sequential ms/NonBlankString]]]
                                                             [:name [:maybe ms/NonBlankString]]
                                                             [:type [:maybe ms/NonBlankString]]
                                                             [:category [:maybe ms/NonBlankString]]]]  ;; New columns
  (t2/with-transaction [_conn]
    (t2/update! CubesRequest cubes_request-id cubes_request_data)
    (retrieve-cubes-request-detail cubes_request-id)))

(mu/defn delete-cubes-request-detail :- (ms/InstanceOf CubesRequest)
  "Delete a Cube Request by `id`."
  [cubes_request-id]
  (t2/delete! CubesRequest :id (u/the-id cubes_request-id)))

;;; --------------------------------------------- Permission Checking ------------------------------------------------

(defmethod mi/can-write? :model/CubesRequest
  [_instance]
  ;; Always return true to allow all users to write
  true)
