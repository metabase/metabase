(ns metabase.events.schema
  (:require
   [malli.util :as mut]
   [metabase.models.view-log-impl :as view-log-impl]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; TODO -- move these into appropriate modules.

(mu/defn event-schema
  "Get the Malli schema we should use for events of `topic`. By default, this looks in our registry for a schema
  matching the event topic name; if it fails to find one, it falls back to `:map`."
  [topic :- keyword?]
  (or (mr/registered-schema topic)
      :map))

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- with-hydrate
  "Given a malli entry schema of a map, return a new entry schema with an additional option
  to hydrate information when sending system event notifications.

    (events.notification/hydrate! [:map
                                    (-> [:user_id :int] (with-hydrate :user [:model/User :email]))]
                                  {:user_id 1})
    ;; => {:user_id 1
           :user    {:email \"ngoc@metabase.com\"}}"
  [entry-schema k model]
  (assert (#{2 3} (count entry-schema)) "entry-schema must have 2 or 3 elements")
  (let [[entry-key option schema] (if (= 2 (count entry-schema))
                                    [(first entry-schema) {} (second entry-schema)]
                                    entry-schema)]
    [entry-key (assoc option :hydrate {:key   k
                                       :model model})
     schema]))

(def ^:private user-hydrate
  [:model/User :first_name :last_name :email])

;; collection events

(mr/def :event/collection-read
  [:map {:closed true}
   [:user-id  pos-int?]
   [:object   [:fn #(t2/instance-of? :model/Collection %)]]])

;; dashboard events

(mr/def ::dashboard
  [:map {:closed true}
   [:user-id pos-int?]
   [:object [:fn #(t2/instance-of? :model/Dashboard %)]]])

(mr/def :event/dashboard-create ::dashboard)
(mr/def :event/dashboard-update ::dashboard)
(mr/def :event/dashboard-delete ::dashboard)

(mr/def ::dashboard-with-dashcards
  (-> (event-schema ::dashboard)
      (mut/assoc :dashcards [:sequential [:map [:id pos-int?]]])))

(mr/def :event/dashboard-remove-cards ::dashboard-with-dashcards)
(mr/def :event/dashboard-add-cards    ::dashboard-with-dashcards)

(mr/def :event/dashboard-read
  [:map {:closed true}
   [:user-id   [:maybe pos-int?]]
   [:object-id [:maybe pos-int?]]])

;; card events

(mr/def ::card
  [:map {:closed true}
   [:user-id  [:maybe pos-int?]]
   [:object   [:fn #(t2/instance-of? :model/Card %)]]])

(mr/def :event/card-create ::card)
(mr/def :event/card-update ::card)
(mr/def :event/card-delete ::card)

(mr/def :event/card-read
  [:map {:closed true}
   ;; context is deliberately coupled to view-log's context
   [:context view-log-impl/context]
   [:user-id [:maybe pos-int?]]
   [:object-id [:maybe pos-int?]]])

(mr/def :event/card-query
  [:map {:closed true}
   [:card-id pos-int?]
   [:user-id [:maybe pos-int?]]
   [:context {:optional true} :any]])

;; user events

(mr/def ::user
  [:map {:closed true}
   [:user-id pos-int?]])

(mr/def :event/user-login  ::user)
(mr/def :event/user-joined ::user)

(mr/def :event/user-invited
  [:map {:closed true}
   [:object [:map
             [:email ms/Email]
             [:is_from_setup {:optional true} :boolean]
             [:first_name    {:optional true} [:maybe :string]]
             [:invite_method {:optional true} :string]
             [:sso_source    {:optional true} [:maybe [:or :keyword :string]]]]]
   [:details {:optional true}
    [:map {:closed true}
     [:invitor [:map {:closed true}
                [:email                       ms/Email]
                [:first_name {:optional true} [:maybe :string]]]]]]])

;; segment events

(mr/def ::segment
  [:map {:closed true}
   [:user-id  pos-int?]
   [:object   [:fn #(t2/instance-of? :model/Segment %)]]])

(mr/def :event/segment-create ::segment)

(mr/def ::segment-with-message
  [:merge
   ::segment
   [:map {:closed true}
    [:revision-message {:optional true} :string]]])

(mr/def :event/segment-update ::segment-with-message)
(mr/def :event/segment-delete ::segment-with-message)

;; database events

(mr/def ::database
  [:map {:closed true}
   [:object [:fn #(t2/instance-of? :model/Database %)]]
   [:previous-object {:optional true} [:fn #(t2/instance-of? :model/Database %)]]
   [:details {:optional true} :map]
   [:user-id pos-int?]])

(mr/def :event/database-create ::database)
(mr/def :event/database-update ::database)
(mr/def :event/database-delete ::database)

;; alert schemas

(mr/def :event/alert-create
  [:map {:closed true}
   (-> [:user-id pos-int?]
       (with-hydrate :user user-hydrate))
   [:object [:and
             [:fn #(t2/instance-of? :model/Pulse %)]
             [:map
              [:card [:fn #(t2/instance-of? :model/Card %)]]]]]])

;; pulse schemas

(mr/def :event/pulse-create
  [:map {:closed true}
   [:user-id pos-int?]
   [:object [:fn #(t2/instance-of? :model/Pulse %)]]])

;; table events

(mr/def :event/table-read
  [:map {:closed true}
   [:user-id  pos-int?]
   [:object [:fn #(t2/instance-of? :model/Table %)]]])

(mr/def ::permission-failure
  [:map {:closed true}
   [:user-id [:maybe pos-int?]]
   [:object [:maybe [:fn #(boolean (t2/model %))]]]
   [:has-access {:optional true} [:maybe :boolean]]])

(mr/def :event/read-permission-failure   ::permission-failure)
(mr/def :event/write-permission-failure  ::permission-failure)
(mr/def :event/update-permission-failure ::permission-failure)

(mr/def :event/create-permission-failure
  [:map {:closed true}
   [:user-id [:maybe pos-int?]]
   [:model [:or :keyword :string]]])
