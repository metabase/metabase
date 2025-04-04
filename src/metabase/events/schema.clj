(ns metabase.events.schema
  (:require
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [malli.util :as mut]
   [metabase.api.macros.defendpoint.open-api :as defendpoint.open-api]
   [metabase.lib.schema.common :as common]
   [metabase.models.view-log-impl :as view-log-impl]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

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

(def ^:private table-hydrate
  [:model/Table :name])

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

;; metric events

;; TODO -- are these for LEGACY METRICS? ARE THESE EVENT USED ANYMORE?

(mr/def ::metric
  [:map {:closed true}
   [:user-id  pos-int?]
   [:object   [:fn #(t2/instance-of? :model/LegacyMetric %)]]])

(mr/def :event/metric-create ::metric)

(mr/def ::metric-with-message
  [:merge
   ::metric
   [:map {:closed true}
    [:revision-message {:optional true} :string]]])

(mr/def :event/metric-update ::metric-with-message)
(mr/def :event/metric-delete ::metric-with-message)

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

(mr/def ::nano-id ::common/non-blank-string)

(def ^:private table-id-hydrate (-> [:table_id {:optional true
                                                :description "The table that was created"}
                                     pos-int?]
                                    (with-hydrate :table table-hydrate)))

(def ^:private table-hydrate-schema [:table {:optional true}
                                     [:map
                                      [:name
                                       {:description "The name of the table"
                                        :gen/return "orders"}
                                       :string]]])

(def ^{:dynamic true
       :private true} *action-gen-value* nil)

(mr/def ::action-events
  [:map #_{:closed true}
   [:action {:gen/fmap (fn [_x] *action-gen-value*)
             :description "The action that was performed"} :keyword]
   [:invocation_id {:description "The unique identifier for the action invocation"} ::nano-id]
   (-> [:actor_id pos-int?] (with-hydrate :actor user-hydrate))
   [:actor {:optional true
            :description "The user who performed the action"}
    [:map {:gen/return {:first_name "Meta"
                        :last_name  "Bot"
                        :email      "bot@metabase.com"}}
     [:first_name [:maybe :string]]
     [:last_name  [:maybe :string]]
     [:email      [:maybe :string]]]]])

(mr/def :event/action.invoked [:merge ::action-events [:map [:args :map]]])
(mr/def :event/action.success [:merge ::action-events [:multi {:dispatch :action}
                                                       [:row/create [:map [:result
                                                                           [:map
                                                                            table-id-hydrate
                                                                            table-hydrate-schema
                                                                            [:created_row {:gen/return {:id 1
                                                                                                        :name "this is an example"}
                                                                                           :description "The created row, actual keys will vary based on the table"}
                                                                             :map]]]]]
                                                       [:row/update [:map [:result
                                                                           [:map
                                                                            table-id-hydrate
                                                                            table-hydrate-schema
                                                                            [:raw_update {:gen/return {:id 1
                                                                                                       :name "New Name"}
                                                                                          :description "The raw update, actual keys will vary based on the table"} [:maybe :map]]
                                                                            [:after  {:gen/return {:id 2
                                                                                                   :name "New Name"}
                                                                                      :description "The after state, actual keys will vary based on the table"} [:maybe :map]]
                                                                            [:before {:gen/return {:id 2
                                                                                                   :name "Old Name"}
                                                                                      :description "The before state, actual keys will vary based on the table"} [:maybe :map]]]]]]
                                                       [:row/delete [:map [:result
                                                                           [:map
                                                                            table-id-hydrate
                                                                            table-hydrate-schema
                                                                            [:deleted_row {:gen/return {:id 1
                                                                                                        :name "this is an example"}
                                                                                           :description "The deleted row, actual keys will vary based on the table"}
                                                                             :map]]]]]
                                                       [::mc/default :map]]])

(mr/def :event/action.failure [:merge ::action-events [:map [:info :map]]])

(defn schema->json-schema
  "Convert a malli schema to a OpenAI schema schema."
  [schema]
  (defendpoint.open-api/fix-json-schema
   (-> schema mr/resolve-schema mjs/transform)))
