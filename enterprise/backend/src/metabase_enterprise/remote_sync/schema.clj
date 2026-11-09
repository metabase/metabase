(ns metabase-enterprise.remote-sync.schema
  "Malli schemas for remote sync API request and response bodies."
  (:require
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

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
   [:initiated_by_user {:optional true} [:maybe [:map
                                                 [:id pos-int?]
                                                 [:first_name [:maybe :string]]
                                                 [:last_name [:maybe :string]]
                                                 [:email :string]]]]
   [:progress [:maybe [:float {:min 0.0 :max 1.0}]]]
   [:started_at :any]
   [:ended_at {:optional true} [:maybe :any]]
   [:last_progress_report_at {:optional true} [:maybe :any]]
   [:last_heartbeat_at {:optional true} [:maybe :any]]
   [:version {:optional true} [:maybe :string]]
   [:cancelled {:optional true} [:maybe :boolean]]
   [:error_message {:optional true} [:maybe :string]]
   [:outcome {:optional true} [:maybe :map]]
   [:conflicts {:optional true} [:maybe [:sequential :string]]]
   [:status TaskStatus]])

(mr/def ::dirty-item-collection
  "The collection a change belongs to, the entity itself for a collection, with the ancestors the user can read."
  [:map {:closed true}
   [:id                  ::lib.schema.id/collection]
   [:name                :string]
   [:type                [:maybe :string]]
   [:effective_ancestors [:sequential ::collections.schema/effective-ancestor]]])

(def DirtyItem
  "A synced entity changed since the last sync, with id 0 when its row no longer exists."
  [:map {:closed true}
   [:id          :int]
   [:name        [:maybe :string]]
   [:model       :string]
   [:sync_status :string]
   [:collection  {:optional true} ::dirty-item-collection]
   [:model_id    {:optional true} [:maybe pos-int?]]])

(def ImportResponse
  "Schema for POST /import response."
  [:map
   [:status [:= :success]]
   [:task_id [:maybe pos-int?]]])

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
  "The labels of the remote content a force push would discard, by whether it deletes or overwrites it."
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
   [:branch_missing {:optional true} :boolean]])

(def TestConnectionResponse
  "Schema for POST /test-connection response."
  [:map
   [:status [:= :success]]])

(mr/def ::remote-sync-task.outcome
  "The `:outcome` column of a RemoteSyncTask, decoded."
  [:multi {:dispatch :kind}
   ["pulled"       [:map {:closed true}
                    [:kind   [:= "pulled"]]
                    [:count  :int]
                    [:branch [:maybe :string]]]]
   ["pull-skipped" [:map {:closed true}
                    [:kind [:= "pull-skipped"]]]]
   ["pushed"       [:map {:closed true}
                    [:kind   [:= "pushed"]]
                    [:count  :int]
                    [:branch [:maybe :string]]]]
   ["push-skipped" [:map {:closed true}
                    [:kind [:= "push-skipped"]]]]
   ["remote-changed" [:map {:closed true}
                      [:kind [:= "remote-changed"]]]]])

(mr/def ::remote-sync-task.update
  "What an update (or insert) of a RemoteSyncTask accepts: every column of `:remote_sync_task` except `id`, all optional."
  [:map {:closed true}
   [:sync_task_type          {:optional true} [:maybe [:or :keyword :string]]]
   [:progress                {:optional true} [:maybe number?]]
   [:cancelled               {:optional true} [:maybe :boolean]]
   [:started_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:ended_at                {:optional true} [:maybe ms/TemporalInstant]]
   [:last_progress_report_at {:optional true} [:maybe ms/TemporalInstant]]
   [:last_heartbeat_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:initiated_by            {:optional true} [:maybe ::lib.schema.id/user]]
   [:error_message           {:optional true} [:maybe :string]]
   [:version                 {:optional true} [:maybe :string]]
   [:conflicts               {:optional true} [:maybe [:or [:sequential :string] [:set :string]]]]
   [:outcome                 {:optional true} [:maybe ::remote-sync-task.outcome]]])
