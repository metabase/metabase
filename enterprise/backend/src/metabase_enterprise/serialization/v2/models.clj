(ns metabase-enterprise.serialization.v2.models
  "See [[metabase.models.serialization]] for documentation.")

(def data-model
  "Schema model types"
  ["Database"
   "Field"
   "FieldUserSettings"
   "Segment"
   "Table"
   "Channel"])

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
           "Metabot"
           "Setting"]))

(def inlined-models
  "An additional list of models which are inlined into parent entities for serialization.
  These are not extracted and serialized separately, but they may need some processing done.
  For example, the models should also have their entity_id fields populated (if they have one)."
  ["DashboardCard"
   "DashboardTab"
   "Dimension"
   "ParameterCard"
   "DashboardCardSeries"
   "MetabotEntity"
   "MetabotPrompt"
   "TimelineEvent"])

(def excluded-models
  "List of models which are not going to be serialized ever."
  ["ApiKey"
   "ApplicationPermissionsRevision"
   "AuditLog"
   "BookmarkOrdering"
   "CacheConfig"
   "CardBookmark"
   "ChannelTemplate"
   "CloudMigration"
   "CollectionBookmark"
   "CollectionPermissionGraphRevision"
   "ConnectionImpersonation"
   "ContentTranslation"
   "DatabaseRouter"
   "DashboardBookmark"
   "DataPermissions"
   "GroupTableAccessPolicy"
   "HTTPAction"
   "ImplicitAction"
   "LoginHistory"
   "MetabotConversation"
   "MetabotMessage"
   "ModelIndex"
   "ModelIndexValue"
   "ModerationReview"
   "Notification"
   "NotificationCard"
   "NotificationSubscription"
   "NotificationHandler"
   "NotificationRecipient"
   "Permissions"
   "PermissionsGroup"
   "PermissionsGroupMembership"
   "PermissionsRevision"
   "PersistedInfo"
   "Pulse"
   "PulseCard"
   "PulseChannel"
   "PulseChannelRecipient"
   "Query"
   "QueryAction"
   "QueryCache"
   "QueryExecution"
   "QueryField"
   "QueryTable"
   "RecentViews"
   "Revision"
   "SearchIndexMetadata"
   "Secret"
   "SemanticSearchTokenTracking"
   "Session"
   "TaskHistory"
   "User"
   "UserKeyValue"
   "UserParameterValue"
   "ViewLog"])
