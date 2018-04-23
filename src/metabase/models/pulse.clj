(ns metabase.models.pulse
  "Notifications are ways to deliver the results of Questions to users without going through the normal Metabase UI. At
  the time of this writing, there are two delivery mechanisms for Notifications -- email and Slack notifications;
  these destinations are known as 'Channels'. Notifications themselves are futher divied into two categories --
  'Pulses', which are sent at specified intervals, and 'Alerts', which are sent when certain conditions are met (such
  as a query returning results).

  Because 'Pulses' were originally the only type of Notification, this name is still used for the model itself, and in
  some of the functions below. To keep things clear try to make sure you use the term 'Notification' for things that
  work with either type.

  One more thing to keep in mind: this code is pretty old and doesn't follow the code patterns used in the other
  Metabase models. There is a plethora of CRUD functions for working with Pulses that IMO aren't really needed (e.g.
  functions for fetching a specific Pulse). At some point in the future, we can clean this namespace up and bring the
  code in line with the rest of the codebase, but for the time being, it probably makes sense to follow the existing
  patterns in this namespace rather than further confuse things."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [events :as events]
             [util :as u]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.models
             [card :refer [Card]]
             [permissions :as perms]
             [collection :as collection]
             [interface :as i]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :as pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

;;; ------------------------------------------------- Perms Checking -------------------------------------------------

(defn- channels-with-recipients
  "Get the 'channels' associated with this `notification`, including recipients of those 'channels'. If `:channels` is already
  hydrated, as it will be when using `retrieve-pulses`, this doesn't need to make any DB calls."
  [notifcation]
  (or (:channels notifcation)
      (-> (db/select PulseChannel, :pulse_id (u/get-id notifcation))
          (hydrate :recipients))))

(defn- emails
  "Get the set of emails this `notification` will be sent to."
  [notification]
  (set (for [channel   notification
             recipient (:recipients channel)]
         (:email recipient))))

(defn- notification-perms-based-on-cards
  "Calculate permissions required to `read-or-write` a `notification` based on its Cards alone. Unlike Dashboards, to
  view or edit a Notification you must have permissions to do the same for *all* the Cards in the Notification."
  ;; TODO - I don't think the Permissions for Notification make a ton of sense. Shouldn't you just need read
  ;; permissions for all the Cards in the Notification in order to edit it? Either way it doesn't matter a ton since
  ;; these artifact perms are being phased out.
  [notification read-or-write]
  (when-let [card-ids (seq (db/select-field :card_id PulseCard, :pulse_id (u/get-id notification)))]
    (reduce set/union (for [card (db/select [Card :public_uuid :dataset_query :read_permissions], :id [:in card-ids])]
                        (i/perms-objects-set card read-or-write)))))

(defn- perms-objects-set
  "Calculate the set of permissions required to `read-or-write` a `notification`."
  [{collection-id :collection_id, :as notification} read-or-write]
  (cond
    ;; first things first: if the current user is a *recipient* of this Pulse, they are allowed to read it
    (and (= read-or-write :read)
         (contains? (emails notification) (:email @*current-user*)))
    nil

    ;; if this Pulse is in a Collection you're allowed to read or write the Pulse based on your permissions for the
    ;; Collection
    collection-id
    (collection/perms-objects-set collection-id read-or-write)

    ;; otherwise we fall back to the traditional artifact-based Permissions
    :else
    (notification-perms-based-on-cards notification read-or-write)))


;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Pulse :pulse)

(defn- pre-delete [{:keys [id]}]
  (db/delete! PulseCard :pulse_id id)
  (db/delete! PulseChannel :pulse_id id))

(u/strict-extend (class Pulse)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:pulse])
          :properties     (constantly {:timestamped? true})
          :pre-delete     pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set  perms-objects-set
          ;; I'm not 100% sure this covers everything. If a user is subscribed to a pulse they're still allowed to
          ;; know it exists, right?
          :can-read?          (partial i/current-user-has-full-permissions? :read)
          :can-write?         (partial i/current-user-has-full-permissions? :write)}))


;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn ^:hydrate channels
  "Return the PulseChannels associated with this PULSE."
  [{:keys [id]}]
  (db/select PulseChannel, :pulse_id id))


(defn ^:hydrate cards
  "Return the `Cards` associated with this PULSE."
  [{:keys [id]}]
  (map #(models/do-post-select Card %)
       (db/query
        {:select    [:c.id :c.name :c.description :c.display :pc.include_csv :pc.include_xls]
         :from      [[Pulse :p]]
         :join      [[PulseCard :pc] [:= :p.id :pc.pulse_id]
                     [Card :c] [:= :c.id :pc.card_id]]
         :where     [:and
                     [:= :p.id id]
                     [:= :c.archived false]]
         :order-by [[:pc.position :asc]]})))


