(ns metabase.models
  (:require [metabase.models
             [activity :as activity]
             [card :as card]
             [card-favorite :as card-favorite]
             [collection :as collection]
             [collection-revision :as collection-revision]
             [dashboard :as dashboard]
             [dashboard-card :as dashboard-card]
             [dashboard-card-series :as dashboard-card-series]
             [dashboard-favorite :as dashboard-favorite]
             [database :as database]
             [dependency :as dependency]
             [dimension :as dimension]
             [field :as field]
             [field-values :as field-values]
             [metric :as metric]
             [metric-important-field :as metric-important-field]
             [native-query-snippet :as native-query-snippet]
             [permissions :as permissions]
             [permissions-group :as permissions-group]
             [permissions-group-membership :as permissions-group-membership]
             [permissions-revision :as permissions-revision]
             [pulse :as pulse]
             [pulse-card :as pulse-card]
             [pulse-channel :as pulse-channel]
             [pulse-channel-recipient :as pulse-channel-recipient]
             [query-cache :as query-cache]
             [query-execution :as query-execution]
             [revision :as revision]
             [segment :as segment]
             [session :as session]
             [setting :as setting]
             [table :as table]
             [task-history :as task-history]
             [user :as user]
             [view-log :as view-log]]
            [potemkin :as p]))

;; Fool the linter
(comment activity/keep-me
         card/keep-me
         card-favorite/keep-me
         collection/keep-me
         collection-revision/keep-me
         dashboard/keep-me
         dashboard-card/keep-me
         dashboard-card-series/keep-me
         dashboard-favorite/keep-me
         database/keep-me
         dependency/keep-me
         dimension/keep-me
         field/keep-me
         field-values/keep-me
         metric/keep-me
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
 [collection-revision CollectionRevision]
 [dashboard Dashboard]
 [dashboard-card DashboardCard]
 [dashboard-card-series DashboardCardSeries]
 [dashboard-favorite DashboardFavorite]
 [database Database]
 [dependency Dependency]
 [dimension Dimension]
 [field Field]
 [field-values FieldValues]
 [metric Metric]
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
