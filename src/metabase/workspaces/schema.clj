(ns metabase.workspaces.schema
  "Malli schemas for the workspaces module."
  (:require
   [metabase.util.malli.registry :as mr]))

(def entity-types
  "Toucan models that support workspace copy-on-write remapping: the git-synced models (see
  `metabase-enterprise.remote-sync.spec/remote-sync-specs`) minus Table, Field and their
  related models, plus the inlined child models (dashboard cards/tabs/series, timeline
  events) whose rows get copied with their own IDs."
  #{:model/Card
    :model/Collection
    :model/Dashboard
    :model/DashboardCard
    :model/DashboardCardSeries
    :model/DashboardTab
    :model/Document
    :model/Measure
    :model/NativeQuerySnippet
    :model/PythonLibrary
    :model/Segment
    :model/Timeline
    :model/TimelineEvent
    :model/Transform
    :model/TransformTag})

(mr/def ::entity-type
  (into [:enum {:decode/json keyword}] (sort entity-types)))

(mr/def ::workspace
  [:map
   [:id         pos-int?]
   [:branch     :string]
   [:creator_id [:maybe pos-int?]]])
