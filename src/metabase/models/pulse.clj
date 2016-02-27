(ns metabase.models.pulse
  (:require [clojure.tools.logging :as log]
            (korma [core :as k]
                   [db :as kdb])
            [medley.core :as m]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [card :refer [Card]]
                             [common :refer [perms-readwrite]]
                             [hydrate :refer :all]
                             [interface :as i]
                             [pulse-card :refer [PulseCard]]
                             [pulse-channel :refer [PulseChannel] :as pulse-channel]
                             [user :refer [User]])))


(i/defentity Pulse :pulse)

(defn- pre-insert [pulse]
  (let [defaults {:public_perms perms-readwrite}]
    (merge defaults pulse)))

(defn ^:hydrate channels
  "Return the `PulseChannels` associated with this PULSE."
  [{:keys [id]}]
  (db/sel :many PulseChannel, :pulse_id id))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete PulseCard :pulse_id id)
  (db/cascade-delete PulseChannel :pulse_id id))

(defn ^:hydrate cards
  "Return the `Cards` assoicated with this PULSE."
  [{:keys [id]}]
  (k/select Card
            (k/join PulseCard (= :pulse_card.card_id :id))
            (k/fields :id :name :description :display)
            (k/where {:pulse_card.pulse_id id})
            (k/order :pulse_card.position :asc)))

(extend (class Pulse)
  i/IEntity
  (merge i/IEntityDefaults
         {:hydration-keys     (constantly [:pulse])
          :timestamped?       (constantly true)
          :can-read?          i/publicly-readable?
          :can-write?         i/publicly-writeable?
          :pre-insert         pre-insert
          :pre-cascade-delete pre-cascade-delete}))


;; ## Persistence Functions

(defn update-pulse-cards
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
  (db/cascade-delete PulseCard :pulse_id id)
  ;; now just insert all of the cards that were given to us
  (when-not (empty? card-ids)
    (let [cards (map-indexed (fn [idx itm] {:pulse_id id :card_id itm :position idx}) card-ids)]
      (k/insert PulseCard (k/values cards)))))

(defn- create-update-delete-channel
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
      (and channel (not existing-channel))  (pulse-channel/create-pulse-channel channel)
      ;; 2. NOT in channels, in db-channels = DELETE
      (and (nil? channel) existing-channel) (db/cascade-delete PulseChannel :id (:id existing-channel))
      ;; 3. in channels, in db-channels = UPDATE
      (and channel existing-channel)        (pulse-channel/update-pulse-channel channel)
      ;; 4. NOT in channels, NOT in db-channels = NO-OP
      :else nil)))

(defn update-pulse-channels
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
        old-channels   (group-by (comp keyword :channel_type) (db/sel :many PulseChannel :pulse_id id))
        handle-channel #(create-update-delete-channel id (first (get new-channels %)) (first (get old-channels %)))]
    (assert (= 0 (count (get new-channels nil))) "Cannot have channels without a :channel_type attribute")
    ;; for each of our possible channel types call our handler function
    (dorun (map handle-channel (vec (keys pulse-channel/channel-types))))))

(defn retrieve-pulse
  "Fetch a single `Pulse` by its ID value."
  [id]
  {:pre [(integer? id)]}
  (-> (db/sel :one Pulse :id id)
      (hydrate :creator :cards [:channels :recipients])
      (m/dissoc-in [:details :emails])))

(defn retrieve-pulses
  "Fetch all `Pulses`."
  []
  (for [pulse (-> (db/sel :many Pulse (k/order :name :ASC))
                  (hydrate :creator :cards [:channels :recipients]))]
    (m/dissoc-in pulse [:details :emails])))

(defn update-pulse
  "Update an existing `Pulse`, including all associated data such as: `PulseCards`, `PulseChannels`, and `PulseChannelRecipients`.

   Returns the updated `Pulse` or throws an Exception."
  [{:keys [id name cards channels] :as pulse}]
  {:pre [(integer? id)
         (string? name)
         (sequential? cards)
         (> (count cards) 0)
         (every? integer? cards)
         (coll? channels)
         (every? map? channels)]}
  (kdb/transaction
    ;; update the pulse itself
    (db/upd Pulse id :name name)
    ;; update cards (only if they changed)
    (when (not= cards (db/sel :many :field [PulseCard :card_id] :pulse_id id (k/order :position :asc)))
      (update-pulse-cards pulse cards))
    ;; update channels
    (update-pulse-channels pulse channels)
    ;; fetch the fully updated pulse and return it (and fire off an event)
    (->> (retrieve-pulse id)
         (events/publish-event :pulse-update))))

(defn create-pulse
  "Create a new `Pulse` by inserting it into the database along with all associated pieces of data such as:
  `PulseCards`, `PulseChannels`, and `PulseChannelRecipients`.

   Returns the newly created `Pulse` or throws an Exception."
  [pulse-name creator-id card-ids channels]
  {:pre [(string? pulse-name)
         (integer? creator-id)
         (sequential? card-ids)
         (> (count card-ids) 0)
         (every? integer? card-ids)
         (coll? channels)
         (every? map? channels)]}
  (kdb/transaction
    (let [{:keys [id] :as pulse} (db/ins Pulse
                                   :creator_id creator-id
                                   :name pulse-name)]
      ;; add card-ids to the Pulse
      (update-pulse-cards pulse card-ids)
      ;; add channels to the Pulse
      (update-pulse-channels pulse channels)
      ;; return the full Pulse (and record our create event)
      (events/publish-event :pulse-create (retrieve-pulse id)))))
