(ns metabase.models.pulse
  (:require [korma.core :as k]
            [korma.db :as kdb]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [common :refer [perms-readwrite]]
                             [interface :refer :all]
                             [pulse-card :refer [PulseCard]]
                             [pulse-channel :refer [PulseChannel]]
                             [user :refer [User]])
            [metabase.util :as u]))


(defrecord PulseInstance []
  ;; preserve normal IFn behavior so things like ((sel :one Database) :id) work correctly
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite PulseInstance :read :public-perms, :write :public-perms)


(defentity Pulse
  [(k/table :pulse)
   (hydration-keys pulse)
   timestamped]

  (pre-insert [_ pulse]
    (let [defaults {:public_perms perms-readwrite}]
      (merge defaults pulse)))

  (post-select [_ {:keys [id creator_id] :as pulse}]
    (map->PulseInstance
      (u/assoc* pulse
                :cards    (delay (db/sel :many [Card :id :name :description :display] (k/where {:id [in (k/subselect PulseCard (k/fields :card_id) (k/where {:pulse_id id}))]})))
                :channels (delay (db/sel :many PulseChannel (k/where {:pulse_id id})))
                :creator  (delay (when creator_id (db/sel :one User :id creator_id))))))

  (pre-cascade-delete [_ {:keys [id]}]
    (db/cascade-delete PulseCard :pulse_id id)
    (db/cascade-delete PulseChannel :pulse_id id)))

(extend-ICanReadWrite PulseEntity :read :public-perms, :write :public-perms)


;; ## Helper Functions

(defn update-pulse-cards
  "Update the `PulseCards` for a given PULSE.
   CARD-IDS should be a definitive collection of *all* IDs of cards for the pulse in the desired order.

   *  If an ID in CARD-IDS has no corresponding existing `PulseCard` object, one will be created.
   *  If an existing `PulseCard` has no corresponding ID in CARD-IDs, it will be deleted.
   *  All cards will be updated with a `position` according to their place in the collection of CARD-IDS"
  {:arglists '([pulse card-ids])}
  [{:keys [id] :as pulse} card-ids]
  {:pre [(integer? id)
         (coll? card-ids)
         (every? integer? card-ids)]}
  ;; IMPORTANT!  This is done in a transaction so that we can have the delete & insert be atomic
  (kdb/transaction
    ;; first off, just delete any cards associated with this pulse (we add them again below)
    (k/delete PulseCard (k/where {:pulse_id id}))
    ;; now just insert all of the cards that were given to us
    (let [cards (map-indexed (fn [idx itm] {:pulse_id id :card_id itm :position idx}) card-ids)]
      (k/insert PulseCard (k/values cards))))
  pulse)

(defn update-pulse
  "Update an existing `Pulse`"
  [{:keys [id name cards channels] :as pulse}]
  {:pre [(string? name)
         (coll? cards)
         (> (count cards) 0)
         (every? integer? cards)
         ;(coll? channels)
         ;(every? map? channels)
         ]}
  ;; TODO: ideally this would all be in a transaction
  (db/upd Pulse id :name name)
  (update-pulse-cards pulse cards)
  (db/sel :one Pulse :id id))

(defn create-pulse
  "Create a new `Pulse` by inserting it into the database along with all associated pieces of data such as:
  `PulseCards`, `PulseChannels`, and `PulseChannelRecipients`.

   This entire operation is atomic and happens within a transaction, so any failure will void the entire creation."
  [name creator-id cards channels]
  {:pre [(string? name)
         (integer? creator-id)
         (coll? cards)
         (> (count cards) 0)
         (every? integer? cards)
         ;(coll? channels)
         ;(every? map? channels)
         ]}
  (let [pulse (db/ins Pulse
                :creator_id creator-id
                :name name)]
    (update-pulse-cards pulse cards)))
