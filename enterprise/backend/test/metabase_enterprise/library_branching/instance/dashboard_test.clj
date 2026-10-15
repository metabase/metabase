(ns metabase-enterprise.library-branching.instance.dashboard-test
  "The instance side of dashboards: the content that a read gives, `write!`, `current`, `trash!` and the stub, and the
  references of a read against the serdes walk of master. Each test writes in a transaction that rolls back."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.kinds.dashboard :as format.dashboard]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ---------------------------------------------------- Helpers ---------------------------------------------------

(defn- store [] (get app-db/kind-stores :dashboard))

(defn- with-refs [id item] (assoc item :refs (format.kinds/refs :dashboard id (:attrs item))))

(defn- write! [id item] (instance/write! (store) id (with-refs id item)))

(defn- current [id] (instance/current (store) id))

(defn- trash! [id] (instance/trash! (store) id))

(defn- refusal
  "The reason of the ::instance/refused that `(f)` throws, or nil when it throws none."
  [f]
  (try
    (f)
    nil
    (catch clojure.lang.ExceptionInfo e
      (when (= ::instance/refused (:type (ex-data e)))
        (:reason (ex-data e))))))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- db-name [] (t2/select-one-fn :name :model/Database (mt/id)))

(defn- field-key
  [table field]
  (let [{:keys [schema name]} (t2/select-one :model/Table (mt/id table))]
    [(db-name) schema name (t2/select-one-fn :name :model/Field (mt/id table field))]))

(defn- rows
  "The rows of dashboard `id`, its tabs, its dashboard cards, their series and its parameter cards."
  [id]
  (let [dashboard (t2/select-one :report_dashboard :entity_id id)
        dashcards (t2/select :report_dashboardcard :dashboard_id (:id dashboard) {:order-by [:id]})]
    [dashboard
     (t2/select :dashboard_tab :dashboard_id (:id dashboard) {:order-by [:id]})
     dashcards
     (when (seq dashcards) (t2/select :dashboardcard_series :dashboardcard_id [:in (map :id dashcards)] {:order-by [:id]}))
     (t2/select :parameter_card :parameterized_object_type "dashboard" :parameterized_object_id (:id dashboard)
                {:order-by [:id]})]))

(defn- metric-query [] (mt/mbql-query venues {:aggregation [[:count]]}))

(defn- do-with-world
  "Calls `f` with `{:dashboards :metrics :m1 :m2 :model :action}`: a Dashboards collection of the Library, two metrics,
  and a model outside the Library with an action, in a transaction that rolls back."
  [f]
  (collections.tu/with-library [{:keys [library metrics]}]
    (mt/with-temp [:model/Collection dashboards {:name     "Dashboards" :type "library-dashboards"
                                                 :location (children-location library)}
                   :model/Card       m1         {:name "Count" :type :metric :dataset_query (metric-query)
                                                 :collection_id (:id metrics)}
                   :model/Card       m2         {:name "Count again" :type :metric :dataset_query (metric-query)
                                                 :collection_id (:id metrics)}
                   :model/Card       model      {:name "Venues" :type :model :dataset_query (mt/mbql-query venues)}
                   :model/Action     action     {:type :implicit :name "Create a venue" :model_id (:id model)}]
      (t2/with-transaction [_ nil {:rollback-only true}]
        (f {:dashboards dashboards :metrics metrics :library library :m1 m1 :m2 m2 :model model :action action})))))

(def ^:private dashboard-id "lbDaShBoArDtEsT000001")
(def ^:private tab-1 "lbTaBoNeTaBoNeTaBo001")
(def ^:private tab-2 "lbTaBtWoTaBtWoTaBt002")
(def ^:private card-1 "lbDcArDoNeDcArDoNe001")
(def ^:private card-2 "lbDcArDtWoDcArDtWo002")
(def ^:private card-3 "lbDcArDtHrEeDcArDt003")

