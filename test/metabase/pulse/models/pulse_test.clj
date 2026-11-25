(ns metabase.pulse.models.pulse-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-channel :as pulse-channel]
   [metabase.pulse.models.pulse-channel-test :as pulse-channel-test]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.pulse.task.send-pulses :as task.send-pulses]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.mock.util :refer [pulse-channel-defaults]]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- user-details
  [username]
  (mt/derecordize (dissoc (mt/fetch-user username) :date_joined :last_login :tenant_id)))

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
  (-> (models.pulse/create-pulses! [{:name          pulse-name
                                     :creator_id    (u/the-id creator)
                                     :skip_if_empty skip-if-empty?
                                     :dashboard_id  dashboard-id
                                     :cards         cards
                                     :channels      channels}])
      first
      remove-uneeded-pulse-keys))

(defn- update-pulse-then-select!
  [pulse]
  (models.pulse/update-pulse! (:id pulse) (dissoc pulse :id))
  (-> (models.pulse/retrieve-pulse (:id pulse))
      remove-uneeded-pulse-keys))

(def ^:private pulse-defaults
  {:collection_id       nil
   :collection_position nil
   :dashboard_id        nil
   :skip_if_empty       false
   :archived            false
   :archived_directly   false
   :parameters          []
   :disable_links       false})

(deftest retrieve-pulse-test
  (testing "this should cover all the basic Pulse attributes"
    (mt/with-temp [:model/Pulse        {pulse-id :id}   {:name "Lodi Dodi"}
                   :model/PulseChannel {channel-id :id} {:pulse_id pulse-id
                                                         :details  {:emails ["user@example.com"]}}
                   :model/Card         {card-id :id}    {:name "Test Card"}]
      (t2/insert! :model/PulseCard, :pulse_id pulse-id, :card_id card-id, :position 0)
      (t2/insert! :model/PulseChannelRecipient, :pulse_channel_id channel-id, :user_id (mt/user->id :rasta))
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
                             :pivot_results      false
                             :dashboard_card_id  nil
                             :dashboard_id       nil
                             :parameter_mappings nil}]
               :channels   [(merge pulse-channel-defaults
                                   {:schedule_type :daily
                                    :schedule_hour 15
                                    :channel_type  :email
                                    :recipients    [{:email "user@example.com"}
                                                    (dissoc (user-details :rasta) :is_superuser :is_qbnewb :is_data_analyst)]})]})
             (-> (dissoc (models.pulse/retrieve-pulse pulse-id) :id :pulse_id :created_at :updated_at)
                 (update :creator  dissoc :date_joined :last_login :tenant_id)
                 (update :entity_id boolean)
                 (update :cards    (fn [cards] (for [card cards]
                                                 (dissoc card :id))))
                 (update :channels (fn [channels] (for [channel channels]
                                                    (-> (dissoc channel :id :pulse_id :created_at :updated_at)
                                                        (update :entity_id boolean)
                                                        (m/dissoc-in [:details :emails])))))
                 mt/derecordize))))))

(deftest update-pulse-cards-test
  (mt/with-temp [:model/Pulse pulse {}
                 :model/Card  card-1 {:name "card1"}
                 :model/Card  card-2 {:name "card2"}
                 :model/Card  card-3 {:name "card3"}]
    (letfn [(update-cards! [card-nums]
              (let [cards (for [card-num card-nums]
                            (case (int card-num)
                              1 card-1
                              2 card-2
                              3 card-3))]
                (models.pulse/update-pulse! (u/the-id pulse) {:cards (mapv models.pulse/card->ref cards)}))
              (when-let [card-ids (seq (t2/select-fn-set :card_id :model/PulseCard, :pulse_id (u/the-id pulse)))]
                (t2/select-fn-set :name :model/Card, :id [:in card-ids])))]
      (doseq [[cards expected] {[]    nil
                                [1]   #{"card1"}
                                [2]   #{"card2"}
                                [2 1] #{"card1" "card2"}
                                [1 3] #{"card3" "card1"}}]
        (testing (format "Cards %s" cards)
          (is (= expected
                 (update-cards! cards))))))))

;; simple example with a single card
(deftest create-pulse-test
  (mt/with-temp [:model/Card card {:name "Test Card"}]
    (mt/with-model-cleanup [:model/Pulse]
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
                             :pivot_results      false
                             :dashboard_card_id  nil
                             :dashboard_id       nil
                             :parameter_mappings nil}]})
             (mt/derecordize
              (create-pulse-then-select!
               "Booyah!"
               (mt/user->id :rasta)
               [(models.pulse/card->ref card)]
               [{:channel_type  :email
                 :schedule_type :daily
                 :schedule_hour 18
                 :enabled       true
                 :recipients    [{:email "foo@bar.com"}]}]
               false)))))))

(deftest create-pulse-event-test
  (testing "Creating pulse also logs event."
    (mt/with-temp [:model/Card card {:name "Test Card"}]
      (mt/with-model-cleanup [:model/Pulse]
        (mt/with-premium-features #{:audit-app}
          (let [pulse (mt/with-current-user (mt/user->id :rasta)
                        (first (models.pulse/create-pulses! [{:name          "pulse-name"
                                                              :creator_id    (mt/user->id :rasta)
                                                              :skip_if_empty false
                                                              :cards         [(models.pulse/card->ref card)]
                                                              :channels      [{:channel_type  :email
                                                                               :schedule_type :daily
                                                                               :schedule_hour 18
                                                                               :enabled       true
                                                                               :recipients    [{:email "foo@bar.com"}]}]}])))]
            (is (= {:topic    :pulse-create
                    :user_id  (mt/user->id :rasta)
                    :model    "Pulse"
                    :model_id (u/the-id pulse)
                    :details  {:archived     false
                               :name         "pulse-name",
                               :dashboard_id nil,
                               :parameters   [],
                               :channel      ["email"],
                               :schedule     ["daily"],
                               :recipients   [[{:email "foo@bar.com"}]]}}
                   (mt/latest-audit-log-entry :pulse-create (u/the-id pulse))))))))))

