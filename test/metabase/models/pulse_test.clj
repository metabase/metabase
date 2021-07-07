(ns metabase.models.pulse-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.database :refer [Database]]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.pulse :as pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.models.pulse-channel :refer [PulseChannel]]
            [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
            [metabase.models.table :refer [Table]]
            [metabase.test :as mt]
            [metabase.test.mock.util :refer [pulse-channel-defaults]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.util.test :as tt]))

(defn- user-details
  [username]
  (mt/derecordize (dissoc (mt/fetch-user username) :date_joined :last_login)))

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
  [pulse-name creator cards channels skip-if-empty? & [dashboard-id]]
  (-> (pulse/create-pulse! cards channels
        {:name          pulse-name
         :creator_id    (u/the-id creator)
         :skip_if_empty skip-if-empty?
         :dashboard_id dashboard-id})
      remove-uneeded-pulse-keys))

(defn- update-pulse-then-select!
  [pulse]
  (-> (pulse/update-pulse! pulse)
      remove-uneeded-pulse-keys))

(def ^:private pulse-defaults
  {:collection_id       nil
   :collection_position nil
   :dashboard_id        nil
   :skip_if_empty       false
   :archived            false
   :parameters          []})

(deftest retrieve-pulse-test
  (testing "this should cover all the basic Pulse attributes"
    (tt/with-temp* [Pulse        [{pulse-id :id}               {:name "Lodi Dodi"}]
                    PulseChannel [{channel-id :id :as channel} {:pulse_id pulse-id
                                                                :details  {:other  "stuff"
                                                                           :emails ["foo@bar.com"]}}]
                    Card         [{card-id :id}                {:name "Test Card"}]]
      (db/insert! PulseCard, :pulse_id pulse-id, :card_id card-id, :position 0)
      (db/insert! PulseChannelRecipient, :pulse_channel_id channel-id, :user_id (mt/user->id :rasta))
      (is (= (merge
              pulse-defaults
              {:creator_id (mt/user->id :rasta)
               :creator    (user-details :rasta)
               :name       "Lodi Dodi"
               :cards      [{:name               "Test Card"
                             :description        nil
                             :collection_id      nil
                             :display            :table
                             :include_csv        false
                             :include_xls        false
                             :dashboard_card_id  nil
                             :dashboard_id       nil
                             :parameter_mappings nil}]
               :channels   [(merge pulse-channel-defaults
                                   {:schedule_type :daily
                                    :schedule_hour 15
                                    :channel_type  :email
                                    :details       {:other "stuff"}
                                    :recipients    [{:email "foo@bar.com"}
                                                    (dissoc (user-details :rasta) :is_superuser :is_qbnewb)]})]})
             (-> (dissoc (pulse/retrieve-pulse pulse-id) :id :pulse_id :created_at :updated_at)
                 (update :creator  dissoc :date_joined :last_login)
                 (update :cards    (fn [cards] (for [card cards]
                                                 (dissoc card :id))))
                 (update :channels (fn [channels] (for [channel channels]
                                                    (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                                                        (m/dissoc-in [:details :emails])))))
                 mt/derecordize))))))

