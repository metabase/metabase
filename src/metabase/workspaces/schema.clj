(ns metabase.workspaces.schema
  "Malli schemas for the workspaces module."
  (:require
   [metabase.util.malli.registry :as mr]))

(def entity-types
  "Entity types that support workspace copy-on-write remapping: the git-synced models (see
  `metabase-enterprise.remote-sync.spec/remote-sync-specs`) minus Table, Field and their
  related models, plus the inlined child models (dashboard cards/tabs/series, timeline
  events) whose rows get copied with their own IDs."
  #{:card
    :collection
    :dashboard
    :dashboard-card
    :dashboard-card-series
    :dashboard-tab
    :document
    :measure
    :native-query-snippet
    :python-library
    :segment
    :timeline
    :timeline-event
    :transform
    :transform-tag})

(mr/def ::entity-type
  (into [:enum {:decode/json keyword}] (sort entity-types)))

(mr/def ::workspace
  [:map
   [:id         pos-int?]
   [:name       :string]
   [:creator_id [:maybe pos-int?]]])
