(ns metabase.notification.payload.impl.system-event
  (:require
   [clojure.data :refer [diff]]
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

(mr/def ::rows.bulk
  [:map
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
   [:table [:map {:gen/return {:id    1
                               :name "orders"}}
            [:id :int]
            [:name :string]]]
   [:records {:gen/return [{:row {:ID 1
                                  :STATUS "approved"}
                            :changes {:STATUS {:before "pending"
                                               :after  "approved"}}}]}
    [:sequential
     [:map {:description "A list of records that were updated in the table."}
      [:row {:description "The row after the changes"} :map]
      [:changes {:description "Changed keys"}
       [:map-of :keyword [:map
                          [:before :any]
                          [:after :any]]]]]]]
   [:settings [:map]]])

(defn- bulk-row-transformation
  [notification-info]
  (or (lib.util.match/match-one
        notification-info
        {:payload    {:event_name ?event_name}
         :creator    {:first_name  ?creator_first_name
                      :last_name   ?creator_last_name
                      :email       ?creator_email
                      :common_name ?creator_common_name}
         :event_info {:actor       {:first_name  ?first_name
                                    :last_name   ?last_name
                                    :email       ?email
                                    :common_name ?common_name}
                      :args        {:table_id ?table_id
                                    :table    {:name ?table_name}}
                      :row-changes ?row-changes}}
        {:payload_type :notification/system-event
         :context      {:event_name ?event_name}
         :editor       {:first_name  ?first_name
                        :last_name   ?last_name
                        :email       ?email
                        :common_name ?common_name}
         :creator      {:first_name  ?creator_first_name
                        :last_name   ?creator_last_name
                        :email       ?creator_email
                        :common_name ?creator_common_name}
         :table        {:id   ?table_id
                        :name ?table_name
                        :url  (str (public-settings/site-url) "/table/" ?table_id)}
         :records      (for [{:keys [before after]} ?row-changes
                             :let [changes-key (keys (second (diff before after)))]]
                         {:row     (if (= ?event_name :event/rows.deleted) before after)
                          :changes (into {} (for [k changes-key]
                                              [k {:before (get before k)
                                                  :after  (get after k)}]))})
         :settings     (notification.payload/default-settings)})
      (throw (ex-info "Unable to destructure notification-info, check that expected structure matches malli schema."
                      {:notification-info notification-info}))))

;; TODO better to just handle all three cases by the same event
(doseq [event-name [:event/rows.created
                    :event/rows.updated
                    :event/rows.deleted]]
  (mu/defmethod transform-event-info event-name :- ::rows.bulk
    [notification-info]
    (bulk-row-transformation notification-info)))

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
