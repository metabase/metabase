(ns metabase.metabot.tools.write-dashboard-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.db :as metabot.db]
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
  "A memory atom holding generated charts `A`, `B` and `C` over `query` (by default the venues table), shown as
  `chart-type` (by default `:bar`), in conversation `conversation-id`."
  ([] (chart-memory nil))
  ([conversation-id] (chart-memory conversation-id (venues-query)))
  ([conversation-id query] (chart-memory conversation-id query :bar))
  ([conversation-id query chart-type]
   (atom (cond-> {:state   {:queries {"q-1" query}
                            :charts  (into {}
                                           (for [id ["A" "B" "C"]]
                                             [id {:chart_id               id
                                                  :query_id               "q-1"
                                                  :queries                [query]
                                                  :visualization_settings {:chart_type chart-type}}]))}
                  :context {}}
           conversation-id (assoc :conversation-id conversation-id)))))

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

(defn- event
  "The result's one data part, a `dashboard_saved` event."
  [result]
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
                           :type "number/=", :sectionId "number", :default "2"}
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
              (testing "connects the filter to every card with the field, and shows its default"
                (is (every? (fn [dc] (some #(= "price" (:parameter_id %)) (:parameter_mappings dc))) dcs))
                (is (re-find (re-pattern (str "<filter id=\"price\" name=\"Price\" type=\"number/=\" default=\"2\""
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
        (is (re-find (re-pattern (str "<tab tab_id=\"\\d+\" name=\"Revenue\">\n"
                                      "      <dashcard dashcard_id=\"\\d+\" display=\"text\" row=\"0\""))
                     (:output (call {:name "Tabbed"
                                     :ops  [{:op "add_tab", :id -1, :name "Revenue"}
                                            {:op "add_text", :id -2, :markdown "Notes", :tab -1}]}))))))))

(deftest legacy-dashcard-on-tabbed-dashboard-test
  (mt/with-temp [:model/Dashboard     {dash-id :id}    {:name "Tabbed"}
                 :model/DashboardTab  _                {:dashboard_id dash-id, :name "First", :position 0}
                 :model/DashboardTab  {second-tab :id} {:dashboard_id dash-id, :name "Second", :position 1}
                 :model/DashboardCard {legacy-id :id}  {:dashboard_id dash-id, :dashboard_tab_id nil, :card_id nil
                                                        :row 0, :col 0, :size_x 24, :size_y 1
                                                        :visualization_settings {:virtual_card {:display "heading"}
                                                                                 :text         "Legacy"}}
                 :model/DashboardCard {second-id :id}  {:dashboard_id dash-id, :dashboard_tab_id second-tab
                                                        :card_id nil
                                                        :row 1, :col 0, :size_x 12, :size_y 3
                                                        :visualization_settings {:virtual_card {:display "text"}
                                                                                 :text         "Notes"}}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [output (:output (call {:dashboard_id dash-id, :name "Renamed"}))]
        (testing "a dashcard with no tab comes before the tabs, marked as shown on every tab"
          (is (re-find (re-pattern (str "\n    <dashcard dashcard_id=\"" legacy-id "\" all_tabs=\"true\""))
                       output))
          (is (< (str/index-of output (str "dashcard_id=\"" legacy-id "\""))
                 (str/index-of output "<tab "))))
        (testing "a dashcard on a later tab stays under that tab"
          (is (re-find (re-pattern (str "<tab tab_id=\"" second-tab "\" name=\"Second\">\n"
                                        "      <dashcard dashcard_id=\"" second-id "\""))
                       output))))
      (testing "ops that leave it with no tab are rejected, naming it as a card that was already there"
        (is (=? {:code ::write-dashboard/dashboard-op-rejected
                 :text (re-pattern (str "(?s)\\QThe dashboard has tabs, so every card needs one. Cards " legacy-id
                                        " were already on the dashboard with no tab\\E.*\\Q`move` them to a tab"
                                        " in this call. Nothing was saved.\\E.*"))}
                (failure {:dashboard_id dash-id
                          :ops          [{:op "add_text", :id -1, :markdown "More", :tab second-tab}]})))
        (is (= 2 (count (dashcards dash-id)))))
      (testing "moving it to a tab in the same call saves"
        (call {:dashboard_id dash-id
               :ops          [{:op "add_text", :id -1, :markdown "More", :tab second-tab}
                              {:op "move", :dashcard_id legacy-id, :tab second-tab}]})
        (is (=? [{:id legacy-id, :dashboard_tab_id second-tab}
                 {:id second-id, :dashboard_tab_id second-tab}
                 {:dashboard_tab_id second-tab}]
                (dashcards dash-id)))))))

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

(deftest reseeded-chart-saves-new-question-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/Dashboard           {dash-id :id}  {:name "Venues"}
                   :model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [add! (fn [query]
                     (binding [shared/*memory-atom* (chart-memory convo-id query)]
                       (call {:dashboard_id dash-id
                              :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}]})))]
          (add! (venues-query))
          ;; The viewing context names a chart after the question the user views, so an edit keeps the chart id.
          (add! (lib/limit (venues-query) 5))
          (testing "a chart whose query changed under the same id is saved again, and the new question is placed"
            (let [cards (t2/select :model/Card :dashboard_id dash-id {:order-by [[:id :asc]]})]
              (is (= [nil 5] (map (comp lib/current-limit :dataset_query) cards)))
              (is (= (map :id cards)
                     (map :card_id (dashcards dash-id)))))))))))

(deftest retry-reuses-aggregated-question-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/Dashboard           {dash-id :id}  {:name "Venues"}
                   :model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [mp    (mt/metadata-provider)
              query (as-> (venues-query) q
                      (lib/aggregate q (lib/count))
                      (lib/breakout q (lib.metadata/field mp (mt/id :venues :price)))
                      (lib/order-by q (lib/aggregation-ref q 0) :desc))]
          (binding [shared/*memory-atom* (chart-memory convo-id query)]
            (dotimes [_ 2]
              (call {:dashboard_id dash-id
                     :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues by price"}]}))))
        (testing "a chart sorted by its own aggregate, added twice, becomes one question on two dashcards"
          (is (= 1 (t2/count :model/Card :dashboard_id dash-id)))
          (is (= 2 (count (dashcards dash-id)))))))))

(deftest retry-reuses-question-joining-aggregated-subquery-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/Dashboard           {dash-id :id}  {:name "Venues"}
                   :model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [mp       (mt/metadata-provider)
              venue-id (lib.metadata/field mp (mt/id :checkins :venue_id))
              visits   (as-> (lib/query mp (lib.metadata/table mp (mt/id :checkins))) q
                         (lib/aggregate q (lib/count))
                         (lib/breakout q venue-id)
                         (lib/order-by q (lib/aggregation-ref q 0) :desc))
              query    (lib/join (venues-query)
                                 (lib/join-clause visits [(lib/= (lib.metadata/field mp (mt/id :venues :id))
                                                                 venue-id)]))]
          (binding [shared/*memory-atom* (chart-memory convo-id query)]
            (dotimes [_ 2]
              (call {:dashboard_id dash-id
                     :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues by visits"}]}))))
        (testing "a chart joining a subquery sorted by its own aggregate, added twice, becomes one question"
          (is (= 1 (t2/count :model/Card :dashboard_id dash-id)))
          (is (= 2 (count (dashcards dash-id)))))))))

(deftest reseeded-chart-display-saves-new-question-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/Dashboard           {dash-id :id}  {:name "Venues"}
                   :model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (doseq [chart-type [:bar :line]]
          (binding [shared/*memory-atom* (chart-memory convo-id (venues-query) chart-type)]
            (call {:dashboard_id dash-id
                   :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}]})))
        (testing "a chart shown another way under the same id is saved again, and the new question is placed"
          (let [cards (t2/select :model/Card :dashboard_id dash-id {:order-by [[:id :asc]]})]
            (is (= [:bar :line] (map :display cards)))
            (is (= (map :id cards)
                   (map :card_id (dashcards dash-id))))))))))

;;; -------------------------------------------------- Editing -----------------------------------------------------

(deftest create-reports-no-moved-cards-test
  (mt/with-model-cleanup [:model/Dashboard]
    (mt/with-current-user (mt/user->id :rasta)
      (let [result  (call {:name "Q4 planning"
                           :ops  [{:op "add_text", :id -1, :markdown "Notes"}
                                  {:op       "add_heading"
                                   :id       -2
                                   :text     "Q4"
                                   :position {:row 0, :col 0}
                                   :size     {:size_x 24, :size_y 1}}]})
            dash-id (:dashboard_id (event result))]
        (testing "a card the call adds and then covers moves down"
          (is (=? [{:row 0, :size_x 24} {:row 1}]
                  (sort-by :row (dashcards dash-id)))))
        (testing "but isn't reported as moved, as the call placed it"
          (is (not (re-find #"moved down" (:output result)))))))))

(deftest placed-card-pushes-cards-down-test
  (sales-dashboard!
   (fn [{:keys [dash-id dashcard-id]}]
     (mt/with-current-user (mt/user->id :rasta)
       (let [result (call {:dashboard_id dash-id
                           :ops          [{:op "add_heading", :id -1, :text "Revenue"
                                           :position {:row 0, :col 0}, :size {:size_x 24, :size_y 2}}]})]
         (testing "a card placed over another pushes it down"
           (is (=? [{:id dashcard-id, :row 2, :col 0} {:row 0, :col 0, :size_x 24, :size_y 2}]
                   (dashcards dash-id))))
         (testing "the result says which card moved, so the model can tell the user"
           (is (re-find (re-pattern (str "Card " dashcard-id " moved down")) (:output result)))))))))

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
           (testing "internal Metabot opens the dashboard it edited"
             (is (=? {:action       "updated"
                      :open         true
                      :saved_charts [{:chart_id "A", :card_id (:id new-card)}]}
                     (event result))))
           (testing "leaves the replaced question and the other dashboard unchanged"
             (is (=? {:name "Revenue by month", :archived false} (t2/select-one :model/Card :id card-id)))
             (is (= "Marketing" (t2/select-one-fn :name :model/Dashboard :id other-id))))
           (testing "the result shows the layout with real ids"
             (is (re-find (re-pattern (str "<dashcard dashcard_id=\"" dashcard-id "\" card_id=\"" (:id new-card)
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
             (is (re-find (re-pattern (str "<dashcard dashcard_id=\"" dashcard-id "\" row=\"6\" col=\"0\" size_x=\"12\""
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
           (is (= {:class :recoverable
                   :code  ::write-dashboard/collection-not-writable
                   :text  (str "The user can't save dashboards to collection " target-id ". Nothing was saved.\n"
                               "To use another collection, read `metabase://collections?tree=true` with"
                               " `read_resource` and pass the id of one with `can_write=true` as `collection_id`.\n"
                               "Or ask the user which collection to move it to.")}
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
            write!    (mt/original-fn #'dashboard-write/write!)
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
           (is (=? {:action "restored", :open true}
                   (event (call {:dashboard_id dash-id, :archived false} :internal))))
           (is (false? (t2/select-one-fn :archived :model/Dashboard :id dash-id))))
         (testing "leaves other dashboards alone"
           (is (false? (t2/select-one-fn :archived :model/Dashboard :id other-id)))))))))

(deftest edit-trashed-while-waiting-test
  (sales-dashboard!
   (fn [{:keys [dash-id]}]
     (mt/with-current-user (mt/user->id :rasta)
       ;; A parallel call trashes the dashboard after this call's first read, before it takes the lock.
       (let [reread (mt/original-fn #'metabot.db/dashboard)]
         (mt/with-dynamic-fn-redefs [metabot.db/dashboard (fn [id]
                                                            (t2/update! :model/Dashboard :id id {:archived true})
                                                            (reread id))]
           (testing "an edit refuses a dashboard trashed while it waited"
             (is (=? {:class :recoverable, :code ::save-entity/destination-archived}
                     (failure {:dashboard_id dash-id, :name "Renamed"})))
             (is (= "Sales overview" (t2/select-one-fn :name :model/Dashboard :id dash-id))))))))))

(deftest unarchive-untrashed-dashboard-test
  (sales-dashboard!
   (fn [{:keys [dash-id]}]
     (mt/with-current-user (mt/user->id :rasta)
       (testing "archived false on a dashboard that isn't in the trash is an update, not a restore"
         (is (=? {:action "updated"}
                 (event (call {:dashboard_id dash-id, :archived false, :name "Renamed"})))))))))

(deftest trashed-collection-test
  (mt/with-model-cleanup [:model/Dashboard]
    (mt/with-temp [:model/Collection {trashed-id :id} {:name "Old", :archived true}
                   :model/Collection {live-id :id}    {:name "Live"}
                   :model/Dashboard  {dash-id :id}    {:name              "Old overview"
                                                       :collection_id     trashed-id
                                                       :archived          true
                                                       :archived_directly false}
                   :model/Dashboard  {other-id :id}   {:name "Live overview", :collection_id live-id}]
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "a dashboard trashed with its collection can't be restored in place"
          (is (= {:class :recoverable
                  :code  ::write-dashboard/dashboard-not-restorable
                  :text  (str "Dashboard " dash-id " can't be restored to its old collection, because that"
                              " collection is in the trash or the user can't save to it. Nothing was saved.\n"
                              "To restore it into another collection, call `write_dashboard` with `archived: false`"
                              " and that collection's `collection_id`.\n"
                              "Or ask the user whether to restore its collection from the trash first, or which"
                              " collection to restore the dashboard to.")}
                 (failure {:dashboard_id dash-id, :archived false})))
          (is (=? {:archived true, :collection_id trashed-id} (t2/select-one :model/Dashboard :id dash-id))))
        (testing "a create or move into a trashed collection is refused"
          (is (=? {:class :recoverable
                   :code  ::write-dashboard/collection-trashed
                   :text  #"(?s)Collection \d+ is in the trash, so the dashboard can't be saved there\..*"}
                  (failure {:name "New", :collection_id trashed-id})))
          (is (=? {:code ::write-dashboard/collection-trashed}
                  (failure {:dashboard_id other-id, :collection_id trashed-id})))
          (is (=? {:code ::write-dashboard/collection-trashed}
                  (failure {:dashboard_id dash-id, :archived false, :collection_id trashed-id})))
          (is (not (t2/exists? :model/Dashboard :name "New")))
          (is (= live-id (t2/select-one-fn :collection_id :model/Dashboard :id other-id))))
        (testing "a restore that moves the dashboard to a live collection works"
          (is (=? {:action "restored", :collection_id live-id}
                  (event (call {:dashboard_id dash-id, :archived false, :collection_id live-id}))))
          (is (=? {:archived false, :collection_id live-id} (t2/select-one :model/Dashboard :id dash-id))))))))

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
          (is (= {:class :recoverable
                  :code  ::write-dashboard/collection-not-writable
                  :text  (str "The user can't save dashboards to collection " coll-id ". Nothing was saved.\n"
                              "To use another collection, read `metabase://collections?tree=true` with"
                              " `read_resource` and pass the id of one with `can_write=true` as `collection_id`.\n"
                              "Or omit `collection_id` to create the dashboard in the user's personal collection,"
                              " or ask the user which collection to use.")}
                 (failure {:name "Mine", :collection_id coll-id}))))
        (testing "so is a create in the root collection"
          (is (=? {:class :recoverable
                   :code  ::write-dashboard/collection-not-writable
                   :text  #"(?s)The user can't save dashboards to the root collection\. .*"}
                  (failure {:name "Mine", :collection_id "root"}))))))))

(deftest other-dashboard-question-test
  (mt/with-temp [:model/Dashboard     {dash-id :id}   {:name "Target"}
                 :model/Dashboard     {other-id :id}  {:name "Other"}
                 :model/Card          {foreign-id :id} {:dataset_query (venues-query), :dashboard_id other-id}
                 :model/Card          {legacy-id :id} {:dataset_query (venues-query), :dashboard_id other-id}
                 :model/Card          {own-id :id}    {:dataset_query (venues-query), :dashboard_id dash-id}
                 :model/DashboardCard _               {:dashboard_id dash-id, :card_id legacy-id
                                                       :row 0, :col 0, :size_x 12, :size_y 6}]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "a question saved in another dashboard is refused with the reason and a way around it"
        (is (= {:class :recoverable
                :code  ::write-dashboard/cards-in-other-dashboards
                :text  (str "A question saved in a dashboard can be shown only on that dashboard, and these are"
                            " saved in other dashboards: question " foreign-id " (dashboard " other-id ")."
                            " Nothing was saved.\n"
                            "To show the same data, build a query on the question with `construct_notebook_query`,"
                            " chart it with `create_chart`, and add that chart with `chart_id` and a `name`. It is"
                            " saved as a new question on this dashboard.\n"
                            "Or ask the user which question to add instead.")}
               (failure {:dashboard_id dash-id
                         :ops          [{:op "add_card", :id -1, :card_id foreign-id}]})))
        (is (=? {:code ::write-dashboard/cards-in-other-dashboards}
                (failure {:name "New", :ops [{:op "add_card", :id -1, :card_id foreign-id}]})))
        (is (not (t2/exists? :model/Dashboard :name "New")))
        (is (= #{legacy-id} (set (map :card_id (dashcards dash-id))))))
      (testing "the dashboard's own questions, and ones it already shows, can be placed"
        (call {:dashboard_id dash-id
               :ops          [{:op "add_card", :id -1, :card_id own-id}
                              {:op "add_card", :id -2, :card_id legacy-id}]})
        (is (= [legacy-id own-id legacy-id] (map :card_id (dashcards dash-id))))))))

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

;;; --------------------------------------------- Curated content --------------------------------------------------

(defn- curated-dashboard!
  "Calls `f` with an uncurated dashboard holding one uncurated question, a question in an official collection, and
  Metabots with `use_verified_content` on and off, as crowberto with the curation features granted."
  [f]
  (mt/with-additional-premium-features #{:content-verification :official-collections :library}
    (mt/with-temp [:model/Collection    {official :id}    {:name "Official", :authority_level "official"}
                   :model/Collection    {plain :id}       {:name "Plain"}
                   :model/Card          {curated-id :id}  {:name          "Curated revenue"
                                                           :collection_id official
                                                           :dataset_query (venues-query)}
                   :model/Card          {plain-id :id}    {:name          "Plain revenue"
                                                           :collection_id plain
                                                           :dataset_query (venues-query)}
                   :model/Dashboard     {dash-id :id}     {:name "Plain dashboard", :collection_id plain}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id
                                                           :card_id      plain-id
                                                           :row          0
                                                           :col          0
                                                           :size_x       12
                                                           :size_y       6}
                   :model/Metabot       curated-metabot   {:name "curated", :use_verified_content true}
                   :model/Metabot       open-metabot      {:name "open", :use_verified_content false}]
      (mt/with-current-user (mt/user->id :crowberto)
        (f {:curated-id      curated-id
            :plain-id        plain-id
            :dash-id         dash-id
            :dashcard-id     dashcard-id
            :curated-metabot curated-metabot
            :open-metabot    open-metabot})))))

(defn- as-metabot
  "Calls `thunk` as a tool of `metabot` under the internal profile."
  [metabot thunk]
  (binding [shared/*metabot*    metabot
            shared/*profile-id* :internal]
    (thunk)))

(deftest curated-only-cards-test
  (curated-dashboard!
   (fn [{:keys [curated-id plain-id dash-id curated-metabot]}]
     (as-metabot
      curated-metabot
      (fn []
        (testing "an uncurated question is refused, and nothing is saved"
          (let [before (dashcards dash-id)]
            (is (= {:class :recoverable
                    :code  ::write-dashboard/cards-not-curated
                    :text  (str "Question " plain-id " can't be added: this Metabot only uses curated content"
                                " (verified, official, or Library content). Nothing was saved.\n"
                                "Call `search` to find curated questions, models, or metrics and add one of those"
                                " instead.")}
                   (failure {:dashboard_id dash-id
                             :name         "Renamed"
                             :ops          [{:op "add_card", :id -1, :card_id plain-id}]})))
            (is (= before (dashcards dash-id)))
            (is (= "Plain dashboard" (t2/select-one-fn :name :model/Dashboard :id dash-id)))))
        (testing "an uncurated series is refused, and so is an uncurated question set as a series"
          (is (=? {:code ::write-dashboard/cards-not-curated
                   :text (re-pattern (str "(?s)\\QQuestion " plain-id " can't be added\\E.*"))}
                  (failure {:dashboard_id dash-id
                            :ops          [{:op "add_card", :id -1, :card_id curated-id, :series [plain-id]}]})))
          (is (=? {:code ::write-dashboard/cards-not-curated}
                  (failure {:dashboard_id dash-id
                            :ops          [{:op "add_card", :id -1, :card_id curated-id}
                                           {:op "set_series", :dashcard_id -1, :card_ids [plain-id]}]})))
          (is (= [plain-id] (map :card_id (dashcards dash-id)))))
        (testing "a missing question reads as unknown, not as uncurated"
          (is (=? {:code ::write-dashboard/dashboard-op-rejected}
                  (failure {:dashboard_id dash-id
                            :ops          [{:op "add_card", :id -1, :card_id Integer/MAX_VALUE}]}))))
        (testing "a curated question is added to the uncurated dashboard"
          (call {:dashboard_id dash-id, :ops [{:op "add_card", :id -1, :card_id curated-id}]} :internal)
          (is (= #{plain-id curated-id} (set (map :card_id (dashcards dash-id)))))))))))

(deftest curated-only-result-test
  (curated-dashboard!
   (fn [{:keys [curated-id dash-id dashcard-id curated-metabot open-metabot]}]
     (let [slot-only (re-pattern (str "<dashcard dashcard_id=\"" dashcard-id "\" row=\"0\" col=\"0\" size_x=\"12\""
                                      " size_y=\"6\"/>"))]
       (testing "with curation on, the uncurated dashboard is edited"
         (let [output (as-metabot
                       curated-metabot
                       #(:output (call {:dashboard_id dash-id
                                        :name         "Renamed"
                                        :ops          [{:op "add_card", :id -1, :card_id curated-id}]}
                                       :internal)))]
           (is (= "Renamed" (t2/select-one-fn :name :model/Dashboard :id dash-id)))
           (testing "and its uncurated question shows its slot only"
             (is (re-find slot-only output))
             (is (not (re-find #"Plain revenue" output))))
           (testing "and its curated question shows in full"
             (is (re-find #"name=\"Curated revenue\"" output)))))
       (testing "with curation off, the uncurated question shows in full"
         (let [output (as-metabot open-metabot
                                  #(:output (call {:dashboard_id dash-id, :name "Renamed again"} :internal)))]
           (is (not (re-find slot-only output)))
           (is (re-find #"name=\"Plain revenue\"" output))))))))

(defn- curated-chart-query
  "A query over the curated question `curated-id`."
  [curated-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp curated-id))))

(deftest curated-only-chart-test
  (curated-dashboard!
   (fn [{:keys [curated-id dash-id curated-metabot]}]
     (mt/with-model-cleanup [:model/Card]
       (as-metabot
        curated-metabot
        (fn []
          (testing "a chart that reads an uncurated table is refused, and nothing is saved"
            (let [cards (t2/count :model/Card)]
              (is (=? {:class :recoverable
                       :code  ::recoverable.common/not-curated
                       :text  #"(?s)`chart A` is not available: this Metabot only uses curated content.*"}
                      (binding [shared/*memory-atom* (chart-memory)]
                        (failure {:dashboard_id dash-id
                                  :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}]}))))
              (is (= cards (t2/count :model/Card)))
              (is (= 1 (count (dashcards dash-id))))))
          (testing "a chart that reads a curated question is added and shown, though its new question isn't curated"
            (let [output (binding [shared/*memory-atom* (chart-memory nil (curated-chart-query curated-id))]
                           (:output (call {:dashboard_id dash-id
                                           :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}]}
                                          :internal)))]
              (is (= 2 (count (dashcards dash-id))))
              (is (re-find #"name=\"Venues\" display=\"bar\"" output))))))))))

(deftest curated-only-conversation-chart-test
  (curated-dashboard!
   (fn [{:keys [curated-id dash-id curated-metabot]}]
     (mt/with-model-cleanup [:model/Card]
       (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}]
         (as-metabot
          curated-metabot
          #(binding [shared/*memory-atom* (chart-memory convo-id (curated-chart-query curated-id))]
             (call {:dashboard_id dash-id
                    :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}]}
                   :internal)
             (testing "a chart saved by an earlier call of this conversation shows in full on a later edit"
               (is (re-find #"name=\"Venues\" display=\"bar\""
                            (:output (call {:dashboard_id dash-id, :name "Renamed"} :internal))))))))))))

(deftest curated-only-other-conversation-card-test
  (curated-dashboard!
   (fn [{:keys [dash-id curated-metabot]}]
     (mt/with-temp [:model/MetabotConversation {convo-id :id}    {:user_id (mt/user->id :crowberto)}
                    :model/MetabotConversation {other-id :id}    {:user_id (mt/user->id :crowberto)}
                    :model/Card                {card-id :id}     {:name                    "Other chat's chart"
                                                                  :dashboard_id            dash-id
                                                                  :dataset_query           (venues-query)
                                                                  :metabot_conversation_id other-id
                                                                  :metabot_chart_id        "A"}
                    :model/DashboardCard       {dashcard-id :id} {:dashboard_id dash-id
                                                                  :card_id      card-id
                                                                  :row          6
                                                                  :col          0
                                                                  :size_x       12
                                                                  :size_y       6}]
       (testing "a card saved from another conversation shows its slot only"
         (let [output (as-metabot
                       curated-metabot
                       #(binding [shared/*memory-atom* (chart-memory convo-id)]
                          (:output (call {:dashboard_id dash-id, :name "Renamed"} :internal))))]
           (is (re-find (re-pattern (str "<dashcard dashcard_id=\"" dashcard-id "\" row=\"6\" col=\"0\" size_x=\"12\""
                                         " size_y=\"6\"/>"))
                        output))
           (is (not (re-find #"Other chat's chart" output)))))))))

(deftest curation-off-test
  (curated-dashboard!
   (fn [{:keys [plain-id dash-id open-metabot]}]
     (testing "with curation off, an uncurated question is added"
       (as-metabot open-metabot
                   #(call {:dashboard_id dash-id, :ops [{:op "add_card", :id -1, :card_id plain-id}]} :internal))
       (is (= [plain-id plain-id] (map :card_id (dashcards dash-id)))))
     (testing "with curation off, a chart that reads an uncurated table is added"
       (mt/with-model-cleanup [:model/Card]
         (as-metabot open-metabot
                     #(binding [shared/*memory-atom* (chart-memory)]
                        (call {:dashboard_id dash-id
                               :ops          [{:op "add_card", :id -1, :chart_id "A", :name "Venues"}]}
                              :internal)))
         (is (= 3 (count (dashcards dash-id)))))))))

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

(deftest ^:parallel blank-name-test
  (letfn [(boundary-error [args]
            (test-util/tool-boundary-error "write_dashboard" #'write-dashboard/write-dashboard-tool args))]
    (testing "a blank dashboard name is refused, as save_entity refuses one"
      (is (=? #"Invalid tool arguments: `name` must be a non-blank string.*"
              (boundary-error {:name "   "}))))
    (testing "so is a blank name for the question a chart becomes"
      (is (=? #"Invalid tool arguments: `ops\[0\]\.name` must be a non-blank string.*"
              (boundary-error {:dashboard_id 1
                               :ops          [{:op "add_card", :id -1, :chart_id "A", :name "   "}]}))))
    (testing "a name too long for the app DB is refused"
      (is (=? #"Invalid tool arguments: `name` must contain 1 to 254 .*"
              (boundary-error {:name (apply str (repeat 255 "x"))}))))))

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