(deftest update-notification-cards!-test
  (mt/with-temp* [Pulse [pulse]
                  Card  [card-1 {:name "card1"}]
                  Card  [card-2 {:name "card2"}]
                  Card  [card-3 {:name "card3"}]]
    (letfn [(update-cards! [card-nums]
              (let [cards (for [card-num card-nums]
                            (case card-num
                              1 card-1
                              2 card-2
                              3 card-3))]
                (pulse/update-notification-cards! pulse (map pulse/card->ref cards)))
              (when-let [card-ids (seq (db/select-field :card_id PulseCard, :pulse_id (u/the-id pulse)))]
                (db/select-field :name Card, :id [:in card-ids])))]
      (doseq [[cards expected] {[]    nil
                                [1]   #{"card1"}
                                [2]   #{"card2"}
                                [2 1] #{"card1" "card2"}
                                [1 3] #{"card3" "card1"}}]
        (testing (format "Cards %s" cards)
          (is (= expected
                 (update-cards! cards))))))))

;; update-notification-channels!
(deftest update-notification-channels-test
  (mt/with-temp Pulse [{:keys [id]}]
    (pulse/update-notification-channels! {:id id} [{:enabled       true
                                                    :channel_type  :email
                                                    :schedule_type :daily
                                                    :schedule_hour 4
                                                    :recipients    [{:email "foo@bar.com"} {:id (mt/user->id :rasta)}]}])
    (is (= (merge pulse-channel-defaults
                  {:channel_type  :email
                   :schedule_type :daily
                   :schedule_hour 4
                   :recipients    [{:email "foo@bar.com"}
                                   (dissoc (user-details :rasta) :is_superuser :is_qbnewb)]})
           (-> (PulseChannel :pulse_id id)
               (hydrate :recipients)
               (dissoc :id :pulse_id :created_at :updated_at)
               (m/dissoc-in [:details :emails])
               mt/derecordize)))))

;; create-pulse!
;; simple example with a single card
(deftest create-pulse-test
  (mt/with-temp Card [card {:name "Test Card"}]
    (mt/with-model-cleanup [Pulse]
      (is (= (merge
              pulse-defaults
              {:creator_id (mt/user->id :rasta)
               :name       "Booyah!"
               :channels   [(merge pulse-channel-defaults
                                   {:schedule_type :daily
                                    :schedule_hour 18
                                    :channel_type  :email
                                    :recipients    [{:email "foo@bar.com"}]})]
               :cards      [{:name               "Test Card"
                             :description        nil
                             :collection_id      nil
                             :display            :table
                             :include_csv        false
                             :include_xls        false
                             :dashboard_card_id  nil
                             :dashboard_id       nil
                             :parameter_mappings nil}]})
             (mt/derecordize
              (create-pulse-then-select!
               "Booyah!"
               (mt/user->id :rasta)
               [(pulse/card->ref card)]
               [{:channel_type  :email
                 :schedule_type :daily
                 :schedule_hour 18
                 :enabled       true
                 :recipients    [{:email "foo@bar.com"}]}]
               false)))))))

(deftest create-dashboard-subscription-test
  (testing "Make sure that the dashboard_id is set correctly when creating a Dashboard Subscription pulse"
    (mt/with-model-cleanup [Pulse]
      (mt/with-temp* [Dashboard     [{dashboard-id :id}]
                      Card          [{card-id :id, :as card}]
                      DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]]
        (is (schema= {:name         (s/eq "Abnormal Pulse")
                      :dashboard_id (s/eq dashboard-id)
                      :cards        [(s/one {:dashboard_id      (s/eq dashboard-id)
                                             :dashboard_card_id (s/eq dashcard-id)
                                             s/Keyword          s/Any}
                                            "pulse card")]
                      s/Keyword     s/Any}
                     (create-pulse-then-select!
                      "Abnormal Pulse"
                      (mt/user->id :rasta)
                      [(assoc (pulse/card->ref card) :dashboard_card_id dashcard-id)]
                      [{:channel_type  :email
                        :schedule_type :daily
                        :schedule_hour 18
                        :enabled       true
                        :recipients    [{:email "foo@bar.com"}]}]
                      false
                      dashboard-id)))))))

;; update-pulse!
;; basic update.  we are testing several things here
;;  1. ability to update the Pulse name
;;  2. creator_id cannot be changed
;;  3. ability to save raw email addresses
;;  4. ability to save individual user recipients
;;  5. ability to create new channels
;;  6. ability to update cards and ensure proper ordering
(deftest update-pulse-test
  (mt/with-temp* [Pulse [pulse]
                  Card  [card-1 {:name "Test Card"}]
                  Card  [card-2 {:name "Bar Card", :display :bar}]]
    (is (= (merge pulse-defaults
                  {:creator_id (mt/user->id :rasta)
                   :name       "We like to party"
                   :cards      [{:name               "Bar Card"
                                 :description        nil
                                 :collection_id      nil
                                 :display            :bar
                                 :include_csv        false
                                 :include_xls        false
                                 :dashboard_card_id  nil
                                 :dashboard_id       nil
                                 :parameter_mappings nil}
                                {:name               "Test Card"
                                 :description        nil
                                 :collection_id      nil
                                 :display            :table
                                 :include_csv        false
                                 :include_xls        false
                                 :dashboard_card_id  nil
                                 :dashboard_id       nil
                                 :parameter_mappings nil}]
                   :channels   [(merge pulse-channel-defaults
                                       {:schedule_type :daily
                                        :schedule_hour 18
                                        :channel_type  :email
                                        :recipients    [{:email "foo@bar.com"}
                                                        (dissoc (user-details :crowberto) :is_superuser :is_qbnewb)]})]})
           (mt/derecordize
            (update-pulse-then-select! {:id            (u/the-id pulse)
                                        :name          "We like to party"
                                        :cards         (map pulse/card->ref [card-2 card-1])
                                        :channels      [{:channel_type  :email
                                                         :schedule_type :daily
                                                         :schedule_hour 18
                                                         :enabled       true
                                                         :recipients    [{:email "foo@bar.com"}
                                                                         {:id (mt/user->id :crowberto)}]}]
                                        :skip_if_empty false}))))))

(deftest no-archived-cards-test
  (testing "make sure fetching a Pulse doesn't return any archived cards"
    (mt/with-temp* [Pulse     [pulse]
                    Card      [card-1 {:archived true}]
                    Card      [card-2]
                    PulseCard [_ {:pulse_id (u/the-id pulse), :card_id (u/the-id card-1), :position 0}]
                    PulseCard [_ {:pulse_id (u/the-id pulse), :card_id (u/the-id card-2), :position 1}]]
      (is (= 1
             (count (:cards (pulse/retrieve-pulse (u/the-id pulse)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-pulse-in-collection [f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [collection]
                    Pulse      [pulse {:collection_id (u/the-id collection)}]
                    Database   [db    {:engine :h2}]
                    Table      [table {:db_id (u/the-id db)}]
                    Card       [card  {:dataset_query {:database (u/the-id db)
                                                       :type     :query
                                                       :query    {:source-table (u/the-id table)}}}]
                    PulseCard  [_ {:pulse_id (u/the-id pulse), :card_id (u/the-id card)}]]
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
(deftest has-permissions-test
  (is (with-pulse-in-collection [_ collection pulse]
        (binding [api/*current-user-permissions-set* (atom #{(perms/collection-read-path collection)})]
          (mi/can-read? pulse)))))

;; Check that if a Pulse is in a Collection, someone who would otherwise be able to see it under the old
;; artifact-permissions regime will *NOT* be able to see it if they don't have permissions for that Collection
(deftest no-permissions-test
  (is (= false
         (with-pulse-in-collection [db _ pulse]
           (binding [api/*current-user-permissions-set* (atom #{(perms/object-path (u/the-id db))})]
             (mi/can-read? pulse))))))

(deftest validate-collection-namespace-test
  (mt/with-temp Collection [{collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Pulse in a non-normal Collection"
      (let [pulse-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Pulse can only go in Collections in the \"default\" namespace"
               (db/insert! Pulse (assoc (tt/with-temp-defaults Pulse) :collection_id collection-id, :name pulse-name))))
          (finally
            (db/delete! Pulse :name pulse-name)))))

    (testing "Shouldn't be able to move a Pulse to a non-normal Collection"
      (mt/with-temp Pulse [{card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Pulse can only go in Collections in the \"default\" namespace"
             (db/update! Pulse card-id {:collection_id collection-id})))))))
