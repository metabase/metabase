(ns metabase.models.resolution
  (:require
   [metabase.plugins.classloader :as classloader]
   [methodical.core :as methodical]
   [toucan2.model :as t2.model]))

(def model->namespace
  "A map of known Toucan 2 models to the 'their' namespace -- the one that includes

    (derive <model> :metabase/model)

  and other important code that should be loaded for side effects (such as method implementations).

  Tests will check to make sure new models get included in this map."
  '{:model/Action                            metabase.models.action
    :model/ApiKey                            metabase.models.api-key
    :model/ApplicationPermissionsRevision    metabase.models.application-permissions-revision
    :model/AuditLog                          metabase.models.audit-log
    :model/BookmarkOrdering                  metabase.models.bookmark
    :model/CacheConfig                       metabase.models.cache-config
    :model/Card                              metabase.models.card
    :model/CardBookmark                      metabase.models.bookmark
    :model/Channel                           metabase.models.channel
    :model/ChannelTemplate                   metabase.models.channel
    :model/CloudMigration                    metabase.models.cloud-migration
    :model/Collection                        metabase.models.collection
    :model/CollectionBookmark                metabase.models.bookmark
    :model/CollectionPermissionGraphRevision metabase.models.collection-permission-graph-revision
    :model/ConnectionImpersonation           metabase-enterprise.advanced-permissions.models.connection-impersonation
    :model/Dashboard                         metabase.models.dashboard
    :model/DashboardBookmark                 metabase.models.bookmark
    :model/DashboardCard                     metabase.models.dashboard-card
    :model/DashboardCardSeries               metabase.models.dashboard-card-series
    :model/DashboardTab                      metabase.models.dashboard-tab
    :model/DataPermissions                   metabase.models.data-permissions
    :model/Database                          metabase.models.database
    :model/Dimension                         metabase.models.dimension
    :model/Field                             metabase.models.field
    :model/FieldUsage                        metabase.models.field-usage
    :model/FieldValues                       metabase.models.field-values
    :model/GroupTableAccessPolicy            metabase-enterprise.sandbox.models.group-table-access-policy
    :model/HTTPAction                        metabase.models.action
    :model/ImplicitAction                    metabase.models.action
    :model/LegacyMetric                      metabase.models.legacy-metric
    :model/LegacyMetricImportantField        metabase.models.legacy-metric-important-field
    :model/LoginHistory                      metabase.models.login-history
    :model/ModelIndex                        metabase.models.model-index
    :model/ModelIndexValue                   metabase.models.model-index
    :model/ModerationReview                  metabase.models.moderation-review
    :model/NativeQuerySnippet                metabase.models.native-query-snippet
    :model/Notification                      metabase.models.notification
    :model/NotificationHandler               metabase.models.notification
    :model/NotificationRecipient             metabase.models.notification
    :model/NotificationSubscription          metabase.models.notification
    :model/ParameterCard                     metabase.models.parameter-card
    :model/Permissions                       metabase.models.permissions
    :model/PermissionsGroup                  metabase.models.permissions-group
    :model/PermissionsGroupMembership        metabase.models.permissions-group-membership
    :model/PermissionsRevision               metabase.models.permissions-revision
    :model/PersistedInfo                     metabase.models.persisted-info
    :model/Pulse                             metabase.models.pulse
    :model/PulseCard                         metabase.models.pulse-card
    :model/PulseChannel                      metabase.models.pulse-channel
    :model/PulseChannelRecipient             metabase.models.pulse-channel-recipient
    :model/Query                             metabase.models.query
    :model/QueryAction                       metabase.models.action
    :model/QueryAnalysis                     metabase.models.query-analysis
    :model/QueryCache                        metabase.models.query-cache
    :model/QueryExecution                    metabase.models.query-execution
    :model/QueryField                        metabase.models.query-field
    :model/QueryTable                        metabase.models.query-table
    :model/RecentViews                       metabase.models.recent-views
    :model/Revision                          metabase.models.revision
    :model/SearchIndexMetadata               metabase.models.search-index-metadata
    :model/Secret                            metabase.models.secret
    :model/Segment                           metabase.models.segment
    :model/Session                           metabase.models.session
    :model/Setting                           metabase.models.setting
    :model/Table                             metabase.models.table
    :model/TablePrivileges                   metabase.models.table-privileges
    :model/TaskHistory                       metabase.models.task-history
    :model/Timeline                          metabase.models.timeline
    :model/TimelineEvent                     metabase.models.timeline-event
    :model/User                              metabase.models.user
    :model/UserKeyValue                      metabase.models.user-key-value
    :model/UserParameterValue                metabase.models.user-parameter-value
    :model/ViewLog                           metabase.models.view-log})

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
      (t2.model/table-name (t2.model/resolve-model model)))))