(deftest create-dashboard-subscription-test
  (testing "Make sure that the dashboard_id is set correctly when creating a Dashboard Subscription pulse"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-temp [:model/Collection    {collection-id :id} {}
                     :model/Dashboard     {dashboard-id :id} {:collection_id collection-id}
                     :model/Card          {card-id :id :as card} {}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id :card_id card-id}]
        (is (=? {:name          "Abnormal Pulse"
                 :dashboard_id  dashboard-id
                 :collection_id collection-id
                 :cards         [{:dashboard_id      dashboard-id
                                  :dashboard_card_id dashcard-id}]}
                (create-pulse-then-select!
                 "Abnormal Pulse"
                 (mt/user->id :rasta)
                 [(assoc (models.pulse/card->ref card) :dashboard_card_id dashcard-id)]
                 [{:channel_type  :email
                   :schedule_type :daily
                   :schedule_hour 18
                   :enabled       true
                   :recipients    [{:email "foo@bar.com"}]}]
                 false
                 dashboard-id)))))))

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
    (mt/with-temp [:model/Pulse pulse  {}
                   :model/Card  card-1 {:name "Test Card"}
                   :model/Card  card-2 {:name "Bar Card" :display :bar}]
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
                                   :pivot_results      false
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
                                   :pivot_results      false
                                   :dashboard_card_id  nil
                                   :dashboard_id       nil
                                   :parameter_mappings nil}]
                     :channels   [(merge pulse-channel-defaults
                                         {:schedule_type :daily
                                          :schedule_hour 18
                                          :channel_type  :email
                                          :recipients    [{:email "foo@bar.com"}
                                                          (dissoc (user-details :crowberto) :is_superuser :is_qbnewb :tenant_id :is_data_analyst)]})]})
             (mt/derecordize
              (mt/with-current-user (mt/user->id :rasta)
                (update-pulse-then-select! {:id            (u/the-id pulse)
                                            :name          "We like to party"
                                            :cards         (map models.pulse/card->ref [card-2 card-1])
                                            :channels      [{:channel_type  :email
                                                             :schedule_type :daily
                                                             :schedule_hour 18
                                                             :enabled       true
                                                             :recipients    [{:email "foo@bar.com"}
                                                                             {:id (mt/user->id :crowberto)}]}]
                                            :skip_if_empty false})))))
      (is (= {:topic    :subscription-update
              :user_id  (mt/user->id :rasta)
              :model    "Pulse"
              :model_id (u/the-id pulse)
              :details  {:previous   {:name (:name pulse)}
                         :new        {:name "We like to party"}
                         :channel    ["email"]
                         :schedule   ["daily"]
                         :recipients [[{:email "foo@bar.com"}
                                       {:first_name  "Crowberto"
                                        :last_name   "Corv"
                                        :email       "crowberto@metabase.com"
                                        :common_name "Crowberto Corv"
                                        :id          (mt/user->id :crowberto)}]]}}
             (mt/latest-audit-log-entry :subscription-update (u/the-id pulse)))))))

(deftest dashboard-subscription-update-test
  (testing "collection_id and dashboard_id of a dashboard subscription cannot be directly modified"
    (mt/with-temp [:model/Collection {collection-id :id} {}
                   :model/Dashboard  {dashboard-id :id} {}
                   :model/Pulse      {pulse-id :id} {:dashboard_id dashboard-id :collection_id collection-id}]
      (is (thrown-with-msg? Exception #"collection ID of a dashboard subscription cannot be directly modified"
                            (t2/update! :model/Pulse :id pulse-id {:collection_id (inc collection-id)})))
      (is (thrown-with-msg? Exception #"dashboard ID of a dashboard subscription cannot be modified"
                            (t2/update! :model/Pulse :id pulse-id {:dashboard_id (inc dashboard-id)}))))))

(deftest no-archived-cards-test
  (testing "make sure fetching a Pulse doesn't return any archived cards"
    (mt/with-temp [:model/Pulse     pulse {}
                   :model/Card      card-1 {:archived true}
                   :model/Card      card-2 {}
                   :model/PulseCard _ {:pulse_id (u/the-id pulse) :card_id (u/the-id card-1) :position 0}
                   :model/PulseCard _ {:pulse_id (u/the-id pulse) :card_id (u/the-id card-2) :position 1}]
      (is (= 1
             (count (:cards (models.pulse/retrieve-pulse (u/the-id pulse)))))))))