(defn- content
  "A dashboard in the collection `dashboards` with two tabs, a card with a series and a parameter mapping, an action
  button, a text card and a parameter whose values come from `m2`."
  [{:keys [dashboards m1 m2 action]}]
  {:kind  :dashboard
   :name  "Venue overview"
   :place (:entity_id dashboards)
   :attrs {:description "Venues at a glance."
           :width       "full"
           :parameters  [{:id                   "cat01"
                          :name                 "Category"
                          :slug                 "category"
                          :type                 "category"
                          :values_source_type   "card"
                          :values_source_config {:card_id     (:entity_id m2)
                                                 :value_field ["field" (field-key :venues :name) nil]}}
                         {:id "plain" :name "Plain" :slug "plain" :type "category"}]
           :tabs        [{:id tab-1 :name "Overview"} {:id tab-2 :name "Details"}]
           :dashcards   [{:id                 card-1
                          :card_id            (:entity_id m1)
                          :dashboard_tab_id   tab-1
                          :row                0
                          :col                0
                          :size_x             12
                          :size_y             6
                          :parameter_mappings [{:parameter_id "cat01"
                                                :card_id      (:entity_id m1)
                                                :target       ["dimension" ["field" (field-key :venues :category_id) nil]]}]
                          :series             [(:entity_id m2)]}
                         {:id               card-2
                          :action_id        (:entity_id action)
                          :dashboard_tab_id tab-1
                          :row              6
                          :col              0
                          :size_x           4
                          :size_y           2}
                         {:id                     card-3
                          :dashboard_tab_id       tab-2
                          :row                    0
                          :col                    0
                          :size_x                 12
                          :size_y                 2
                          :visualization_settings {:text "Notes" :virtual_card {:display "text"}}}]}})

