(ns metabase.models
  (:require [metabase.models.activity :as activity]
            [metabase.models.card :as card]
            [metabase.models.card-favorite :as card-favorite]
            [metabase.models.collection :as collection]
            [metabase.models.collection-permission-graph-revision :as c-perm-revision]
            [metabase.models.dashboard :as dashboard]
            [metabase.models.dashboard-card :as dashboard-card]
            [metabase.models.dashboard-card-series :as dashboard-card-series]
            [metabase.models.dashboard-favorite :as dashboard-favorite]
            [metabase.models.database :as database]
            [metabase.models.dependency :as dependency]
            [metabase.models.dimension :as dimension]
            [metabase.models.field :as field]
            [metabase.models.field-values :as field-values]
            [metabase.models.login-history :as login-history]
            [metabase.models.metric :as metric]
            [metabase.models.moderation-review :as moderation-review]
            [metabase.models.metric-important-field :as metric-important-field]
            [metabase.models.native-query-snippet :as native-query-snippet]
            [metabase.models.permissions :as permissions]
            [metabase.models.permissions-group :as permissions-group]
            [metabase.models.permissions-group-membership :as permissions-group-membership]
            [metabase.models.permissions-revision :as permissions-revision]
            [metabase.models.pulse :as pulse]
            [metabase.models.pulse-card :as pulse-card]
            [metabase.models.pulse-channel :as pulse-channel]
            [metabase.models.pulse-channel-recipient :as pulse-channel-recipient]
            [metabase.models.query-cache :as query-cache]
            [metabase.models.query-execution :as query-execution]
            [metabase.models.revision :as revision]
            [metabase.models.segment :as segment]
            [metabase.models.session :as session]
            [metabase.models.setting :as setting]
            [metabase.models.table :as table]
            [metabase.models.task-history :as task-history]
            [metabase.models.user :as user]
            [metabase.models.view-log :as view-log]
            [potemkin :as p]))

;; Fool the linter
(comment activity/keep-me
         card/keep-me
         card-favorite/keep-me
         collection/keep-me
         c-perm-revision/keep-me
         dashboard/keep-me
         dashboard-card/keep-me
         dashboard-card-series/keep-me
         dashboard-favorite/keep-me
         database/keep-me
         dependency/keep-me
         dimension/keep-me
         field/keep-me
         field-values/keep-me
         login-history/keep-me
         metric/keep-me
         moderation-review/keep-me
         metric-important-field/keep-me
         native-query-snippet/keep-me
         permissions/keep-me
         permissions-group/keep-me
         permissions-group-membership/keep-me
         permissions-revision/keep-me
         pulse/keep-me
         pulse-card/keep-me
         pulse-channel/keep-me
         pulse-channel-recipient/keep-me
         query-cache/keep-me
         query-execution/keep-me
         revision/keep-me
         segment/keep-me
         session/keep-me
         setting/keep-me
         table/keep-me
         task-history/keep-me
         user/keep-me
         view-log/keep-me)

(p/import-vars
 [activity Activity]
 [card Card]
 [card-favorite CardFavorite]
 [collection Collection]
 [c-perm-revision CollectionPermissionGraphRevision]
 [dashboard Dashboard]
 [dashboard-card DashboardCard]
 [dashboard-card-series DashboardCardSeries]
 [dashboard-favorite DashboardFavorite]
 [database Database]
 [dependency Dependency]
 [dimension Dimension]
 [field Field]
 [field-values FieldValues]
 [login-history LoginHistory]
 [metric Metric]
 [moderation-review ModerationReview]
 [metric-important-field MetricImportantField]
 [native-query-snippet NativeQuerySnippet]
 [permissions Permissions]
 [permissions-group PermissionsGroup]
 [permissions-group-membership PermissionsGroupMembership]
 [permissions-revision PermissionsRevision]
 [pulse Pulse]
 [pulse-card PulseCard]
 [pulse-channel PulseChannel]
 [pulse-channel-recipient PulseChannelRecipient]
 [query-cache QueryCache]
 [query-execution QueryExecution]
 [revision Revision]
 [segment Segment]
 [session Session]
 [setting Setting]
 [table Table]
 [task-history TaskHistory]
 [user User]
 [view-log ViewLog])
