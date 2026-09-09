(ns metabase-enterprise.remote-sync.schema
  "Malli schemas for remote sync API request and response bodies."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; ------------------------------------------- Task Schemas -------------------------------------------

(def TaskStatus
  "Status of a remote sync task."
  [:enum :running :successful :errored :cancelled :timed-out :conflict])

(def TaskType
  "Type of remote sync task."
  [:enum "import" "export"])

(def SyncTask
  "Schema for a remote sync task object."
  [:map
   [:id pos-int?]
   [:sync_task_type TaskType]
   [:initiated_by {:optional true} [:maybe pos-int?]]
   [:progress [:maybe [:float {:min 0.0 :max 1.0}]]]
   [:started_at :any]
   [:ended_at {:optional true} [:maybe :any]]
   [:last_progress_report_at {:optional true} [:maybe :any]]
   [:version {:optional true} [:maybe :string]]
   [:cancelled {:optional true} [:maybe :boolean]]
   [:error_message {:optional true} [:maybe :string]]
   [:outcome {:optional true} [:maybe :map]]
   [:conflicts {:optional true} [:maybe [:sequential :string]]]
   [:status TaskStatus]])

;;; ------------------------------------------- Conflict Schemas -------------------------------------------

(def ConflictType
  "Type of import conflict detected during pre-flight check."
  [:enum
   :entity-id-conflict    ; Local entity exists with same entity_id but not in RemoteSyncObject
   :library-conflict      ; First import, local Library exists, import has Library
   :transforms-conflict   ; Local has transforms AND import has transforms
   :snippets-conflict     ; Local has snippets AND import has snippets
   :dirty])               ; RemoteSyncObject has items with status != "synced"

(def ConflictDetail
  "Schema for detailed conflict information."
  [:map
   [:type ConflictType]
   [:category {:optional true} :string]
   [:count {:optional true} pos-int?]
   [:entity-ids {:optional true} [:set :string]]
   [:message {:optional true} :string]])

(def ConflictResponse
  "Schema for conflict error response from async-import!."
  [:map
   [:status-code [:= 400]]
   [:conflicts [:= true]]
   [:conflict-type {:optional true} ConflictType]
   [:conflict-details {:optional true} [:sequential ConflictDetail]]
   [:conflict-summary {:optional true} [:set :string]]])

;;; ------------------------------------------- Dirty Item Schemas -------------------------------------------

(def DirtyItem
  "Schema for a dirty sync item.
   Note: id is :int instead of pos-int? because the Transforms root collection uses
   a sentinel value of -1 as its model_id."
  [:map
   [:id :int]
   [:name [:maybe :string]]
   [:model :string]
   [:sync_status :string]
   [:created_at {:optional true} :any]
   [:updated_at {:optional true} [:maybe :any]]
   [:collection_id {:optional true} [:maybe pos-int?]]
   [:authority_level {:optional true} [:maybe :string]]
   [:display {:optional true} [:maybe :string]]
   [:query_type {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:table_id {:optional true} [:maybe pos-int?]]
   [:table_name {:optional true} [:maybe :string]]])

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

(def MergeSummary
  "Counts of remote changes a merge would fold into local content."
  [:map
   [:added :int]
   [:updated :int]
   [:removed :int]])

(def ForcePushCasualties
  "Remote content a force push would discard, keyed by how: entities removed entirely (`:deleted`) or
  whose remote-side edits would be replaced (`:overwritten`). Each is human-readable entity labels."
  [:map
   [:deleted [:sequential :string]]
   [:overwritten [:sequential :string]]])

(def ExportPreflightResponse
  "Schema for GET /export-preflight response."
  [:map
   [:has_changes :boolean]
   [:clean :boolean]
   [:conflicts [:sequential :string]]
   [:summary MergeSummary]
   [:force_push_casualties ForcePushCasualties]
   [:reason [:maybe :string]]])

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

(def HasRemoteChangesResponse
  "Schema for GET /has-remote-changes response."
  [:map
   [:has_changes :boolean]
   [:remote_version [:maybe :string]]
   [:local_version [:maybe :string]]
   [:cached :boolean]
   [:branch_missing {:optional true} :boolean]])

(def TestConnectionResponse
  "Schema for POST /test-connection response."
  [:map
   [:status [:= :success]]])

(mr/def ::remote-sync-object
  "A RemoteSyncObject as selected from the app DB: every column of `:remote_sync_object`."
  [:map {:closed true}
   [:id                  ms/PositiveInt]
   [:model_type          :string]
   [:model_id            [:maybe :int]]
   [:status              :string]
   [:status_changed_at   ms/TemporalInstant]
   [:model_name          :string]
   [:model_collection_id [:maybe ::lib.schema.id/collection]]
   [:model_display       [:maybe :string]]
   [:model_table_id      [:maybe ::lib.schema.id/table]]
   [:model_table_name    [:maybe :string]]
   [:file_path           [:maybe :string]]
   [:content_hash        [:maybe :string]]])

(mr/def ::remote-sync-object.update
  "What an update (or insert) of a RemoteSyncObject accepts: every column of `:remote_sync_object` except `id`, all optional."
  [:map {:closed true}
   [:model_type          {:optional true} [:maybe :string]]
   [:model_id            {:optional true} [:maybe :int]]
   [:status              {:optional true} [:maybe :string]]
   [:status_changed_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:model_name          {:optional true} [:maybe :string]]
   [:model_collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:model_display       {:optional true} [:maybe :string]]
   [:model_table_id      {:optional true} [:maybe ::lib.schema.id/table]]
   [:model_table_name    {:optional true} [:maybe :string]]
   [:file_path           {:optional true} [:maybe :string]]
   [:content_hash        {:optional true} [:maybe :string]]])

(mr/def ::remote-sync-task.conflict
  "One entry of the `:conflicts` column of a RemoteSyncTask, decoded."
  :map)

(mr/def ::remote-sync-task.conflicts
  "The `:conflicts` column of a RemoteSyncTask, decoded."
  [:sequential ::remote-sync-task.conflict])

(mr/def ::remote-sync-task.outcome
  "The `:outcome` column of a RemoteSyncTask, decoded."
  :map)

(mr/def ::remote-sync-task
  "A RemoteSyncTask as selected from the app DB: every column of `:remote_sync_task`."
  [:map {:closed true}
   [:id                      ms/PositiveInt]
   [:sync_task_type          :string]
   [:progress                [:maybe number?]]
   [:cancelled               :boolean]
   [:started_at              ms/TemporalInstant]
   [:ended_at                [:maybe ms/TemporalInstant]]
   [:last_progress_report_at ms/TemporalInstant]
   [:initiated_by            [:maybe ::lib.schema.id/user]]
   [:error_message           [:maybe :string]]
   [:version                 [:maybe :string]]
   [:conflicts               [:maybe ::remote-sync-task.conflicts]]
   [:outcome                 [:maybe ::remote-sync-task.outcome]]])

(mr/def ::remote-sync-task.update
  "What an update (or insert) of a RemoteSyncTask accepts: every column of `:remote_sync_task` except `id`, all optional."
  [:map {:closed true}
   [:sync_task_type          {:optional true} [:maybe :string]]
   [:progress                {:optional true} [:maybe number?]]
   [:cancelled               {:optional true} [:maybe :boolean]]
   [:started_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:ended_at                {:optional true} [:maybe ms/TemporalInstant]]
   [:last_progress_report_at {:optional true} [:maybe ms/TemporalInstant]]
   [:initiated_by            {:optional true} [:maybe ::lib.schema.id/user]]
   [:error_message           {:optional true} [:maybe :string]]
   [:version                 {:optional true} [:maybe :string]]
   [:conflicts               {:optional true} [:maybe ::remote-sync-task.conflicts]]
   [:outcome                 {:optional true} [:maybe ::remote-sync-task.outcome]]])
