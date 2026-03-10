(ns metabase.events.schema
  (:require
   [malli.util :as mut]
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

 ;; collection write events

(mr/def ::collection
  [:map {:closed true}
   [:user-id [:maybe pos-int?]]
   [:object [:fn #(t2/instance-of? :model/Collection %)]]])

(mr/def :event/collection-create ::collection)
(mr/def :event/collection-update ::collection)

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

(mr/def ::publicize
  [:map {:closed true}
   [:user-id pos-int?]
   [:object-id pos-int?]])

(mr/def :event/dashboard-public-link-created ::publicize)
(mr/def :event/dashboard-public-link-deleted ::publicize)
(mr/def :event/card-public-link-created ::publicize)
(mr/def :event/card-public-link-deleted ::publicize)

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

;; measure events

(mr/def ::measure
  [:map {:closed true}
   [:user-id  pos-int?]
   [:object   [:fn #(t2/instance-of? :model/Measure %)]]])

(mr/def :event/measure-create ::measure)

(mr/def ::measure-with-message
  [:merge
   ::measure
   [:map {:closed true}
    [:revision-message {:optional true} :string]]])

(mr/def :event/measure-update ::measure-with-message)
(mr/def :event/measure-delete ::measure-with-message)

;; database events

(mr/def ::database
  [:map {:closed true}
   [:object [:fn #(t2/instance-of? :model/Database %)]]
   [:previous-object {:optional true} [:fn #(t2/instance-of? :model/Database %)]]
   [:details {:optional true} :map]
   [:user-id pos-int?]
   [:details-changed? {:optional true} [:maybe :boolean]]])

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

;; table write events

(mr/def ::table
  [:map {:closed true}
   [:user-id [:maybe pos-int?]]
   [:object [:fn #(t2/instance-of? :model/Table %)]]])

(mr/def :event/table-create ::table)
(mr/def :event/table-update ::table)
(mr/def :event/table-delete ::table)
(mr/def :event/table-publish ::table)
(mr/def :event/table-unpublish ::table)

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

;; Enterprise remote sync events

(mr/def :event/remote-sync
  [:map
   [:sync-type [:enum :initial :incremental :full "import" "export"]]
   [:collection-id [:maybe ms/NonBlankString]]
   [:user-id [:maybe pos-int?]]
   [:timestamp [:maybe :any]]
   [:branch {:optional true} [:maybe :string]]
   [:status {:optional true} [:maybe [:enum "success" "error"]]]
   [:version {:optional true} :string]
   [:message {:optional true} [:maybe :string]]])

;; snippet events

(mr/def ::snippet
  [:map {:closed true}
   [:user-id [:maybe pos-int?]]
   [:object [:fn #(t2/instance-of? :model/NativeQuerySnippet %)]]])

(mr/def :event/snippet-create ::snippet)
(mr/def :event/snippet-update ::snippet)
(mr/def :event/snippet-delete ::snippet)

;; field events

(mr/def ::field
  [:map {:closed true}
   [:user-id [:maybe pos-int?]]
   [:object [:fn #(t2/instance-of? :model/Field %)]]])

(mr/def :event/field-create ::field)
(mr/def :event/field-update ::field)
(mr/def :event/field-delete ::field)
