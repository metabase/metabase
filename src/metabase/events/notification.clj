(ns metabase.events.notification
  (:require
   [java-time.api :as t]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.events.schema :as events.schema]
   [metabase.models.notification :as models.notification]
   [metabase.models.user :as user]
   [metabase.notification.core :as notification]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.render.style :as style]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :metabase/event ::notification)

(def ^:private supported-topics #{:event/user-invited
                                  :event/alert-create
                                  :event/slack-token-invalid})

(def ^:private hydrate-transformer
  (mtx/transformer
   {:decoders {:map {:compile (fn [schema _]
                                (let [hydrates (into {}
                                                     (keep (fn [[k {:keys [hydrate] :as _p} _v]]
                                                             (when hydrate
                                                               [k hydrate])))
                                                     (mc/children schema))]
                                  (when (seq hydrates)
                                    (fn [x]
                                      (if (map? x)
                                        (reduce-kv
                                         (fn [_acc k {:keys [key model] :as _hydrate-prop}]
                                           (assoc x key (t2/select-one model (get x k))))
                                         x
                                         hydrates)
                                        x)))))}}}))

(defn- hydrate!
  "Given a schema and value, hydrate the keys that are marked as to-hydrate.
  Hydrated keys have the :hydrate properties that can be added by [[events.schema/with-hydration]].

    (hydrate! [:map
                [:user_id {:hydrate {:key :user
                                     :model [:model/User :email]}} :int]]
              {:user_id 1})
    ;; => {:user_id 1
           :user    {:email \"ngoc@metabase.com\"}}"
  [schema value]
  (mc/decode schema value hydrate-transformer))

(defn- notifications-for-topic
  "Returns notifications for a given topic if it is supported and has notifications."
  [topic]
  (when (supported-topics topic)
    (models.notification/notifications-for-event topic)))

(defn- join-url
  [new-user]
  (let [reset-token               (user/set-password-reset-token! (:id new-user))
        should-link-to-login-page (and (public-settings/sso-enabled?)
                                       (not (public-settings/enable-password-login)))]
    (if should-link-to-login-page
      (str (public-settings/site-url) "/auth/login")
      ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
      (str (user/form-password-reset-url reset-token) "#new"))))

(defn- extra-context
  "Returns a map of extra context for a given topic and event-info.
  Extra are set of contexts that are specific to a certain emails.
  Currently we need it to support usecases that our template engines doesn't support such as i18n,
  but ideally this should be part of the template."
  [topic event-info]
  (case topic
    :event/user-invited
    {:user-invited-today         (t/format "MMM'&nbsp;'dd,'&nbsp;'yyyy" (t/zoned-date-time))
     :user-invited-email-subject (trs "You''re invited to join {0}''s {1}" (public-settings/site-name) (messages/app-name-trs))
     :user-invited-join-url      (join-url (:object event-info))}

    :event/alert-create
    {:alert-create-condition-description (->> event-info :object
                                              messages/pulse->alert-condition-kwd
                                              (get messages/alert-condition-text))}
    {}))

(defn- enriched-event-info
  [topic event-info]
  ;; DO NOT delete or rename these fields, they are used in the notification templates
  {:context     {:application-name     (public-settings/application-name)
                 :application-logo-url (messages/logo-url)
                 :site-name            (public-settings/site-name)
                 :site-url             (public-settings/site-url)
                 :admin-email          (public-settings/admin-email)
                 :style                {:button (messages/button-style (style/primary-color))}
                 :extra                (extra-context topic event-info)}
   :event-info  (cond->> event-info
                  (some? (events.schema/topic->schema topic))
                  (hydrate! (events.schema/topic->schema topic)))
   :event-topic topic})

(def ^:dynamic *skip-sending-notification?*
  "Used as a hack for when we need to skip sending notifications for certain events.

  It's an escape hatch until we implement conditional notifications."
  false)

(defn- maybe-send-notification-for-topic!
  [topic event-info]
  (when-not *skip-sending-notification?*
    (when-let [notifications (notifications-for-topic topic)]
      (let [event-info (enriched-event-info topic event-info)]
        (log/infof "Found %d %s for event: %s"
                   (count notifications) (u/format-plural (count notifications) "notification" "notifications") topic)
        (doseq [notification notifications]
          (notification/send-notification! (assoc notification :payload event-info)))))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))