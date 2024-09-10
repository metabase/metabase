(ns metabase.models.company
  "This namespace defines the model for the Company Details entity. It includes functions to handle CRUD operations
   and related business logic for managing company details within the application."
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
   [metabase.api.common :as api]))  ;; Add this require

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def Company
  "Defines the model name for company details using toucan2."
  :model/Company)

(methodical/defmethod t2/table-name :model/Company [_model] :company)
(methodical/defmethod t2/model-for-automagic-hydration [:default :company] [_original-model _k] :model/Company)

(doto :model/Company
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.full-perms-for-perms-set))

(t2/deftransforms :model/Company
  {:parameters mi/transform-json})

;;; ----------------------------------------------- CRUD Operations --------------------------------------------------

(defn- assert-valid-company [{:keys [company_name]}]
  (when-not (mc/validate ms/NonBlankString company_name)
    (throw (ex-info (tru "Company name must be a non-blank string.") {:company_name company_name}))))

(t2/define-before-insert :model/Company
  [company]
  (u/prog1 company
    (assert-valid-company company)))

(t2/define-before-update :model/Company
  [company]
  (u/prog1 company
    (assert-valid-company company)))

(t2/define-before-delete :model/Company
  [company]
  ;; Add any logic needed before deleting a company detail
  company)

;;; ----------------------------------------------- Hydration Methods ------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :attributes]
  [_model k company]
  (mi/instances-with-hydrated-data company k))

;;; --------------------------------------------- Serialization Methods ----------------------------------------------

(defmethod serdes/extract-one "company"
  [_model-name _opts company]
  (serdes/extract-one-basics "company" company))

(defmethod serdes/load-xform "company" [company]
  (serdes/load-xform-basics company))

(defmethod serdes/dependencies "company" [_company]
  [])

;;; ----------------------------------------------- Fetch Functions ---------------------------------------------------

(mu/defn retrieve-company :- [:sequential (ms/InstanceOf Company)]
  "Fetch all Company Details."
  []
  (t2/select Company))

(mu/defn retrieve-company-detail :- [:maybe (ms/InstanceOf Company)]
  "Fetch a single Company Detail by `id`."
  [company-id]
  (t2/select-one Company :id (u/the-id company-id)))

(mu/defn create-company-detail :- (ms/InstanceOf Company)
  "Create a new Company Detail."
  [company-data :- [:map [:company_name ms/NonBlankString]]]
  (t2/with-transaction [_conn]
    (t2/insert-returning-instances! Company company-data)))

(mu/defn update-company-detail :- (ms/InstanceOf Company)
  "Update an existing Company Detail."
  [company-id :- ms/PositiveInt, company-data :- [:map [:company_name ms/NonBlankString]]]
  (t2/with-transaction [_conn]
    (t2/update! Company company-id company-data) ;; No "updated_at" here
    (retrieve-company-detail company-id)))

(mu/defn delete-company-detail :- (ms/InstanceOf Company)
  "Delete a Company Detail by `id`."
  [company-id]
  (t2/delete! Company :id (u/the-id company-id)))

;;; --------------------------------------------- Permission Checking ------------------------------------------------

(defmethod mi/can-write? :model/Company
  [_instance]
  ;; Always return true to allow all users to write
  true)