;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def AlertConditions
  "Schema for valid values of `:alert_condition` for Alerts."
  (s/enum "rows" "goal"))

(def CardRef
  "Schema for the map we use to internally represent the fact that a Card is in a Notification and the details about its
  presence there."
  (su/with-api-error-message {:id          su/IntGreaterThanZero
                              :include_csv s/Bool
                              :include_xls s/Bool}
    "value must be a map with the keys `id`, `include_csv`, and `include_xls`."))


;;; ---------------------------------------- Notification Fetching Helper Fns ----------------------------------------

(defn- hydrate-notification [notification]
  (-> notification
      (hydrate :creator :cards [:channels :recipients])
      (m/dissoc-in [:details :emails])))

(defn- notification->pulse
  "Take a generic `Notification`, and put it in the standard Pulse format the frontend expects. This really just
  consists of removing associated `Alert` columns."
  [notification]
  (dissoc notification :alert_condition :alert_above_goal :alert_first_only))

;; TODO - do we really need this function? Why can't we just use `db/select` and `hydrate` like we do for everything
;; else?
(defn retrieve-pulse
  "Fetch a single *Pulse*, and hydrate it with a set of 'standard' hydrations; remove Alert coulmns, since this is a
  *Pulse* and they will all be unset."
  [pulse-or-id]
  (-> (db/select-one Pulse :id (u/get-id pulse-or-id), :alert_condition nil)
      hydrate-notification
      notification->pulse))

(defn retrieve-notification
  "Fetch an Alert or Pulse, and do the 'standard' hydrations."
  [notification-or-id]
  (-> (Pulse (u/get-id notification-or-id))
      hydrate-notification))

(defn- notification->alert
  "Take a generic `Notification` and put it in the standard `Alert` format the frontend expects. This really just
  consists of collapsing `:cards` into a `:card` key with whatever the first Card is."
  [notification]
  (-> notification
      (assoc :card (first (:cards notification)))
      (dissoc :cards)))

(defn retrieve-alert
  "Fetch a single Alert by its `id` value, do the standard hydrations, and put it in the standard `Alert` format."
  [alert-or-id]
  (-> (db/select-one Pulse, :id (u/get-id alert-or-id), :alert_condition [:not= nil])
      hydrate-notification
      notification->alert))

(defn retrieve-alerts
  "Fetch all Alerts."
  []
  (for [alert (db/select Pulse, :alert_condition [:not= nil], {:order-by [[:%lower.name :asc]]})]
    (-> alert
        hydrate-notification
        notification->alert)))

(defn retrieve-pulses
  "Fetch all `Pulses`."
  []
  (for [pulse (db/select Pulse, :alert_condition nil, {:order-by [[:%lower.name :asc]]})]
    (-> pulse
        hydrate-notification
        notification->pulse)))

(defn- query-as [model query]
  (db/do-post-select model (db/query query)))

