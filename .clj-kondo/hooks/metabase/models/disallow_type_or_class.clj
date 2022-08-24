(ns hooks.metabase.models.disallow-type-or-class
  (:require [clj-kondo.hooks-api :as hooks]))

(def known-models
  '#{Action
     Activity
     App
     ApplicationPermissionsRevision
     BookmarkOrdering
     Card
     CardBookmark
     CardEmitter
     Collection
     CollectionBookmark
     CollectionPermissionGraphRevision
     Dashboard
     DashboardBookmark
     DashboardCard
     DashboardCardSeries
     DashboardEmitter
     Database
     Dimension
     Emitter
     Field
     FieldValues
     HTTPAction
     LoginHistory
     Metric
     MetricImportantField
     ModerationReview
     NativeQuerySnippet
     Permissions
     PermissionsGroup
     PermissionsGroupMembership
     PermissionsRevision
     PersistedInfo
     Pulse
     PulseCard
     PulseChannel
     PulseChannelRecipient
     Query
     QueryAction
     QueryCache
     QueryExecution
     Revision
     Secret
     Segment
     Session
     Setting
     Table
     TaskHistory
     Timeline
     TimelineEvent
     User
     ViewLog})

(defn hook [{:keys [node], :as arg}]
  (let [arg (second (:children node))]
    (when (hooks/token-node? arg)
      (let [token (hooks/sexpr arg)]
        (when (contains? known-models (symbol (name token)))
          (hooks/reg-finding!
           (assoc (meta node)
                  :message (format "Don't call %s on a model!" (str (first (:children node))))
                  :type :metabase/disallow-class-or-type-on-model))))))
  arg)
