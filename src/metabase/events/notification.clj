(ns metabase.events.notification
  (:require
   [java-time.api :as t]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.events.schema :as events.schema]
   [metabase.models.notification :as models.notification]
   [metabase.models.user :as user]
   [metabase.notification.core :as notification]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :metabase/event ::notification)

(def ^:private supported-topics #{:event/user-invited})

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

(defn- app-name-trs
  "Return the user configured application name, or Metabase translated
  via trs if a name isn't configured."
  []
  (or (public-settings/application-name)
      (trs "Metabase")))

(defn- site-name
  []
  (or (public-settings/site-name) (trs "Unknown")))

(defn- enriched-event-info
  [topic event-info]
  ;; DO NOT delete or rename these fields, they are used in the notification templates
  {:context     {:application-name (public-settings/application-name)
                 :site-name        (site-name)
                 :current-user     @api/*current-user*
                 ;; extra are set of contexts that are specific to a cerntain emails
                 ;; currently we need it to support i18n purposes, but ideally it should not exists
                 :extra            {:user-invited-today         (t/format "MMM'&nbsp;'dd,'&nbsp;'yyyy" (t/zoned-date-time))
                                    :user-invited-email-subject (trs "You''re invited to join {0}''s {1}" (site-name) (app-name-trs))
                                    ;; TODO test that this link works for real
                                    :user-invited-join-url      (some-> event-info (get-in [:object :id]) user/set-password-reset-token! user/form-password-reset-url (str "#new"))}}
   :event-info  (cond->> event-info
                  (some? (events.schema/topic->schema topic))
                  (hydrate! (events.schema/topic->schema topic)))
   :event-topic topic})

(defn- maybe-send-notification-for-topic!
  [topic event-info]
  (when-let [notifications (notifications-for-topic topic)]
    (let [event-info (enriched-event-info topic event-info)]
      (log/infof "Found %d %s for event: %s"
                 (count notifications) (u/format-plural (count notifications) "notification" "notifications") topic)
      (doseq [notification notifications]
        (notification/send-notification! (assoc notification :payload event-info))))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))