(defn retrieve-user-alerts-for-card
  "Find all alerts for `CARD-ID` that `USER-ID` is set to receive"
  [card-id user-id]
  (map (comp notification->alert hydrate-notification)
       (query-as Pulse
                 {:select [:p.*]
                  :from   [[Pulse :p]]
                  :join   [[PulseCard :pc] [:= :p.id :pc.pulse_id]
                           [PulseChannel :pchan] [:= :pchan.pulse_id :p.id]
                           [PulseChannelRecipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]
                  :where  [:and
                           [:not= :p.alert_condition nil]
                           [:= :pc.card_id card-id]
                           [:= :pcr.user_id user-id]]})))

(defn retrieve-alerts-for-cards
  "Find all alerts for `CARD-IDS`, used for admin users"
  [& card-ids]
  (when (seq card-ids)
    (map (comp notification->alert hydrate-notification)
         (query-as Pulse
                   {:select [:p.*]
                    :from   [[Pulse :p]]
                    :join   [[PulseCard :pc] [:= :p.id :pc.pulse_id]]
                    :where  [:and
                             [:not= :p.alert_condition nil]
                             [:in :pc.card_id card-ids]]}))))

(s/defn card->ref :- CardRef
  "Create a card reference from a card or id"
  [card :- su/Map]
  {:id          (u/get-id card)
   :include_csv (get card :include_csv false)
   :include_xls (get card :include_xls false)})


;;; ------------------------------------------ Other Persistence Functions -------------------------------------------

(s/defn update-notification-cards!
  "Update the PulseCards for a given `notification-or-id`.
   `card-refs` should be a definitive collection of *all* Cards for the Notification in the desired order. They should
  have keys like `id`, `include_csv`, and `include_xls`.

   *  If a Card ID in `card-refs` has no corresponding existing `PulseCard` object, one will be created.
   *  If an existing `PulseCard` has no corresponding ID in CARD-IDs, it will be deleted.
   *  All cards will be updated with a `position` according to their place in the collection of `card-ids`"
  [notification-or-id, card-refs :- (s/maybe [CardRef])]
  ;; first off, just delete any cards associated with this pulse (we add them again below)
  (db/delete! PulseCard :pulse_id (u/get-id notification-or-id))
  ;; now just insert all of the cards that were given to us
  (when (seq card-refs)
    (let [cards (map-indexed (fn [i {card-id :id :keys [include_csv include_xls]}]
                               {:pulse_id    (u/get-id notification-or-id)
                                :card_id     card-id
                                :position    i
                                :include_csv include_csv
                                :include_xls include_xls})
                             card-refs)]
      (db/insert-many! PulseCard cards))))


(defn- create-update-delete-channel!
  "Utility function which determines how to properly update a single pulse channel."
  [notification-or-id new-channel existing-channel]
  ;; NOTE that we force the :id of the channel being updated to the :id we *know* from our
  ;;      existing list of PulseChannels pulled from the db to ensure we affect the right record
  (let [channel (when new-channel (assoc new-channel
                                    :pulse_id       (u/get-id notification-or-id)
                                    :id             (:id existing-channel)
                                    :channel_type   (keyword (:channel_type new-channel))
                                    :schedule_type  (keyword (:schedule_type new-channel))
                                    :schedule_frame (keyword (:schedule_frame new-channel))))]
    (cond
      ;; 1. in channels, NOT in db-channels = CREATE
      (and channel (not existing-channel))  (pulse-channel/create-pulse-channel! channel)
      ;; 2. NOT in channels, in db-channels = DELETE
      (and (nil? channel) existing-channel) (db/delete! PulseChannel :id (:id existing-channel))
      ;; 3. in channels, in db-channels = UPDATE
      (and channel existing-channel)        (pulse-channel/update-pulse-channel! channel)
      ;; 4. NOT in channels, NOT in db-channels = NO-OP
      :else nil)))

(s/defn update-notification-channels!
  "Update the PulseChannels for a given `notification-or-id`.
   CHANNELS should be a definitive collection of *all* of the channels for the the pulse.

   * If a channel in the list has no existing `PulseChannel` object, one will be created.
   * If an existing `PulseChannel` has no corresponding entry in CHANNELS, it will be deleted.
   * All previously existing channels will be updated with their most recent information."
  [notification-or-id, channels :- [su/Map]]
  (let [new-channels   (group-by (comp keyword :channel_type) channels)
        old-channels   (group-by (comp keyword :channel_type) (db/select PulseChannel
                                                                :pulse_id (u/get-id notification-or-id)))
        handle-channel #(create-update-delete-channel! (u/get-id notification-or-id)
                                                       (first (get new-channels %))
                                                       (first (get old-channels %)))]
    (assert (zero? (count (get new-channels nil)))
      "Cannot have channels without a :channel_type attribute")
    ;; for each of our possible channel types call our handler function
    (doseq [[channel-type] pulse-channel/channel-types]
      (handle-channel channel-type))))

(s/defn ^:private create-notification-and-add-cards-and-channels!
  "Create a new pulse with the properties specified in `notification`; add the `card-refs` to the Notification and add
  the Notification to `channels`. Returns the `id` of the newly created Notification."
  [notification, card-refs :- (s/maybe [CardRef]), channels]
  (db/transaction
    (let [notification (db/insert! Pulse notification)]
      ;; add card-ids to the Pulse
      (update-notification-cards! notification card-refs)
      ;; add channels to the Pulse
      (update-notification-channels! notification channels)
      ;; now return the ID
      (u/get-id notification))))

(s/defn create-pulse!
  "Create a new Pulse by inserting it into the database along with all associated pieces of data such as:
  PulseCards, PulseChannels, and PulseChannelRecipients.

   Returns the newly created Pulse, or throws an Exception."
  {:style/indent 2}
  [cards    :- [{s/Keyword s/Any}]
   channels :- [{s/Keyword s/Any}]
   kvs      :- {:name                           su/NonBlankString
                :creator_id                     su/IntGreaterThanZero
                (s/optional-key :skip_if_empty) (s/maybe s/Bool)
                (s/optional-key :collection_id) (s/maybe su/IntGreaterThanZero)}]
  (let [pulse-id (create-notification-and-add-cards-and-channels! kvs cards channels)]
    ;; return the full Pulse (and record our create event)
    (events/publish-event! :pulse-create (retrieve-pulse pulse-id))))

