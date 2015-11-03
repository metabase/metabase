(ns metabase.models.pulse
  (:require [korma.core :as k]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [card :refer [Card]]
                             [interface :refer :all]
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
  [(table :pulse)
   (hydration-keys pulse)
   timestamped]

  (pre-insert [_ pulse]
    (let [defaults {:public_perms 2}]
      (merge defaults pulse)))

  (post-select [_ {:keys [id creator_id] :as pulse}]
    (map->PulseInstance
      (u/assoc* pulse
                :cards (delay (sel :many Card (k/where {:id [in (k/subselect PulseCard (k/fields :card_id) (k/where {:pulse_id id}))]})))
                :channels (delay (sel :many PulseChannel (k/where {:pulse_id id})))
                :creator (delay (when creator_id (sel :one User :id creator_id))))))

  (pre-cascade-delete [_ {:keys [id]}]
    (cascade-delete PulseCard :pulse_id id)
    (cascade-delete PulseChannel :pulse_id id)))

(extend-ICanReadWrite Pulse :read :public-perms, :write :public-perms)