(deftest archive-pulse-when-last-user-unsubscribes-test
  (letfn [(do-with-objects [f]
            (mt/with-temp [:model/User                  {user-id :id} {}
                           :model/Pulse                 {pulse-id :id} {}
                           :model/PulseChannel          {pulse-channel-id :id} {:pulse_id pulse-id}
                           :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id :user_id user-id}]
              (f {:user-id          user-id
                  :pulse-id         pulse-id
                  :pulse-channel-id pulse-channel-id
                  :archived?        (fn []
                                      (t2/select-one-fn :archived :model/Pulse :id pulse-id))})))]
    (testing "automatically archive a Pulse when the last user unsubscribes"
      (testing "one subscriber"
        (do-with-objects
         (fn [{:keys [archived? user-id]}]
           (testing "make the User inactive"
             (is (nil? (user/update-users! [{:id user-id :is_active false}]))))
           (testing "Pulse should be archived"
             (is (archived?))))))
      (testing "multiple subscribers"
        (do-with-objects
         (fn [{:keys [archived? user-id pulse-channel-id]}]
           ;; create a second user + subscription so we can verify that we don't archive the Pulse if a User unsubscribes
           ;; but there is still another subscription.
           (mt/with-temp [:model/User                  {user-2-id :id} {}
                          :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id :user_id user-2-id}]
             (is (not (archived?)))
             (testing "User 1 becomes inactive: Pulse should not be archived yet (because User 2 is still a recipient)"
               (is (nil? (user/update-users! [{:id user-id :is_active false}])))
               (is (not (archived?))))
             (testing "User 2 becomes inactive: Pulse should now be archived because it has no more recipients"
               (is (nil? (user/update-users! [{:id user-2-id :is_active false}])))
               (is (archived?))
               (testing "PulseChannel & PulseChannelRecipient rows should have been archived as well."
                 (is (not (t2/exists? :model/PulseChannel :id pulse-channel-id)))
                 (is (not (t2/exists? :model/PulseChannelRecipient :pulse_channel_id pulse-channel-id))))))))))
    (testing "Don't archive Pulse if it has still has recipients after deleting User subscription\n"
      (testing "another User subscription exists on a DIFFERENT channel\n"
        (do-with-objects
         (fn [{:keys [archived? user-id pulse-id]}]
           (mt/with-temp [:model/User                  {user-2-id :id} {}
                          :model/PulseChannel          {channel-2-id :id} {:pulse_id pulse-id}
                          :model/PulseChannelRecipient _ {:pulse_channel_id channel-2-id :user_id user-2-id}]
             (testing "make User 1 inactive"
               (is (nil? (user/update-users! [{:id user-id :is_active false}]))))
             (testing "Pulse should not be archived"
               (is (not (archived?))))))))
      (testing "still sent to a Slack channel"
        (do-with-objects
         (fn [{:keys [archived? user-id pulse-id]}]
           (mt/with-temp [:model/PulseChannel _ {:channel_type "slack"
                                                 :details      {:channel "#general"}
                                                 :pulse_id     pulse-id}]
             (testing "make the User inactive"
               (is (nil? (user/update-users! [{:id user-id :is_active false}]))))
             (testing "Pulse should not be archived"
               (is (not (archived?))))))))
      (testing "still sent to email addresses\n"
        (testing "emails on the same channel as deleted User\n"
          (do-with-objects
           (fn [{:keys [archived? user-id pulse-channel-id]}]
             (t2/update! :model/PulseChannel :id pulse-channel-id {:details {:emails ["foo@bar.com"]}})
             (testing "make the User inactive"
               (is (nil? (user/update-users! [{:id user-id :is_active false}]))))
             (testing "Pulse should not be archived"
               (is (not (archived?)))))))
        (testing "emails on a different channel\n"
          (do-with-objects
           (fn [{:keys [archived? user-id pulse-id]}]
             (mt/with-temp [:model/PulseChannel _ {:channel_type "email"
                                                   :details      {:emails ["foo@bar.com"]}
                                                   :pulse_id     pulse-id}]
               (testing "make the User inactive"
                 (is (nil? (user/update-users! [{:id user-id :is_active false}]))))
               (testing "Pulse should not be archived"
                 (is (not (archived?))))))))))))

(deftest archive-pulse-will-disable-pulse-channels-test
  (pulse-channel-test/with-send-pulse-setup!
    (mt/with-temp [:model/Pulse {pulse-id :id} {}]
      (mt/with-model-cleanup [:model/PulseChannel]
        (let [pc-id (:id (first (pulse-channel/create-pulse-channels! [(merge {:pulse_id     pulse-id
                                                                               :channel_type :email
                                                                               :enabled      true}
                                                                              pulse-channel-test/daily-at-6pm)])))]
          (is (= #{(pulse-channel-test/pulse->trigger-info pulse-id pulse-channel-test/daily-at-6pm [pc-id])}
                 (pulse-channel-test/send-pulse-triggers pulse-id)))
          (testing "archived pulse will disable pulse channels and remove triggers"
            (models.pulse/update-pulses! [{:id pulse-id :archived true}])
            (is (false? (t2/select-one-fn :enabled :model/PulseChannel :id pc-id)))
            (is (empty? (pulse-channel-test/send-pulse-triggers pulse-id))))
          (testing "re-enabled pulse will re-enable pulse channels and add triggers"
            (models.pulse/update-pulses! [{:id pulse-id :archived false}])
            (is (true? (t2/select-one-fn :enabled :model/PulseChannel :id pc-id)))
            (is (= #{(pulse-channel-test/pulse->trigger-info pulse-id pulse-channel-test/daily-at-6pm [pc-id])}
                   (pulse-channel-test/send-pulse-triggers pulse-id))))
          (testing "delete pulse will remove pulse channels and triggers"
            (models.pulse/delete-pulses! [pulse-id])
            (is (false? (t2/exists? :model/PulseChannel :id pc-id)))
            (is (empty? (pulse-channel-test/send-pulse-triggers pulse-id)))))))))

