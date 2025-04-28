(ns metabase.notification.payload.impl.system-event
  (:require
   [java-time.api :as t]
   [malli.util :as mut]
   [metabase.channel.email.messages :as messages]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.user :as user]
   [metabase.notification.condition :as notification.condition]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.send :as notification.send]
   [metabase.public-settings :as public-settings]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2]))

(defn- join-url
  [user-id]
  ;; TODO: the reset token should come from the event-info, not generated here!
  (let [reset-token               (user/set-password-reset-token! user-id)
        should-link-to-login-page (and (public-settings/sso-enabled?)
                                       (not (public-settings/enable-password-login)))]
    (if should-link-to-login-page
      (str (public-settings/site-url) "/auth/login")
      ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
      (str (user/form-password-reset-url reset-token) "#new"))))

(defn- dispatch-on-event-info
  [{notification-system-event :payload :as _notification-info}]
  (let [{:keys [action event_name]} notification-system-event]
    (if action
      [event_name action]
      event_name)))

(defmulti transform-event-info
  "Transform the event info to a format that is easier to work with in the templates.
  This is a multi-method because we want to be able to add more event types in the future."
  {:arglists '([notification-info])}
  dispatch-on-event-info)

(def ^:private timestamp-schema
  [:timestamp  {:gen/fmap (fn [_x] (u.date/format (t/zoned-date-time)))} :any])

(mr/def ::row.mutate
  [:map {:closed true}
   [:context :map]
   [:creator [:map {:gen/return {:first_name  "Meta"
                                 :last_name   "Bot"
                                 :common_name "Meta Bot"
                                 :email       "bot@metabase.com"}}
              [:first_name :string]
              [:last_name :string]
              [:email :string]
              [:common_name :string]]]
   [:editor [:map {:gen/return {:first_name  "Meta"
                                :last_name   "Bot"
                                :common_name "Meta Bot"
                                :email       "bot@metabase.com"}}
             [:first_name :string]
             [:last_name :string]
             [:email :string]
             [:common_name :string]]]
   [:table [:map {:closed true
                  :gen/return {:id    1
                               :name "orders"
                               :url  "https://metabase.com/databases/1337/table/1"}}
            [:id :int]
            [:name :string]
            [:url :string]]]

   [:settings [:map]]])

;; TODO: all 3 schemas are actually the same, we should be able to use a multi schema for this.
;; the reason we need to separte them out is to have description and sampling nicer.
;; Maybe we should figure out a way to provide options for choosing the value of dispatch when sampling
;; Looked but afaik there is no such things. (PR against malli?)
(mr/def ::row.created
  [:merge
   ::row.mutate
   [:map
    [:context [:map  {:closed true}
               [:event_name [:enum :event/row.created "event/row.created"]]
               timestamp-schema]]
    [:record {:description "The newly created row with all its field values"
              :gen/return  {:id     1
                            :name   "Product A"
                            :price  29.99
                            :status "active"}}
     :map]]])

(mr/def ::row.updated
  [:merge
   ::row.mutate
   [:map
    [:context [:map {:closed true}
               [:event_name [:enum :event/row.updated "event/row.updated"]]
               timestamp-schema]]
    [:record {:description "The row after updates were applied, containing all fields"
              :gen/return  {:id     1
                            :name   "Product A"
                            :price  24.99
                            :status "on sale"}}
     :map]
    [:changes {:description "Only the fields that were modified, showing previous and new values"
               :gen/return  {:price  {:before 29.99
                                      :after 24.99}
                             :status {:before "active"
                                      :after "on sale"}}}
     [:map-of :keyword [:map
                        [:before :any]
                        [:after :any]]]]]])

(mr/def ::row.deleted
  [:merge
   ::row.mutate
   [:map {:closed true}
    [:context [:map {:closed true}
               [:event_name [:enum :event/row.deleted "event/row.deleted"]]
               timestamp-schema]]
    [:record {:description "The row that was deleted, showing all field values before deletion"
              :gen/return  {:id     1
                            :name   "Product A"
                            :price  24.99
                            :status "discontinued"}}
     :map]]])

(mr/def ::row.mutate.all
  [:multi {:dispatch (comp :event_name :context)}
   [:event/row.created ::row.created]
   [:event/row.updated ::row.updated]
   [:event/row.deleted ::row.deleted]])

(mu/defn- bulk-row-transformation :- ::row.mutate.all
  [notification-info]
  (or (lib.util.match/match-one
        notification-info
        {:payload    {:event_name ?event_name}
         :creator    {:first_name  ?creator_first_name
                      :last_name   ?creator_last_name
                      :email       ?creator_email
                      :common_name ?creator_common_name}
         :event_info {:actor       ?actor
                      :args        {:table_id  ?table_id
                                    :db_id     ?db_id
                                    :table     {:name ?table_name}
                                    :timestamp ?timestamp}
                      :row_change  {:pk     ?pk
                                    :before ?before
                                    :after  ?after}}}
        (merge
         {:context      {:event_name ?event_name
                         :timestamp  (u.date/format ?timestamp)}
          :editor       {:first_name  (:first_name ?actor)
                         :last_name   (:last_name ?actor)
                         :email       (:email ?actor)
                         :common_name (:common_name ?actor)}
          :creator      {:first_name  ?creator_first_name
                         :last_name   ?creator_last_name
                         :email       ?creator_email
                         :common_name ?creator_common_name}
          :table        {:id   ?table_id
                         :name ?table_name
                         :url  (urls/table-url ?db_id ?table_id)}
          :record       (or ?after ?before) ;; for insert and update we want the after, for delete we want the before

          :settings     (notification.payload/default-settings)}
         (when (= ?event_name :event/row.updated)
           {:changes (let [row-columns (into #{} (concat (keys ?before) (keys ?after)))]
                       (into {}
                             (for [k row-columns]
                               [k {:before (get ?before k)
                                   :after  (get ?after k)}])))})))
      (throw (ex-info "Unable to destructure notification-info, check that expected structure matches malli schema."
                      {:notification-info notification-info}))))

(mu/defmethod transform-event-info :event/row.created :- ::row.created
  [notification-info]
  (bulk-row-transformation notification-info))

(mu/defmethod transform-event-info :event/row.updated :- ::row.updated
  [notification-info]
  (bulk-row-transformation notification-info))

(mu/defmethod transform-event-info :event/row.deleted :- ::row.deleted
  [notification-info]
  (bulk-row-transformation notification-info))

(defmethod transform-event-info :default
  [notification-info]
  (let [event-info (:event_info notification-info)]
    {:creator      (t2/select-one [:model/User :id :first_name :last_name :email] (:creator_id notification-info))
     :context      (notification.payload/default-settings)
     ;; TODO, we need event_name anywhere?
     :payload      (assoc event-info :event_name (-> notification-info :payload :event_name))}))

(defmethod transform-event-info :event/user-invited
  [notification-info]
  (let [default-payload ((get-method transform-event-info :default) notification-info)]
    (assoc-in default-payload
              [:payload :custom]
              {:user_invited_email_subject (trs "You''re invited to join {0}''s {1}" (public-settings/site-name) (messages/app-name-trs))
               :user_invited_join_url      (-> notification-info :event_info :object :id join-url)})))

(mu/defmethod notification.payload/notification-payload :notification/system-event :- :map
  [notification-info :- ::notification.payload/Notification]
  (transform-event-info notification-info))

(defmethod notification.payload/notification-payload-schema :notification/system-event
  [notification-info]
  (when-let [[op _arg-schema return-schema] (some->> notification-info
                                                     dispatch-on-event-info
                                                     (get-method transform-event-info)
                                                     meta
                                                     :schema)]
    (assert (= op :=>))
    (mr/resolve-schema return-schema)))

(defmethod notification.send/should-queue-notification? :notification/system-event
  [notification-info]
  (if-let [condition (not-empty (:condition notification-info))]
    (notification.condition/evaluate-expression condition (:event_info notification-info))
    true))
