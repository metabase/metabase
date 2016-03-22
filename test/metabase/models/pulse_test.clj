(ns metabase.models.pulse-test
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [hydrate :refer :all]
                             [pulse :refer :all]
                             [pulse-card :refer :all]
                             [pulse-channel :refer :all]
                             [pulse-channel-recipient :refer :all])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [medley.core :as m]))

(defn user-details
  [username]
  (-> (fetch-user username)
      (dissoc :date_joined :last_login)))

;; create a channel then select its details
(defn create-pulse-then-select
  [name creator cards channels]
  (let [{:keys [cards channels] :as pulse} (create-pulse name creator cards channels)]
    (-> pulse
        (dissoc :id :creator :public_perms :created_at :updated_at)
        (assoc :cards (mapv #(dissoc % :id) cards))
        (assoc :channels (for [channel channels]
                           (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                               (m/dissoc-in [:details :emails])))))))

(defn update-pulse-then-select
  [pulse]
  (let [{:keys [cards channels] :as pulse} (update-pulse pulse)]
    (-> pulse
        (dissoc :id :creator :pulse_id :created_at :updated_at)
        (assoc :cards (mapv #(dissoc % :id) cards))
        (assoc :channels (for [channel channels]
                           (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                               (m/dissoc-in [:details :emails])))))))


;; retrieve-pulse
;; this should cover all the basic Pulse attributes
(expect
  {:creator_id   (user->id :rasta)
   :creator      (user-details :rasta)
   :name         "Lodi Dodi"
   :public_perms 2
   :cards        [{:name "Test Card",
                   :description nil,
                   :display "table"}]
   :channels     [{:schedule_type :daily,
                   :schedule_hour 15,
                   :schedule_frame nil,
                   :channel_type  :email,
                   :details       {:other "stuff"},
                   :schedule_day  nil,
                   :recipients    [{:email "foo@bar.com"}
                                   (dissoc (user-details :rasta) :is_superuser :is_qbnewb)]}]}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       "Lodi Dodi"}]
    (tu/with-temp PulseChannel [{channel-id :id :as channel} {:pulse_id      id
                                                              :channel_type  :email
                                                              :details       {:other  "stuff"
                                                                              :emails ["foo@bar.com"]}
                                                              :schedule_type :daily
                                                              :schedule_hour 15}]
      (tu/with-temp Card [{card-id :id} {:creator_id            (user->id :rasta)
                                        :name                   "Test Card"
                                        :display                :table
                                        :public_perms           0
                                        :dataset_query          {:type :native}
                                        :visualization_settings {}}]
        (do
          (db/ins PulseCard :pulse_id id :card_id card-id :position 0)
          (db/ins PulseChannelRecipient :pulse_channel_id channel-id :user_id (user->id :rasta))
          (let [{:keys [cards channels creator] :as pulse} (retrieve-pulse id)]
            (-> pulse
                (dissoc :id :pulse_id :created_at :updated_at)
                (assoc :creator (dissoc creator :date_joined :last_login))
                (assoc :cards (mapv #(dissoc % :id) cards))
                (assoc :channels (for [channel channels]
                                   (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                                       (m/dissoc-in [:details :emails])))))))))))

;; retrieve-pulses
;; some crappy problem with expectations where tests with vectors of maps are failing without explanation :(
;(expect
;  [{:creator_id   (user->id :crowberto)
;    :creator      (user-details :crowberto)
;    :name         "ABC"
;    :public_perms 2
;    :cards        []
;    :channels     []}
;   {:creator_id   (user->id :rasta)
;   :creator      (user-details :rasta)
;   :name         "Loddi-doddi"
;   :public_perms 2
;   :cards        [{:name "Test Card",
;                   :description nil,
;                   :display "table"}]
;   :channels     [{:schedule_type :daily,
;                   :schedule_hour 15,
;                   :channel_type  :email,
;                   :details       {:other "stuff"},
;                   :schedule_day  nil,
;                   :recipients    [{:email "foo@bar.com"}
;                                   (dissoc (user-details :rasta) :is_superuser)]}]}]
;  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
;                                     :name       "Loddi-doddi"}]
;    (tu/with-temp PulseChannel [{channel-id :id :as channel} {:pulse_id      id
;                                                              :channel_type  :email
;                                                              :details       {:other  "stuff"
;                                                                              :emails ["foo@bar.com"]}
;                                                              :schedule_type :daily
;                                                              :schedule_hour 15}]
;      (tu/with-temp Card [{card-id :id} {:creator_id            (user->id :rasta)
;                                         :name                   "Test Card"
;                                         :display                :table
;                                         :public_perms           0
;                                         :dataset_query          {:type :native}
;                                         :visualization_settings {}}]
;        (tu/with-temp Pulse [{pulse2 :id} {:creator_id (user->id :crowberto)
;                                           :name       "ABC"}]
;          (let [format-pulse (fn [{:keys [cards channels creator] :as pulse}]
;                               (-> pulse
;                                   (dissoc :id :pulse_id :created_at :updated_at)
;                                   (assoc :creator (dissoc creator :date_joined :last_login))
;                                   (assoc :cards (mapv #(dissoc % :id) cards))
;                                   (assoc :channels (mapv #(dissoc % :id :pulse_id :created_at :updated_at) channels))))]
;            (do
;              (db/ins PulseCard :pulse_id id :card_id card-id :position 0)
;              (db/ins PulseChannelRecipient :pulse_channel_id channel-id :user_id (user->id :rasta))
;              (mapv format-pulse (retrieve-pulses)))))))))

;; update-pulse-cards
(expect
  [[]
   ["card1"]
   ["card2"]
   ["card2" "card1"]
   ["card1" "card3"]]
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp Card [{card-id1 :id} {:creator_id            (user->id :rasta)
                                        :name                   "card1"
                                        :display                :table
                                        :public_perms           0
                                        :dataset_query          {:type :native}
                                        :visualization_settings {}}]
      (tu/with-temp Card [{card-id2 :id} {:creator_id            (user->id :rasta)
                                          :name                   "card2"
                                          :display                :table
                                          :public_perms           0
                                          :dataset_query          {:type :native}
                                          :visualization_settings {}}]
        (tu/with-temp Card [{card-id3 :id} {:creator_id            (user->id :rasta)
                                            :name                   "card3"
                                            :display                :table
                                            :public_perms           0
                                            :dataset_query          {:type :native}
                                            :visualization_settings {}}]
          (let [upd-cards (fn [cards]
                            (update-pulse-cards {:id id} cards)
                            (->> (db/sel :many PulseCard :pulse_id id)
                                 (mapv (fn [{:keys [card_id]}]
                                         (db/sel :one :field [Card :name] :id card_id)))))]
            [(upd-cards [])
             (upd-cards [card-id1])
             (upd-cards [card-id2])
             (upd-cards [card-id2 card-id1])
             (upd-cards [card-id1 card-id3])]))))))

;; update-pulse-channels
(expect
  {:channel_type  :email
   :schedule_type :daily
   :schedule_hour 4
   :schedule_day  nil
   :schedule_frame nil
   :recipients    [{:email "foo@bar.com"}
                   (dissoc (user-details :rasta) :is_superuser :is_qbnewb)]}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (do
      (update-pulse-channels {:id id} [{:channel_type  :email
                                        :schedule_type :daily
                                        :schedule_hour 4
                                        :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)}]}])
      (-> (db/sel :one PulseChannel :pulse_id id)
          (hydrate :recipients)
          (dissoc :id :pulse_id :created_at :updated_at)
          (m/dissoc-in [:details :emails])))))

;; create-pulse
;; simple example with a single card
(expect
  {:creator_id (user->id :rasta)
   :name       "Booyah!"
   :channels   [{:schedule_type :daily
                 :schedule_hour 18
                 :schedule_frame nil
                 :channel_type  :email
                 :recipients    [{:email "foo@bar.com"}]
                 :schedule_day  nil}]
   :cards      [{:name        "Test Card"
                 :description nil
                 :display     "table"}]}
  (tu/with-temp Card [{:keys [id]} {:creator_id             (user->id :rasta)
                                    :name                   "Test Card"
                                    :display                :table
                                    :public_perms           0
                                    :dataset_query          {:type :native}
                                    :visualization_settings {}}]
    (create-pulse-then-select "Booyah!" (user->id :rasta) [id] [{:channel_type  :email
                                                                 :schedule_type :daily
                                                                 :schedule_hour 18
                                                                 :recipients    [{:email "foo@bar.com"}]}])))

;; update-pulse
;; basic update.  we are testing several things here
;;  1. ability to update the Pulse name
;;  2. creator_id cannot be changed
;;  3. ability to save raw email addresses
;;  4. ability to save individual user recipients
;;  5. ability to create new channels
;;  6. ability to update cards and ensure proper ordering
(expect
  {:creator_id   (user->id :rasta)
   :name         "We like to party"
   :public_perms 2
   :cards        [{:name "Bar Card",
                   :description nil,
                   :display "bar"}
                  {:name "Test Card",
                   :description nil,
                   :display "table"}]
   :channels     [{:schedule_type :daily,
                   :schedule_hour 18,
                   :schedule_frame nil,
                   :channel_type  :email,
                   :schedule_day  nil,
                   :recipients    [{:email "foo@bar.com"}
                                   (dissoc (user-details :crowberto) :is_superuser :is_qbnewb)]}]}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       "Lodi Dodi"}]
    (tu/with-temp Card [{card-id1 :id} {:creator_id            (user->id :rasta)
                                        :name                   "Test Card"
                                        :display                :table
                                        :public_perms           0
                                        :dataset_query          {:type :native}
                                        :visualization_settings {}}]
      (tu/with-temp Card [{card-id2 :id} {:creator_id            (user->id :rasta)
                                          :name                   "Bar Card"
                                          :display                :bar
                                          :public_perms           0
                                          :dataset_query          {:type :native}
                                          :visualization_settings {}}]
        (update-pulse-then-select {:id         id
                                   :name       "We like to party"
                                   :creator_id (user->id :crowberto)
                                   :cards      [card-id2 card-id1]
                                   :channels   [{:channel_type  :email
                                                 :schedule_type :daily
                                                 :schedule_hour 18
                                                 :recipients    [{:email "foo@bar.com"}
                                                                 {:id (user->id :crowberto)}]}]})))))
