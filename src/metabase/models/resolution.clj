(ns metabase.models.resolution
  (:require
   [metabase.classloader.core :as classloader]
   [methodical.core :as methodical]
   [toucan2.model :as t2.model]))

(def model->namespace
  "A map of known Toucan 2 models to the 'their' namespace -- the one that includes

    (derive <model> :metabase/model)

  and other important code that should be loaded for side effects (such as method implementations).

  Tests will check to make sure new models get included in this map."
  '{:model/Action                            metabase.actions.models
    :model/AnalysisFinding                   metabase-enterprise.dependencies.models.analysis-finding
    :model/AnalysisFindingError              metabase-enterprise.dependencies.models.analysis-finding-error
    :model/ApiKey                            metabase.api-keys.models.api-key
    :model/ApplicationPermissionsRevision    metabase.permissions.models.application-permissions-revision
    :model/AuditLog                          metabase.audit-app.models.audit-log
    :model/AuthIdentity metabase.auth-identity.models.auth-identity
    :model/BookmarkOrdering                  metabase.bookmarks.models.bookmark
    :model/CacheConfig                       metabase.cache.models.cache-config
    :model/Card                              metabase.queries.models.card
    :model/CardBookmark                      metabase.bookmarks.models.bookmark
    :model/Channel                           metabase.channel.models.channel
    :model/ChannelTemplate                   metabase.channel.models.channel
    :model/CloudMigration                    metabase.cloud-migration.models.cloud-migration
    :model/Collection                        metabase.collections.models.collection
    :model/CollectionBookmark                metabase.bookmarks.models.bookmark
    :model/CollectionPermissionGraphRevision metabase.permissions.models.collection-permission-graph-revision
    :model/Comment                           metabase.comments.models.comment
    :model/CommentReaction                   metabase.comments.models.comment-reaction
    :model/ConnectionImpersonation           metabase-enterprise.impersonation.model
    :model/ContentTranslation                metabase.content-translation.models
    :model/Dashboard                         metabase.dashboards.models.dashboard
    :model/DashboardBookmark                 metabase.bookmarks.models.bookmark
    :model/DashboardCard                     metabase.dashboards.models.dashboard-card
    :model/DashboardCardSeries               metabase.dashboards.models.dashboard-card-series
    :model/DashboardTab                      metabase.dashboards.models.dashboard-tab
    :model/DataPermissions                   metabase.permissions.models.data-permissions
    :model/Database                          metabase.warehouses.models.database
    :model/DatabaseRouter                    metabase-enterprise.database-routing.model
    :model/Dependency                        metabase-enterprise.dependencies.models.dependency
    :model/Dimension                         metabase.warehouse-schema.models.dimension
    :model/Document                          metabase.documents.models.document
    :model/DocumentBookmark                  metabase.bookmarks.models.bookmark
    :model/Field                             metabase.warehouse-schema.models.field
    :model/FieldUserSettings                 metabase.warehouse-schema.models.field-user-settings
    :model/FieldValues                       metabase.warehouse-schema.models.field-values
    :model/Glossary                          metabase.glossary.models.glossary
    :model/Sandbox                           metabase-enterprise.sandbox.models.sandbox
    :model/HTTPAction                        metabase.actions.models
    :model/ImplicitAction                    metabase.actions.models
    :model/LoginHistory                      metabase.login-history.models.login-history
    :model/Measure                           metabase.measures.models.measure
    :model/Metabot                           metabase-enterprise.metabot-v3.models.metabot
    :model/MetabotConversation               metabase-enterprise.metabot-v3.models.metabot-conversation
    :model/MetabotMessage                    metabase-enterprise.metabot-v3.models.metabot-message
    :model/MetabotPrompt                     metabase-enterprise.metabot-v3.models.metabot-prompt
    :model/ModelIndex                        metabase.indexed-entities.models.model-index
    :model/ModelIndexValue                   metabase.indexed-entities.models.model-index
    :model/ModerationReview                  metabase.content-verification.models.moderation-review
    :model/NativeQuerySnippet                metabase.native-query-snippets.models.native-query-snippet
    :model/Notification                      metabase.notification.models
    :model/NotificationCard                  metabase.notification.models
    :model/NotificationHandler               metabase.notification.models
    :model/NotificationRecipient             metabase.notification.models
    :model/NotificationSubscription          metabase.notification.models
    :model/ParameterCard                     metabase.queries.models.parameter-card
    :model/Permissions                       metabase.permissions.models.permissions
    :model/PermissionsGroup                  metabase.permissions.models.permissions-group
    :model/PermissionsGroupMembership        metabase.permissions.models.permissions-group-membership
    :model/PermissionsRevision               metabase.permissions.models.permissions-revision
    :model/PersistedInfo                     metabase.model-persistence.models.persisted-info
    :model/PythonLibrary                     metabase-enterprise.transforms-python.models.python-library
    :model/Pulse                             metabase.pulse.models.pulse
    :model/PulseCard                         metabase.pulse.models.pulse-card
    :model/PulseChannel                      metabase.pulse.models.pulse-channel
    :model/PulseChannelRecipient             metabase.pulse.models.pulse-channel-recipient
    :model/Query                             metabase.queries.models.query
    :model/QueryAction                       metabase.actions.models
    :model/QueryCache                        metabase.cache.models.query-cache
    :model/QueryExecution                    metabase.queries.models.query-execution
    :model/QueryField                        metabase.queries.models.query-field
    :model/QueryTable                        metabase.queries.models.query-table
    :model/RecentViews                       metabase.activity-feed.models.recent-views
    :model/RemoteSyncObject                  metabase-enterprise.remote-sync.models.remote-sync-object
    :model/RemoteSyncTask                    metabase-enterprise.remote-sync.models.remote-sync-task
    :model/Revision                          metabase.revisions.models.revision
    :model/SearchIndexMetadata               metabase.search.models.search-index-metadata
    :model/Secret                            metabase.secrets.models.secret
    :model/Segment                           metabase.segments.models.segment
    :model/SemanticSearchTokenTracking       metabase-enterprise.semantic-search.models.token-tracking
    :model/Session                           metabase.session.models.session
    :model/Setting                           metabase.settings.models.setting
    :model/SupportAccessGrantLog metabase-enterprise.support-access-grants.models.support-access-grant-log
    :model/Table                             metabase.warehouse-schema.models.table
    :model/TaskHistory                       metabase.task-history.models.task-history
    :model/TaskRun                           metabase.task-history.models.task-run
    :model/Tenant                            metabase-enterprise.tenants.model
    :model/Timeline                          metabase.timeline.models.timeline
    :model/TimelineEvent                     metabase.timeline.models.timeline-event
    :model/Transform                         metabase-enterprise.transforms.models.transform
    :model/TransformJob                      metabase-enterprise.transforms.models.transform-job
    :model/TransformJobRun                   metabase-enterprise.transforms.models.job-run
    :model/TransformJobTransformTag          metabase-enterprise.transforms.models.transform-job-transform-tag
    :model/TransformRun                      metabase-enterprise.transforms.models.transform-run
    :model/TransformRunCancelation           metabase-enterprise.transforms.models.transform-run-cancelation
    :model/TransformTag                      metabase-enterprise.transforms.models.transform-tag
    :model/TransformTransformTag             metabase-enterprise.transforms.models.transform-transform-tag
    :model/Undo                              metabase-enterprise.action-v2.models.undo
    :model/User                              metabase.users.models.user
    :model/UserKeyValue                      metabase.user-key-value.models.user-key-value
    :model/UserParameterValue                metabase.users.models.user-parameter-value
    :model/ViewLog                           metabase.view-log.models.view-log
    :model/Workspace                         metabase-enterprise.workspaces.models.workspace
    :model/WorkspaceInput                    metabase-enterprise.workspaces.models.workspace-input
    :model/WorkspaceInputExternal            metabase-enterprise.workspaces.models.workspace-input-external
    :model/WorkspaceLog                      metabase-enterprise.workspaces.models.workspace-log
    :model/WorkspaceMerge                    metabase-enterprise.workspaces.models.workspace-merge
    :model/WorkspaceMergeTransform           metabase-enterprise.workspaces.models.workspace-merge-transform
    :model/WorkspaceOutput                   metabase-enterprise.workspaces.models.workspace-output
    :model/WorkspaceOutputExternal           metabase-enterprise.workspaces.models.workspace-output-external
    :model/WorkspaceGraph                    metabase-enterprise.workspaces.models.workspace-graph
    :model/WorkspaceTransform                metabase-enterprise.workspaces.models.workspace-transform})

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !!                                                                                                !!
;;; !!                 DO NOT ADD ANY MORE MODEL NAMESPACES UNDER `metabase.models.*`                 !!
;;; !!                                                                                                !!
;;; !!   Please read https://metaboat.slack.com/archives/CKZEMT1MJ/p1738972144181069 for more info    !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

