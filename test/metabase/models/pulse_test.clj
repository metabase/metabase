(ns metabase.models.pulse-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.models
             [card :refer [Card]]
             [pulse :refer :all]
             [pulse-card :refer :all]
             [pulse-channel :refer :all]
             [pulse-channel-recipient :refer :all]]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(defn- user-details
  [username]
  (dissoc (fetch-user username) :date_joined :last_login))

;; create a channel then select its details
(defn- create-pulse-then-select!
  [name creator cards channels skip-if-empty?]
  (let [{:keys [cards channels] :as pulse} (create-pulse! name creator cards channels skip-if-empty?)]
    (-> pulse
        (dissoc :id :creator :created_at :updated_at)
        (assoc :cards (mapv #(dissoc % :id) cards))
        (assoc :channels (for [channel channels]
                           (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                               (m/dissoc-in [:details :emails])))))))

(defn- update-pulse-then-select!
  [pulse]
  (let [{:keys [cards channels] :as pulse} (update-pulse! pulse)]
    (-> pulse
        (dissoc :id :creator :pulse_id :created_at :updated_at)
        (assoc :cards (mapv #(dissoc % :id) cards))
        (assoc :channels (for [channel channels]
                           (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                               (m/dissoc-in [:details :emails])))))))


;; retrieve-pulse
;; this should cover all the basic Pulse attributes
(expect
  {:creator_id    (user->id :rasta)
   :creator       (user-details :rasta)
   :name          "Lodi Dodi"
   :cards         [{:name        "Test Card"
                    :description nil
                    :display     :table}]
   :channels      [{:enabled        true
                    :schedule_type  :daily
                    :schedule_hour  15
                    :schedule_frame nil
                    :channel_type   :email
                    :details        {:other "stuff"}
                    :schedule_day   nil
                    :recipients     [{:email "foo@bar.com"}
                                     (dissoc (user-details :rasta) :is_superuser :is_qbnewb)]}]
   :skip_if_empty false}
  (tt/with-temp* [Pulse        [{pulse-id :id}               {:name "Lodi Dodi"}]
                  PulseChannel [{channel-id :id :as channel} {:pulse_id pulse-id
                                                              :details  {:other  "stuff"
                                                                         :emails ["foo@bar.com"]}}]
                  Card         [{card-id :id}                {:name "Test Card"}]]
    (db/insert! PulseCard, :pulse_id pulse-id, :card_id card-id, :position 0)
    (db/insert! PulseChannelRecipient, :pulse_channel_id channel-id, :user_id (user->id :rasta))
    (-> (dissoc (retrieve-pulse pulse-id) :id :pulse_id :created_at :updated_at)
        (update :creator  (u/rpartial dissoc :date_joined :last_login))
        (update :cards    (fn [cards] (for [card cards]
                                        (dissoc card :id))))
        (update :channels (fn [channels] (for [channel channels]
                                           (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                                               (m/dissoc-in [:details :emails]))))))))


;; update-pulse-cards!
(expect
  [#{}
   #{"card1"}
   #{"card2"}
   #{"card2" "card1"}
   #{"card1" "card3"}]
  (tt/with-temp* [Pulse [{pulse-id :id}]
                  Card  [{card-id-1 :id} {:name "card1"}]
                  Card  [{card-id-2 :id} {:name "card2"}]
                  Card  [{card-id-3 :id} {:name "card3"}]]
    (let [upd-cards! (fn [cards]
                       (update-pulse-cards! {:id pulse-id} cards)
                       (set (for [card-id (db/select-field :card_id PulseCard, :pulse_id pulse-id)]
                              (db/select-one-field :name Card, :id card-id))))]
      [(upd-cards! [])
       (upd-cards! [card-id-1])
       (upd-cards! [card-id-2])
       (upd-cards! [card-id-2 card-id-1])
       (upd-cards! [card-id-1 card-id-3])])))

;; update-pulse-channels!
(expect
  {:enabled       true
   :channel_type  :email
   :schedule_type :daily
   :schedule_hour 4
   :schedule_day  nil
   :schedule_frame nil
   :recipients    [{:email "foo@bar.com"}
                   (dissoc (user-details :rasta) :is_superuser :is_qbnewb)]}
  (tt/with-temp Pulse [{:keys [id]}]
    (update-pulse-channels! {:id id} [{:enabled       true
                                       :channel_type  :email
                                       :schedule_type :daily
                                       :schedule_hour 4
                                       :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)}]}])
    (-> (PulseChannel :pulse_id id)
        (hydrate :recipients)
        (dissoc :id :pulse_id :created_at :updated_at)
        (m/dissoc-in [:details :emails]))))

;; create-pulse!
;; simple example with a single card
(expect
  {:creator_id    (user->id :rasta)
   :name          "Booyah!"
   :channels      [{:enabled        true
                    :schedule_type  :daily
                    :schedule_hour  18
                    :schedule_frame nil
                    :channel_type   :email
                    :recipients     [{:email "foo@bar.com"}]
                    :schedule_day   nil}]
   :cards         [{:name        "Test Card"
                    :description nil
                    :display     :table}]
   :skip_if_empty false}
  (tt/with-temp Card [{:keys [id]} {:name "Test Card"}]
    (create-pulse-then-select! "Booyah!"
                               (user->id :rasta)
                               [id]
                               [{:channel_type  :email
                                 :schedule_type :daily
                                 :schedule_hour 18
                                 :recipients    [{:email "foo@bar.com"}]}]
                               false)))

;; update-pulse!
;; basic update.  we are testing several things here
;;  1. ability to update the Pulse name
;;  2. creator_id cannot be changed
;;  3. ability to save raw email addresses
;;  4. ability to save individual user recipients
;;  5. ability to create new channels
;;  6. ability to update cards and ensure proper ordering
(expect
  {:creator_id    (user->id :rasta)
   :name          "We like to party"
   :cards         [{:name        "Bar Card"
                    :description nil
                    :display     :bar}
                   {:name        "Test Card"
                    :description nil
                    :display     :table}]
   :channels      [{:enabled        true
                    :schedule_type  :daily
                    :schedule_hour  18
                    :schedule_frame nil
                    :channel_type   :email
                    :schedule_day   nil
                    :recipients     [{:email "foo@bar.com"}
                                     (dissoc (user-details :crowberto) :is_superuser :is_qbnewb)]}]
   :skip_if_empty false}
  (tt/with-temp* [Pulse [{pulse-id :id}]
                  Card  [{card-id-1 :id} {:name "Test Card"}]
                  Card  [{card-id-2 :id} {:name "Bar Card", :display :bar}]]
    (update-pulse-then-select! {:id             pulse-id
                                :name           "We like to party"
                                :creator_id     (user->id :crowberto)
                                :cards          [card-id-2 card-id-1]
                                :channels       [{:channel_type  :email
                                                  :schedule_type :daily
                                                  :schedule_hour 18
                                                  :recipients    [{:email "foo@bar.com"}
                                                                  {:id (user->id :crowberto)}]}]
                                :skip-if-empty? false})))
