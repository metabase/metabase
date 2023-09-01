(ns metabase.models
  (:require
   [metabase.models.action :as action]
   [metabase.models.activity :as activity]
   [metabase.models.application-permissions-revision :as a-perm-revision]
   [metabase.models.bookmark :as bookmark]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.models.collection-permission-graph-revision
    :as c-perm-revision]
   [metabase.models.dashboard :as dashboard]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.dashboard-card-series :as dashboard-card-series]
   [metabase.models.dashboard-tab :as dashboard-tab]
   [metabase.models.database :as database]
   [metabase.models.dimension :as dimension]
   [metabase.models.field :as field]
   [metabase.models.field-values :as field-values]
   [metabase.models.login-history :as login-history]
   [metabase.models.metric :as metric]
   [metabase.models.metric-important-field :as metric-important-field]
   [metabase.models.model-index :as model-index]
   [metabase.models.moderation-review :as moderation-review]
   [metabase.models.native-query-snippet :as native-query-snippet]
   [metabase.models.parameter-card :as parameter-card]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-group-membership
    :as perms-group-membership]
   [metabase.models.permissions-revision :as perms-revision]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.pulse :as pulse]
   [metabase.models.pulse-card :as pulse-card]
   [metabase.models.pulse-channel :as pulse-channel]
   [metabase.models.pulse-channel-recipient :as pulse-channel-recipient]
   [metabase.models.query-cache :as query-cache]
   [metabase.models.query-execution :as query-execution]
   [metabase.models.revision :as revision]
   [metabase.models.secret :as secret]
   [metabase.models.segment :as segment]
   [metabase.models.session :as session]
   [metabase.models.setting :as setting]
   [metabase.models.table :as table]
   [metabase.models.table-privileges]
   [metabase.models.task-history :as task-history]
   [metabase.models.timeline :as timeline]
   [metabase.models.timeline-event :as timeline-event]
   [metabase.models.user :as user]
   [metabase.models.view-log :as view-log]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.model :as t2.model]))

;; Fool the linter
(comment action/keep-me
         activity/keep-me
         card/keep-me
         bookmark/keep-me
         collection/keep-me
         c-perm-revision/keep-me
         dashboard/keep-me
         dashboard-card/keep-me
         dashboard-card-series/keep-me
         dashboard-tab/keep-me
         database/keep-me
         dimension/keep-me
         field/keep-me
         field-values/keep-me
         a-perm-revision/keep-me
         login-history/keep-me
         metric/keep-me
         moderation-review/keep-me
         metric-important-field/keep-me
         native-query-snippet/keep-me
         parameter-card/keep-me
         perms-group-membership/keep-me
         perms-group/keep-me
         perms-revision/keep-me
         perms/keep-me
         persisted-info/keep-me
         pulse-card/keep-me
         pulse-channel-recipient/keep-me
         pulse-channel/keep-me
         pulse/keep-me
         query-cache/keep-me
         query-execution/keep-me
         revision/keep-me
         secret/keep-me
         segment/keep-me
         session/keep-me
         setting/keep-me
         table/keep-me
         task-history/keep-me
         timeline-event/keep-me
         timeline/keep-me
         user/keep-me
         view-log/keep-me)

(p/import-vars
 [action Action HTTPAction ImplicitAction QueryAction]
 [activity Activity]
 [bookmark CardBookmark]
 [bookmark DashboardBookmark]
 [bookmark CollectionBookmark]
 [bookmark BookmarkOrdering]
 [card Card]
 [collection Collection]
 [c-perm-revision CollectionPermissionGraphRevision]
 [dashboard Dashboard]
 [dashboard-card DashboardCard]
 [dashboard-card-series DashboardCardSeries]
 [database Database]
 [dimension Dimension]
 [field Field]
 [field-values FieldValues]
 [login-history LoginHistory]
 [metric Metric]
 [moderation-review ModerationReview]
 [model-index ModelIndex ModelIndexValue]
 [metric-important-field MetricImportantField]
 [native-query-snippet NativeQuerySnippet]
 [parameter-card ParameterCard]
 [perms Permissions]
 [perms-group PermissionsGroup]
 [perms-group-membership PermissionsGroupMembership]
 [perms-revision PermissionsRevision]
 [a-perm-revision ApplicationPermissionsRevision]
 [persisted-info PersistedInfo]
 [pulse Pulse]
 [pulse-card PulseCard]
 [pulse-channel PulseChannel]
 [pulse-channel-recipient PulseChannelRecipient]
 [query-cache QueryCache]
 [query-execution QueryExecution]
 [revision Revision]
 [secret Secret]
 [segment Segment]
 [session Session]
 [setting Setting]
 [table Table]
 [task-history TaskHistory]
 [timeline Timeline]
 [timeline-event TimelineEvent]
 [user User]
 [view-log ViewLog])

(defenterprise resolve-enterprise-model
  "OSS version; no-op."
  metabase-enterprise.models
  [x]
  x)

(methodical/defmethod t2.model/resolve-model :before :default
  "Ensure the namespace for given model is loaded.
  This is a safety mechanism as we are moving to toucan2 and we don't need to require the model namespaces in order to use it."
  [x]
  (when (and (keyword? x)
             (= (namespace x) "model")
             ;; Don't try to require if it's already registered as a :metabase/model, since that means it has already
             ;; been required
             (not (isa? x :metabase/model)))
    (try
      (let [model-namespace (str "metabase.models." (u/->kebab-case-en (name x)))]
        ;; use `classloader/require` which is thread-safe and plays nice with our plugins system
        (classloader/require model-namespace))
      (catch clojure.lang.ExceptionInfo _
        (resolve-enterprise-model x))))
  x)

(methodical/defmethod t2.model/resolve-model :around clojure.lang.Symbol
  "Handle models deriving from :metabase/model."
  [symb]
  (or
    (when (simple-symbol? symb)
      (let [metabase-models-keyword (keyword "model" (name symb))]
        (when (isa? metabase-models-keyword :metabase/model)
          metabase-models-keyword)))
    (next-method symb)))