(defn- status-code
  "The `:status-code` of the exception `thunk` throws, or nil when it throws none."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(defn- insert-pulse!
  "Create a Pulse named at random with `overrides`, and return its id."
  [overrides]
  (:id (first (models.pulse/create-pulses! [(merge {:name       (mt/random-name)
                                                    :creator_id (mt/user->id :rasta)
                                                    :cards      []
                                                    :channels   []}
                                                   overrides)]))))

(deftest dashboard-subscription-collection-is-derived-on-insert-test
  (mt/with-temp [:model/Collection {collection-id :id}       {}
                 :model/Collection {other-collection-id :id} {}
                 :model/Dashboard  {dashboard-id :id}        {:collection_id collection-id}
                 :model/Dashboard  {other-dashboard-id :id}  {:collection_id other-collection-id}]
    (mt/with-model-cleanup [:model/Pulse]
      (testing "a dashboard subscription goes in the collection of its dashboard, whatever the row names"
        (let [pulse-id (insert-pulse! {:dashboard_id dashboard-id :collection_id other-collection-id})]
          (is (= collection-id (t2/select-one-fn :collection_id :model/Pulse :id pulse-id)))))
      (testing "dashboard subscriptions are filed each with its own dashboard"
        (let [ids [(insert-pulse! {:dashboard_id dashboard-id})
                   (insert-pulse! {:dashboard_id other-dashboard-id})]]
          (is (= [collection-id other-collection-id]
                 (mapv #(t2/select-one-fn :collection_id :model/Pulse :id %) ids)))))
      (testing "a pulse without a dashboard keeps the collection of the row"
        (let [pulse-id (insert-pulse! {:collection_id other-collection-id})]
          (is (= other-collection-id (t2/select-one-fn :collection_id :model/Pulse :id pulse-id))))))))

(deftest ^:parallel dashboard-subscription-schema-test
  (let [row (fn [overrides]
              (merge {:id 1 :dashboard_id 1 :collection_position nil :alert_condition nil
                      :alert_first_only nil :alert_above_goal nil}
                     overrides))]
    (testing "dashboard subscription has none of the columns of an alert, or a collection position"
      (doseq [overrides [{:alert_condition "rows"}
                         {:alert_first_only false}
                         {:alert_above_goal true}
                         {:collection_position 1}]]
        (testing (pr-str overrides)
          (is (= 400 (pulse-channel-test/normalize-status ::pulse.schema/pulse.update (row overrides)))))))
    (testing "columns of an alert and collection position are fine without dashboard"
      (is (nil? (pulse-channel-test/normalize-status
                 ::pulse.schema/pulse.update
                 (row {:dashboard_id nil :alert_condition "rows" :alert_first_only false :collection_position 1})))))
    (testing "body with only some of the columns passes"
      (is (nil? (pulse-channel-test/normalize-status ::pulse.schema/pulse.update
                                                     {:id 1 :dashboard_id 1 :alert_condition "rows"}))))))

(deftest dashboard-subscription-update-shape-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
    (mt/with-model-cleanup [:model/Pulse]
      (testing "update cannot give dashboard subscription the columns of an alert or collection position"
        (let [pulse-id (insert-pulse! {:dashboard_id dashboard-id})]
          (doseq [changes [{:alert_condition "rows"}
                           {:alert_first_only false}
                           {:alert_above_goal true}
                           {:collection_position 1}]]
            (testing (pr-str changes)
              (is (= 400 (status-code #(t2/update! :model/Pulse :id pulse-id changes))))))
          (is (=? {:alert_condition nil :collection_position nil}
                  (t2/select-one :model/Pulse :id pulse-id)))
          (testing "while name goes through"
            (is (= 1 (t2/update! :model/Pulse :id pulse-id {:name "Renamed"})))))))))

(deftest ^:parallel pulse-parameters-schema-test
  (testing "parameters are sequence of maps with id"
    (is (not (mr/validate ::pulse.schema/pulse.update {:id 1 :parameters [{:value 1}]})))
    (is (mr/validate ::pulse.schema/pulse.update {:id 1 :parameters [{:id "abc" :value 1}]}))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Pulse Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-pulse-in-collection! [f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection collection {}
                   :model/Pulse      pulse {:collection_id (u/the-id collection)}
                   :model/Database   db    {:engine :h2}
                   :model/Table      table {:db_id (u/the-id db)}
                   :model/Card       card  {:dataset_query {:database (u/the-id db)
                                                            :type     :query
                                                            :query    {:source-table (u/the-id table)}}}
                   :model/PulseCard  _ {:pulse_id (u/the-id pulse) :card_id (u/the-id card)}]
      (f db collection pulse card))))

(defmacro with-pulse-in-collection!
  "Execute `body` with a temporary Pulse, in a Collection, containing a single Card."
  {:style/indent :defn}
  [[db-binding collection-binding pulse-binding card-binding] & body]
  `(do-with-pulse-in-collection!
    (fn [~(or db-binding '_) ~(or collection-binding '_) ~(or pulse-binding '_) ~(or card-binding '_)]
      ~@body)))

(deftest validate-collection-namespace-test
  (mt/with-temp [:model/Collection {collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Pulse in a non-normal Collection"
      (let [pulse-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Pulse can only go in Collections in the \"default\"(?: or :[a-z\-]+)+ namespace."
               (insert-pulse! {:collection_id collection-id, :name pulse-name})))
          (finally
            (t2/delete! :model/Pulse :name pulse-name)))))
    (testing "Shouldn't be able to move a Pulse to a non-normal Collection"
      (mt/with-temp [:model/Pulse {card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Pulse can only go in Collections in the \"default\"(?: or :[a-z\-]+)+ namespace."
             (models.pulse/update-pulses! [{:id card-id :collection_id collection-id}])))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                         Dashboard Subscription Collections Permissions Tests                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- do-with-dashboard-subscription-in-collection! [f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection collection {}
                   :model/Dashboard  dashboard {:collection_id (u/the-id collection)}
                   :model/Pulse      pulse     {:collection_id (u/the-id collection)
                                                :dashboard_id  (u/the-id dashboard)
                                                :creator_id    (mt/user->id :rasta)}
                   :model/Database   db        {:engine :h2}]
      (f db collection dashboard pulse))))

(defmacro with-dashboard-subscription-in-collection!
  "Execute `body` with a temporary Dashboard Subscription created by :rasta (a non-admin) for a Dashboard in a Collection"
  {:style/indent 1}
  [[db-binding collection-binding dashboard-binding subscription-binding] & body]
  `(do-with-dashboard-subscription-in-collection!
    (fn [~(or db-binding '_) ~(or collection-binding '_) ~(or dashboard-binding '_) ~(or subscription-binding '_)]
      ~@body)))

(deftest dashboard-subscription-permissions-test
  (with-dashboard-subscription-in-collection! [_ collection dashboard subscription]
    (testing "An admin has read and write access to any dashboard subscription"
      (binding [api/*is-superuser?* true]
        (is (mi/can-read? (t2/hydrate subscription :can_read)))
        (is (mi/can-write? (t2/hydrate subscription :can_write)))))
    (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
    (mt/with-current-user (mt/user->id :rasta)
      (testing "A non-admin has read and write access to a subscription they created"
        (is (mi/can-read? (t2/hydrate subscription :can_read)))
        (is (mi/can-write? (t2/hydrate subscription :can_write))))
      (testing "A non-admin has read-only access to a subscription they are a recipient of"
        ;; Create a new Dashboard Subscription with an admin creator but non-admin recipient
        (mt/with-temp [:model/Pulse                subscription            {:collection_id (u/the-id collection)
                                                                            :dashboard_id  (u/the-id dashboard)
                                                                            :creator_id    (mt/user->id :crowberto)}
                       :model/PulseChannel          {pulse-channel-id :id} {:pulse_id (u/the-id subscription)}
                       :model/PulseChannelRecipient _                      {:pulse_channel_id pulse-channel-id
                                                                            :user_id (mt/user->id :rasta)}]
          (is (mi/can-read? (t2/hydrate subscription :can_read)))
          (is (not (mi/can-write? (t2/hydrate subscription :can_write))))))
      (testing "A non-admin doesn't have read or write access to a subscription they aren't a creator or recipient of"
        (mt/with-temp [:model/Pulse subscription {:collection_id (u/the-id collection)
                                                  :dashboard_id  (u/the-id dashboard)
                                                  :creator_id    (mt/user->id :crowberto)}]
          (is (not (mi/can-read? (t2/hydrate subscription :can_read))))
          (is (not (mi/can-write? (t2/hydrate subscription :can_write)))))))))

(deftest update-permissions-test
  (with-dashboard-subscription-in-collection! [_ collection _ subscription]
    (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
    (testing "the creator may update their dashboard subscription"
      (mt/with-current-user (mt/user->id :rasta)
        (is (mi/can-update? (t2/hydrate subscription :can_write) {:name "Renamed"}))))
    (testing "an admin may update any dashboard subscription"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (mi/can-update? (t2/hydrate subscription :can_write) {:name "Renamed"}))))
    (testing "another user may not"
      (mt/with-current-user (mt/user->id :lucky)
        (is (not (mi/can-update? (t2/hydrate subscription :can_write) {:name "Renamed"})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/update-check subscription {:name "Renamed"})))))))

(deftest create-permissions-test
  (when config/ee-available?
    (testing "A user without download permission should not be able to create a pulse with attachments"
      (mt/with-model-cleanup [:model/User]
        (let [[{user-id :id}] (user/create-users! [{:email (mt/random-email)}])]
          (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                         :model/Table {table-id :id} {:db_id db-id}
                         :model/Collection {collection-id :id} {:name "Test Collection"}
                         :model/Card card {:collection_id collection-id
                                           :dataset_query {:database db-id
                                                           :type     :query
                                                           :query    {:source-table table-id}}}
                         :model/PermissionsGroup {group-id :id} {}
                         :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}]
            ;; Grant read access on the card but no download permission
            (mt/with-premium-features #{:advanced-permissions}
              (perms/grant-permissions! group-id (perms/collection-read-path collection-id))
              (perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
              (perms/set-table-permission! group-id table-id :perms/create-queries :query-builder)
              (perms/set-table-permission! group-id table-id :perms/download-results :no)
              (perms/set-table-permission! (perms/all-users-group) table-id :perms/download-results :no)
              (mt/with-current-user user-id
                (testing "should not be able to create a pulse with CSV attachment"
                  (is (false? (mi/can-create? :model/Pulse
                                              {:cards         [(assoc card :include_csv true)]
                                               :dashboard_id  nil
                                               :collection_id nil}))))
                (testing "should not be able to create a pulse with XLS attachment"
                  (is (false? (mi/can-create? :model/Pulse
                                              {:cards         [(assoc card :include_xls true)]
                                               :dashboard_id  nil
                                               :collection_id nil}))))
                (testing "should be able to create a pulse without attachments"
                  (is (true? (mi/can-create? :model/Pulse
                                             {:cards         [card]
                                              :dashboard_id  nil
                                              :collection_id nil}))))))))))
    (testing "A user with download permission should be able to create a pulse with attachments"
      (mt/with-model-cleanup [:model/User]
        (let [[{user-id :id}] (user/create-users! [{:email (mt/random-email)}])]
          (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                         :model/Table {table-id :id} {:db_id db-id}
                         :model/Collection {collection-id :id} {:name "Test Collection"}
                         :model/Card card {:collection_id collection-id
                                           :dataset_query {:database db-id
                                                           :type     :query
                                                           :query    {:source-table table-id}}}
                         :model/PermissionsGroup {group-id :id} {}
                         :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}]
            ;; Grant read and download permissions
            (mt/with-premium-features #{:advanced-permissions}
              (perms/grant-permissions! group-id (perms/collection-read-path collection-id))
              (perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
              (perms/set-table-permission! group-id table-id :perms/create-queries :query-builder)
              (perms/set-table-permission! group-id table-id :perms/download-results :one-million-rows)
              (mt/with-current-user user-id
                (testing "should be able to create a pulse with CSV attachment"
                  (is (true? (mi/can-create? :model/Pulse
                                             {:cards         [(assoc card :include_csv true)]
                                              :dashboard_id  nil
                                              :collection_id nil}))))
                (testing "should be able to create a pulse with XLS attachment"
                  (is (true? (mi/can-create? :model/Pulse
                                             {:cards         [(assoc card :include_xls true)]
                                              :dashboard_id  nil
                                              :collection_id nil}))))))))))))

(deftest maybe-filter-pulses-recipients-cross-tenant-test
  ;; Tenants are enterprise-only: :model/Tenant is not on the OSS classpath, so guard the body out
  ;; of OSS builds entirely (with-premium-features only flips the flag, it does not load EE code).
  (mt/when-ee-evailable
   (testing "GHY-4140: for a non-superuser, the recipient filter drops other-tenant users but
            keeps same-tenant users. The comparison must deref *current-user* (an atom); reading
            :tenant_id off the atom itself is always nil, which wrongly drops every tenant user."
     (mt/with-premium-features #{:tenants}
       (mt/with-temp [:model/Tenant {tenant-id :id}       {:name "GHY4140 T1" :slug "ghy4140-t1"}
                      :model/Tenant {other-tenant-id :id} {:name "GHY4140 T2" :slug "ghy4140-t2"}
                      :model/User   {caller-id :id}       {:tenant_id tenant-id}
                      :model/User   {same-id :id}         {:tenant_id tenant-id}
                      :model/User   {other-id :id}        {:tenant_id other-tenant-id}
                      :model/User   {internal-id :id}     {}]
         ;; Production recipient maps come from the :recipients hydration, which selects only
         ;; id/email/name fields — no :tenant_id — so the recipients here carry ids only. The
         ;; filter must work on that shape, which is why it looks tenant membership up from the
         ;; app DB instead of reading it off the map.
         (let [pulses [{:channels [{:recipients [{:id same-id}
                                                 {:id other-id}
                                                 {:id internal-id}
                                                 {:email "ext@example.com"}]}]}]]
           (mt/with-current-user caller-id
             (let [kept (-> (models.pulse/maybe-filter-pulses-recipients pulses)
                            first :channels first :recipients)]
               (testing "same-tenant Metabase user survives"
                 (is (some #(= same-id (:id %)) kept)))
               (testing "other-tenant Metabase user is redacted"
                 (is (not (some #(= other-id (:id %)) kept))))
               (testing "an internal (tenantless) user is redacted too: a tenant caller sees only its own tenant"
                 (is (not (some #(= internal-id (:id %)) kept))))
               (testing "raw email recipient is always preserved"
                 (is (some #(= "ext@example.com" (:email %)) kept)))))
           (testing "an internal (tenantless) non-superuser sees only other internal users and raw emails"
             (mt/with-current-user internal-id
               (is (= [{:id internal-id} {:email "ext@example.com"}]
                      (-> (models.pulse/maybe-filter-pulses-recipients pulses)
                          first :channels first :recipients)))))))))))

(defn- pulse-rows
  "`n` Pulse rows that differ in what they hold: a Collection, one or two Cards, an email channel with a User and a raw
  address as recipients, and for every other one a Slack channel."
  [n card-ids collection-ids]
  (mapv (fn [i]
          {:name          (mt/random-name)
           :creator_id    (mt/user->id :rasta)
           :collection_id (nth collection-ids (mod i 2))
           :cards         (mapv (fn [card-id] {:id card-id :include_csv false :include_xls false :dashboard_card_id nil})
                                (take (inc (mod i 2)) card-ids))
           :channels      (cond-> [{:channel_type  :email
                                    :schedule_type :daily
                                    :schedule_hour 18
                                    :enabled       true
                                    :recipients    [{:id (mt/user->id :lucky)} {:email "foo@bar.com"}]}]
                            (odd? i) (conj {:channel_type  :slack
                                            :schedule_type :hourly
                                            :enabled       true
                                            :details       {:channel "#general"}}))})
        (range n)))

(defn- do-with-pulse-rows!
  "Call `f` with a function of `n` Pulse rows, two Card ids and two Collection ids, in a scheduler and with the rows it
  creates cleaned up."
  [f]
  (mt/with-temp-scheduler!
    (task/init! ::task.send-pulses/SendPulses)
    (mt/with-temp [:model/Card       {card-1 :id}       {}
                   :model/Card       {card-2 :id}       {}
                   :model/Collection {collection-1 :id} {}
                   :model/Collection {collection-2 :id} {}]
      (mt/with-model-cleanup [:model/Pulse :model/PulseCard :model/PulseChannel :model/PulseChannelRecipient]
        (let [card-ids       [card-1 card-2]
              collection-ids [collection-1 collection-2]]
          (f (fn [n] (pulse-rows n card-ids collection-ids)) card-ids collection-ids))))))

(deftest archived-directly-through-plain-update-test
  (mt/with-temp [:model/Collection {collection-1 :id} {}
                 :model/Collection {collection-2 :id} {}
                 :model/Pulse      {pulse-id :id}     {:collection_id collection-1}]
    (let [archived-directly (fn [] (t2/select-one-fn :archived_directly :model/Pulse :id pulse-id))]
      (testing "a plain update that archives a Pulse in a live Collection stores archived_directly true"
        (t2/update! :model/Pulse :id pulse-id {:archived true})
        (is (true? (archived-directly))))
      (testing "a plain update that restores it stores archived_directly false"
        (t2/update! :model/Pulse :id pulse-id {:archived false})
        (is (false? (archived-directly))))
      (testing "an update that archives and moves it at once reads the Collection it moves to"
        (t2/update! :model/Pulse :id pulse-id {:archived true :collection_id collection-2})
        (is (true? (archived-directly))))
      (testing "an update that archives it into the root Collection stores archived_directly true"
        (t2/update! :model/Pulse :id pulse-id {:archived false})
        (t2/update! :model/Pulse :id pulse-id {:archived true :collection_id nil})
        (is (true? (archived-directly))))
      (testing "an update that archives a Pulse whose Collection is archived stores archived_directly false"
        (t2/update! :model/Pulse :id pulse-id {:archived false :collection_id collection-1})
        (t2/update! :model/Collection :id collection-1 {:archived true})
        (t2/update! :model/Pulse :id pulse-id {:archived true})
        (is (false? (archived-directly)))))))

(deftest archived-directly-in-update-event-test
  (mt/with-temp [:model/Collection {collection-id :id} {}
                 :model/Pulse      {pulse-id :id}      {:collection_id collection-id}]
    (testing "the update event of the write function carries the stored value, never an expression"
      (let [published (atom [])]
        (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]) event)]
          (models.pulse/update-pulses! [{:id pulse-id :archived true}]))
        (is (= [[true]]
               (into [] (comp (filter (comp #{:event/pulse-update} first))
                              (map (comp #(mapv (comp :archived_directly :object) %) :changes second)))
                     @published)))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (do-with-pulse-rows!
   (fn [rows card-ids collection-ids]
     (let [create! (fn [n] (mapv :id (models.pulse/create-pulses! (rows n))))
           [_card-1 card-2] card-ids
           [collection-1 _collection-2] collection-ids]
       (testing "creating Pulses"
         (let [counted (fn [n] (events.tu/statement-count! #(models.pulse/create-pulses! (rows n))))]
           (counted 2)
           (is (= (counted 2) (counted 6)))))
       (testing "replacing the Cards and Channels of a Pulse, whatever number of recipients"
         (let [counted (fn [n]
                         (let [[id] (create! 1)]
                           (events.tu/statement-count!
                            #(models.pulse/update-pulse!
                              id
                              {:name     "Renamed"
                               :cards    [{:id card-2 :include_csv true :include_xls false :dashboard_card_id nil}]
                               :channels [{:channel_type  :email
                                           :schedule_type :daily
                                           :schedule_hour 9
                                           :enabled       true
                                           :recipients    (mapv (fn [i] {:email (str "new" i "@bar.com")}) (range n))}]}))))]
           (counted 2)
           (is (= (counted 2) (counted 6)))))
       (testing "updating the PulseChannels a Pulse has, whatever number of recipients it gains"
         (let [recipients (fn [users] (mapv (fn [user] {:id (mt/user->id user)}) users))
               counted    (fn [recipients]
                            (let [[id]    (create! 1)
                                  channel (t2/select-one :model/PulseChannel :pulse_id id :channel_type :email)]
                              (events.tu/statement-count!
                               #(models.pulse/update-pulse!
                                 id
                                 {:channels [{:id            (:id channel)
                                              :channel_type  :email
                                              :schedule_type :daily
                                              :schedule_hour 18
                                              :enabled       true
                                              :recipients    recipients}]}))))]
           (counted (recipients [:rasta :lucky]))
           (is (= (counted (recipients [:rasta :lucky]))
                  (counted (recipients [:rasta :lucky :crowberto]))))))
       (testing "archiving and restoring Pulses, some already archived"
         (let [counted (fn [n archived?]
                         (let [ids (create! n)]
                           (models.pulse/update-pulses! (mapv (fn [row-id] (assoc {:archived archived?} :id row-id)) (vec (take-nth 2 ids))))
                           (events.tu/statement-count! #(models.pulse/update-pulses! (mapv (fn [row-id] (assoc {:archived archived?} :id row-id)) ids)))))]
           (counted 2 true)
           (is (= (counted 2 true) (counted 6 true)))
           (is (= (counted 2 false) (counted 6 false)))))
       (testing "moving Pulses to a Collection"
         (let [counted (fn [n]
                         (let [ids (create! n)]
                           (events.tu/statement-count!
                            #(models.pulse/update-pulses! (mapv (fn [row-id] (assoc {:collection_id collection-1} :id row-id)) ids)))))]
           (counted 2)
           (is (= (counted 2) (counted 6)))))
       (testing "deleting Pulses"
         (let [counted (fn [n]
                         (let [ids (create! n)]
                           (events.tu/statement-count! #(models.pulse/delete-pulses! ids))))]
           (counted 2)
           (is (= (counted 2) (counted 6)))))
       (testing "removing PulseChannels, which archives the Pulses left without one"
         (let [counted (fn [n]
                         (let [ids         (create! n)
                               channel-ids (t2/select-pks-vec :model/PulseChannel :pulse_id [:in ids] :channel_type :email)]
                           (events.tu/statement-count! #(models.pulse/remove-pulse-channels! channel-ids))))]
           (counted 2)
           (is (= (counted 2) (counted 6)))))
       (testing "deleting PulseChannelRecipients"
         (let [counted (fn [n]
                         (let [ids           (create! n)
                               recipient-ids (t2/select-pks-vec :model/PulseChannelRecipient
                                                                :pulse_channel_id [:in (t2/select-pks-vec :model/PulseChannel :pulse_id [:in ids])])]
                           (events.tu/statement-count! #(models.pulse/delete-pulse-channel-recipients! recipient-ids))))]
           (counted 2)
           (is (= (counted 2) (counted 6)))))
       (testing "setting the details of a PulseChannel"
         (let [counted (fn [n]
                         (let [ids     (create! n)
                               channel (t2/select-one :model/PulseChannel :pulse_id [:in ids] :channel_type :slack)]
                           (events.tu/statement-count! #(models.pulse/update-pulse-channel-details! channel {:channel (str "#" n)}))))]
           (counted 2)
           (is (= (counted 2) (counted 6)))))))))

(deftest dashboard-subscription-write-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp-scheduler!
    (task/init! ::task.send-pulses/SendPulses)
    (mt/with-temp [:model/Card            {card-id :id}        {}
                   :model/Collection      {collection-1 :id}   {}
                   :model/Collection      {collection-2 :id}   {}
                   :model/Dashboard       {dashboard-1 :id}    {:collection_id collection-1}
                   :model/Dashboard       {dashboard-2 :id}    {:collection_id collection-2}
                   :model/Dashboard       {dashboard-3 :id}    {:collection_id collection-1}
                   :model/Dashboard       {dashboard-4 :id}    {:collection_id collection-2}
                   :model/Dashboard       {dashboard-5 :id}    {:collection_id collection-1}
                   :model/Dashboard       {dashboard-6 :id}    {:collection_id collection-2}
                   :model/DashboardCard   {dashcard-1 :id}     {:dashboard_id dashboard-1 :card_id card-id}
                   :model/DashboardCard   {dashcard-2 :id}     {:dashboard_id dashboard-2 :card_id card-id}
                   :model/DashboardCard   {dashcard-3 :id}     {:dashboard_id dashboard-3 :card_id card-id}
                   :model/DashboardCard   {dashcard-4 :id}     {:dashboard_id dashboard-4 :card_id card-id}
                   :model/DashboardCard   {dashcard-5 :id}     {:dashboard_id dashboard-5 :card_id card-id}
                   :model/DashboardCard   {dashcard-6 :id}     {:dashboard_id dashboard-6 :card_id card-id}]
      (mt/with-model-cleanup [:model/Pulse :model/PulseCard :model/PulseChannel :model/PulseChannelRecipient]
        (let [dashboards [dashboard-1 dashboard-2 dashboard-3 dashboard-4 dashboard-5 dashboard-6]
              dashcards  [dashcard-1 dashcard-2 dashcard-3 dashcard-4 dashcard-5 dashcard-6]
              create!    (fn [n]
                           (mapv :id (models.pulse/create-pulses!
                                      (mapv (fn [dashboard-id i]
                                              {:name         (mt/random-name)
                                               :creator_id   (mt/user->id :rasta)
                                               :dashboard_id dashboard-id
                                               :cards        (if (even? i) [{:id card-id :include_csv false :include_xls false :dashboard_card_id (nth dashcards i)}] [])
                                               :channels     []})
                                            (take n dashboards) (range)))))]
          (testing "appending PulseCards to the Pulses of Dashboards, some with PulseCards already"
            (let [counted (fn [n]
                            (let [ids (create! n)]
                              (events.tu/statement-count!
                               #(models.pulse/append-pulse-cards!
                                 (mapv (fn [id dashcard-id] {:card_id card-id :pulse_id id :dashboard_card_id dashcard-id})
                                       ids (reverse (take n dashcards)))))))]
              (counted 2)
              (is (= (counted 2) (counted 6)))))
          (testing "deleting the PulseCards of DashboardCards"
            (let [counted (fn [n]
                            (create! n)
                            (events.tu/statement-count! #(models.pulse/delete-pulse-cards-for-dashcards! (vec (take n dashcards)))))]
              (counted 2)
              (is (= (counted 2) (counted 6)))))
          (testing "naming the Pulses of Dashboards and moving them with their Dashboards"
            (let [counted (fn [n]
                            (create! n)
                            (events.tu/statement-count!
                             #(models.pulse/update-pulses-for-dashboards!
                               (into {} (map-indexed (fn [i dashboard-id]
                                                       [dashboard-id {:name "Renamed" :collection_id (if (even? i) collection-1 collection-2)}]))
                                     (take n dashboards)))))]
              (counted 2)
              (is (= (counted 2) (counted 6))))))))))

(deftest create-pulses-reports-first-invalid-row-test
  (do-with-pulse-rows!
   (fn [rows _card-ids _collection-ids]
     (let [[row] (rows 1)
           bad-schedule   (update-in row [:channels 0] assoc :schedule_type :weekly :schedule_hour 8 :schedule_day nil)
           bad-collection (assoc row :collection_id Integer/MAX_VALUE)
           message-of     (fn [pulses]
                            (try (models.pulse/create-pulses! pulses)
                                 nil
                                 (catch clojure.lang.ExceptionInfo e (ex-message e))))
           schedule-message   (message-of [bad-schedule])
           collection-message (message-of [bad-collection])]
       (is (string? schedule-message))
       (is (string? collection-message))
       (is (not= schedule-message collection-message))
       (testing "the message is the one of the first invalid row, whatever the kind of its error"
         (is (= schedule-message (message-of [bad-schedule bad-collection])))
         (is (= collection-message (message-of [bad-collection bad-schedule])))
         (is (= schedule-message (message-of [row bad-schedule bad-collection]))))
       (testing "nothing is written"
         (let [before (t2/count :model/Pulse)]
           (message-of [row bad-schedule bad-collection])
           (is (= before (t2/count :model/Pulse)))))))))
