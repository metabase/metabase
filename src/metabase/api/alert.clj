(ns ^:deprecated metabase.api.alert
  "/api/alert endpoints.

  Deprecated: will soon be migrated to notification APIs."
  (:require
   [clojure.set :refer [difference]]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.channel.email :as email]
   [metabase.channel.email.messages :as messages]
   [metabase.config :as config]
   [metabase.events :as events]
   [metabase.models.interface :as mi]
   [metabase.models.pulse :as models.pulse]
   [metabase.plugins.classloader :as classloader]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(when config/ee-available?
  (classloader/require 'metabase-enterprise.advanced-permissions.common))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/"
  "Fetch alerts which the current user has created or will receive, or all alerts if the user is an admin.
  The optional `user_id` will return alerts created by the corresponding user, but is ignored for non-admin users."
  [archived user_id]
  {archived [:maybe ms/BooleanValue]
   user_id  [:maybe ms/PositiveInt]}
  (let [user-id (if api/*is-superuser?*
                  user_id
                  api/*current-user-id*)]
    (as-> (models.pulse/retrieve-alerts {:archived? archived
                                         :user-id   user-id}) <>
      (filter mi/can-read? <>)
      (t2/hydrate <> :can_write))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/:id"
  "Fetch an alert by ID"
  [id]
  {id ms/PositiveInt}
  (-> (api/read-check (models.pulse/retrieve-alert id))
      (t2/hydrate :can_write)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/question/:id"
  "Fetch all alerts for the given question (`Card`) id"
  [id archived]
  {id       [:maybe ms/PositiveInt]
   archived [:maybe ms/BooleanValue]}
  (-> (if api/*is-superuser?*
        (models.pulse/retrieve-alerts-for-cards {:card-ids [id], :archived? archived})
        (models.pulse/retrieve-user-alerts-for-card {:card-id id, :user-id api/*current-user-id*, :archived?  archived}))
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

(defn- maybe-include-csv [card alert-condition]
  (if (= "rows" alert-condition)
    (assoc card :include_csv true)
    card))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint POST "/"
  "Create a new Alert."
  [:as {{:keys [alert_condition card channels alert_first_only alert_above_goal]
         :as new-alert-request-body} :body}]
  {alert_condition  models.pulse/AlertConditions
   alert_first_only :boolean
   alert_above_goal [:maybe :boolean]
   card             models.pulse/CardRef
   channels         [:+ :map]}
  (validation/check-has-application-permission :subscription false)
  ;; To create an Alert you need read perms for its Card
  (api/read-check :model/Card (u/the-id card))
  ;; ok, now create the Alert
  (let [alert-card (-> card (maybe-include-csv alert_condition) models.pulse/card->ref)
        new-alert  (api/check-500
                    (-> new-alert-request-body
                        only-alert-keys
                        (models.pulse/create-alert! api/*current-user-id* alert-card channels)))]
    (events/publish-event! :event/alert-create {:object new-alert :user-id api/*current-user-id*})
    ;; return our new Alert
    new-alert))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint PUT "/:id"
  "Update a `Alert` with ID."
  [id :as {{:keys [alert_condition alert_first_only alert_above_goal card channels archived]
            :as alert-updates} :body}]
  {id               ms/PositiveInt
   alert_condition  [:maybe models.pulse/AlertConditions]
   alert_first_only [:maybe :boolean]
   alert_above_goal [:maybe :boolean]
   card             [:maybe models.pulse/CardRef]
   channels         [:maybe [:+ [:map]]]
   archived         [:maybe :boolean]}
  (try
    (validation/check-has-application-permission :monitoring)
    (catch clojure.lang.ExceptionInfo _e
      (validation/check-has-application-permission :subscription false)))

  ;; fetch the existing Alert in the DB
  (let [alert-before-update                   (api/check-404 (models.pulse/retrieve-alert id))
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
    (api/read-check :model/Card (u/the-id (:card alert-before-update)))
    ;; if trying to change the card, check perms for that as well
    (when card
      (api/write-check :model/Card (u/the-id card)))

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
    (let [updated-alert (models.pulse/update-alert!
                         (merge
                          (assoc (only-alert-keys alert-updates)
                                 :id id)
                          (when card
                            {:card (models.pulse/card->ref card)})
                          (when (contains? alert-updates :channels)
                            {:channels channels})
                          ;; automatically archive alert if it now has no recipients
                          (when (and (contains? alert-updates :channels)
                                     (not (seq (:recipients (email-channel alert-updates))))
                                     (not (slack-channel alert-updates)))
                            {:archived true})))]
      ;; Only admins or users has subscription or monitoring perms
      ;; can update recipients or explicitly archive an alert
      ;; Finally, return the updated Alert
      updated-alert)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint DELETE "/:id/subscription"
  "For users to unsubscribe themselves from the given alert."
  [id]
  {id ms/PositiveInt}
  (validation/check-has-application-permission :subscription false)
  (let [alert (models.pulse/retrieve-alert id)]
    (api/read-check alert)
    (api/let-404 [alert-id (u/the-id alert)
                  pc-id    (t2/select-one-pk :model/PulseChannel :pulse_id alert-id :channel_type "email")
                  pcr-id   (t2/select-one-pk :model/PulseChannelRecipient :pulse_channel_id pc-id :user_id api/*current-user-id*)]
      (t2/delete! :model/PulseChannelRecipient :id pcr-id))
    ;; Send emails letting people know they have been unsubscribed
    (let [user @api/*current-user*]
      (when (email/email-configured?)
        (messages/send-you-unsubscribed-notification-card-email! alert user))
      (events/publish-event! :event/alert-unsubscribe {:object {:email (:email user)}
                                                       :user-id api/*current-user-id*}))
    ;; finally, return a 204 No Content
    api/generic-204-no-content))

(api/define-routes)
