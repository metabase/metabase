(ns metabase-enterprise.serialization.v2.models)

(def data-model
  "Schema model types"
  ["Database"
   "Field"
   "Metric"
   "Segment"
   "Table"])

(def content
  "Content model types"
  ["Action"
   "Card"
   "Collection"
   "Dashboard"
   "NativeQuerySnippet"
   "Timeline"])

(def exported-models
  "The list of all models exported by serialization by default. Used for production code and by tests."
  (concat data-model
          content
          ["FieldValues"
           "Setting"]))

(def inlined-models
  "An additional list of models which are inlined into parent entities for serialization.
  These are not extracted and serialized separately, but they may need some processing done.
  For example, the models should also have their entity_id fields populated (if they have one)."
  ["ImplicitAction"      ; inlined into Action
   "QueryAction"         ; inlined into Action
   "DashboardCard"       ; inlined into Dashboard
   "DashboardTab"        ; inlined into Dashboard
   "Dimension"           ; inlined into Field
   "ParameterCard"       ; inlined into Card
   "DashboardCardSeries" ; inlined into Dashboard
   "TimelineEvent"])     ; inlined into Timeline

(def excluded-models
  "List of models which are not going to be serialized ever."
  ["Activity"                          ; activity is not serialized
   "ApiKey"                            ; api keys are not serialized
   "ApplicationPermissionsRevision"    ; permissions are not serialized
   "AuditLog"                          ; audit log is not serialized
   "BookmarkOrdering"                  ; bookmarks are not serialized
   "CardBookmark"                      ; bookmarks are not serialized
   "CollectionBookmark"                ; bookmarks are not serialized
   "CollectionPermissionGraphRevision" ; permissions are not serialized
   "ConnectionImpersonation"           ; permissions are not serialized
   "DashboardBookmark"                 ; bookmarks are not serialized
   "GroupTableAccessPolicy"            ; permissions are not serialized
   "HTTPAction"                        ; HTTP actions are not fully implemented, and if they were they would be inlined into Action
   "LoginHistory"                      ; login history is not serialized
   "MetricImportantField"              ; ???
   "ModelIndex"                        ; Why are model indexes not verified???
   "ModelIndexValue"                   ; Why are model indexes not verified???
   "ModerationReview"                  ; Which content is verified is not serialized
   "Permissions"                       ; permissions are not serialized
   "PermissionsGroup"                  ; permissions are not serialized
   "PermissionsGroupMembership"        ; permissions are not serialized
   "PermissionsRevision"               ; permissions are not serialized
   "PersistedInfo"                     ; ??? Cal: this could potentially be a bug, because the persistence is a state machine
   "Pulse"                             ; subscriptions/alerts are not serialized
   "PulseCard"                         ; subscriptions/alerts are not serialized
   "PulseChannel"                      ; subscriptions/alerts are not serialized
   "PulseChannelRecipient"             ; subscriptions/alerts are not serialized
   "Query"                             ; queries are not serialized
   "QueryCache"                        ; query cache data is not serialized
   "QueryExecution"                    ; query executions is not serialized
   "RecentViews"                       ; view history is not serialized
   "Revision"                          ; revisions are not serializaed
   "Secret"                            ; secrets are not serialized
   "Session"                           ; sessions are not serialized
   "TablePrivileges"                   ; table privileges are not serialized
   "TaskHistory"                       ; task history is not serialized
   "User"                              ; users are not serialized
   "ViewLog"])                         ; view history is not serialized
