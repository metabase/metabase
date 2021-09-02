(ns metabase.api.alert
  "/api/alert endpoints"
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.email :as email]
            [metabase.email.messages :as messages]
            [metabase.events :as events]
            [metabase.models.card :refer [Card]]
            [metabase.models.interface :as mi]
            [metabase.models.pulse :as pulse :refer [Pulse]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(api/defendpoint GET "/"
  "Fetch all alerts"
  [archived user_id]
  {archived (s/maybe su/BooleanString)
   user_id  (s/maybe su/IntGreaterThanZero)}
  (as-> (pulse/retrieve-alerts {:archived? (Boolean/parseBoolean archived)
                                :user-id   user_id}) <>
    (filter mi/can-read? <>)
    (hydrate <> :can_write)))

(api/defendpoint GET "/:id"
  "Fetch an alert by ID"
  [id]
  (-> (api/read-check (pulse/retrieve-alert id))
      (hydrate :can_write)))

(api/defendpoint GET "/question/:id"
  "Fetch all questions for the given question (`Card`) id"
  [id archived]
  {id       (s/maybe su/IntGreaterThanZero)
   archived (s/maybe su/BooleanString)}
  (-> (if api/*is-superuser?*
        (pulse/retrieve-alerts-for-cards {:card-ids [id], :archived? (Boolean/parseBoolean archived)})
        (pulse/retrieve-user-alerts-for-card {:card-id id, :user-id api/*current-user-id*, :archived? (Boolean/parseBoolean archived)}))
      (hydrate :can_write)))

(defn- only-alert-keys [request]
  (u/select-keys-when request
    :present [:alert_condition :alert_first_only :alert_above_goal :archived]))

(defn- email-channel [alert]
  (m/find-first #(= :email (:channel_type %)) (:channels alert)))

(defn- slack-channel [alert]
  (m/find-first #(= :slack (:channel_type %)) (:channels alert)))

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
   alert_first_only s/Bool
   alert_above_goal (s/maybe s/Bool)
   card             pulse/CardRef
   channels         (su/non-empty [su/Map])}
  ;; do various perms checks as needed. Perms for an Alert == perms for its Card. So to create an Alert you need write
  ;; perms for its Card
  (api/write-check Card (u/the-id card))
  ;; ok, now create the Alert
  (let [alert-card (-> card (maybe-include-csv alert_condition) pulse/card->ref)
        new-alert  (api/check-500
                    (-> new-alert-request-body
                        only-alert-keys
                        (pulse/create-alert! api/*current-user-id* alert-card channels)))]
    (notify-new-alert-created! new-alert)
    ;; return our new Alert
    new-alert))

(defn- notify-on-archive-if-needed!
  "When an alert is archived, we notify any recipients that they are no longer going to be receiving that alert"
  [alert]
  (when (email/email-configured?)
    (doseq [recipient (collect-alert-recipients alert)]
      (messages/send-admin-unsubscribed-alert-email! alert recipient @api/*current-user*))))

(api/defendpoint PUT "/:id"
  "Update a `Alert` with ID."
  [id :as {{:keys [alert_condition card channels alert_first_only alert_above_goal card channels archived]
            :as alert-updates} :body}]
  {alert_condition     (s/maybe pulse/AlertConditions)
   alert_first_only    (s/maybe s/Bool)
   alert_above_goal    (s/maybe s/Bool)
   card                (s/maybe pulse/CardRef)
   channels            (s/maybe (su/non-empty [su/Map]))
   archived            (s/maybe s/Bool)}
  ;; fetch the existing Alert in the DB
  (let [alert-before-update (api/check-404 (pulse/retrieve-alert id))]
    (assert (:card alert-before-update)
            (tru "Invalid Alert: Alert does not have a Card associated with it"))
    ;; check permissions as needed.
    ;; Check permissions to update existing Card
    (api/write-check Card (u/the-id (:card alert-before-update)))
    ;; if trying to change the card, check perms for that as well
    (when card
      (api/write-check Card (u/the-id card)))
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

      ;; Only admins can update recipients or explicitly archive an alert
      (when (and api/*is-superuser?* (email/email-configured?))
        (if archived
          (notify-on-archive-if-needed! updated-alert)
          (notify-recipient-changes! alert-before-update updated-alert)))
      ;; Finally, return the updated Alert
      updated-alert)))

(defn- should-unsubscribe-archive?
  "An alert should be archived after a user unsubscribes if
     - they are the only recipient
     - there is no slack channel"
  [alert unsubscribing-user-id]
  (let [{:keys [recipients]} (email-channel alert)]
    (and (= 1 (count recipients))
         (= unsubscribing-user-id (:id (first recipients)))
         (nil? (slack-channel alert)))))

(api/defendpoint DELETE "/:id/unsubscribe"
  "Unsubscribes a user from the given alert"
  [id]
  ;; Admins are not allowed to unsubscribe from alerts, they should edit the alert
  (api/check (not api/*is-superuser?*)
    [400 "Admin users are not allowed to unsubscribe from alerts"])
  (let [alert (pulse/retrieve-alert id)]
    (api/read-check alert)

    (if (should-unsubscribe-archive? alert api/*current-user-id*)
      (db/transaction
        (pulse/unsubscribe-from-alert! id api/*current-user-id*)
        (pulse/update-alert! {:id id, :archived true})
        (notify-on-archive-if-needed! alert))
      (pulse/unsubscribe-from-alert! id api/*current-user-id*))
    ;; Send emails letting people know they have been unsubscribe
    (when (email/email-configured?)
      (messages/send-you-unsubscribed-alert-email! alert @api/*current-user*))
    ;; finally, return a 204 No Content
    api/generic-204-no-content))

(api/define-routes)
