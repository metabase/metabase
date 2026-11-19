(ns metabase-enterprise.dependencies.marks-test
  "Characterizes which status rows each representative write marks stale, in each of the three status tables, and
  whether it triggers the jobs."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.batch-processing.core :as grouper]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(def ^:private status-models
  "The three status tables, by the key a mark map reports them under."
  {:dependency      :model/DependencyStatus
   :analysis        :model/AnalysisFindingStatus
   :result-metadata :model/ResultMetadataStatus})

(def ^:private edges
  "The dependency graph of the world, as `[from to]` names of its entities."
  [[:card-a :table-venues]
   [:card-b :card-a]
   [:metric :table-venues]
   [:card-c :metric]
   [:snippet-outer :snippet-inner]
   [:card-native :snippet-outer]
   [:measure :table-orders]
   [:card-d :measure]
   [:card-e :card-d]
   [:segment :table-venues]
   [:card-g :segment]
   [:dashboard :card-f]
   [:card-f :table-products]])

(defn- with-world!
  "Call `f` with a map from the name of each entity of a small world to its `[entity-type entity-id]`, its dependency
  graph stored and every status of every entity in every status table current."
  [f]
  (mt/with-temp [:model/Card               {card-a :id}        {:dataset_query (deps.test/table-query :venues)}
                 :model/Card               {card-b :id}        {:dataset_query (deps.test/card-query card-a)}
                 :model/Card               {metric :id}        {:type          :metric
                                                                :dataset_query (lib/aggregate (deps.test/table-query :venues)
                                                                                              (lib/count))}
                 :model/Card               {card-c :id}        {:dataset_query (deps.test/table-query :venues)}
                 :model/NativeQuerySnippet {snippet-inner :id} {:name "marks inner" :content "VENUES"}
                 :model/NativeQuerySnippet {snippet-outer :id} {:name "marks outer" :content "{{snippet: marks inner}}"}
                 :model/Card               {card-native :id}   {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                                                 "SELECT 1")}
                 :model/Measure            {measure :id}       {:name       "Marks measure"
                                                                :definition (lib/aggregate (deps.test/table-query :orders)
                                                                                           (lib/count))}
                 :model/Card               {card-d :id}        {:dataset_query (deps.test/table-query :orders)}
                 :model/Card               {card-e :id}        {:dataset_query (deps.test/table-query :orders)}
                 :model/Segment            {segment :id}       {}
                 :model/Card               {card-g :id}        {:dataset_query (deps.test/table-query :venues)}
                 :model/Card               {card-f :id}        {:dataset_query (deps.test/table-query :products)}
                 :model/Dashboard          {dashboard :id}     {}
                 :model/Transform          {transform :id}     {}]
    (let [world {:card-a         [:card card-a]
                 :card-b         [:card card-b]
                 :metric         [:card metric]
                 :card-c         [:card card-c]
                 :snippet-inner  [:snippet snippet-inner]
                 :snippet-outer  [:snippet snippet-outer]
                 :card-native    [:card card-native]
                 :measure        [:measure measure]
                 :card-d         [:card card-d]
                 :card-e         [:card card-e]
                 :segment        [:segment segment]
                 :card-g         [:card card-g]
                 :card-f         [:card card-f]
                 :dashboard      [:dashboard dashboard]
                 :transform      [:transform transform]
                 :table-venues   [:table (mt/id :venues)]
                 :table-orders   [:table (mt/id :orders)]
                 :table-products [:table (mt/id :products)]}]
      (t2/insert! :model/Dependency (for [[from to] edges
                                          :let      [[from-type from-id] (world from)
                                                     [to-type to-id]     (world to)]]
                                      {:from_entity_type from-type :from_entity_id from-id
                                       :to_entity_type   to-type   :to_entity_id   to-id}))
      (try
        (f world)
        (finally
          (doseq [model (vals status-models)
                  [entity-type entity-id] (vals world)]
            (t2/delete! model :entity_type entity-type :entity_id entity-id))
          (t2/delete! :model/Dependency {:where (into [:or] (for [[t id] (vals world)]
                                                              [:and [:= :from_entity_type (name t)] [:= :from_entity_id id]]))}))))))

