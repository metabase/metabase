(ns metabase.queries.events.schema
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.view-log.core :as view-log]
   [toucan2.core :as t2]))

(mr/def ::card
  [:map {:closed true}
   [:user-id  [:maybe pos-int?]]
   [:object   [:fn #(t2/instance-of? :model/Card %)]]])

(mr/def :event/card-create ::card)
(mr/def :event/card-delete ::card)

(mr/def :event/card-update
  [:map {:closed true}
   [:user-id         [:maybe pos-int?]]
   [:object          [:fn #(t2/instance-of? :model/Card %)]]
   [:previous-object [:fn #(t2/instance-of? :model/Card %)]]])

(mr/def :event/card-read
  [:map {:closed true}
   ;; context is deliberately coupled to view-log's context
   [:context view-log/context]
   [:user-id [:maybe pos-int?]]
   [:object-id [:maybe pos-int?]]])

(mr/def :event/card-query
  [:map {:closed true}
   [:card-id pos-int?]
   [:user-id [:maybe pos-int?]]
   [:context {:optional true} :any]])

(mr/def :event/card-public-link-created
  [:map {:closed true}
   [:user-id pos-int?]
   [:object-id pos-int?]])

(mr/def :event/card-public-link-deleted
  [:map {:closed true}
   [:user-id pos-int?]
   [:object-id pos-int?]])