(defn- in-order
  "`item` with its dashboard cards in the order of the format."
  [item]
  (update item :attrs (fn [a] (cond-> a
                                (:dashcards a) (update :dashcards #(format.dashboard/dashcard-order (get a :tabs []) %))))))

(defn- with-attrs [item f & args] (in-order (apply update item :attrs f args)))

;;; ---------------------------------------------------- Content ---------------------------------------------------

(deftest content-test
  (do-with-world
   (fn [{:keys [dashboards m1 m2 action] :as world}]
     (let [d   (t2/insert-returning-instance! :model/Dashboard
                                              {:name          "Venue overview"
                                               :entity_id     dashboard-id
                                               :collection_id (:id dashboards)
                                               :description   "Venues at a glance."
                                               :width         "full"
                                               :creator_id    (mt/user->id :crowberto)
                                               :parameters    [{:id                   "cat01"
                                                                :name                 "Category"
                                                                :slug                 "category"
                                                                :type                 "category"
                                                                :values_source_type   "card"
                                                                :values_source_config {:card_id     (:id m2)
                                                                                       :value_field [:field (mt/id :venues :name) nil]}}
                                                               {:id "plain" :name "Plain" :slug "plain" :type "category"}]})
           t1  (t2/insert-returning-pk! :model/DashboardTab {:dashboard_id (:id d) :name "Overview" :position 0
                                                             :entity_id tab-1})
           t2  (t2/insert-returning-pk! :model/DashboardTab {:dashboard_id (:id d) :name "Details" :position 1
                                                             :entity_id tab-2})
           ;; The cards are inserted out of their order, so the read must sort them.
           dc3 (t2/insert-returning-pk! :model/DashboardCard
                                        {:dashboard_id (:id d) :entity_id card-3 :dashboard_tab_id t2 :row 0 :col 0
                                         :size_x 12 :size_y 2
                                         :visualization_settings {:text "Notes" :virtual_card {:display "text"}}})
           dc1 (t2/insert-returning-pk! :model/DashboardCard
                                        {:dashboard_id (:id d) :entity_id card-1 :card_id (:id m1) :dashboard_tab_id t1
                                         :row 0 :col 0 :size_x 12 :size_y 6
                                         :parameter_mappings [{:parameter_id "cat01" :card_id (:id m1)
                                                               :target [:dimension [:field (mt/id :venues :category_id) nil]]}]})
           _   (t2/insert! :model/DashboardCardSeries {:dashboardcard_id dc1 :card_id (:id m2) :position 0})
           _   (t2/insert-returning-pk! :model/DashboardCard
                                        {:dashboard_id (:id d) :entity_id card-2 :action_id (:id action)
                                         :dashboard_tab_id t1 :row 6 :col 0 :size_x 4 :size_y 2})
           expected (with-refs dashboard-id (content world))]
       (testing "a dashboard: its collection, its attributes, its tabs in their order, its cards in their order with
                 their cards, actions, series, mappings and settings by entity id and natural key"
         (is (= expected (get (app-db/read-current) dashboard-id)))
         (is (= #{[:card (:entity_id m1)] [:card (:entity_id m2)] [:action (:entity_id action)]
                  [:field [:env (field-key :venues :name)]] [:field [:env (field-key :venues :category_id)]]}
                (:refs expected))))
       (testing "the item fits the schema of its kind, and survives encode and decode"
         (let [c (first (filter #(= :dashboard (codec/kind %)) format.kinds/codecs))]
           (is (mr/validate (codec/schema c) expected))
           (is (= [dashboard-id expected]
                  (codec/decode c (codec/read-yaml (writer/write-yaml (codec/encode c dashboard-id expected))))))))
       (testing "the public link, the embedding settings, the views, the cache and the bookkeeping columns are not
                 content"
         (t2/update! :model/Dashboard (:id d) {:public_uuid      (str (random-uuid))
                                               :enable_embedding true
                                               :embedding_params {:cat01 "enabled"}
                                               :cache_ttl        60
                                               :view_count       12})
         (t2/update! :model/DashboardCard dc3 {:created_at (java.time.OffsetDateTime/now)})
         (is (= expected (get (app-db/read-current) dashboard-id))))))))

(deftest scope-test
  (do-with-world
   (fn [{:keys [dashboards]}]
     (mt/with-temp [:model/Collection outside  {:name "Not the Library" :location "/"}
                    :model/Dashboard  in       {:name "In" :collection_id (:id dashboards)}
                    :model/Dashboard  archived {:name "Archived" :collection_id (:id dashboards) :archived true}
                    :model/Dashboard  out      {:name "Outside" :collection_id (:id outside)}]
       (testing "a dashboard is in scope iff it is not archived and its collection is in scope"
         (is (= #{(:entity_id in)} (:dashboard (scope/scope-ids scope/roots [:dashboard]))))
         (is (= 1 (:dashboard (scope/scope-count))))
         (is (some? (current (:entity_id in))))
         (is (every? nil? (map (comp current :entity_id) [archived out]))))))))

;;; ----------------------------------------------------- Writes ----------------------------------------------------

(deftest put-get-test
  (do-with-world
   (fn [{:keys [m1 m2 dashboards] :as world}]
     (let [item   (content world)
           steps  [["a new dashboard" item]
                   ["a renamed tab and a tab moved to the front"
                    (with-attrs item assoc :tabs [{:id tab-2 :name "Details, renamed"} {:id tab-1 :name "Overview"}])]
                   ["a card moved to another tab, with no mapping and no series"
                    (with-attrs item update :dashcards
                      (fn [dcs] (-> dcs
                                    (update 0 dissoc :parameter_mappings :series)
                                    (update 0 assoc :dashboard_tab_id tab-2 :row 4))))]
                   ["series in another order, and a card that changes its card"
                    (with-attrs item update :dashcards
                      (fn [dcs] (-> dcs
                                    (assoc-in [0 :series] [(:entity_id m2) (:entity_id m1)])
                                    (assoc-in [0 :card_id] (:entity_id m2)))))]
                   ["a removed card, a new card and other parameters"
                    (with-attrs item
                      (fn [a] (-> a
                                  (assoc :parameters [{:id "plain" :name "Plain" :slug "plain" :type "category"}])
                                  (update :dashcards (fn [dcs] (conj (subvec dcs 0 2)
                                                                     {:id "lbDcArDfOuRdCaRdFo004" :dashboard_tab_id tab-2
                                                                      :row 0 :col 0 :size_x 6 :size_y 6
                                                                      :card_id (:entity_id m2)}))))))]
                   ["no tab, no card and no parameter: the default of each"
                    (with-attrs item dissoc :tabs :dashcards :parameters :width :description)]
                   ["the content again, in another collection of the Library"
                    (let [other (t2/insert-returning-instance! :model/Collection
                                                               {:name "More dashboards" :location (children-location dashboards)})]
                      (assoc item :place (:entity_id other)))]]]
       (doseq [[label step] steps]
         (testing label
           (write! dashboard-id step)
           (is (= (with-refs dashboard-id step) (current dashboard-id)))))))))

(deftest get-put-test
  (do-with-world
   (fn [world]
     (write! dashboard-id (content world))
     (testing "a write of the current content changes no row"
       (let [before (rows dashboard-id)]
         (instance/write! (store) dashboard-id (current dashboard-id))
         (is (= before (rows dashboard-id))))))))

(deftest instance-local-attributes-test
  (do-with-world
   (fn [world]
     (write! dashboard-id (content world))
     (let [uuid (str (random-uuid))]
       (t2/update! :model/Dashboard :entity_id dashboard-id {:public_uuid uuid :enable_embedding true
                                                             :embedding_params {:cat01 "enabled"}})
       (testing "a write leaves the public link and the embedding settings as they are"
         (write! dashboard-id (with-attrs (content world) assoc :description "Changed."))
         (is (= [uuid true {"cat01" "enabled"}]
                ((juxt :public_uuid :enable_embedding :embedding_params)
                 (t2/select-one :model/Dashboard :entity_id dashboard-id)))))))))

(deftest parameter-cards-test
  (do-with-world
   (fn [{:keys [m2] :as world}]
     (testing "a parameter whose values come from a card has its ParameterCard row, as a save of the dashboard gives"
       (write! dashboard-id (content world))
       (let [d (t2/select-one :model/Dashboard :entity_id dashboard-id)]
         (is (= [[(:id m2) "cat01"]]
                (map (juxt :card_id :parameter_id)
                     (t2/select :model/ParameterCard :parameterized_object_type "dashboard"
                                :parameterized_object_id (:id d)))))
         (testing "and a write with no values source removes it"
           (write! dashboard-id (with-attrs (content world) update :parameters (partial mapv #(dissoc % :values_source_type :values_source_config))))
           (is (empty? (t2/select :model/ParameterCard :parameterized_object_type "dashboard"
                                  :parameterized_object_id (:id d))))))))))

(deftest trash-and-restore-test
  (do-with-world
   (fn [{:keys [dashboards] :as world}]
     (write! dashboard-id (content world))
     (let [d        (t2/select-one :model/Dashboard :entity_id dashboard-id)
           question (t2/insert-returning-instance! :model/Card {:name          "Internal" :type :question
                                                                :display       :table
                                                                :visualization_settings {}
                                                                :creator_id    (mt/user->id :crowberto)
                                                                :dataset_query (mt/mbql-query venues)
                                                                :dashboard_id  (:id d)
                                                                :collection_id (:id dashboards)})]
       (testing "trash! moves the dashboard and its questions to the trash"
         (trash! dashboard-id)
         (is (nil? (current dashboard-id)))
         (is (:archived (t2/select-one :model/Dashboard (:id d))))
         (is (:archived (t2/select-one :model/Card (:id question)))))
       (testing "a trash of a trashed dashboard, or of no dashboard, does nothing"
         (is (nil? (trash! dashboard-id)))
         (is (nil? (trash! "lbNoSuChDaShBoArD0001"))))
       (testing "a write restores the dashboard, and none of its questions: each question is an item"
         (write! dashboard-id (content world))
         (is (= (with-refs dashboard-id (content world)) (current dashboard-id)))
         (is (:archived (t2/select-one :model/Card (:id question)))))))))

(deftest move-test
  (do-with-world
   (fn [{:keys [dashboards] :as world}]
     (write! dashboard-id (content world))
     (let [d        (t2/select-one :model/Dashboard :entity_id dashboard-id)
           question (t2/insert-returning-instance! :model/Card {:name          "Internal" :type :question
                                                                :display       :table
                                                                :visualization_settings {}
                                                                :creator_id    (mt/user->id :crowberto)
                                                                :dataset_query (mt/mbql-query venues)
                                                                :dashboard_id  (:id d)
                                                                :collection_id (:id dashboards)})
           other    (t2/insert-returning-instance! :model/Collection {:name     "More dashboards"
                                                                      :location (children-location dashboards)})]
       (testing "a write that moves the dashboard moves its questions with it, as a save of the dashboard does"
         (write! dashboard-id (assoc (content world) :place (:entity_id other)))
         (is (= (:id other) (t2/select-one-fn :collection_id :model/Card (:id question)))))))))

(deftest refused-writes-test
  (do-with-world
   (fn [{:keys [library] :as world}]
     (let [item (content world)]
       (testing "a dashboard is in a collection of the Library"
         (is (= :place (refusal #(write! dashboard-id (assoc item :place nil)))))
         (mt/with-temp [:model/Collection outside {:name "Not the Library" :location "/"}]
           (is (= :place (refusal #(write! dashboard-id (assoc item :place (:entity_id outside))))))))
       (testing "a dashboard outside the Library keeps its identity"
         (mt/with-temp [:model/Collection outside {:name "Not the Library" :location "/"}
                        :model/Dashboard  _       {:name "A person's" :entity_id dashboard-id :collection_id (:id outside)}]
           (is (= :outside-library (refusal #(write! dashboard-id item))))))
       (testing "a card, an action or a field that this instance does not have is refused, and no row is made"
         (doseq [[label changed reason]
                 [["a card" (with-attrs item assoc-in [:dashcards 0 :card_id] "lbNoSuChCaRdNoSuChCa1") :reference]
                  ["an action" (with-attrs item assoc-in [:dashcards 1 :action_id] "lbNoSuChAcTiOnNoSuCh1") :reference]
                  ["a field" (with-attrs item assoc-in [:dashcards 0 :parameter_mappings 0 :target]
                               ["dimension" ["field" [(db-name) "PUBLIC" "VENUES" "NO_SUCH_FIELD"] nil]]) :environment]
                  ["a table" (with-attrs item assoc-in [:parameters 0 :values_source_config :value_field]
                               ["field" [(db-name) "PUBLIC" "NO_SUCH_TABLE" "ID"] nil]) :environment]]]
           (testing label
             (let [tables (t2/count :model/Table)
                   fields (t2/count :model/Field)]
               (is (= reason (refusal #(write! dashboard-id changed))))
               (is (nil? (t2/select-one :model/Dashboard :entity_id dashboard-id)))
               (is (= [tables fields] [(t2/count :model/Table) (t2/count :model/Field)]))))))
       (testing "content that is not a dashboard is refused"
         (is (= :invalid-content (refusal #(write! dashboard-id (assoc-in item [:attrs :tabs] [{:id tab-1}]))))))
       (is (some? library))))))

(deftest stub-test
  (do-with-world
   (fn [world]
     (let [item (with-refs dashboard-id (content world))
           stub (instance/stub (store) dashboard-id item (:refs item))]
       (testing "the stub of a dashboard has no card and no parameter, so it refers to nothing"
         (is (= #{} (:refs stub)))
         (is (= (:tabs (:attrs item)) (:tabs (:attrs stub))))
         (is (not-any? (:attrs stub) [:dashcards :parameters])))
       (testing "a write of the stub, then of the content, gives the content"
         (instance/write! (store) dashboard-id stub)
         (is (= stub (current dashboard-id)))
         (instance/write! (store) dashboard-id item)
         (is (= item (current dashboard-id))))))))

;;; ------------------------------------------- The serdes walk of master ---------------------------------------------

(defn- portable-target
  "The target of a reference for the serdes dependency or descendant `[model id]` of master, or nil for a model that
  library branching does not name."
  [[model id]]
  (case model
    ("Card" "Action" "Dashboard" "Collection" "Timeline")
    (t2/select-one-fn :entity_id (keyword "model" model) :id id)
    "Field"    [:env (serdes/*export-field-fk* id)]
    "Table"    [:env (serdes/*export-table-fk* id)]
    "Database" [:env [(t2/select-one-fn :name :model/Database :id id)]]
    nil))

(deftest refs-contain-the-serdes-walk-test
  (testing "the references of a dashboard that the instance reads hold every item and environment object that master's
            serdes walk follows from it, its descendants and its dependencies, but for its collection"
    (do-with-world
     (fn [{:keys [dashboards] :as world}]
       (write! dashboard-id (content world))
       (let [d       (t2/select-one :model/Dashboard :entity_id dashboard-id)
             _       (t2/update! :model/DashboardCard :entity_id card-3
                                 {:visualization_settings {:text           "Notes"
                                                           :virtual_card   {:display "text"}
                                                           :click_behavior {:type     "link" :linkType "dashboard"
                                                                            :targetId (:id d)}}})
             walk    (into (set (keys (serdes/descendants "Dashboard" (:id d) {})))
                           (map (fn [path] ((juxt :model :id) (peek path))))
                           (serdes/serialization-dependencies "Dashboard" d))
             targets (set (map second (:refs (current dashboard-id))))
             walked  (disj (set (keep portable-target walk)) (:entity_id dashboards))]
         (is (every? (set (map first walk)) ["Card" "Action" "Dashboard" "Field"]) "the walk follows each kind")
         (is (every? targets walked) (pr-str (remove targets walked))))))))

;;; ------------------------------------------------- Reference cycles ------------------------------------------------

(deftest new-dashboard-with-a-new-question-test
  (testing "the apply of a plan that creates a dashboard and a question of it, a reference cycle, gives both"
    (do-with-world
     (fn [{:keys [dashboards] :as world}]
       (write! dashboard-id (content world))
       (let [d        (t2/select-one :model/Dashboard :entity_id dashboard-id)
             question (t2/insert-returning-instance! :model/Card {:name                   "Internal" :type :question
                                                                  :display                :table
                                                                  :visualization_settings {}
                                                                  :creator_id             (mt/user->id :crowberto)
                                                                  :dataset_query          (mt/mbql-query venues)
                                                                  :dashboard_id           (:id d)
                                                                  :collection_id          (:id dashboards)})
             _        (t2/insert! :model/DashboardCard {:dashboard_id (:id d) :card_id (:id question) :row 9 :col 0
                                                        :size_x 4 :size_y 4 :entity_id "lbDcArDqUeStIoN000005"
                                                        :dashboard_tab_id (t2/select-one-pk :model/DashboardTab
                                                                                            :entity_id tab-1)})
             target   (select-keys (app-db/read-current) [dashboard-id (:entity_id question)])
             _        (t2/delete! :model/Dashboard (:id d))
             _        (t2/delete! :model/Card (:id question))
             local    (app-db/read-current)
             inst     (app-db/app-db-instance)
             steps    (plan/plan local (merge local target) local)
             result   (instance/apply-plan! inst steps {:base     (instance/base inst)
                                                        :new-base "5555555555555555555555555555555555555555"
                                                        :digests  {}
                                                        :head-ok? (constantly true)})]
         (is (= [:dashboard :question] (sort (map :kind (vals target)))))
         (is (contains? result :ok) (pr-str result))
         (is (= target (select-keys (app-db/read-current) (keys target)))))))))