(defn- reset-statuses!
  "Make every status of every entity of `world` current in every status table."
  [world]
  (doseq [model                   (vals status-models)
          [entity-type entity-id] (vals world)]
    (deps.test/record-status-processed! model entity-type entity-id 1)
    (t2/update! model :entity_type entity-type :entity_id entity-id {:stale 0 :terminal false :fail_count 0})))

(defn- stale-names
  "The names of the entities of `world` whose status in the status `model` counts a write."
  [world model]
  (let [by-node (into {} (map (fn [[k v]] [v k])) world)]
    (into (sorted-set)
          (keep (fn [{:keys [entity_type entity_id]}] (by-node [entity_type entity_id])))
          (t2/select [model :entity_type :entity_id] :stale [:> 0]))))

(defn- marks!
  "Which statuses of the entities of `world` the `write!` marks, by status table, and whether it triggers the jobs."
  [world write!]
  (reset-statuses! world)
  (let [submitted (atom 0)]
    (mt/with-dynamic-fn-redefs [grouper/submit! (fn [_queue _write] (swap! submitted inc))]
      (deps.test/do-with-immediate-hook-writes write!))
    (into {:triggers? (pos? @submitted)}
          (map (fn [[k model]] [k (stale-names world model)]))
          status-models)))

(defn- marked
  "The expected marks: the entity names in each status table, and whether the jobs trigger."
  [{:keys [dependency analysis result-metadata triggers?] :or {triggers? true}}]
  {:triggers?       triggers?
   :dependency      (into (sorted-set) dependency)
   :analysis        (into (sorted-set) analysis)
   :result-metadata (into (sorted-set) result-metadata)})

(defn- id-of
  "The id of the entity of `world` named `k`."
  [world k]
  (second (world k)))

