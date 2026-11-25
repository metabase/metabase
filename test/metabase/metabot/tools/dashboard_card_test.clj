(ns metabase.metabot.tools.dashboard-card-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.dashboard-card :as dashboard-card]
   [metabase.metabot.tools.shared :as shared]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.users.models.user-parameter-value :as user-parameter-value]))

(defn- call-tool!
  "Call `run_dashboard_card` as rasta with `memory` as the agent memory, while rasta views `viewing` (the
   `user_is_viewing` items)."
  [memory viewing args]
  (mt/with-current-user (mt/user->id :rasta)
    (binding [shared/*memory-atom* (atom (assoc memory :context {:user_is_viewing viewing}))]
      (dashboard-card/run-dashboard-card-tool args))))

(defn- run-card!
  "[[call-tool!]] in a conversation of rasta's own with query execution on."
  [viewing args]
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :rasta)}]
    (mt/with-temporary-setting-values [metabot-query-execution-enabled? true]
      (call-tool! {:conversation-id conversation-id} viewing args))))

(defn- venues-count
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(defn- do-with-venues-dashboard
  "Call `f` with `{:dashboard-id :dashcard-id :text-dashcard-id :card-id}` for a dashboard with a Price filter
   (default 4) connected to a card that counts venues, and a text card."
  [f]
  (mt/with-temp [:model/Card          {card-id :id}          {:dataset_query (venues-count)}
                 :model/Dashboard     {dashboard-id :id}     {:parameters [{:id "price", :name "Price", :slug "price"
                                                                            :type "category", :default [4]}]}
                 :model/DashboardCard {dashcard-id :id}      {:dashboard_id       dashboard-id
                                                              :card_id            card-id
                                                              :parameter_mappings [{:parameter_id "price"
                                                                                    :card_id      card-id
                                                                                    :target       [:dimension (mt/$ids venues $price)]}]}
                 :model/DashboardCard {text-dashcard-id :id} {:dashboard_id           dashboard-id
                                                              :visualization_settings {:text "Hello"}}]
    (f {:dashboard-id dashboard-id, :dashcard-id dashcard-id, :text-dashcard-id text-dashcard-id, :card-id card-id})))

(defn- count-shown
  "The count in the one-cell table of a run's `output`."
  [output]
  (some->> output (re-find #"\| (\d+) \|") second parse-long))

(deftest runs-with-filter-values-on-screen-test
  (do-with-venues-dashboard
   (fn [{:keys [dashboard-id dashcard-id card-id]}]
     (let [run (fn [parameters]
                 (run-card! [(cond-> {:type "dashboard", :id dashboard-id}
                               parameters (assoc :parameters parameters))]
                            {:dashcard_id dashcard-id}))]
       (testing "the value on screen filters the card, and the result names it"
         (let [{:keys [output structured-output]} (run [{:id "price", :value [1]}])]
           (is (= 22 (count-shown output)))
           (is (str/includes? output "with the dashboard filter values on the user's screen: Price = [1]."))
           (is (str/includes? output (str "`metabase://question/" card-id "`")))
           (is (= {:dashcard-id dashcard-id, :card-id card-id, :returned 1, :truncated? false}
                  structured-output))))
       (testing "a cleared filter applies no value, not its default"
         (let [{:keys [output]} (run [{:id "price", :value nil}])]
           (is (= 100 (count-shown output)))
           (is (str/includes? output "Price = (cleared)."))))
       (testing "without values from the frontend, none is applied and the result says the values are unknown"
         (let [{:keys [output]} (run nil)]
           (is (= 100 (count-shown output)))
           (is (str/includes? output "the values on the user's screen are unknown"))))
       (testing "a connected filter the frontend sent no value for is named as unknown"
         (let [{:keys [output]} (run [])]
           (is (= 100 (count-shown output)))
           (is (str/includes? output "No value was applied for Price: its value on the user's screen is unknown"))
           (is (not (str/includes? output "No dashboard filter is connected")))))
       (testing "a value for a filter the dashboard doesn't have is dropped rather than failing the run"
         (is (= 22 (count-shown (:output (run [{:id "price", :value [1]} {:id "gone", :value "x"}]))))))))))

(deftest does-not-store-last-used-values-test
  (testing "Metabot's run leaves the user's last-used filter values alone"
    (do-with-venues-dashboard
     (fn [{:keys [dashboard-id dashcard-id]}]
       (let [stored (atom [])]
         (mt/with-dynamic-fn-redefs [user-parameter-value/store! (fn [& args] (swap! stored conj args))]
           (is (= 22 (count-shown (:output (run-card! [{:type "dashboard", :id dashboard-id
                                                        :parameters [{:id "price", :value [1]}]}]
                                                      {:dashcard_id dashcard-id})))))
           (is (= [] @stored))))))))

(deftest refusals-test
  (do-with-venues-dashboard
   (fn [{:keys [dashboard-id dashcard-id text-dashcard-id]}]
     (testing "the user is not viewing a dashboard"
       (is (=? {:output #"The user is not viewing a dashboard.*"}
               (run-card! [{:type "table", :id (mt/id :venues)}] {:dashcard_id dashcard-id}))))
     (testing "a dashcard of another dashboard"
       (mt/with-temp [:model/Dashboard {other-id :id} {}]
         (is (=? {:output (re-pattern (str "Dashcard " dashcard-id " was not found on dashboard " other-id "\\..*"))}
                 (run-card! [{:type "dashboard", :id other-id}] {:dashcard_id dashcard-id})))))
     (testing "a text card"
       (is (=? {:output (str "Dashcard " text-dashcard-id " is not a question, so it has no results.")}
               (run-card! [{:type "dashboard", :id dashboard-id}] {:dashcard_id text-dashcard-id}))))
     (testing "query execution is off"
       (mt/with-temporary-setting-values [metabot-query-execution-enabled? false]
         (is (=? {:output "Query execution is turned off for Metabot."}
                 (call-tool! {} [{:type "dashboard", :id dashboard-id}] {:dashcard_id dashcard-id}))))))))

(deftest unreadable-card-not-found-test
  (testing "a card the user can't read, on a dashboard they can, is not found"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection    {open-id :id}     {}
                     :model/Collection    {closed-id :id}   {}
                     :model/Card          {card-id :id}     {:collection_id closed-id, :dataset_query (venues-count)}
                     :model/Dashboard     {dashboard-id :id} {:collection_id open-id}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) open-id)
        (is (=? {:output (re-pattern (str "Dashcard " dashcard-id " was not found on dashboard " dashboard-id "\\..*"))}
                (run-card! [{:type "dashboard", :id dashboard-id}] {:dashcard_id dashcard-id})))))))

(deftest metabot-sql-card-refused-test
  (testing "a question holding SQL that Metabot saved doesn't run with filter values"
    (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :rasta)}
                   :model/Card                {card-id :id}         {:dataset_query           (mt/native-query {:query "SELECT 1"})
                                                                     :metabot_conversation_id conversation-id}
                   :model/Dashboard           {dashboard-id :id}    {}
                   :model/DashboardCard       {dashcard-id :id}     {:dashboard_id dashboard-id, :card_id card-id}]
      (is (=? {:output #"Dashcard \d+ runs SQL that you wrote.*"}
              (run-card! [{:type "dashboard", :id dashboard-id}] {:dashcard_id dashcard-id}))))))
