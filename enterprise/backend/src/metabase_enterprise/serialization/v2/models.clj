(ns metabase-enterprise.serialization.v2.models)

(def data-model
  "Schema model types"
  ["Database"
   "Field"
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
  ["DashboardCard"
   "DashboardTab"
   "Dimension"
   "ParameterCard"
   "DashboardCardSeries"
   "TimelineEvent"])

(def excluded-models
  "List of models which are not going to be serialized ever."
  ["ApiKey"
   "ApplicationPermissionsRevision"
   "AuditLog"
   "BookmarkOrdering"
   "CacheConfig"
   "CardBookmark"
   "CloudMigration"
   "CollectionBookmark"
   "CollectionPermissionGraphRevision"
   "ConnectionImpersonation"
   "DashboardBookmark"
   "DataPermissions"
   "FieldUsage"
   "GroupTableAccessPolicy"
   "HTTPAction"
   "ImplicitAction"
   "LoginHistory"
   "LegacyMetric"
   "LegacyMetricImportantField"
   "ModelIndex"
   "ModelIndexValue"
   "ModerationReview"
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
   "QueryAnalysis"
   "QueryCache"
   "QueryExecution"
   "QueryField"
   "QueryTable"
   "RecentViews"
   "Revision"
   "Secret"
   "Session"
   "TablePrivileges"
   "TaskHistory"
   "User"
   "UserParameterValue"
   "ViewLog"])
