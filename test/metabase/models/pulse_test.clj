(ns metabase.models.pulse-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models
    :refer [Card Collection Dashboard DashboardCard Database Pulse PulseCard
            PulseChannel PulseChannelRecipient Table User]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.pulse :as pulse]
   [metabase.models.pulse-channel-test :as pulse-channel-test]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.mock.util :refer [pulse-channel-defaults]]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(defn- user-details
  [username]
  (mt/derecordize (dissoc (mt/fetch-user username) :date_joined :last_login)))

(defn- remove-uneeded-pulse-keys [pulse]
  (-> pulse
      (dissoc :id :creator :created_at :updated_at)
      (update :entity_id boolean)
      (update :cards (fn [cards]
                       (for [card cards]
                         (dissoc card :id))))
      (update :channels (fn [channels]
                          (for [channel channels]
                            (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                                (update :entity_id boolean)
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
    (t2.with-temp/with-temp [Pulse        {pulse-id :id}   {:name "Lodi Dodi"}
                             PulseChannel {channel-id :id} {:pulse_id pulse-id
                                                            :details  {:other  "stuff"
                                                                       :emails ["foo@bar.com"]}}
                             Card         {card-id :id}    {:name "Test Card"}]
      (t2/insert! PulseCard, :pulse_id pulse-id, :card_id card-id, :position 0)
      (t2/insert! PulseChannelRecipient, :pulse_channel_id channel-id, :user_id (mt/user->id :rasta))
      (is (= (merge
              pulse-defaults
              {:creator_id (mt/user->id :rasta)
               :creator    (user-details :rasta)
               :name       "Lodi Dodi"
               :entity_id  true
               :cards      [{:name               "Test Card"
                             :description        nil
                             :collection_id      nil
                             :display            :table
                             :include_csv        false
                             :include_xls        false
                             :format_rows        true
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
                 (update :entity_id boolean)
                 (update :cards    (fn [cards] (for [card cards]
                                                 (dissoc card :id))))
                 (update :channels (fn [channels] (for [channel channels]
                                                    (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                                                        (update :entity_id boolean)
                                                        (m/dissoc-in [:details :emails])))))
                 mt/derecordize))))))

(deftest update-notification-cards!-test
  (mt/with-temp [Pulse pulse {}
                 Card  card-1 {:name "card1"}
                 Card  card-2 {:name "card2"}
                 Card  card-3 {:name "card3"}]
    (letfn [(update-cards! [card-nums]
              (let [cards (for [card-num card-nums]
                            (case (int card-num)
                              1 card-1
                              2 card-2
                              3 card-3))]
                (pulse/update-notification-cards! pulse (map pulse/card->ref cards)))
              (when-let [card-ids (seq (t2/select-fn-set :card_id PulseCard, :pulse_id (u/the-id pulse)))]
                (t2/select-fn-set :name Card, :id [:in card-ids])))]
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
  (t2.with-temp/with-temp [Pulse {:keys [id]}]
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
           (-> (t2/select-one PulseChannel :pulse_id id)
               (t2/hydrate :recipients)
               (dissoc :id :pulse_id :created_at :updated_at)
               (update :entity_id boolean)
               (m/dissoc-in [:details :emails])
               mt/derecordize)))))

;; create-pulse!
;; simple example with a single card
(deftest create-pulse-test
  (t2.with-temp/with-temp [Card card {:name "Test Card"}]
    (mt/with-model-cleanup [Pulse]
      (is (= (merge
              pulse-defaults
              {:creator_id (mt/user->id :rasta)
               :name       "Booyah!"
               :entity_id  true
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
                             :format_rows        true
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

(deftest create-pulse-event-test
  (testing "Creating pulse also logs event."
    (t2.with-temp/with-temp [Card card {:name "Test Card"}]
      (mt/with-model-cleanup [Pulse]
        (mt/with-premium-features #{:audit-app}
          (let [pulse (pulse/create-pulse! [(pulse/card->ref card)]
                                           [{:channel_type  :email
                                             :schedule_type :daily
                                             :schedule_hour 18
                                             :enabled       true
                                             :recipients    [{:email "foo@bar.com"}]}]
                                           {:name          "pulse-name"
                                            :creator_id    (mt/user->id :rasta)
                                            :skip_if_empty false})]
            (is (= {:topic    :subscription-create
                    :user_id  nil
                    :model    "Pulse"
                    :model_id (u/the-id pulse)
                    :details  {:archived     false
                               :name         "pulse-name",
                               :dashboard_id nil,
                               :parameters   [],
                               :channel      ["email"],
                               :schedule     ["daily"],
                               :recipients   [[{:email "foo@bar.com"}]]}}
                   (mt/latest-audit-log-entry :subscription-create (u/the-id pulse))))))))))

(deftest create-dashboard-subscription-test
  (testing "Make sure that the dashboard_id is set correctly when creating a Dashboard Subscription pulse"
    (mt/with-model-cleanup [Pulse]
      (mt/with-temp [Collection    {collection-id :id} {}
                     Dashboard     {dashboard-id :id} {:collection_id collection-id}
                     Card          {card-id :id :as card} {}
                     DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id :card_id card-id}]
        (is (=? {:name          "Abnormal Pulse"
                 :dashboard_id  dashboard-id
                 :collection_id collection-id
                 :cards         [{:dashboard_id      dashboard-id
                                  :dashboard_card_id dashcard-id}]}
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
;;  7. subscription-update event is called
(deftest update-pulse-test
  (mt/with-premium-features #{:audit-app}
    (t2.with-temp/with-temp [Pulse pulse  {}
                             Card  card-1 {:name "Test Card"}
                             Card  card-2 {:name "Bar Card" :display :bar}]
      (is (= (merge pulse-defaults
                    {:creator_id (mt/user->id :rasta)
                     :name       "We like to party"
                     :entity_id  true
                     :cards      [{:name               "Bar Card"
                                   :description        nil
                                   :collection_id      nil
                                   :display            :bar
                                   :include_csv        false
                                   :include_xls        false
                                   :format_rows        true
                                   :dashboard_card_id  nil
                                   :dashboard_id       nil
                                   :parameter_mappings nil}
                                  {:name               "Test Card"
                                   :description        nil
                                   :collection_id      nil
                                   :display            :table
                                   :include_csv        false
                                   :include_xls        false
                                   :format_rows        true
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
                                          :skip_if_empty false}))))
      (is (= {:topic    :subscription-update
              :user_id  nil
              :model    "Pulse"
              :model_id (u/the-id pulse)
              :details  {:archived     false
                         :name         "We like to party",
                         :dashboard_id nil,
                         :parameters   [],
                         :channel      ["email"],
                         :schedule     ["daily"],
                         :recipients   [[{:email       "foo@bar.com"}
                                         {:first_name  "Crowberto"
                                          :last_name   "Corv"
                                          :email       "crowberto@metabase.com"
                                          :common_name "Crowberto Corv"
                                          :id          (mt/user->id :crowberto)}]]}}
             (mt/latest-audit-log-entry :subscription-update (u/the-id pulse)))))))

(deftest dashboard-subscription-update-test
  (testing "collection_id and dashboard_id of a dashboard subscription cannot be directly modified"
      (mt/with-temp [Collection {collection-id :id} {}
                     Dashboard  {dashboard-id :id} {}
                     Pulse      {pulse-id :id} {:dashboard_id dashboard-id :collection_id collection-id}]
        (is (thrown-with-msg? Exception #"collection ID of a dashboard subscription cannot be directly modified"
              (t2/update! Pulse pulse-id {:collection_id (inc collection-id)})))
        (is (thrown-with-msg? Exception #"dashboard ID of a dashboard subscription cannot be modified"
              (t2/update! Pulse pulse-id {:dashboard_id (inc dashboard-id)}))))))

(deftest no-archived-cards-test
  (testing "make sure fetching a Pulse doesn't return any archived cards"
    (mt/with-temp [Pulse     pulse {}
                   Card      card-1 {:archived true}
                   Card      card-2 {}
                   PulseCard _ {:pulse_id (u/the-id pulse) :card_id (u/the-id card-1) :position 0}
                   PulseCard _ {:pulse_id (u/the-id pulse) :card_id (u/the-id card-2) :position 1}]
      (is (= 1
             (count (:cards (pulse/retrieve-pulse (u/the-id pulse)))))))))

(deftest archive-pulse-when-last-user-unsubscribes-test
  (letfn [(do-with-objects [f]
            (mt/with-temp [User                  {user-id :id} {}
                           Pulse                 {pulse-id :id} {}
                           PulseChannel          {pulse-channel-id :id} {:pulse_id pulse-id}
                           PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id :user_id user-id}]
              (f {:user-id          user-id
                  :pulse-id         pulse-id
                  :pulse-channel-id pulse-channel-id
                  :archived?        (fn []
                                      (t2/select-one-fn :archived Pulse :id pulse-id))})))]
    (testing "automatically archive a Pulse when the last user unsubscribes"
      (testing "one subscriber"
        (do-with-objects
         (fn [{:keys [archived? user-id]}]
           (testing "make the User inactive"
             (is (pos? (t2/update! User user-id {:is_active false}))))
           (testing "Pulse should be archived"
             (is (archived?))))))
      (testing "multiple subscribers"
        (do-with-objects
         (fn [{:keys [archived? user-id pulse-channel-id]}]
           ;; create a second user + subscription so we can verify that we don't archive the Pulse if a User unsubscribes
           ;; but there is still another subscription.
           (mt/with-temp [User                  {user-2-id :id} {}
                          PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id :user_id user-2-id}]
             (is (not (archived?)))
             (testing "User 1 becomes inactive: Pulse should not be archived yet (because User 2 is still a recipient)"
               (is (pos? (t2/update! User user-id {:is_active false})))
               (is (not (archived?))))
             (testing "User 2 becomes inactive: Pulse should now be archived because it has no more recipients"
               (is (t2/update! User user-2-id {:is_active false}))
               (is (archived?))
               (testing "PulseChannel & PulseChannelRecipient rows should have been archived as well."
                 (is (not (t2/exists? PulseChannel :id pulse-channel-id)))
                 (is (not (t2/exists? PulseChannelRecipient :pulse_channel_id pulse-channel-id))))))))))
    (testing "Don't archive Pulse if it has still has recipients after deleting User subscription\n"
      (testing "another User subscription exists on a DIFFERENT channel\n"
        (do-with-objects
         (fn [{:keys [archived? user-id pulse-id]}]
           (mt/with-temp [User                  {user-2-id :id} {}
                          PulseChannel          {channel-2-id :id} {:pulse_id pulse-id}
                          PulseChannelRecipient _ {:pulse_channel_id channel-2-id :user_id user-2-id}]
             (testing "make User 1 inactive"
               (is (t2/update! User user-id {:is_active false})))
             (testing "Pulse should not be archived"
               (is (not (archived?))))))))
      (testing "still sent to a Slack channel"
        (do-with-objects
         (fn [{:keys [archived? user-id pulse-id]}]
           (t2.with-temp/with-temp [PulseChannel _ {:channel_type "slack"
                                                    :details      {:channel "#general"}
                                                    :pulse_id     pulse-id}]
             (testing "make the User inactive"
               (is (pos? (t2/update! User user-id {:is_active false}))))
             (testing "Pulse should not be archived"
               (is (not (archived?))))))))
      (testing "still sent to email addresses\n"
        (testing "emails on the same channel as deleted User\n"
          (do-with-objects
           (fn [{:keys [archived? user-id pulse-channel-id]}]
             (t2/update! PulseChannel pulse-channel-id {:details {:emails ["foo@bar.com"]}})
             (testing "make the User inactive"
               (is (pos? (t2/update! User user-id {:is_active false}))))
             (testing "Pulse should not be archived"
               (is (not (archived?)))))))
        (testing "emails on a different channel\n"
          (do-with-objects
           (fn [{:keys [archived? user-id pulse-id]}]
             (t2.with-temp/with-temp [PulseChannel _ {:channel_type "email"
                                                      :details      {:emails ["foo@bar.com"]}
                                                      :pulse_id     pulse-id}]
               (testing "make the User inactive"
                 (is (pos? (t2/update! User user-id {:is_active false}))))
               (testing "Pulse should not be archived"
                 (is (not (archived?))))))))))))

(deftest archive-pulse-will-disable-pulse-channels-test
  (pulse-channel-test/with-send-pulse-setup!
    (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                   :model/PulseChannel {pc-id :id}    (merge {:pulse_id       pulse-id
                                                              :channel_type   :email}
                                                             pulse-channel-test/daily-at-6pm)]
      (is (= #{(pulse-channel-test/pulse->trigger-info pulse-id pulse-channel-test/daily-at-6pm [pc-id])}
             (pulse-channel-test/send-pulse-triggers pulse-id)))

      (testing "archived pulse will disable pulse channels and remove triggers"
        (t2/update! :model/Pulse pulse-id {:archived true})
        (is (false? (t2/select-one-fn :enabled :model/PulseChannel pc-id)))
        (is (empty? (pulse-channel-test/send-pulse-triggers pulse-id))))

      (testing "re-enabled pulse will re-enable pulse channels and add triggers"
        (t2/update! :model/Pulse pulse-id {:archived false})
        (is (true? (t2/select-one-fn :enabled :model/PulseChannel pc-id)))
        (is (= #{(pulse-channel-test/pulse->trigger-info pulse-id pulse-channel-test/daily-at-6pm [pc-id])}
               (pulse-channel-test/send-pulse-triggers pulse-id))))

      (testing "delete pulse will remove pulse channels and triggers"
        (t2/delete! :model/Pulse pulse-id)
        (is (false? (t2/exists? :model/PulseChannel pc-id)))
        (is (empty? (pulse-channel-test/send-pulse-triggers pulse-id)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Pulse Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-pulse-in-collection [f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [Collection collection {}
                   Pulse      pulse {:collection_id (u/the-id collection)}
                   Database   db    {:engine :h2}
                   Table      table {:db_id (u/the-id db)}
                   Card       card  {:dataset_query {:database (u/the-id db)
                                                     :type     :query
                                                     :query    {:source-table (u/the-id table)}}}
                   PulseCard  _ {:pulse_id (u/the-id pulse) :card_id (u/the-id card)}]
      (f db collection pulse card))))

(defmacro with-pulse-in-collection
  "Execute `body` with a temporary Pulse, in a Collection, containing a single Card."
  {:style/indent :defn}
  [[db-binding collection-binding pulse-binding card-binding] & body]
  `(do-with-pulse-in-collection
    (fn [~(or db-binding '_) ~(or collection-binding '_) ~(or pulse-binding '_) ~(or card-binding '_)]
      ~@body)))

(deftest validate-collection-namespace-test
  (t2.with-temp/with-temp [Collection {collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Pulse in a non-normal Collection"
      (let [pulse-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Pulse can only go in Collections in the \"default\" or :analytics namespace."
               (t2/insert! Pulse (assoc (t2.with-temp/with-temp-defaults Pulse) :collection_id collection-id, :name pulse-name))))
          (finally
            (t2/delete! Pulse :name pulse-name)))))

    (testing "Shouldn't be able to move a Pulse to a non-normal Collection"
      (t2.with-temp/with-temp [Pulse {card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Pulse can only go in Collections in the \"default\" or :analytics namespace."
             (t2/update! Pulse card-id {:collection_id collection-id})))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                         Dashboard Subscription Collections Permissions Tests                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- do-with-dashboard-subscription-in-collection [f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [Collection collection {}
                   Dashboard  dashboard {:collection_id (u/the-id collection)}
                   Pulse      pulse     {:collection_id (u/the-id collection)
                                         :dashboard_id  (u/the-id dashboard)
                                         :creator_id    (mt/user->id :rasta)}
                   Database   db        {:engine :h2}]
      (f db collection dashboard pulse))))

(defmacro with-dashboard-subscription-in-collection
  "Execute `body` with a temporary Dashboard Subscription created by :rasta (a non-admin) for a Dashboard in a Collection"
  {:style/indent 1}
  [[db-binding collection-binding dashboard-binding subscription-binding] & body]
  `(do-with-dashboard-subscription-in-collection
    (fn [~(or db-binding '_) ~(or collection-binding '_) ~(or dashboard-binding '_) ~(or subscription-binding '_)]
      ~@body)))

(deftest dashboard-subscription-permissions-test
  (with-dashboard-subscription-in-collection [_ collection dashboard subscription]
    (testing "An admin has read and write access to any dashboard subscription"
      (binding [api/*is-superuser?* true]
        (is (mi/can-read? subscription))
        (is (mi/can-write? subscription))))

    (mt/with-current-user (mt/user->id :rasta)
      (binding [api/*current-user-permissions-set* (delay #{(perms/collection-read-path collection)})]
        (testing "A non-admin has read and write access to a subscription they created"
            (is (mi/can-read? subscription))
            (is (mi/can-write? subscription)))

        (testing "A non-admin has read-only access to a subscription they are a recipient of"
          ;; Create a new Dashboard Subscription with an admin creator but non-admin recipient
          (mt/with-temp [Pulse                subscription            {:collection_id (u/the-id collection)
                                                                       :dashboard_id  (u/the-id dashboard)
                                                                       :creator_id    (mt/user->id :crowberto)}
                         PulseChannel          {pulse-channel-id :id} {:pulse_id (u/the-id subscription)}
                         PulseChannelRecipient _                      {:pulse_channel_id pulse-channel-id
                                                                       :user_id (mt/user->id :rasta)}]
            (is (mi/can-read? subscription))
            (is (not (mi/can-write? subscription)))))

       (testing "A non-admin doesn't have read or write access to a subscription they aren't a creator or recipient of"
         (mt/with-temp [Pulse subscription {:collection_id (u/the-id collection)
                                            :dashboard_id  (u/the-id dashboard)
                                            :creator_id    (mt/user->id :crowberto)}]
            (is (not (mi/can-read? subscription)))
            (is (not (mi/can-write? subscription)))))))))

(deftest identity-hash-test
  (testing "Pulse hashes are composed of the name and the collection hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp [Collection  coll  {:name "field-db" :location "/" :created_at now}
                     Pulse       pulse {:name "my pulse" :collection_id (:id coll) :created_at now}]
        (is (= "82553101"
               (serdes/raw-hash ["my pulse" (serdes/identity-hash coll) now])
               (serdes/identity-hash pulse)))))))