(methodical/defmethod t2.model/resolve-model :before :default
  "Ensure the namespace for given model is loaded. This is a safety mechanism as we are moving to toucan2 and we don't
  need to require the model namespaces in order to use it."
  [x]
  (when (and (keyword? x)
             (= (namespace x) "model")
             ;; Don't try to require if it's already registered as a :metabase/model, since that means it has already
             ;; been required
             (not (isa? x :metabase/model)))
    ;; [[classloader/require]] for thread safety
    (classloader/require (model->namespace x)))
  x)

(methodical/defmethod t2.model/resolve-model :around clojure.lang.Symbol
  "Handle models named by simple symbols e.g. `'User`."
  [symb]
  (or
   (when (simple-symbol? symb)
     (let [metabase-models-keyword (keyword "model" (name symb))]
       (t2.model/resolve-model metabase-models-keyword)))
   (next-method symb)))

(def ^:private ^:dynamic *table-name-resolved* false)

(methodical/defmethod t2.model/table-name :around :default
  "Toucan 2 table-name by default does not do model resolution. Since we do a lot of dynamic model resolution, wrap it
  and resolve keywords if needed."
  [model]
  (if (or (not (keyword? model))
          *table-name-resolved*)
    (next-method model)
    (binding [*table-name-resolved* true]
      ;; loading the model namespace by calling `resolve-model` can add a new implementation to `table-name`, and
      ;; apparently we need to refer back to the var to pick up the updated multimethod.
      (#'t2.model/table-name (t2.model/resolve-model model)))))
