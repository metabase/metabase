(ns metabase.models.pulse
  (:require [clojure.set :as set]
            [medley.core :as m]
            [metabase
             [db :as mdb]
             [events :as events]
             [util :as u]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.models
             [card :refer [Card]]
             [interface :as i]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :as pulse-channel :refer [PulseChannel]]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

;;; ------------------------------------------------------------ Perms Checking ------------------------------------------------------------

(defn- perms-objects-set [pulse read-or-write]
  (set (when-let [card-ids (db/select-field :card_id PulseCard, :pulse_id (u/get-id pulse))]
         (apply set/union (for [card (db/select [Card :dataset_query], :id [:in card-ids])]
                            (i/perms-objects-set card read-or-write))))))

(defn- channels-with-recipients
  "Get the 'channels' associated with this PULSE, including recipients of those 'channels'.
   If `:channels` is already hydrated, as it will be when using `retrieve-pulses`, this doesn't need to make any DB calls."
  [pulse]
  (or (:channels pulse)
      (-> (db/select PulseChannel, :pulse_id (u/get-id pulse))
          (hydrate :recipients))))

(defn- emails
  "Get the set of emails this PULSE will be sent to."
  [pulse]
  (set (for [channel   (channels-with-recipients pulse)
             recipient (:recipients channel)]
         (:email recipient))))

(defn- can-read? [pulse]
  (or (i/current-user-has-full-permissions? :read pulse)
      (contains? (emails pulse) (:email @*current-user*))))


;;; ------------------------------------------------------------ Entity & Lifecycle ------------------------------------------------------------

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
          ;; I'm not 100% sure this covers everything. If a user is subscribed to a pulse they're still allowed to know it exists, right?
          :can-read?          can-read?
          :can-write?         (partial i/current-user-has-full-permissions? :write)}))


;;; ------------------------------------------------------------ Hydration ------------------------------------------------------------

(defn ^:hydrate channels
  "Return the `PulseChannels` associated with this PULSE."
  [{:keys [id]}]
  (db/select PulseChannel, :pulse_id id))


(defn ^:hydrate cards
  "Return the `Cards` associated with this PULSE."
  [{:keys [id]}]
  (db/select [Card :id :name :description :display]
    (mdb/join [Card :id] [PulseCard :card_id])
    (db/qualify PulseCard :pulse_id) id
    {:order-by [[(db/qualify PulseCard :position) :asc]]}))


;;; ------------------------------------------------------------ Pulse Fetching Helper Fns ------------------------------------------------------------

(defn retrieve-pulse
  "Fetch a single `Pulse` by its ID value."
  [id]
  {:pre [(integer? id)]}
  (-> (Pulse id)
      (hydrate :creator :cards [:channels :recipients])
      (m/dissoc-in [:details :emails])))


(defn retrieve-pulses
  "Fetch all `Pulses`."
  []
  (for [pulse (-> (db/select Pulse, {:order-by [[:name :asc]]})
                  (hydrate :creator :cards [:channels :recipients]))]
    (m/dissoc-in pulse [:details :emails])))


;;; ------------------------------------------------------------ Other Persistence Functions ------------------------------------------------------------

(defn update-pulse-cards!
  "Update the `PulseCards` for a given PULSE.
   CARD-IDS should be a definitive collection of *all* IDs of cards for the pulse in the desired order.

   *  If an ID in CARD-IDS has no corresponding existing `PulseCard` object, one will be created.
   *  If an existing `PulseCard` has no corresponding ID in CARD-IDs, it will be deleted.
   *  All cards will be updated with a `position` according to their place in the collection of CARD-IDS"
  {:arglists '([pulse card-ids])}
  [{:keys [id]} card-ids]
  {:pre [(integer? id)
         (sequential? card-ids)
         (every? integer? card-ids)]}
  ;; first off, just delete any cards associated with this pulse (we add them again below)
  (db/delete! PulseCard :pulse_id id)
  ;; now just insert all of the cards that were given to us
  (when (seq card-ids)
    (let [cards (map-indexed (fn [idx itm] {:pulse_id id :card_id itm :position idx}) card-ids)]
      (db/insert-many! PulseCard cards))))


(defn- create-update-delete-channel!
  "Utility function which determines how to properly update a single pulse channel."
  [pulse-id new-channel existing-channel]
  ;; NOTE that we force the :id of the channel being updated to the :id we *know* from our
  ;;      existing list of `PulseChannels` pulled from the db to ensure we affect the right record
  (let [channel (when new-channel (assoc new-channel
                                    :pulse_id       pulse-id
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

(defn update-pulse-channels!
  "Update the `PulseChannels` for a given PULSE.
   CHANNELS should be a definitive collection of *all* of the channels for the the pulse.

   * If a channel in the list has no existing `PulseChannel` object, one will be created.
   * If an existing `PulseChannel` has no corresponding entry in CHANNELS, it will be deleted.
   * All previously existing channels will be updated with their most recent information."
  {:arglists '([pulse channels])}
  [{:keys [id]} channels]
  {:pre [(integer? id)
         (coll? channels)
         (every? map? channels)]}
  (let [new-channels   (group-by (comp keyword :channel_type) channels)
        old-channels   (group-by (comp keyword :channel_type) (db/select PulseChannel :pulse_id id))
        handle-channel #(create-update-delete-channel! id (first (get new-channels %)) (first (get old-channels %)))]
    (assert (zero? (count (get new-channels nil)))
      "Cannot have channels without a :channel_type attribute")
    ;; for each of our possible channel types call our handler function
    (doseq [[channel-type] pulse-channel/channel-types]
      (handle-channel channel-type))))


(defn create-pulse!
  "Create a new `Pulse` by inserting it into the database along with all associated pieces of data such as:
  `PulseCards`, `PulseChannels`, and `PulseChannelRecipients`.

   Returns the newly created `Pulse` or throws an Exception."
  [pulse-name creator-id card-ids channels skip-if-empty?]
  {:pre [(string? pulse-name)
         (integer? creator-id)
         (sequential? card-ids)
         (seq card-ids)
         (every? integer? card-ids)
         (coll? channels)
         (every? map? channels)]}
  (db/transaction
    (let [{:keys [id] :as pulse} (db/insert! Pulse
                                   :creator_id creator-id
                                   :name pulse-name
                                   :skip_if_empty skip-if-empty?)]
      ;; add card-ids to the Pulse
      (update-pulse-cards! pulse card-ids)
      ;; add channels to the Pulse
      (update-pulse-channels! pulse channels)
      ;; return the full Pulse (and record our create event)
      (events/publish-event! :pulse-create (retrieve-pulse id)))))


(defn update-pulse!
  "Update an existing `Pulse`, including all associated data such as: `PulseCards`, `PulseChannels`, and `PulseChannelRecipients`.

   Returns the updated `Pulse` or throws an Exception."
  [{:keys [id name cards channels skip-if-empty?] :as pulse}]
  {:pre [(integer? id)
         (string? name)
         (sequential? cards)
         (> (count cards) 0)
         (every? integer? cards)
         (coll? channels)
         (every? map? channels)]}
  (db/transaction
    ;; update the pulse itself
    (db/update! Pulse id, :name name, :skip_if_empty skip-if-empty?)
    ;; update cards (only if they changed)
    (when (not= cards (map :card_id (db/select [PulseCard :card_id], :pulse_id id, {:order-by [[:position :asc]]})))
      (update-pulse-cards! pulse cards))
    ;; update channels
    (update-pulse-channels! pulse channels)
    ;; fetch the fully updated pulse and return it (and fire off an event)
    (->> (retrieve-pulse id)
         (events/publish-event! :pulse-update))))
