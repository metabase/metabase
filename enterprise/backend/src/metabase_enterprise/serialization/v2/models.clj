(ns metabase-enterprise.serialization.v2.models
  "The models serialization exports, by kind.")

(def data-model
  "Schema model types"
  [:model/Database
   :model/Dimension
   :model/Field
   :model/FieldUserSettings
   :model/Measure
   :model/Segment
   :model/Table
   :model/TableUserSettings
   :model/Channel])

(def data-model-in-collection
  "Data model types that can be found in collections (via published tables), extracted by ID when discovered via
   descendants even if no-data-model is set."
  [:model/Table
   :model/TableUserSettings
   :model/Field
   :model/FieldUserSettings
   :model/Dimension
   :model/Segment])

(def content
  "Content model types"
  [:model/Action
   :model/Card
   :model/Collection
   :model/Dashboard
   :model/Document
   :model/Glossary
   :model/NativeQuerySnippet
   :model/Timeline])

(def elidable-content-models
  "Content models a reference may name without the target being in the archive or the destination. Such references
  are dropped on import instead of failing the load."
  #{:model/Timeline})

(def exported-models
  "The list of all models exported by serialization by default. Used for production code and by tests."
  (concat data-model
          content
          [:model/CustomVizPlugin
           :model/DataApp
           :model/EmbeddingTheme
           :model/FieldValues
           :model/Metabot
           :model/OsiAiContext
           :model/PythonLibrary
           :model/Setting
           :model/Transform
           :model/TransformJob
           :model/TransformTag
           :model/TransformTest]))

(def inlined-models
  "An additional list of models which are inlined into parent entities for serialization.
  These are not extracted and serialized separately, but they may need some processing done.
  For example, the models should also have their entity_id fields populated (if they have one)."
  [:model/DashboardCard
   :model/DashboardTab
   :model/ParameterCard
   :model/DashboardCardSeries
   :model/MetabotPrompt
   :model/TableIndex
   :model/TimelineEvent
   :model/TransformJobTransformTag
   :model/TransformTransformTag])

(def excluded-models
  "List of models which are not going to be serialized ever."
  [:model/AgentApiCallLog
   :model/AiUsageLog
   ;; Not serialized yet; card tests become exported content with their serialization spec.
   :model/CardTest
   :model/AnalysisFinding
   :model/AnalysisFindingError
   :model/AnalysisFindingStatus
   :model/ApiKey
   :model/ApiKeyUsageLog
   :model/ApplicationPermissionsRevision
   :model/AuditLog
   :model/AuthIdentity
   :model/BookmarkOrdering
   :model/CacheConfig
   :model/CardBookmark
   :model/ChannelTemplate
   :model/CloudMigration
   :model/CollectionBookmark
   :model/CollectionPermissionGraphRevision
   :model/Comment
   :model/CommentReaction
   :model/ConnectionImpersonation
   :model/ContentDiagnosticsFinding
   :model/ContentTranslation
   :model/DashboardBookmark
   :model/DataComplexityScore
   :model/DataPermissions
   :model/DatabaseRouter
   :model/Dependency
   :model/DependencyStatus
   :model/DocumentBookmark
   :model/EmbeddingSdkReact18Host
   :model/Exploration
   :model/ExplorationBlock
   :model/ExplorationBookmark
   :model/ExplorationPage
   :model/ExplorationQuery
   :model/ExplorationQueryResult
   :model/ExplorationThread
   :model/ExplorationThreadTimeline
   :model/ImplicitAction
   :model/ImpersonationQueryCache
   :model/LoginHistory
   :model/McpFeedback
   :model/McpGroupPermission
   :model/McpQueryHandle
   :model/McpSessionLog
   :model/McpToolCallLog
   :model/MetabotConversation
   :model/MetabotFeedback
   :model/MetabotGroupLimit
   :model/MetabotInstanceLimit
   :model/MetabotMessage
   :model/MetabotPermissions
   :model/MetabotSourceFeedback
   :model/MetabotUsedTable
   :model/ModelIndex
   :model/ModelIndexValue
   :model/ModerationReview
   :model/Notification
   :model/NotificationCard
   :model/NotificationHandler
   :model/NotificationRecipient
   :model/NotificationSubscription
   :model/OAuthAccessToken
   :model/OAuthAuthorizationCode
   :model/OAuthClient
   :model/OAuthClientEvent
   :model/OAuthRefreshToken
   :model/Permissions
   :model/PermissionsGroup
   :model/PermissionsGroupMembership
   :model/PermissionsRevision
   :model/PersistedInfo
   :model/PremiumFeaturesCache
   :model/Pulse
   :model/PulseCard
   :model/PulseChannel
   :model/PulseChannelRecipient
   :model/Query
   :model/QueryAction
   :model/QueryCache
   :model/QueryExecution
   :model/QueryField
   :model/QueryTable
   :model/RecentViews
   :model/ReplacementRun
   :model/RemoteSyncTask
   :model/ResultMetadataStatus
   :model/Revision
   :model/Sandbox
   :model/SearchIndexMetadata
   :model/Secret
   :model/SecurityAdvisory
   :model/SemanticSearchTokenTracking
   :model/Session
   :model/SourceDimensionDaily
   :model/SourceDimensionProfileDaily
   :model/SourceMetricDaily
   :model/SourceSegmentCompositeDaily
   :model/SourceSegmentDaily
   :model/SsoRelayState
   :model/StoredResult
   :model/StoredResultUse
   :model/SupportAccessGrantLog
   :model/TableRemapping
   :model/TaskHistory
   :model/TaskRun
   :model/Tenant
   :model/TransformDagRun
   :model/TransformJobRun
   :model/TransformRun
   :model/TransformRunCancelation
   :model/DataTestRun
   :model/Undo
   :model/User
   :model/UserKeyValue
   :model/UserParameterValue
   :model/ViewLog
   :model/Workspace
   :model/WorkspaceDatabase])
