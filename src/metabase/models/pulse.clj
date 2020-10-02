(ns metabase.models.pulse
  "Notifcations are ways to deliver the results of Questions to users without going through the normal Metabase UI. At
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
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [events :as events]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection]
             [interface :as i]
             [permissions :as perms]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :as pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.util
             [i18n :refer [deferred-tru tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Pulse :pulse)

(defn- pre-insert [notification]
  (u/prog1 notification
    (collection/check-collection-namespace Pulse (:collection_id notification))))

(defn- pre-update [updates]
  (u/prog1 updates
    (collection/check-collection-namespace Pulse (:collection_id updates))))

(defn- alert->card
  "Return the Card associated with an Alert, fetching it if needed, for permissions-checking purposes."
  [alert]
  (or
   ;; if `card` is already present as a top-level key we can just use that directly
   (:card alert)
   ;; otherwise fetch the associated `:cards` (if not already fetched) and then pull the first one out, since Alerts
   ;; can only have one Card
   (-> (hydrate alert :cards) :cards first)
   ;; if there's still not a Card, throw an Exception!
   (throw (Exception. (tru "Invalid Alert: Alert does not have a Card assoicated with it")))))

(defn- perms-objects-set
  "Permissions to read or write a *Pulse* are the same as those of its parent Collection.

  Permissions to read or write an *Alert* are the same as those of its 'parent' *Card*. For all intents and purposes,
  an Alert cannot be put into a Collection."
  [notification read-or-write]
  (let [is-alert? (boolean (:alert_condition notification))]
    (if is-alert?
      (i/perms-objects-set (alert->card notification) read-or-write)
      (perms/perms-objects-set-for-parent-collection notification read-or-write))))

(u/strict-extend (class Pulse)
  models/IModel
  (merge
   models/IModelDefaults
   {:hydration-keys (constantly [:pulse])
    :properties     (constantly {:timestamped? true})
    :pre-insert     pre-insert
    :pre-update     pre-update})
  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:can-read?         (partial i/current-user-has-full-permissions? :read)
    :can-write?        (partial i/current-user-has-full-permissions? :write)
    :perms-objects-set perms-objects-set}))


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
    (deferred-tru "value must be a map with the keys `{0}`, `{1}`, and `{2}`." "id" "include_csv" "include_xls")))

(def HybridPulseCard
  "This schema represents the cards that are included in a pulse. This is the data from the `PulseCard` and some
  additional information used by the UI to display it from `Card`. This is a superset of `CardRef` and is coercible to
  a `CardRef`"
  (su/with-api-error-message
      (merge (:schema CardRef)
             {:name          (s/maybe s/Str)
              :description   (s/maybe s/Str)
              :display       (s/maybe su/KeywordOrString)
              :collection_id (s/maybe su/IntGreaterThanZero)})
    (deferred-tru "value must be a map with the following keys `({0})`"
         (str/join ", " ["collection_id" "description" "display" "id" "include_csv" "include_xls" "name"]))))

