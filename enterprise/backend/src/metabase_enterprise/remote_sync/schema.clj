(ns metabase-enterprise.remote-sync.schema
  "Malli schemas for remote sync API request and response bodies.")

;;; ------------------------------------------- Task Schemas -------------------------------------------

(def TaskStatus
  "Status of a remote sync task."
  [:enum :running :successful :errored :cancelled :timed-out])

(def TaskType
  "Type of remote sync task."
  [:enum "import" "export"])

(def SyncTask
  "Schema for a remote sync task object."
  [:map
   [:id pos-int?]
   [:sync_task_type TaskType]
   [:initiated_by {:optional true} [:maybe pos-int?]]
   [:progress [:maybe [:double {:min 0.0 :max 1.0}]]]
   [:started_at :any]
   [:ended_at {:optional true} [:maybe :any]]
   [:last_progress_report_at {:optional true} [:maybe :any]]
   [:version {:optional true} [:maybe :string]]
   [:cancelled {:optional true} [:maybe :boolean]]
   [:error_message {:optional true} [:maybe :string]]
   [:status TaskStatus]])

;;; ------------------------------------------- Dirty Item Schemas -------------------------------------------

(def DirtyItem
  "Schema for a dirty sync item."
  [:map
   [:id pos-int?]
   [:name [:maybe :string]]
   [:model :string]
   [:sync_status :string]
   [:created_at {:optional true} :any]
   [:updated_at {:optional true} [:maybe :any]]
   [:collection_id {:optional true} [:maybe pos-int?]]
   [:authority_level {:optional true} [:maybe :string]]
   [:display {:optional true} [:maybe :string]]
   [:query_type {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]])

;;; ------------------------------------------- API Response Schemas -------------------------------------------

(def ImportResponse
  "Schema for POST /import response."
  [:map
   [:status [:= :success]]
   [:task_id [:maybe pos-int?]]
   [:message {:optional true} [:maybe :string]]])

(def IsDirtyResponse
  "Schema for GET /is-dirty response."
  [:map
   [:is_dirty :boolean]])

(def DirtyResponse
  "Schema for GET /dirty response."
  [:map
   [:dirty [:sequential DirtyItem]]])

(def ExportResponse
  "Schema for POST /export response."
  [:map
   [:message :string]
   [:task_id pos-int?]])

(def SettingsUpdateResponse
  "Schema for PUT /settings response."
  [:map
   [:success :boolean]
   [:task_id {:optional true} pos-int?]])

(def BranchesResponse
  "Schema for GET /branches response."
  [:map
   [:items [:sequential :string]]])

(def CreateBranchResponse
  "Schema for POST /create-branch response."
  [:map
   [:status :string]
   [:message :string]])

(def StashResponse
  "Schema for POST /stash response."
  [:map
   [:status :string]
   [:message :string]
   [:task_id pos-int?]])
