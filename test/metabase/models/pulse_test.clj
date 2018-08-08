(ns metabase.models.pulse-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [database :refer [Database]]
             [interface :as mi]
             [permissions :as perms]
             [pulse :refer :all]
             [pulse-card :refer :all]
             [pulse-channel :refer :all]
             [pulse-channel-recipient :refer :all]
             [table :refer [Table]]]
            [metabase.test
             [data :refer :all]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
            [metabase.test.mock.util :refer [pulse-channel-defaults]]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(defn- user-details
  [username]
  (dissoc (fetch-user username) :date_joined :last_login))

(defn- remove-uneeded-pulse-keys [pulse]
  (-> pulse
      (dissoc :id :creator :created_at :updated_at)
      (update :cards (fn [cards]
                       (for [card cards]
                         (dissoc card :id))))
      (update :channels (fn [channels]
                          (for [channel channels]
                            (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                                (m/dissoc-in [:details :emails])))))))
;; create a channel then select its details
(defn- create-pulse-then-select!
  [name creator cards channels skip-if-empty?]
  (-> (create-pulse! cards channels
        {:name          name
         :creator_id    (u/get-id creator)
         :skip_if_empty skip-if-empty?})
      remove-uneeded-pulse-keys))

(defn- update-pulse-then-select!
  [pulse]
  (-> (update-pulse! pulse)
      remove-uneeded-pulse-keys))

(def ^:private pulse-defaults
  {:collection_id       nil
   :collection_position nil
   :skip_if_empty       false
   :archived            false})

;; retrieve-pulse
;; this should cover all the basic Pulse attributes
(expect
  (merge
   pulse-defaults
   {:creator_id (user->id :rasta)
    :creator    (user-details :rasta)
    :name       "Lodi Dodi"
    :cards      [{:name          "Test Card"
                  :description   nil
                  :collection_id nil
                  :display       :table
                  :include_csv   false
                  :include_xls   false}]
    :channels   [(merge pulse-channel-defaults
                        {:schedule_type :daily
                         :schedule_hour 15
                         :channel_type  :email
                         :details       {:other "stuff"}
                         :recipients    [{:email "foo@bar.com"}
                                         (dissoc (user-details :rasta) :is_superuser :is_qbnewb)]})]})
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


;; update-notification-cards!
(expect
  [nil
   #{"card1"}
   #{"card2"}
   #{"card2" "card1"}
   #{"card1" "card3"}]
  (tt/with-temp* [Pulse [pulse]
                  Card  [card-1 {:name "card1"}]
                  Card  [card-2 {:name "card2"}]
                  Card  [card-3 {:name "card3"}]]
    (let [upd-cards! (fn [cards]
                       (update-notification-cards! pulse (map card->ref cards))
                       (when-let [card-ids (seq (db/select-field :card_id PulseCard, :pulse_id (u/get-id pulse)))]
                         (db/select-field :name Card, :id [:in card-ids])))]
      [(upd-cards! [])
       (upd-cards! [card-1])
       (upd-cards! [card-2])
       (upd-cards! [card-2 card-1])
       (upd-cards! [card-1 card-3])])))

;; update-notification-channels!
(expect
  (merge pulse-channel-defaults
         {:channel_type  :email
          :schedule_type :daily
          :schedule_hour 4
          :recipients    [{:email "foo@bar.com"}
                          (dissoc (user-details :rasta) :is_superuser :is_qbnewb)]})
  (tt/with-temp Pulse [{:keys [id]}]
    (update-notification-channels! {:id id} [{:enabled       true
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
  (merge
   pulse-defaults
   {:creator_id (user->id :rasta)
    :name       "Booyah!"
    :channels   [(merge pulse-channel-defaults
                        {:schedule_type :daily
                         :schedule_hour 18
                         :channel_type  :email
                         :recipients    [{:email "foo@bar.com"}]})]
    :cards      [{:name          "Test Card"
                  :description   nil
                  :collection_id nil
                  :display       :table
                  :include_csv   false
                  :include_xls   false}]})
  (tt/with-temp Card [card {:name "Test Card"}]
    (tu/with-model-cleanup [Pulse]
      (create-pulse-then-select! "Booyah!"
                                 (user->id :rasta)
                                 [(card->ref card)]
                                 [{:channel_type  :email
                                   :schedule_type :daily
                                   :schedule_hour 18
                                   :recipients    [{:email "foo@bar.com"}]}]
                                 false))))
;; update-pulse!
;; basic update.  we are testing several things here
;;  1. ability to update the Pulse name
;;  2. creator_id cannot be changed
;;  3. ability to save raw email addresses
;;  4. ability to save individual user recipients
;;  5. ability to create new channels
;;  6. ability to update cards and ensure proper ordering
(expect
  (merge
   pulse-defaults
   {:creator_id (user->id :rasta)
    :name       "We like to party"
    :cards      [{:name          "Bar Card"
                  :description   nil
                  :collection_id nil
                  :display       :bar
                  :include_csv   false
                  :include_xls   false}
                 {:name          "Test Card"
                  :description   nil
                  :collection_id nil
                  :display       :table
                  :include_csv   false
                  :include_xls   false}]
    :channels   [(merge pulse-channel-defaults
                        {:schedule_type :daily
                         :schedule_hour 18
                         :channel_type  :email
                         :recipients    [{:email "foo@bar.com"}
                                         (dissoc (user-details :crowberto) :is_superuser :is_qbnewb)]})]})
  (tt/with-temp* [Pulse [pulse]
                  Card  [card-1 {:name "Test Card"}]
                  Card  [card-2 {:name "Bar Card", :display :bar}]]
    (update-pulse-then-select! {:id            (u/get-id pulse)
                                :name          "We like to party"
                                :cards         (map card->ref [card-2 card-1])
                                :channels      [{:channel_type  :email
                                                 :schedule_type :daily
                                                 :schedule_hour 18
                                                 :recipients    [{:email "foo@bar.com"}
                                                                 {:id (user->id :crowberto)}]}]
                                :skip_if_empty false})))

;; make sure fetching a Pulse doesn't return any archived cards
(expect
  1
  (tt/with-temp* [Pulse     [pulse]
                  Card      [card-1 {:archived true}]
                  Card      [card-2]
                  PulseCard [_ {:pulse_id (u/get-id pulse), :card_id (u/get-id card-1), :position 0}]
                  PulseCard [_ {:pulse_id (u/get-id pulse), :card_id (u/get-id card-2), :position 1}]]
    (count (:cards (retrieve-pulse (u/get-id pulse))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-pulse-in-collection [f]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection]
                    Pulse      [pulse  {:collection_id (u/get-id collection)}]
                    Database   [db    {:engine :h2}]
                    Table      [table {:db_id (u/get-id db)}]
                    Card       [card  {:dataset_query {:database (u/get-id db)
                                                       :type     :query
                                                       :query    {:source-table (u/get-id table)}}}]
                    PulseCard  [_ {:pulse_id (u/get-id pulse), :card_id (u/get-id card)}]]
      (f db collection pulse card))))

(defmacro with-pulse-in-collection
  "Execute `body` with a temporary Pulse, in a Colleciton, containing a single Card."
  {:style/indent 1}
  [[db-binding collection-binding pulse-binding card-binding] & body]
  `(do-with-pulse-in-collection
    (fn [~(or db-binding '_) ~(or collection-binding '_) ~(or pulse-binding '_) ~(or card-binding '_)]
      ~@body)))

;; Check that if a Pulse is in a Collection, someone who would not be able to see it under the old
;; artifact-permissions regime will be able to see it if they have permissions for that Collection
(expect
  (with-pulse-in-collection [_ collection pulse]
    (binding [api/*current-user-permissions-set* (atom #{(perms/collection-read-path collection)})]
      (mi/can-read? pulse))))

;; Check that if a Pulse is in a Collection, someone who would otherwise be able to see it under the old
;; artifact-permissions regime will *NOT* be able to see it if they don't have permissions for that Collection
(expect
  false
  (with-pulse-in-collection [db _ pulse]
    (binding [api/*current-user-permissions-set* (atom #{(perms/object-path (u/get-id db))})]
      (mi/can-read? pulse))))
