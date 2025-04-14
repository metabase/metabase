(ns metabase.notification.payload.impl.system-event
  (:require
   [metabase.channel.email.messages :as messages]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.user :as user]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
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

(mr/def ::action.success.row.update
  [:map
   [:editor [:map {:gen/return {:first_name  "Meta"
                                :last_name   "Bot"
                                :common_name "Meta Bot"
                                :email       "bot@metabase.com"}}
             [:first_name :string]
             [:last_name :string]
             [:email :string]
             [:common_name :string]]]
   [:table [:map {:gen/return {:id    1
                               :name "orders"}}
            [:id :int]
            [:name :string]]]
   [:record [:map {:gen/return {:id          1
                                :product_id  2
                                :customer_id 42
                                :total       100.0}
                   :description "the new record, actual keys will vary based on the table"}
             [:id :int]
             [:name :string]]]
   [:changes [:map {:gen/return {:before {:total 100.0}
                                 :after  {:total 200.0}}
                    :description "the changes made to the record, actual keys will vary based on the table"}
              [:before :map]
              [:after :map]]]
   [:settings [:map]]])

(mu/defmethod transform-event-info [:event/action.success :row/update] :- ::action.success.row.update
  [notification-info]
  (lib.util.match/match
    notification-info
    {:event_info {:actor    {:first_name  ?first_name
                             :last_name   ?last_name
                             :email       ?email
                             :common_name ?common_name}
                  :result   {:table_id ?table_id
                             :table    {:name ?table_name}
                             :before   ?before
                             :after    ?after}}}
    {:editor     {:first_name  ?first_name
                  :last_name   ?last_name
                  :email       ?email
                  :common_name ?common_name}
     :table      {:id   ?table_id
                  :name ?table_name
                  :url  (str (public-settings/site-url) "/table/" ?table_id)}
     :record     ?after
     :changes    (into {} (for [[k v] ?after
                                :let [before-val (get ?before k)]
                                :when (not= v before-val)]
                            [k {:before before-val :after v}]))
     :settings   (notification.payload/default-settings)}))

(defmethod transform-event-info :default
  [notification-info]
  (let [event-info (:event_info notification-info)]
    {:payload_type :notification/system-event
     :creator      (t2/select-one [:model/User :id :first_name :last_name :email] (:creator_id notification-info))
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