(defn create-alert!
  "Creates a pulse with the correct fields specified for an alert"
  [alert creator-id card-id channels]
  (let [id (-> alert
               (assoc :skip_if_empty true :creator_id creator-id)
               (create-notification-and-add-cards-and-channels! [card-id] channels))]
    ;; return the full Pulse (and record our create event)
    (events/publish-event! :alert-create (retrieve-alert id))))

(s/defn ^:private notification-or-id->existing-card-refs :- [CardRef]
  [notification-or-id]
  (db/select [PulseCard [:card_id :id] :include_csv :include_xls]
    :pulse_id (u/get-id notification-or-id)
    {:order-by [[:position :asc]]}))

(s/defn ^:private card-refs-have-changed? :- s/Bool
  [notification-or-id, new-card-refs :- [CardRef]]
  (not= (notification-or-id->existing-card-refs notification-or-id)
        new-card-refs))

(s/defn ^:private update-notification-cards-if-changed! [notification-or-id new-card-refs]
  (when (card-refs-have-changed? notification-or-id new-card-refs)
    (update-notification-cards! notification-or-id new-card-refs)))

(s/defn update-notification!
  "Update the supplied keys in a `notification`."
  [notification :- {:id                                su/IntGreaterThanZero
                    (s/optional-key :name)             su/NonBlankString
                    (s/optional-key :alert_condition)  AlertConditions
                    (s/optional-key :alert_above_goal) s/Bool
                    (s/optional-key :alert_first_only) s/Bool
                    (s/optional-key :skip_if_empty)    s/Bool
                    (s/optional-key :collection_id)    su/IntGreaterThanZero
                    (s/optional-key :cards)            [CardRef]
                    (s/optional-key :channels)         [su/Map]}]
  (db/update! Pulse (u/get-id notification)
    (u/select-non-nil-keys notification
                           [:name :alert_condition :alert_above_goal :alert_first_only :skip_if_empty :collection_id]))
  ;; update Cards if the 'refs' have changed
  (update-notification-cards-if-changed! notification (map card->ref (:cards notification)))
  ;; update channels as needed
  (update-notification-channels! notification (:channels notification)))

(s/defn update-pulse!
  "Update an existing Pulse, including all associated data such as: PulseCards, PulseChannels, and
  PulseChannelRecipients.

  Returns the updated Pulse or throws an Exception."
  [pulse]
  (update-notification! pulse)
  ;; fetch the fully updated pulse and return it (and fire off an event)
  (->> (retrieve-pulse (u/get-id pulse))
       (events/publish-event! :pulse-update)))

(defn- alert->notification
  "Convert an 'Alert` back into the generic 'Notification' format."
  [{:keys [card cards], :as alert}]
  (-> alert
      (assoc :skip_if_empty true, :cards [(card->ref (or card (first cards)))])
      (dissoc :card)))

;; TODO - why do we make sure to strictly validate everything when we create a PULSE but not when we create an ALERT?
(defn update-alert!
  "Updates the given `ALERT` and returns it"
  [alert]
  (update-notification! (alert->notification alert))
  ;; fetch the fully updated pulse and return it (and fire off an event)
  (->> (retrieve-alert (u/get-id alert))
       (events/publish-event! :pulse-update)))

(defn unsubscribe-from-alert!
  "Unsubscribe a User with `user-id` from an Alert with `alert-id`."
  [alert-id user-id]
  (let [[result] (db/execute! {:delete-from PulseChannelRecipient
                               ;; The below select * clause is required for the query to work on MySQL (PG and H2 work
                               ;; without it). MySQL will fail if the delete has an implicit join. By wrapping the
                               ;; query in a select *, it forces that query to use a temp table rather than trying to
                               ;; make the join directly, which works in MySQL, PG and H2
                               :where [:= :id {:select [:*]
                                               :from [[{:select [:pcr.id]
                                                         :from [[PulseChannelRecipient :pcr]]
                                                         :join [[PulseChannel :pchan] [:= :pchan.id :pcr.pulse_channel_id]
                                                                [Pulse :p] [:= :p.id :pchan.pulse_id]]
                                                         :where [:and
                                                                 [:= :p.id alert-id]
                                                                 [:not= :p.alert_condition nil]
                                                                 [:= :pcr.user_id user-id]]} "r"]]}]})]
    (when (zero? result)
      (log/warnf "Failed to remove user-id '%s' from alert-id '%s'" user-id alert-id))

    result))
