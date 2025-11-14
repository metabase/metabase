(ns metabase-enterprise.representations.v0.pulse
  (:require
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def toucan-model
  "The toucan model keyword associated with pulse representations"
  :model/Pulse)

(defmethod v0-common/representation-type :model/Pulse [_entity]
  :pulse)

(defn- export-pulse-card
  "Export a PulseCard Toucan entity to representation format."
  [t2-pulse-card]
  (u/remove-nils
   {:card (v0-common/->ref (:card_id t2-pulse-card) :question)
    :position (:position t2-pulse-card)
    :include_csv (:include_csv t2-pulse-card)
    :include_xls (:include_xls t2-pulse-card)}))

(defn- export-pulse-channel
  "Export a PulseChannel Toucan entity to representation format."
  [t2-pulse-channel]
  (u/remove-nils
   {:channel_type (:channel_type t2-pulse-channel)
    :enabled (:enabled t2-pulse-channel)
    :schedule_type (:schedule_type t2-pulse-channel)
    :schedule_hour (:schedule_hour t2-pulse-channel)
    :schedule_day (:schedule_day t2-pulse-channel)
    :schedule_frame (:schedule_frame t2-pulse-channel)
    :details (:details t2-pulse-channel)
    :recipients (mapv :user_id (:recipients t2-pulse-channel))}))

(defn export-pulse
  "Export a Pulse Toucan entity to a v0 pulse representation."
  [t2-pulse]
  (let [pulse-cards (t2/select :model/PulseCard :pulse_id (:id t2-pulse))
        pulse-channels (t2/hydrate (t2/select :model/PulseChannel :pulse_id (:id t2-pulse)) :recipients)]
    (u/remove-nils
     {:type :pulse
      :version :v0
      :name (format "pulse-%s" (:id t2-pulse))
      :display_name (:name t2-pulse)
      :skip_if_empty (:skip_if_empty t2-pulse)
      :archived (:archived t2-pulse)
      :parameters (:parameters t2-pulse)
      :cards (mapv export-pulse-card pulse-cards)
      :channels (mapv export-pulse-channel pulse-channels)})))

(defn- yaml->pulse-card
  "Convert a pulse card from the representation format to Toucan-compatible data."
  [card-data ref-index]
  (let [card-ref (:card card-data)
        card-id (-> ref-index
                    (v0-common/lookup-entity card-ref)
                    (v0-common/ensure-correct-type :question)
                    (or (lookup/lookup-by-name :model/Card card-ref))
                    (or (lookup/lookup-by-id :model/Card card-ref))
                    :id
                    (v0-common/ensure-not-nil))]
    (u/remove-nils
     {:card_id card-id
      :position (:position card-data)
      :include_csv (or (:include_csv card-data) false)
      :include_xls (or (:include_xls card-data) false)})))

(defn- yaml->pulse-channel
  "Convert a pulse channel from the representation format to Toucan-compatible data."
  [channel-data _ref-index]
  (u/remove-nils
   {:channel_type (:channel_type channel-data)
    :enabled (:enabled channel-data)
    :schedule_type (:schedule_type channel-data)
    :schedule_hour (:schedule_hour channel-data)
    :schedule_day (:schedule_day channel-data)
    :schedule_frame (:schedule_frame channel-data)
    :details (or (:details channel-data) {})
    :recipients (:recipients channel-data)}))

(defn yaml->toucan
  "Convert a v0 pulse representation to Toucan-compatible data."
  [{display-name :display_name
    :keys [skip_if_empty archived parameters cards channels] :as _representation}
   ref-index]
  (u/remove-nils
   {:name display-name
    :skip_if_empty (or skip_if_empty false)
    :archived (or archived false)
    :parameters (or parameters [])
    :cards (when cards
             (mapv #(yaml->pulse-card % ref-index) cards))
    :channels (when channels
                (mapv #(yaml->pulse-channel % ref-index) channels))}))

(defn- insert-pulse-cards!
  "Insert pulse cards for the given pulse ID."
  [pulse-id cards]
  (when (seq cards)
    (t2/insert-returning-instances! :model/PulseCard
                                    (for [[idx card] (map-indexed vector cards)]
                                      (let [t2-card (->> card
                                                         (rep-t2/with-toucan-defaults :model/PulseCard))]
                                        (assoc t2-card
                                               :pulse_id pulse-id
                                               :position idx))))))

(defn- insert-pulse-channels!
  "Insert pulse channels for the given pulse ID."
  [pulse-id channels]
  (when (seq channels)
    (doseq [channel channels]
      (let [t2-channel (-> channel
                           (dissoc :recipients)
                           (rep-t2/with-toucan-defaults :model/PulseChannel)
                           (assoc :pulse_id pulse-id))
            inserted-channel (t2/insert-returning-instance! :model/PulseChannel t2-channel)]
        (when-let [recipients (:recipients channel)]
          (when (seq recipients)
            (t2/insert! :model/PulseChannelRecipient
                        (for [user-id recipients]
                          {:pulse_channel_id (:id inserted-channel)
                           :user_id user-id}))))))))

(defn insert!
  "Insert a v0 pulse as a new entity, handling cards and channels as well"
  [representation ref-index]
  (let [t2-pulse (->> (yaml->toucan representation ref-index)
                      (rep-t2/with-toucan-defaults :model/Pulse))
        pulse (t2/insert-returning-instance! :model/Pulse (dissoc t2-pulse :cards :channels))
        cards (insert-pulse-cards! (:id pulse) (:cards representation))
        _ (insert-pulse-channels! (:id pulse) (:channels representation))
        channels (t2/hydrate (t2/select :model/PulseChannel :pulse_id (:id pulse)) :recipients)]
    (assoc pulse :cards cards :channels channels)))

(defn update!
  "Update an existing v0 pulse from a representation."
  [representation id ref-index]
  (let [t2-pulse (yaml->toucan representation ref-index)]
    (t2/update! :model/Pulse id (dissoc t2-pulse :entity_id :cards :channels)))
  (t2/delete! :model/PulseCard :pulse_id id)
  (t2/delete! :model/PulseChannel :pulse_id id)
  (insert-pulse-cards! id (:cards representation))
  (insert-pulse-channels! id (:channels representation))
  (let [pulse (t2/select-one :model/Pulse :id id)
        cards (t2/select :model/PulseCard :pulse_id id)
        channels (t2/hydrate (t2/select :model/PulseChannel :pulse_id id) :recipients)]
    (assoc pulse :cards cards :channels channels)))

(defn persist!
  "Persist a v0 pulse representation by creating or updating it in the database."
  [_representation _ref-index]
  nil)
