(ns metabase.api.alert
  "/api/alert endpoints"
  (:require
   [clojure.data :as data]
   [clojure.set :refer [difference]]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.config :as config]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.models.pulse :as pulse]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(when config/ee-available?
  (classloader/require 'metabase-enterprise.advanced-permissions.common))

(api/defendpoint GET "/"
  "Fetch alerts which the current user has created or will receive, or all alerts if the user is an admin.
  The optional `user_id` will return alerts created by the corresponding user, but is ignored for non-admin users."
  [archived user_id]
  {archived [:maybe ms/BooleanValue]
   user_id  [:maybe ms/PositiveInt]}
  (let [user-id (if api/*is-superuser?*
                  user_id
                  api/*current-user-id*)]
    (as-> (pulse/retrieve-alerts {:archived? archived
                                  :user-id   user-id}) <>
      (filter mi/can-read? <>)
      (t2/hydrate <> :can_write))))

(api/defendpoint GET "/:id"
  "Fetch an alert by ID"
  [id]
  {id ms/PositiveInt}
  (-> (api/read-check (pulse/retrieve-alert id))
      (t2/hydrate :can_write)))

(api/defendpoint GET "/question/:id"
  "Fetch all alerts for the given question (`Card`) id"
  [id archived]
  {id       [:maybe ms/PositiveInt]
   archived [:maybe ms/BooleanValue]}
  (-> (if api/*is-superuser?*
        (pulse/retrieve-alerts-for-cards {:card-ids [id], :archived? archived})
        (pulse/retrieve-user-alerts-for-card {:card-id id, :user-id api/*current-user-id*, :archived?  archived}))
      (t2/hydrate :can_write)))

(defn- only-alert-keys [request]
  (u/select-keys-when request
    :present [:alert_condition :alert_first_only :alert_above_goal :archived]))

(defn email-channel
  "Get email channel from an alert."
  [alert]
  (m/find-first #(= :email (keyword (:channel_type %))) (:channels alert)))

(defn- slack-channel
  "Get slack channel from an alert."
  [alert]
  (m/find-first #(= :slack (keyword (:channel_type %))) (:channels alert)))

(defn- key-by [key-fn coll]
  (zipmap (map key-fn coll) coll))

(defn- notify-email-disabled! [alert recipients]
  (doseq [user recipients]
    (messages/send-admin-unsubscribed-alert-email! alert user @api/*current-user*)))

(defn- notify-email-enabled! [alert recipients]
  (doseq [user recipients]
    (messages/send-you-were-added-alert-email! alert user @api/*current-user*)))

(defn- notify-email-recipient-diffs! [old-alert old-recipients new-alert new-recipients]
  (let [old-ids->users (key-by :id old-recipients)
        new-ids->users (key-by :id new-recipients)
        [removed-ids added-ids _] (data/diff (set (keys old-ids->users))
                                             (set (keys new-ids->users)))]
    (doseq [old-id removed-ids
            :let [removed-user (get old-ids->users old-id)]]
      (messages/send-admin-unsubscribed-alert-email! old-alert removed-user @api/*current-user*))

    (doseq [new-id added-ids
            :let [added-user (get new-ids->users new-id)]]
      (messages/send-you-were-added-alert-email! new-alert added-user @api/*current-user*))))

(defn- notify-recipient-changes!
  "This function compares `OLD-ALERT` and `UPDATED-ALERT` to determine if there have been any channel or recipient
  related changes. Recipients that have been added or removed will be notified."
  [old-alert updated-alert]
  (let [{old-recipients :recipients, old-enabled :enabled} (email-channel old-alert)
        {new-recipients :recipients, new-enabled :enabled} (email-channel updated-alert)]
    (cond
      ;; Did email notifications just get disabled?
      (and old-enabled (not new-enabled))
      (notify-email-disabled! old-alert old-recipients)

      ;; Did a disabled email notifications just get re-enabled?
      (and (not old-enabled) new-enabled)
      (notify-email-enabled! updated-alert new-recipients)

      ;; No need to notify recipients if emails are disabled
      new-enabled
      (notify-email-recipient-diffs! old-alert old-recipients updated-alert new-recipients))))

(defn- collect-alert-recipients [alert]
  (set (:recipients (email-channel alert))))

(defn- non-creator-recipients [{{creator-id :id} :creator :as alert}]
 (remove #(= creator-id (:id %)) (collect-alert-recipients alert)))

(defn- notify-new-alert-created! [alert]
  (when (email/email-configured?)

    (messages/send-new-alert-email! alert)

    (doseq [recipient (non-creator-recipients alert)]
      (messages/send-you-were-added-alert-email! alert recipient @api/*current-user*))))

(defn- maybe-include-csv [card alert-condition]
  (if (= "rows" alert-condition)
    (assoc card :include_csv true)
    card))

(api/defendpoint POST "/"
  "Create a new Alert."
  [:as {{:keys [alert_condition card channels alert_first_only alert_above_goal]
         :as new-alert-request-body} :body}]
  {alert_condition  pulse/AlertConditions
   alert_first_only :boolean
   alert_above_goal [:maybe :boolean]
   card             pulse/CardRef
   channels         [:+ :map]}
  (validation/check-has-application-permission :subscription false)
  ;; To create an Alert you need read perms for its Card
  (api/read-check Card (u/the-id card))
  ;; ok, now create the Alert
  (let [alert-card (-> card (maybe-include-csv alert_condition) pulse/card->ref)
        new-alert  (api/check-500
                    (-> new-alert-request-body
                        only-alert-keys
                        (pulse/create-alert! api/*current-user-id* alert-card channels)))]
   (events/publish-event! :event/alert-create {:object new-alert :user-id api/*current-user-id*})
   (notify-new-alert-created! new-alert)
    ;; return our new Alert
   new-alert))

(defn- notify-on-archive-if-needed!
  "When an alert is archived, we notify all recipients that they are no longer receiving that alert."
  [alert]
  (when (email/email-configured?)
    (doseq [recipient (collect-alert-recipients alert)]
      (messages/send-admin-unsubscribed-alert-email! alert recipient @api/*current-user*))))

(api/defendpoint PUT "/:id"
  "Update a `Alert` with ID."
  [id :as {{:keys [alert_condition alert_first_only alert_above_goal card channels archived]
            :as alert-updates} :body}]
  {id               ms/PositiveInt
   alert_condition  [:maybe pulse/AlertConditions]
   alert_first_only [:maybe :boolean]
   alert_above_goal [:maybe :boolean]
   card             [:maybe pulse/CardRef]
   channels         [:maybe [:+ [:map]]]
   archived         [:maybe :boolean]}
  (try
   (validation/check-has-application-permission :monitoring)
   (catch clojure.lang.ExceptionInfo _e
     (validation/check-has-application-permission :subscription false)))

  ;; fetch the existing Alert in the DB
  (let [alert-before-update                   (api/check-404 (pulse/retrieve-alert id))
        current-user-has-application-permissions? (and (premium-features/enable-advanced-permissions?)
                                                   (resolve 'metabase-enterprise.advanced-permissions.common/current-user-has-application-permissions?))
        has-subscription-perms?               (and current-user-has-application-permissions?
                                                   (current-user-has-application-permissions? :subscription))
        has-monitoring-permissions?           (and current-user-has-application-permissions?
                                                   (current-user-has-application-permissions? :monitoring))]
    (assert (:card alert-before-update)
            (tru "Invalid Alert: Alert does not have a Card associated with it"))
    ;; check permissions as needed.
    ;; Check permissions to update existing Card
    (api/read-check Card (u/the-id (:card alert-before-update)))
    ;; if trying to change the card, check perms for that as well
    (when card
      (api/write-check Card (u/the-id card)))

    (when-not (or api/*is-superuser?*
                  has-monitoring-permissions?
                  has-subscription-perms?)
      (api/check (= (-> alert-before-update :creator :id) api/*current-user-id*)
                 [403 (tru "Non-admin users without monitoring or subscription permissions are only allowed to update alerts that they created")])
      (api/check (or (not (contains? alert-updates :channels))
                     (and (= 1 (count channels))
                          ;; Non-admin alerts can only include the creator as a recipient
                          (= [api/*current-user-id*]
                             (map :id (:recipients (email-channel alert-updates))))))
                 [403 (tru "Non-admin users without monitoring or subscription permissions are not allowed to modify the channels for an alert")]))

    ;; only admin or users with subscription permissions can add recipients
    (let [to-add-recipients (difference (set (map :id (:recipients (email-channel alert-updates))))
                                        (set (map :id (:recipients (email-channel alert-before-update)))))]
      (api/check (or api/*is-superuser?*
                     has-subscription-perms?
                     (empty? to-add-recipients))
                 [403 (tru "Non-admin users without subscription permissions are not allowed to add recipients")]))

    ;; now update the Alert
    (let [updated-alert (pulse/update-alert!
                         (merge
                          (assoc (only-alert-keys alert-updates)
                                 :id id)
                          (when card
                            {:card (pulse/card->ref card)})
                          (when (contains? alert-updates :channels)
                            {:channels channels})
                          ;; automatically archive alert if it now has no recipients
                          (when (and (contains? alert-updates :channels)
                                     (not (seq (:recipients (email-channel alert-updates))))
                                     (not (slack-channel alert-updates)))
                            {:archived true})))]
      ;; Only admins or users has subscription or monitoring perms
      ;; can update recipients or explicitly archive an alert
      (when (and (or api/*is-superuser?*
                     has-subscription-perms?
                     has-monitoring-permissions?)
                 (email/email-configured?))
        (if archived
          (notify-on-archive-if-needed! updated-alert)
          (notify-recipient-changes! alert-before-update updated-alert)))
      ;; Finally, return the updated Alert
      updated-alert)))

(api/defendpoint DELETE "/:id/subscription"
  "For users to unsubscribe themselves from the given alert."
  [id]
  {id ms/PositiveInt}
  (validation/check-has-application-permission :subscription false)
  (let [alert (pulse/retrieve-alert id)]
    (api/read-check alert)
    (api/let-404 [alert-id (u/the-id alert)
                  pc-id    (t2/select-one-pk PulseChannel :pulse_id alert-id :channel_type "email")
                  pcr-id   (t2/select-one-pk PulseChannelRecipient :pulse_channel_id pc-id :user_id api/*current-user-id*)]
                 (t2/delete! PulseChannelRecipient :id pcr-id))
    ;; Send emails letting people know they have been unsubscribed
    (let [user @api/*current-user*]
      (when (email/email-configured?)
        (messages/send-you-unsubscribed-alert-email! alert user))
      (events/publish-event! :event/alert-unsubscribe {:object {:email (:email user)}
                                                       :user-id api/*current-user-id*}))
    ;; finally, return a 204 No Content
    api/generic-204-no-content))

(api/define-routes)
