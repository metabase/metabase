(ns metabase.events.schema
  (:require
   [malli.core :as mc]
   [toucan2.core :as t2]))

;; dashboard events

(def ^:private dashboard-default
  (mc/schema
   [:map {:closed true}
    [:actor-id pos-int?]
    [:object [:fn #(t2/instance-of? :model/Dashboard %)]]]))

(def ^:private dashboard-update-with-dashcards
  (mc/schema
   [:merge
    dashboard-default
    [:map {:closed true}
     [:dashcards [:sequential [:map [:id pos-int?]]]]]]))

(def ^:private dashboard-update-with-tab-ids
  (mc/schema
   [:merge
    dashboard-default
    [:map {:closed true}
     [:tab-ids [:sequential pos-int?]]]]))

(def ^:private dashboard-events-schemas
  {:event/dashboard-read             dashboard-default
   :event/dashboard-create           dashboard-default
   :event/dashboard-update           dashboard-default
   :event/dashboard-reposition-cards dashboard-update-with-dashcards
   :event/dashboard-remove-cards     dashboard-update-with-dashcards
   :event/dashboard-add-cards        dashboard-update-with-dashcards
   :event/dashboard-add-tabs         dashboard-update-with-tab-ids
   :event/dashboard-update-tabs      dashboard-update-with-tab-ids
   :event/dashboard-remove-tabs      dashboard-update-with-tab-ids})

;; card events

(def ^:private card-default
  (mc/schema
   [:map {:closed true}
    [:actor-id pos-int?]
    [:object   [:fn #(t2/instance-of? :model/Card %)]]]))

(def ^:private card-events-schemas
  {:event/card-create card-default
   :event/card-update card-default})

;; user events

(def ^:private user-default
  (mc/schema
   [:map {:closed true}
    [:user-id pos-int?]]))

(def ^:private user-events-schema
  {:event/user-login  user-default
   :event/user-joined user-default})

;; metric events

(def ^:private metric-default
  (mc/schema
   [:map {:closed true}
    [:actor-id pos-int?]
    [:object   [:fn #(t2/instance-of? :model/Metric %)]]]))

(def ^:private metric-with-message
  (mc/schema
   [:merge metric-default
    [:map {:closed true}
     [:revision-message {:optional true} :string]]]))

(def ^:private metric-related-schema
  {:event/metric-create metric-default
   :event/metric-update metric-with-message
   :event/metric-delete metric-with-message})

;; segment events

(def ^:private segment-default
  (mc/schema
   [:map {:closed true}
    [:actor-id pos-int?]
    [:object   [:fn #(t2/instance-of? :model/Segment %)]]]))

(def ^:private segment-with-message
  (mc/schema
   [:merge segment-default
    [:map {:closed true}
     [:revision-message {:optional true} :string]]]))

(def ^:private segment-related-schema
  {:event/segment-create segment-default
   :event/segment-update segment-with-message
   :event/segment-delete segment-with-message})

;; database events

(def ^:private database-default
  (mc/schema
   [:map {:closed true}
    [:object [:fn #(t2/instance-of? :model/Database %)]]]))

(def ^:private database-events
  {:event/database-create [:merge database-default
                           [:map {:closed true}
                            [:actor-id pos-int?]]]
   :event/database-update database-default
   :event/database-delete database-default})

;; table events

(def ^:private table-default
  (mc/schema
   [:map {:closed true}
    [:actor-id pos-int?]
    [:object [:fn #(t2/instance-of? :model/Table %)]]]))

(def ^:private table-events
  {:event/table-read table-default})

(def topic->schema
  "Returns the schema for an event topic."
  (merge dashboard-events-schemas
         card-events-schemas
         user-events-schema
         metric-related-schema
         segment-related-schema
         database-events
         table-events))
