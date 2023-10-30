(ns metabase.events.schema
  (:require
   [malli.core :as mc]
   [malli.util :as mut]
   [toucan2.core :as t2]))

;; dashboard events

(let [default-schema (mc/schema
                      [:map {:closed true}
                       [:user-id pos-int?]
                       [:object [:fn #(t2/instance-of? :model/Dashboard %)]]])
      with-dashcards (mut/assoc default-schema
                                :dashcards [:sequential [:map [:id pos-int?]]])
      with-tab-ids   (mut/assoc default-schema
                                :tab-ids [:sequential pos-int?])]
  (def ^:private dashboard-events-schemas
    {:event/dashboard-read             default-schema
     :event/dashboard-create           default-schema
     :event/dashboard-update           default-schema
     :event/dashboard-delete           default-schema
     :event/dashboard-reposition-cards with-dashcards
     :event/dashboard-remove-cards     with-dashcards
     :event/dashboard-add-cards        with-dashcards
     :event/dashboard-add-tabs         with-tab-ids
     :event/dashboard-update-tabs      with-tab-ids
     :event/dashboard-remove-tabs      with-tab-ids}))

;; card events

(let [default-schema (mc/schema
                      [:map {:closed true}
                       [:user-id  pos-int?]
                       [:object   [:fn #(t2/instance-of? :model/Card %)]]])]
  (def ^:private card-events-schemas
    {:event/card-create default-schema
     :event/card-read   default-schema
     :event/card-update default-schema
     :event/card-delete default-schema
     :event/card-query  [:map {:closed true}
                         [:card-id                       pos-int?]
                         [:user-id                       [:maybe pos-int?]]
                         [:cached       {:optional true} :any]
                         [:context      {:optional true} :any]
                         [:ignore_cache {:optional true} :any]]}))


;; user events

(let [default-schema (mc/schema
                      [:map {:closed true}
                       [:user-id pos-int?]])]
  (def ^:private user-events-schema
    {:event/user-login  default-schema
     :event/user-joined default-schema}))

;; metric events

(let [default-schema (mc/schema
                      [:map {:closed true}
                       [:user-id  pos-int?]
                       [:object   [:fn #(t2/instance-of? :model/Metric %)]]])
      with-message   (mc/schema [:merge default-schema
                                 [:map {:closed true}
                                  [:revision-message {:optional true} :string]]])]
  (def ^:private metric-related-schema
    {:event/metric-create default-schema
     :event/metric-update with-message
     :event/metric-delete with-message}))

;; segment events

(let [default-schema (mc/schema
                      [:map {:closed true}
                       [:user-id  pos-int?]
                       [:object   [:fn #(t2/instance-of? :model/Segment %)]]])
      with-message (mc/schema
                    [:merge default-schema
                     [:map {:closed true}
                      [:revision-message {:optional true} :string]]])]
  (def ^:private segment-related-schema
    {:event/segment-create default-schema
     :event/segment-update with-message
     :event/segment-delete with-message}))

;; database events

(let [default-schema (mc/schema
                      [:map {:closed true}
                       [:object [:fn #(t2/instance-of? :model/Database %)]]])
      with-user      (mc/schema
                      [:merge default-schema
                       [:map {:closed true}
                        [:user-id  pos-int?]]])]

  (def ^:private database-events
    {:event/database-create with-user

     :event/database-update default-schema
     :event/database-delete default-schema}))

;; alert schemas
(def ^:private alert-schema
  {:event/alert-create (mc/schema
                        [:map {:closed true}
                         [:user-id pos-int?]
                         [:object [:and
                                   [:fn #(t2/instance-of? :model/Pulse %)]
                                   [:map
                                    [:card [:fn #(t2/instance-of? :model/Card %)]]]]]])})

;; pulse schemas
(def ^:private pulse-schemas
  {:event/pulse-create (mc/schema
                        [:map {:closed true}
                         [:user-id pos-int?]
                         [:object [:fn #(t2/instance-of? :model/Pulse %)]]])})

;; table events

(def ^:private table-events
  {:event/table-read (mc/schema
                      [:map {:closed true}
                       [:user-id  pos-int?]
                       [:object [:fn #(t2/instance-of? :model/Table %)]]])})

(def topic->schema
  "Returns the schema for an event topic."
  (merge dashboard-events-schemas
         card-events-schemas
         user-events-schema
         metric-related-schema
         segment-related-schema
         database-events
         alert-schema
         pulse-schemas
         table-events))