(def CoercibleToCardRef
  "Schema for functions accepting either a `HybridPulseCard` or `CardRef`."
  (s/conditional
   (fn check-hybrid-pulse-card [maybe-map]
     (and (map? maybe-map)
          (some #(contains? maybe-map %) [:name :description :display :collection_id])))
   HybridPulseCard
   :else
   CardRef))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn ^:hydrate channels
  "Return the PulseChannels associated with this `notification`."
  [notification-or-id]
  (db/select PulseChannel, :pulse_id (u/get-id notification-or-id)))

(s/defn ^:hydrate cards :- [HybridPulseCard]
  "Return the Cards associated with this `notification`."
  [notification-or-id]
  (map (partial models/do-post-select Card)
       (db/query
        {:select    [:c.id :c.name :c.description :c.collection_id :c.display :pc.include_csv :pc.include_xls]
         :from      [[Pulse :p]]
         :join      [[PulseCard :pc] [:= :p.id :pc.pulse_id]
                     [Card :c] [:= :c.id :pc.card_id]]
         :where     [:and
                     [:= :p.id (u/get-id notification-or-id)]
                     [:= :c.archived false]]
         :order-by [[:pc.position :asc]]})))

;;; ---------------------------------------- Notification Fetching Helper Fns ----------------------------------------

(s/defn hydrate-notification :- PulseInstance
  "Hydrate a Pulse or Alert with the Fields needed for sending it."
  [notification :- PulseInstance]
  (-> notification
      (hydrate :creator :cards [:channels :recipients])
      (m/dissoc-in [:details :emails])))

(s/defn ^:private notification->pulse :- PulseInstance
  "Take a generic `Notification`, and put it in the standard Pulse format the frontend expects. This really just
  consists of removing associated `Alert` columns."
  [notification :- PulseInstance]
  (dissoc notification :alert_condition :alert_above_goal :alert_first_only))

;; TODO - do we really need this function? Why can't we just use `db/select` and `hydrate` like we do for everything
;; else?
(s/defn retrieve-pulse :- (s/maybe PulseInstance)
  "Fetch a single *Pulse*, and hydrate it with a set of 'standard' hydrations; remove Alert columns, since this is a
  *Pulse* and they will all be unset."
  [pulse-or-id]
  (some-> (db/select-one Pulse :id (u/get-id pulse-or-id), :alert_condition nil)
          hydrate-notification
          notification->pulse))

(s/defn retrieve-notification :- (s/maybe PulseInstance)
  "Fetch an Alert or Pulse, and do the 'standard' hydrations, adding `:channels` with `:recipients`, `:creator`, and
  `:cards`."
  [notification-or-id & additional-condtions]
  (some-> (apply Pulse :id (u/get-id notification-or-id), additional-condtions)
          hydrate-notification))

(s/defn ^:private notification->alert :- PulseInstance
  "Take a generic `Notification` and put it in the standard `Alert` format the frontend expects. This really just
  consists of collapsing `:cards` into a `:card` key with whatever the first Card is."
  [notification :- PulseInstance]
  (-> notification
      (assoc :card (first (:cards notification)))
      (dissoc :cards)))

(s/defn retrieve-alert :- (s/maybe PulseInstance)
  "Fetch a single Alert by its `id` value, do the standard hydrations, and put it in the standard `Alert` format."
  [alert-or-id]
  (some-> (db/select-one Pulse, :id (u/get-id alert-or-id), :alert_condition [:not= nil])
          hydrate-notification
          notification->alert))

(s/defn retrieve-alerts :- [PulseInstance]
  "Fetch all Alerts."
  ([]
   (retrieve-alerts nil))
  ([{:keys [archived?]
     :or   {archived? false}}]
   (for [alert (db/select Pulse, :alert_condition [:not= nil], :archived archived?, {:order-by [[:%lower.name :asc]]})]
     (-> alert
         hydrate-notification
         notification->alert))))

(s/defn retrieve-pulses :- [PulseInstance]
  "Fetch all `Pulses`."
  ([]
   (retrieve-pulses nil))
  ([{:keys [archived?]
     :or   {archived? false}}]
   (for [pulse (db/select Pulse, :alert_condition nil, :archived archived?, {:order-by [[:%lower.name :asc]]})]
     (-> pulse
         hydrate-notification
         notification->pulse))))

(defn- query-as [model query]
  (db/do-post-select model (db/query query)))

(defn retrieve-user-alerts-for-card
  "Find all alerts for `card-id` that `user-id` is set to receive"
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
   kvs      :- {:name                                 su/NonBlankString
                :creator_id                           su/IntGreaterThanZero
                (s/optional-key :skip_if_empty)       (s/maybe s/Bool)
                (s/optional-key :collection_id)       (s/maybe su/IntGreaterThanZero)
                (s/optional-key :collection_position) (s/maybe su/IntGreaterThanZero)}]
  (let [pulse-id (create-notification-and-add-cards-and-channels! kvs cards channels)]
    ;; return the full Pulse (and record our create event)
    (events/publish-event! :pulse-create (retrieve-pulse pulse-id))))

(defn create-alert!
  "Creates a pulse with the correct fields specified for an alert"
  [alert creator-id card-id channels]
  (let [id (-> alert
               (assoc :skip_if_empty true, :creator_id creator-id)
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
  [notification :- {:id                                   su/IntGreaterThanZero
                    (s/optional-key :name)                su/NonBlankString
                    (s/optional-key :alert_condition)     AlertConditions
                    (s/optional-key :alert_above_goal)    s/Bool
                    (s/optional-key :alert_first_only)    s/Bool
                    (s/optional-key :skip_if_empty)       s/Bool
                    (s/optional-key :collection_id)       (s/maybe su/IntGreaterThanZero)
                    (s/optional-key :collection_position) (s/maybe su/IntGreaterThanZero)
                    (s/optional-key :cards)               [CoercibleToCardRef]
                    (s/optional-key :channels)            [su/Map]
                    (s/optional-key :archived)            s/Bool}]
  (db/update! Pulse (u/get-id notification)
    (u/select-keys-when notification
      :present [:collection_id :collection_position :archived]
      :non-nil [:name :alert_condition :alert_above_goal :alert_first_only :skip_if_empty]))
  ;; update Cards if the 'refs' have changed
  (when (contains? notification :cards)
    (update-notification-cards-if-changed! notification (map card->ref (:cards notification))))
  ;; update channels as needed
  (when (contains? notification :channels)
    (update-notification-channels! notification (:channels notification))))

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
  (let [card (or card (first cards))]
    (-> alert
        (assoc :skip_if_empty true, :cards (when card [(card->ref card)]))
        (dissoc :card))))

;; TODO - why do we make sure to strictly validate everything when we create a PULSE but not when we create an ALERT?
(defn update-alert!
  "Updates the given `alert` and returns it"
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
