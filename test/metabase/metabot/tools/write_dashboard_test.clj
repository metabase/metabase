(ns metabase.metabot.tools.write-dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.skills :as skills]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.toolkit.dashboard-ops :as dashboard-ops]
   [metabase.metabot.toolkit.dashboard-write :as dashboard-write]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.save-entity :as save-entity]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.write-dashboard :as write-dashboard]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Helpers ------------------------------------------------------

(defn- venues-query []
  (lib/query (mt/metadata-provider)
             (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(defn- chart-memory
  "A memory atom holding generated charts `A`, `B` and `C` over a real query, in conversation `conversation-id`."
  ([] (chart-memory nil))
  ([conversation-id]
   (let [query (venues-query)]
     (atom (cond-> {:state   {:queries {"q-1" query}
                              :charts  (into {}
                                             (for [id ["A" "B" "C"]]
                                               [id {:chart_id               id
                                                    :query_id               "q-1"
                                                    :queries                [query]
                                                    :visualization_settings {:chart_type :bar}}]))}
                    :context {}}
             conversation-id (assoc :conversation-id conversation-id))))))

(def ^:private tool-names
  "Every tool a recovery step names here."
  #{"construct_notebook_query"
    "create_chart"
    "read_resource"
    "search"
    "write_dashboard"})

(defn- call
  "Calls the tool with `args`, as the `profile-id` profile when one is given."
  ([args] (call args nil))
  ([args profile-id]
   (tools.core/call write-dashboard/write-dashboard-tool args
                    (cond-> {:tool-names tool-names} profile-id (assoc :profile-id profile-id)))))

(defn- failure [args]
  (test-util/tool-failure write-dashboard/write-dashboard-tool args tool-names))

(defn- event [result]
  (let [[part & more] (:data-parts result)]
    (is (empty? more))
    (is (= "dashboard_saved" (:data-type part)))
    (:data part)))

(defn- dashcards [dashboard-id]
  (t2/select [:model/DashboardCard :id :card_id :row :col :size_x :size_y :dashboard_tab_id :parameter_mappings]
             :dashboard_id dashboard-id
             {:order-by [[:id :asc]]}))

(defn- overlap? [a b]
  (and (< (:col a) (+ (:col b) (:size_x b)))
       (< (:col b) (+ (:col a) (:size_x a)))
       (< (:row a) (+ (:row b) (:size_y b)))
       (< (:row b) (+ (:row a) (:size_y a)))))

(defn- sales-dashboard!
  "Calls `f` with a dashboard on a Sales collection holding one dashcard, plus an unrelated dashboard.
  Rasta can write to Sales. Lucky can only read it."
  [f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection       {coll-id :id :as coll} {:name "Sales"}
                   :model/Card             {card-id :id}          {:name          "Revenue by month"
                                                                   :collection_id coll-id
                                                                   :dataset_query (venues-query)}
                   :model/Dashboard        {dash-id :id}          {:name "Sales overview", :collection_id coll-id}
                   :model/DashboardCard    {dashcard-id :id}      {:dashboard_id dash-id
                                                                   :card_id      card-id
                                                                   :row          0
                                                                   :col          0
                                                                   :size_x       12
                                                                   :size_y       6}
                   :model/Dashboard        {other-id :id}         {:name "Marketing", :collection_id coll-id}
                   :model/PermissionsGroup {group-id :id}         {}]
      (perms/add-user-to-group! (mt/user->id :rasta) group-id)
      (perms/grant-collection-readwrite-permissions! group-id coll)
      (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
      (f {:coll-id     coll-id
          :card-id     card-id
          :dash-id     dash-id
          :dashcard-id dashcard-id
          :other-id    other-id}))))

;;; ------------------------------------------------- Creating -----------------------------------------------------

(deftest create-blank-dashboard-test
  (mt/with-model-cleanup [:model/Dashboard]
    (mt/with-current-user (mt/user->id :rasta)
      (let [personal                        (:id (collection/user->personal-collection (mt/user->id :rasta)))
            result                          (call {:name "Q4 planning"} :internal)
            {:keys [dashboard_id] :as data} (event result)]
        (testing "creates an empty dashboard in the personal collection"
          (is (=? {:name "Q4 planning", :collection_id personal, :archived false}
                  (t2/select-one :model/Dashboard :id dashboard_id)))
          (is (empty? (dashcards dashboard_id))))
        (testing "internal Metabot opens a dashboard it created"
          (is (= {:dashboard_id  dashboard_id
                  :action        "created"
                  :name          "Q4 planning"
                  :url           (str "/dashboard/" dashboard_id)
                  :collection_id personal
                  :open          true
                  :saved_charts  []}
                 data)))
        (testing "the model reads where it was saved and how to link it"
          (is (re-find #"<dashboard_saved action=\"created\" url=\"metabase://dashboard/\d+\">" (:output result)))
          (is (re-find #"<collection id=\"\d+\" name=\"Rasta Toucan's Personal Collection\"/>" (:output result)))
          (is (re-find #"Link it as \[Q4 planning\]\(metabase://dashboard/\d+\)\." (:output result))))))))

(deftest create-topic-dashboard-test
  (mt/with-model-cleanup [:model/Dashboard :model/Card]
    (mt/with-temp [:model/Collection          {coll-id :id}  {:name "Sales"}
                   :model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}
                   :model/Dashboard           {other-id :id} {:name "Marketing"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (doseq [[profile-id open?] [[:internal true] [:nlq false]]]
          (testing profile-id
            (let [ops    [{:op "add_card", :id -1, :chart_id "A", :name "Venues A"
                           :position {:row 0, :col 0}, :size {:size_x 12, :size_y 6}}
                          {:op "add_card", :id -2, :chart_id "B", :name "Venues B"
                           :position {:row 0, :col 12}, :size {:size_x 12, :size_y 6}}
                          {:op "add_card", :id -3, :chart_id "C", :name "Venues C"
                           :position {:row 6, :col 0}, :size {:size_x 24, :size_y 6}}
                          {:op "add_parameter", :parameter_id "price", :name "Price"
                           :type "number/=", :sectionId "number"}
                          {:op "wire_parameter", :parameter_id "price", :dashcard_id -1
                           :target_field (mt/id :venues :price), :autowire true}]
                  result (binding [shared/*memory-atom* (chart-memory convo-id)]
                           (call {:name          "Venues"
                                  :description   "Venues by price."
                                  :collection_id coll-id
                                  :ops           ops}
                                 profile-id))
                  {:keys [dashboard_id saved_charts] :as data} (event result)
                  dcs    (dashcards dashboard_id)
                  cards  (t2/select :model/Card :dashboard_id dashboard_id {:order-by [[:id :asc]]})]
              (testing "creates the dashboard in the requested collection"
                (is (=? {:name "Venues", :description "Venues by price.", :collection_id coll-id}
                        (t2/select-one :model/Dashboard :id dashboard_id))))
              (testing "saves each chart as a dashboard question that records its conversation and chart"
                (is (=? [{:name "Venues A", :metabot_conversation_id convo-id, :metabot_chart_id "A", :display :bar}
                         {:name "Venues B", :metabot_conversation_id convo-id, :metabot_chart_id "B"}
                         {:name "Venues C", :metabot_conversation_id convo-id, :metabot_chart_id "C"}]
                        cards))
                (is (= (for [card cards] {:chart_id (:metabot_chart_id card), :card_id (:id card)})
                       saved_charts)))
              (testing "places the three cards where the ops say, without overlap"
                (is (= (map :id cards) (map :card_id dcs)))
                (is (= [[0 0 12 6] [0 12 12 6] [6 0 24 6]] (map (juxt :row :col :size_x :size_y) dcs)))
                (is (not-any? true? (for [a dcs b dcs :when (not= a b)] (overlap? a b)))))
              (testing "connects the filter to every card with the field"
                (is (every? (fn [dc] (some #(= "price" (:parameter_id %)) (:parameter_mappings dc))) dcs))
                (is (re-find (re-pattern (str "<filter id=\"price\" name=\"Price\" type=\"number/=\""
                                              " connected_dashcards=\"\\d+, \\d+, \\d+\"/>"))
                             (:output result))))
              (testing "opens the dashboard only in internal Metabot"
                (is (= open? (:open data))))
              (testing "leaves other dashboards alone"
                (is (empty? (dashcards other-id)))))))))))

(deftest create-with-tabs-test
  (mt/with-model-cleanup [:model/Dashboard]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "the result groups the dashcards under their tabs"
        (is (re-find #"<tab id=\"\d+\" name=\"Revenue\">\n      <dashcard id=\"\d+\" display=\"text\" row=\"0\""
                     (:output (call {:name "Tabbed"
                                     :ops  [{:op "add_tab", :id -1, :name "Revenue"}
                                            {:op "add_text", :id -2, :markdown "Notes", :tab -1}]}))))))))

(deftest retry-reuses-question-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/Dashboard           {dash-id :id}  {:name "Venues"}
                   :model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (binding [shared/*memory-atom* (chart-memory convo-id)]
          (dotimes [_ 2]
            (call {:dashboard_id dash-id
                   :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}]})))
        (testing "a chart added twice in one conversation becomes one question on two dashcards"
          (is (= 1 (t2/count :model/Card :dashboard_id dash-id)))
          (is (= 2 (count (dashcards dash-id)))))))))

;;; -------------------------------------------------- Editing -----------------------------------------------------

(deftest replace-chart-on-dashboard-test
  (sales-dashboard!
   (fn [{:keys [card-id dash-id dashcard-id other-id]}]
     (mt/with-model-cleanup [:model/Card]
       (mt/with-current-user (mt/user->id :rasta)
         (let [result   (binding [shared/*memory-atom* (chart-memory)]
                          (call {:dashboard_id dash-id
                                 :ops          [{:op "replace_card", :dashcard_id dashcard-id, :chart_id "A"
                                                 :name "Venues"}
                                                {:op "resize", :dashcard_id dashcard-id
                                                 :size {:size_x 24, :size_y 6}}]}
                                :internal))
               new-card (t2/select-one :model/Card :dashboard_id dash-id)]
           (testing "shows a new dashboard question in the same slot, full width"
             (is (=? [{:id dashcard-id, :card_id (:id new-card), :row 0, :col 0, :size_x 24, :size_y 6}]
                     (dashcards dash-id))))
           (testing "an edit doesn't open the dashboard"
             (is (=? {:action       "updated"
                      :open         false
                      :saved_charts [{:chart_id "A", :card_id (:id new-card)}]}
                     (event result))))
           (testing "leaves the replaced question and the other dashboard unchanged"
             (is (=? {:name "Revenue by month", :archived false} (t2/select-one :model/Card :id card-id)))
             (is (= "Marketing" (t2/select-one-fn :name :model/Dashboard :id other-id))))
           (testing "the result shows the layout with real ids"
             (is (re-find (re-pattern (str "<dashcard id=\"" dashcard-id "\" card_id=\"" (:id new-card)
                                           "\" name=\"Venues\" display=\"bar\" row=\"0\" col=\"0\""
                                           " size_x=\"24\" size_y=\"6\"/>"))
                          (:output result))))))))))

(deftest unreadable-card-test
  (sales-dashboard!
   (fn [{:keys [dash-id]}]
     (mt/with-temp [:model/Collection    {hidden-id :id}   {:name "Hidden"}
                    :model/Card          {card-id :id}     {:name          "Secret revenue"
                                                            :collection_id hidden-id
                                                            :dataset_query (venues-query)}
                    :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id
                                                            :card_id      card-id
                                                            :row          6
                                                            :col          0
                                                            :size_x       12
                                                            :size_y       6}]
       (mt/with-current-user (mt/user->id :rasta)
         (let [output (:output (call {:dashboard_id dash-id, :name "Sales summary"}))]
           (testing "a card the user can't read shows its slot without its id or name"
             (is (re-find (re-pattern (str "<dashcard id=\"" dashcard-id "\" row=\"6\" col=\"0\" size_x=\"12\""
                                           " size_y=\"6\"/>"))
                          output))
             (is (not (re-find #"Secret revenue" output))))))))))

(deftest edit-details-test
  (sales-dashboard!
   (fn [{:keys [dash-id]}]
     (mt/with-temp [:model/Collection {target-id :id :as target} {:name "Archive"}]
       (perms/grant-collection-readwrite-permissions! (perms-group/all-users) target)
       (t2/update! :model/Dashboard :id dash-id {:description "Old"})
       (mt/with-current-user (mt/user->id :rasta)
         (testing "renames, moves and clears the description in one save"
           (call {:dashboard_id  dash-id
                  :name          "Sales summary"
                  :collection_id target-id
                  :clear         ["description"]})
           (is (=? {:name "Sales summary", :collection_id target-id, :description nil}
                   (t2/select-one :model/Dashboard :id dash-id)))))))))

(deftest move-to-read-only-collection-test
  (sales-dashboard!
   (fn [{:keys [dash-id coll-id]}]
     (mt/with-temp [:model/Collection {target-id :id :as target} {:name "Read only"}]
       (perms/grant-collection-read-permissions! (perms-group/all-users) target)
       (mt/with-current-user (mt/user->id :rasta)
         (testing "a move to a collection the user can't write to is refused"
           (is (=? {:class :recoverable, :code ::save-entity/destination-not-writable}
                   (failure {:dashboard_id dash-id, :collection_id target-id}))))
         (testing "the dashboard stays where it was"
           (is (= coll-id (t2/select-one-fn :collection_id :model/Dashboard :id dash-id)))))))))

(deftest parallel-edits-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Parallel"}
                 :model/Card      {card-a :id}  {:dataset_query (venues-query)}
                 :model/Card      {card-b :id}  {:dataset_query (venues-query)}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [a-waiting (promise)
            b-done    (promise)
            write!    dashboard-write/write!
            add-card  (fn [card-id]
                        (future (call {:dashboard_id dash-id
                                       :ops          [{:op "add_card", :id -1, :card_id card-id}]})))]
        ;; The call adding card A has read the layout and waits to save it while the call adding card B saves.
        ;; Without the lock, A then saves the layout it read, which deletes B's card. With the lock, B waits for A,
        ;; so A saves once its wait times out, and B compiles against A's saved layout.
        (mt/with-dynamic-fn-redefs [dashboard-write/write! (fn [opts]
                                                             (when (some #(= card-a (:card_id %)) (:ops opts))
                                                               (deliver a-waiting true)
                                                               (deref b-done 2000 nil))
                                                             (write! opts))]
          (let [a (add-card card-a)]
            (deref a-waiting 10000 nil)
            @(add-card card-b)
            (deliver b-done true)
            @a))
        (testing "parallel edits of one dashboard keep each other's cards"
          (is (= #{card-a card-b} (set (map :card_id (dashcards dash-id))))))))))

;;; ------------------------------------------------ Trash ---------------------------------------------------------

(deftest trash-and-restore-test
  (sales-dashboard!
   (fn [{:keys [dash-id other-id]}]
     (mt/with-current-user (mt/user->id :rasta)
       (let [result (call {:dashboard_id dash-id, :archived true} :internal)]
         (testing "moves the dashboard to the trash without asking"
           (is (true? (t2/select-one-fn :archived :model/Dashboard :id dash-id)))
           (is (=? {:action "trashed", :open false} (event result))))
         (testing "the result is the header only"
           (is (not (re-find #"<dashboard " (:output result))))
           (is (re-find #"restore it from there" (:output result))))
         (testing "an edit to a trashed dashboard is refused"
           (is (=? {:class :recoverable, :code ::save-entity/destination-archived}
                   (failure {:dashboard_id dash-id, :name "New name"}))))
         (testing "restores it"
           (is (=? {:action "restored"} (event (call {:dashboard_id dash-id, :archived false}))))
           (is (false? (t2/select-one-fn :archived :model/Dashboard :id dash-id))))
         (testing "leaves other dashboards alone"
           (is (false? (t2/select-one-fn :archived :model/Dashboard :id other-id)))))))))

(deftest unarchive-untrashed-dashboard-test
  (sales-dashboard!
   (fn [{:keys [dash-id]}]
     (mt/with-current-user (mt/user->id :rasta)
       (testing "archived false on a dashboard that isn't in the trash is an update, not a restore"
         (is (=? {:action "updated"}
                 (event (call {:dashboard_id dash-id, :archived false, :name "Renamed"})))))))))

;;; ------------------------------------------------ Refusals ------------------------------------------------------

(deftest read-only-dashboard-test
  (sales-dashboard!
   (fn [{:keys [dash-id dashcard-id]}]
     (mt/with-model-cleanup [:model/Card]
       (mt/with-current-user (mt/user->id :lucky)
         (let [before (t2/count :model/Revision :model "Dashboard" :model_id dash-id)]
           (testing "a read-only dashboard is refused, offering a new dashboard"
             (is (= {:class :recoverable
                     :code  ::write-dashboard/dashboard-not-writable
                     :text  (str "You can view dashboard " dash-id " but can't edit it, so nothing was saved.\n"
                                 "Tell the user why.\n"
                                 "If they want, use `write_dashboard` to create a dashboard in their personal"
                                 " collection instead.")}
                    (binding [shared/*memory-atom* (chart-memory)]
                      (failure {:dashboard_id dash-id
                                :ops          [{:op "add_card", :id -1, :chart_id "E", :name "Unknown chart"}]})))))
           (testing "nothing changes"
             (is (= [dashcard-id] (map :id (dashcards dash-id))))
             (is (= before (t2/count :model/Revision :model "Dashboard" :model_id dash-id)))
             (is (not (t2/exists? :model/Card :dashboard_id dash-id))))))))))

(deftest not-found-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "a missing dashboard reads as not found"
      (is (=? {:class :recoverable, :code ::recoverable.common/not-found}
              (failure {:dashboard_id Integer/MAX_VALUE, :name "x"}))))))

(deftest unwritable-collection-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "Read only"}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
      (mt/with-current-user (mt/user->id :rasta)
        (testing "a create in a read-only collection is refused"
          (is (=? {:class :recoverable, :code ::save-entity/destination-not-writable}
                  (failure {:name "Mine", :collection_id coll-id}))))
        (testing "so is a create in the root collection"
          (is (=? {:class :recoverable, :code ::save-entity/destination-not-writable}
                  (failure {:name "Mine", :collection_id "root"}))))))))

(deftest unrunnable-chart-test
  (mt/with-model-cleanup [:model/Dashboard]
    (mt/with-no-data-perms-for-all-users!
      (mt/with-current-user (mt/user->id :rasta)
        (let [before (t2/count :model/Dashboard)]
          (testing "a chart whose query the user can't run ends the turn"
            (is (=? {:class :unrecoverable, :code ::save-entity/no-query-permission}
                    (binding [shared/*memory-atom* (chart-memory)]
                      (failure {:name "x", :ops [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}]})))))
          (testing "nothing is created"
            (is (= before (t2/count :model/Dashboard)))))))))

;;; ------------------------------------------------ Arguments -----------------------------------------------------

(deftest invalid-request-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (doseq [[args problem] [[{}
                               "A new dashboard needs a `name`."]
                              [{:name "x", :archived true}
                               "`archived` applies only to an existing dashboard."]
                              [{:name "x", :clear ["description"]}
                               "`clear` applies only to an existing dashboard."]
                              [{:dashboard_id dash-id, :archived true, :ops [{:op "add_text", :id -1, :markdown "hi"}]}
                               "`archived` can't be sent with `ops`."]
                              [{:dashboard_id dash-id, :description "d", :clear ["description"]}
                               "`description` is both set and cleared."]
                              [{:dashboard_id dash-id, :name nil, :ops nil}
                               "This call changes nothing."]]]
        (testing (pr-str args)
          (is (=? {:class :recoverable
                   :code  ::write-dashboard/invalid-request
                   :text  (re-pattern (str "\\Q" problem "\\E.*"))}
                  (failure args))))))))

(deftest op-sources-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (venues-query)}]
      (doseq [[op detail] [[{:op "add_card", :id -1, :card_id card-id, :chart_id "A", :name "x"}
                            "Pass one of `card_id` or `chart_id`, not both."]
                           [{:op "add_card", :id -1}
                            "Pass `card_id` for a saved question"]
                           [{:op "add_card", :id -1, :chart_id "A"}
                            "Pass `name`"]]]
        (testing (pr-str op)
          (is (=? {:class :recoverable
                   :code  ::write-dashboard/dashboard-op-rejected
                   :text  (re-pattern (str "(?s)\\Qops[0] (add_card): " detail "\\E.*"))}
                  (binding [shared/*memory-atom* (chart-memory)]
                    (failure {:name "x", :ops [op]})))))))))

(deftest unknown-chart-test
  (mt/with-model-cleanup [:model/Dashboard]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [before (t2/count :model/Dashboard)]
        (is (=? {:class :recoverable, :code ::recoverable.common/unknown-chart-id}
                (binding [shared/*memory-atom* (chart-memory)]
                  (failure {:name "x", :ops [{:op "add_card", :id -1, :chart_id "nope", :name "x"}]}))))
        (testing "nothing is created"
          (is (= before (t2/count :model/Dashboard))))))))

(deftest rejected-op-saves-nothing-test
  (mt/with-model-cleanup [:model/Dashboard :model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [dashboards (t2/count :model/Dashboard)
            cards      (t2/count :model/Card)]
        (testing "an invalid op on a create is reported with its index, and no dashboard to read"
          (is (= {:class :recoverable
                  :code  ::write-dashboard/dashboard-op-rejected
                  :text  "ops[1] (move): The dashboard has no card with dashcard id 999. Nothing was saved."}
                 (binding [shared/*memory-atom* (chart-memory)]
                   (failure {:name "x"
                             :ops  [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}
                                    {:op "move", :dashcard_id 999, :position {:row 0, :col 0}}]})))))
        (testing "neither the dashboard nor the chart's question is saved"
          (is (= dashboards (t2/count :model/Dashboard)))
          (is (= cards (t2/count :model/Card))))))))

(deftest rejected-op-on-edit-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (testing "an invalid op on an edit offers to read that dashboard's cards"
        (is (=? {:code ::write-dashboard/dashboard-op-rejected
                 :text (re-pattern (str "(?s).*\\Qread `metabase://dashboard/" dash-id "/items` with"
                                        " `read_resource`.\\E"))}
                (failure {:dashboard_id dash-id, :ops [{:op "remove", :dashcard_id 999}]})))))))

(deftest op-error-wording-test
  (testing "every compiler error has Metabot wording"
    (is (empty? (remove (set (keys @#'write-dashboard/op-error-details)) (keys dashboard-ops/errors))))))

(deftest excluded-ops-test
  (let [args-schema (:args (tools.core/declaration write-dashboard/write-dashboard-tool))]
    (testing "the ops nothing asks Metabot for are refused"
      (doseq [op [{:op "add_iframe", :id -1, :src "https://example.com"}
                  {:op "add_action", :id -1, :action_id 1}
                  {:op "patch_dashcard", :dashcard_id 1, :patch {}}]]
        (is (not (mr/validate args-schema {:name "x", :ops [op]})) (:op op))))
    (testing "the other ops are offered, a chart source included"
      (is (mr/validate args-schema {:name "x", :ops [{:op "add_card", :id -1, :chart_id "A", :name "y"}]})))))

;;; ------------------------------------------------- Profiles -----------------------------------------------------

(deftest profiles-test
  (testing "internal and NLQ Metabot offer the tool"
    (doseq [profile-id [:internal :internal-sql :nlq :nlq-fallback]]
      (testing profile-id
        (is (some #{#'metabot.tools/write-dashboard-tool} (:tools (profiles/get-profile profile-id))))))))

(deftest scope-test
  (let [tool-names (fn [perms]
                     (binding [scope/*current-user-scope* (scope/user-metabot-perms->scopes perms)]
                       (set (keys (profiles/get-tools-for-profile :nlq [])))))]
    (testing "the NLQ permission alone doesn't grant the tool"
      (is (not (contains? (tool-names {:permission/metabot :yes, :permission/metabot-nlq :yes})
                          "write_dashboard"))))
    (testing "the other-tools permission grants it"
      (is (contains? (tool-names scope/all-yes-permissions) "write_dashboard")))))

(deftest skill-catalog-test
  (testing "a profile with the tool lists the write-dashboard skill"
    (is (some #{"write-dashboard"}
              (map :id (:catalog (skills/build-skill-manifest (profiles/get-profile :internal)
                                                              ["write_dashboard"]
                                                              [])))))))
