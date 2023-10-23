(ns metabase.events.schema
  (:require
   [malli.core :as mc]
   [toucan2.core :as t2]))

;; dashboard related events

(def ^:private dashboard-default
  (mc/schema
   [:map {:closed true}
    [:object [:fn #(t2/instance-of? :model/Dashboard %)]]]))

(def ^:private dashboard-with-actor
  (mc/schema
   [:merge
    dashboard-default
    [:map {:closed true}
     [:actor-id pos-int?]]]))

(def ^:private dashboard-update-with-dashcards
  (mc/schema
   [:merge
    dashboard-with-actor
    [:map {:closed true}
     [:dashcards [:sequential [:map [:id pos-int?]]]]]]))

(def ^:private dashboard-update-with-tab-ids
  (mc/schema
   [:merge
    dashboard-with-actor
    [:map {:closed true}
     [:tab-ids [:sequential pos-int?]]]]))

(def ^:private dashboard-events-schemas
  (merge
   {:event/dashboard-read             dashboard-with-actor
    :event/dashboard-create           (mc/schema
                                       [:merge
                                        dashboard-default
                                        [:map {:closed true}
                                         [:creator-id pos-int?]]])
    :event/dashboard-update           dashboard-with-actor
    :event/dashboard-reposition-cards dashboard-update-with-dashcards
    :event/dashboard-remove-cards     dashboard-update-with-dashcards
    :event/dashboard-add-cards        dashboard-update-with-dashcards
    :event/dashboard-add-tabs         dashboard-update-with-tab-ids
    :event/dashboard-update-tabs      dashboard-update-with-tab-ids
    :event/dashboard-remove-tabs      dashboard-update-with-tab-ids}))

(def topic->schema
  "Returns the schema for an event topic."
  dashboard-events-schemas)
