(ns metabase-enterprise.remote-sync.schema
  "Malli schemas for remote sync API request and response bodies."
  (:require
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase.actions.schema :as actions.schema]
   [metabase.collections.schema :as collections.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.documents.schema :as documents.schema]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.schema :as measures.schema]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.segments.schema :as segments.schema]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]))

(mr/def ::task-status
  "Status of a remote sync task."
  [:enum :running :successful :errored :cancelled :timed-out :conflict])

(mr/def ::task-type
  "Type of remote sync task."
  [:enum "import" "export"])

(mr/def ::sync-task
  "Schema for a remote sync task object."
  [:map
   [:id pos-int?]
   [:sync_task_type ::task-type]
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
   [:status ::task-status]])

(def ^:private item-data
  "The schema of the `:data` of an item of each model: a row of the model, with what remote sync hydrates of it."
  {"action"             ::actions.schema/action
   "card"               ::queries.schema/card
   "cardtest"           ::data-testing.schema/card-test
   "collection"         ::collections.schema/collection
   "dashboard"          ::dashboards.schema/dashboard
   "dataapp"            ::data-apps.schema/data-app
   "dimension"          ::warehouse-schema.schema/dimension
   "document"           ::documents.schema/document
   "fieldusersettings"  ::warehouse-schema.schema/field-user-settings
   "glossary"           ::glossary.schema/glossary
   "measure"            ::measures.schema/measure
   "nativequerysnippet" ::native-query-snippets.schema/native-query-snippet
   "pythonlibrary"      ::transforms-python.schema/python-library
   "segment"            ::segments.schema/segment
   "tableusersettings"  ::warehouse-schema.schema/table-user-settings
   "timeline"           ::timeline.schema/timeline
   "transform"          ::transforms.schema/transform
   "transformtag"       ::transforms.schema/transform-tag
   "transformtest"      ::data-testing.schema/transform-test})

(mr/def ::item
  "A synced row as the client shows it: its model, its primary key, and its `:data`, the row with what the client shows
  of it, such as its collection, and, for an unsynced dependency, the items that use it."
  (into [:multi {:dispatch :model}]
        (for [[model data] item-data]
          [model [:map {:closed true}
                  [:id      pos-int?]
                  [:model   [:= model]]
                  [:data    data]
                  [:used_by {:optional true} [:sequential [:ref ::item]]]]])))

(mr/def ::dirty-item
  "A synced row changed since the last sync, as the client lists it: an item (see `::item`) with the name the change
  gives it and its status, with id 0 and no `:data` when its row no longer exists."
  (into [:multi {:dispatch :model}]
        (for [[model data] item-data]
          [model [:map {:closed true}
                  [:id          :int]
                  [:model       [:= model]]
                  [:name        [:maybe :string]]
                  [:sync_status :string]
                  [:data        [:maybe data]]]])))

(mr/def ::import-response
  "Schema for POST /import response."
  [:map
   [:status [:= :success]]
   [:task_id [:maybe pos-int?]]])

(mr/def ::is-dirty-response
  "Schema for GET /is-dirty response."
  [:map
   [:is_dirty :boolean]])

(mr/def ::dirty-response
  "Schema for GET /dirty response."
  [:map
   [:dirty [:sequential ::dirty-item]]])

(mr/def ::export-response
  "Schema for POST /export response."
  [:map
   [:message :string]
   [:task_id pos-int?]])

(mr/def ::merge-summary
  "Counts of remote changes a merge would fold into local content."
  [:map
   [:added :int]
   [:updated :int]
   [:removed :int]])

(mr/def ::force-push-casualties
  "The labels of the remote content a force push would discard, by whether it deletes or overwrites it."
  [:map
   [:deleted [:sequential :string]]
   [:overwritten [:sequential :string]]])

(mr/def ::export-preflight-response
  "Schema for GET /export-preflight response."
  [:map
   [:has_changes :boolean]
   [:clean :boolean]
   [:conflicts [:sequential :string]]
   [:summary ::merge-summary]
   [:force_push_casualties ::force-push-casualties]
   [:reason [:maybe :string]]])

(mr/def ::settings-update-response
  "Schema for PUT /settings response."
  [:map
   [:success :boolean]
   [:task_id {:optional true} pos-int?]])

(mr/def ::branches-response
  "Schema for GET /branches response."
  [:map
   [:items [:sequential :string]]])

(mr/def ::stash-response
  "Schema for POST /stash response."
  [:map
   [:status :string]
   [:message :string]
   [:task_id pos-int?]])

(mr/def ::has-remote-changes-response
  "Schema for GET /has-remote-changes response."
  [:map
   [:has_changes :boolean]
   [:remote_version [:maybe :string]]
   [:local_version [:maybe :string]]
   [:branch_missing {:optional true} :boolean]])

(mr/def ::test-connection-response
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