(deftest card-writes-test
  (mt/with-premium-features #{:dependencies}
    (with-world!
      (fn [world]
        (testing "a query change marks the card's own dependency and analysis, and through the result metadata it
                derives, what reads it"
          (is (= (marked {:dependency [:card-a] :analysis [:card-a :card-b] :result-metadata [:card-b]})
                 (marks! world #(t2/update! :model/Card :id (id-of world :card-a)
                                            {:dataset_query (deps.test/table-query :orders)})))))
        (testing "a question rename marks nothing and triggers nothing"
          (is (= (marked {:triggers? false})
                 (marks! world #(t2/update! :model/Card :id (id-of world :card-b) {:name "Renamed"})))))
        (testing "a metric rename marks the result metadata and analysis of its direct dependents"
          (is (= (marked {:analysis [:card-c] :result-metadata [:card-c]})
                 (marks! world #(t2/update! :model/Card :id (id-of world :metric) {:name "Renamed metric"})))))
        (testing "a result metadata change dependents see marks them"
          (let [metadata (t2/select-one-fn :result_metadata :model/Card :id (id-of world :card-a))]
            (is (= (marked {:analysis [:card-b] :result-metadata [:card-b]})
                   (marks! world #(t2/update! :model/Card :id (id-of world :card-a)
                                              {:result_metadata (mapv (fn [col] (assoc col :display_name "Renamed"))
                                                                      metadata)}))))))
        (testing "a result metadata change dependents don't see marks nothing"
          (let [metadata (t2/select-one-fn :result_metadata :model/Card :id (id-of world :card-a))]
            (is (= (marked {:triggers? false})
                   (marks! world #(t2/update! :model/Card :id (id-of world :card-a)
                                              {:result_metadata (mapv (fn [col]
                                                                        (assoc col :fingerprint
                                                                               {:global {:distinct-count 3}}))
                                                                      metadata)}))))))
        (testing "a card type change marks its own dependency and analysis, and what reads it"
          (is (= (marked {:dependency [:card-a] :analysis [:card-a :card-b] :result-metadata [:card-b]})
                 (marks! world #(t2/update! :model/Card :id (id-of world :card-a) {:type :model})))))
        (testing "creating a card marks nothing but triggers the jobs"
          (is (= (marked {})
                 (marks! world #(t2/delete! :model/Card :id (t2/insert-returning-pk!
                                                             :model/Card
                                                             {:name                   "created"
                                                              :display                :table
                                                              :visualization_settings {}
                                                              :creator_id             (mt/user->id :rasta)
                                                              :dataset_query          (deps.test/table-query :venues)}))))))
        (testing "deleting a card marks the result metadata and analysis of its direct dependents"
          (is (= (marked {:analysis [:card-e] :result-metadata [:card-e]})
                 (marks! world #(t2/delete! :model/Card :id (id-of world :card-d))))))))))

(deftest snippet-and-measure-writes-test
  (mt/with-premium-features #{:dependencies}
    (with-world!
      (fn [world]
        (testing "a snippet content change marks its own dependency and every transitive dependent's dependency and
                analysis"
          (is (= (marked {:dependency [:card-native :snippet-inner :snippet-outer]
                          :analysis   [:card-native :snippet-outer]})
                 (marks! world #(t2/update! :model/NativeQuerySnippet :id (id-of world :snippet-inner)
                                            {:content "ORDERS"})))))
        (testing "a measure definition change marks its own dependency and every transitive dependent's result
                metadata and analysis"
          (is (= (marked {:dependency      [:measure]
                          :analysis        [:card-d :card-e]
                          :result-metadata [:card-d :card-e]})
                 (marks! world #(t2/update! :model/Measure :id (id-of world :measure)
                                            {:definition (lib/aggregate (deps.test/table-query :orders)
                                                                        (lib/count))
                                             :name       "Renamed measure"})))))
        (testing "a segment definition change marks its own dependency and analysis and its direct dependents"
          (is (= (marked {:dependency      [:segment]
                          :analysis        [:card-g :segment]
                          :result-metadata [:card-g]})
                 (marks! world #(t2/update! :model/Segment :id (id-of world :segment)
                                            {:definition (lib/filter (deps.test/table-query :checkins)
                                                                     (lib/= 2 2))})))))
        (testing "deleting a snippet marks every transitive dependent's dependency and analysis"
          (is (= (marked {:dependency [:card-native :snippet-outer]
                          :analysis   [:card-native :snippet-outer]})
                 (marks! world #(t2/delete! :model/NativeQuerySnippet :id (id-of world :snippet-inner))))))
        (testing "deleting a measure marks every transitive dependent's result metadata and analysis"
          (is (= (marked {:analysis [:card-d :card-e] :result-metadata [:card-d :card-e]})
                 (marks! world #(t2/delete! :model/Measure :id (id-of world :measure))))))))))

(deftest table-and-field-writes-test
  (mt/with-premium-features #{:dependencies}
    (with-world!
      (fn [world]
        (let [venues-dependents [:card-a :metric :segment]]
          (testing "a table rename marks its direct dependents"
            (mt/with-temp-vals-in-db :model/Table (mt/id :venues) {:display_name "Venues"}
              (is (= (marked {:analysis venues-dependents :result-metadata venues-dependents})
                     (marks! world #(t2/update! :model/Table :id (mt/id :venues) {:display_name "Places"}))))))
          (testing "a table description change marks nothing"
            (mt/with-temp-vals-in-db :model/Table (mt/id :venues) {:description "Venues"}
              (is (= (marked {:triggers? false})
                     (marks! world #(t2/update! :model/Table :id (mt/id :venues) {:description "Places"}))))))
          (testing "a field rename marks its table's direct dependents"
            (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:display_name "Price"}
              (is (= (marked {:analysis venues-dependents :result-metadata venues-dependents})
                     (marks! world #(t2/update! :model/Field :id (mt/id :venues :price) {:display_name "Cost"}))))))
          (testing "a field fingerprint marks nothing"
            (is (= (marked {:triggers? false})
                   (marks! world #(t2/update! :model/Field :id (mt/id :venues :price)
                                              {:last_analyzed (t/offset-date-time)})))))
          (testing "creating and deleting a field marks its table's direct dependents"
            (let [field-id (atom nil)]
              (is (= (marked {:analysis venues-dependents :result-metadata venues-dependents})
                     (marks! world #(reset! field-id (t2/insert-returning-pk! :model/Field {:table_id      (mt/id :venues)
                                                                                            :name          "marks"
                                                                                            :base_type     :type/Text
                                                                                            :database_type "TEXT"})))))
              (is (= (marked {:analysis venues-dependents :result-metadata venues-dependents})
                     (marks! world #(t2/delete! :model/Field :id @field-id))))))
          (testing "table user settings mark its table's direct dependents"
            (is (= (marked {:analysis venues-dependents :result-metadata venues-dependents})
                   (marks! world #(t2/insert! :model/TableUserSettings {:table_id (mt/id :venues) :display_name "Places"}))))
            (is (= (marked {:analysis venues-dependents :result-metadata venues-dependents})
                   (marks! world #(t2/delete! :model/TableUserSettings :table_id (mt/id :venues))))))
          (testing "field user settings mark the field's table's direct dependents"
            (is (= (marked {:analysis venues-dependents :result-metadata venues-dependents})
                   (marks! world #(t2/insert! :model/FieldUserSettings {:field_id     (mt/id :venues :price)
                                                                        :display_name "Cost"}))))
            (is (= (marked {:analysis venues-dependents :result-metadata venues-dependents})
                   (marks! world #(t2/delete! :model/FieldUserSettings :field_id (mt/id :venues :price)))))))))))

(deftest remap-writes-test
  (mt/with-premium-features #{:dependencies}
    (with-world!
      (fn [world]
        (let [orders-transitive [:card-d :card-e :measure]
              venues-transitive [:card-a :card-b :card-c :card-g :metric :segment]]
          (testing "an external remap marks the transitive dependents of the remapped field's table"
            (let [dimension-id (atom nil)]
              (is (= (marked {:analysis orders-transitive :result-metadata orders-transitive})
                     (marks! world #(reset! dimension-id (t2/insert-returning-pk!
                                                          :model/Dimension
                                                          {:field_id                (mt/id :orders :product_id)
                                                           :type                    :external
                                                           :name                    "Product"
                                                           :human_readable_field_id (mt/id :products :title)})))))
              (testing "and a change of its human-readable field marks them, and the field's own table's direct
                      dependents"
                (mt/with-temp-vals-in-db :model/Field (mt/id :products :title) {:display_name "Title"}
                  (is (= (marked {:analysis        (conj orders-transitive :card-f)
                                  :result-metadata (conj orders-transitive :card-f)})
                         (marks! world #(t2/update! :model/Field :id (mt/id :products :title)
                                                    {:display_name "Name"}))))))
              (testing "and a user setting of its human-readable field"
                (is (= (marked {:analysis        (conj orders-transitive :card-f)
                                :result-metadata (conj orders-transitive :card-f)})
                       (marks! world #(t2/insert! :model/FieldUserSettings {:field_id     (mt/id :products :title)
                                                                            :display_name "Item"}))))
                (t2/delete! :model/FieldUserSettings :field_id (mt/id :products :title)))
              (testing "and deleting it"
                (is (= (marked {:analysis orders-transitive :result-metadata orders-transitive})
                       (marks! world #(t2/delete! :model/Dimension :id @dimension-id)))))))
          (testing "the FieldValues of an internal remap mark the transitive dependents when they gain human-readable
                  values, and nothing when only their values change"
            (mt/with-temp [:model/Dimension   _  {:field_id (mt/id :venues :price) :type :internal :name "Price"}
                           :model/FieldValues fv {:field_id              (mt/id :venues :price) :type :full
                                                  :values                [1 2 3 4]
                                                  :human_readable_values []}]
              (is (= (marked {:triggers? false})
                     (marks! world #(t2/update! :model/FieldValues :id (:id fv) {:values [1 2 3 4 5]}))))
              (is (= (marked {:analysis venues-transitive :result-metadata venues-transitive})
                     (marks! world #(t2/update! :model/FieldValues :id (:id fv)
                                                {:human_readable_values ["$" "$$" "$$$" "$$$$" "$$$$$"]})))))))))))

(deftest dashboard-writes-test
  (mt/with-premium-features #{:dependencies}
    (with-world!
      (fn [world]
        (let [dashboard-id (id-of world :dashboard)
              dashcard-id  (atom nil)]
          (testing "a parameter change marks the dashboard's dependency"
            (is (= (marked {:dependency [:dashboard]})
                   (marks! world #(t2/update! :model/Dashboard :id dashboard-id
                                              {:parameters [{:id "p" :name "P" :slug "p" :type :category}]})))))
          (testing "a dashboard card marks the dashboard's dependency when it is created, changed or deleted"
            (is (= (marked {:dependency [:dashboard]})
                   (marks! world #(reset! dashcard-id (t2/insert-returning-pk! :model/DashboardCard
                                                                               {:dashboard_id dashboard-id
                                                                                :card_id      (id-of world :card-f)
                                                                                :row 0 :col 0 :size_x 4 :size_y 4})))))
            (is (= (marked {:dependency [:dashboard]})
                   (marks! world #(t2/update! :model/DashboardCard :id @dashcard-id {:card_id (id-of world :card-a)}))))
            (is (= (marked {:triggers? false})
                   (marks! world #(t2/update! :model/DashboardCard :id @dashcard-id {:row 2}))))
            (is (= (marked {:dependency [:dashboard]})
                   (marks! world #(t2/insert! :model/DashboardCardSeries {:dashboardcard_id @dashcard-id
                                                                          :card_id          (id-of world :card-b)
                                                                          :position         0}))))
            (is (= (marked {:dependency [:dashboard]})
                   (marks! world #(t2/delete! :model/DashboardCardSeries :dashboardcard_id @dashcard-id))))
            (is (= (marked {:dependency [:dashboard]})
                   (marks! world #(t2/delete! :model/DashboardCard :id @dashcard-id)))))
          (testing "a tab marks the dashboard's dependency"
            (is (= (marked {:dependency [:dashboard]})
                   (marks! world #(t2/delete! :model/DashboardTab :id (t2/insert-returning-pk!
                                                                       :model/DashboardTab
                                                                       {:dashboard_id dashboard-id
                                                                        :name         "Tab"
                                                                        :position     0})))))))))))

(deftest transform-and-action-writes-test
  (mt/with-premium-features #{:dependencies}
    (with-world!
      (fn [world]
        (testing "a transform source change marks its own dependency and analysis"
          (is (= (marked {:dependency [:transform] :analysis [:transform]})
                 (marks! world #(t2/update! :model/Transform :id (id-of world :transform)
                                            {:source {:type  :query
                                                      :query (lib/native-query (mt/metadata-provider) "SELECT 2")}})))))
        (testing "a transform rename marks nothing"
          (is (= (marked {:triggers? false})
                 (marks! world #(t2/update! :model/Transform :id (id-of world :transform) {:name "Renamed"})))))
        (mt/with-temp [:model/Action      {action-id :id} {:type :query :name "Marks action"}
                       :model/QueryAction _               {:action_id     action-id
                                                           :database_id   (mt/id)
                                                           :dataset_query (lib/native-query (mt/metadata-provider)
                                                                                            "UPDATE venues SET id = 1")}]
          (let [world (assoc world :action [:action action-id])]
            (testing "a query action's query change marks the action's dependency"
              (is (= (marked {:dependency [:action]})
                     (marks! world #(t2/update! :model/QueryAction :action_id action-id
                                                {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                                  "UPDATE venues SET id = 2")})))))
            (testing "an action rename marks nothing"
              (is (= (marked {:triggers? false})
                     (marks! world #(t2/update! :model/Action :id action-id {:name "Renamed"})))))))))))

(deftest data-app-writes-test
  (mt/with-premium-features #{:dependencies}
    (data-apps.tu/with-published-tables! [(mt/id :products)]
      (with-world!
        (fn [world]
          (mt/with-temp [:model/DataApp    {app-id :id collection-id :resource_collection_id} {:slug        "marks"
                                                                                               :name        "Marks"
                                                                                               :bundle_path "marks.js"}
                         :model/Collection {other-id :id} {}]
            (let [world   (assoc world :data-app [:data-app app-id])
                  card-id (id-of world :card-f)]
              (testing "moving a card into and out of an app's resource collection marks the app's dependency"
                (is (= (marked {:dependency [:data-app]})
                       (marks! world #(t2/update! :model/Card :id card-id {:collection_id collection-id}))))
                (is (= (marked {:dependency [:data-app]})
                       (marks! world #(t2/update! :model/Card :id card-id {:collection_id other-id})))))
              (testing "moving a card between other collections marks nothing, but triggers the jobs"
                (is (= (marked {})
                       (marks! world #(t2/update! :model/Card :id card-id {:collection_id nil}))))))))))))
