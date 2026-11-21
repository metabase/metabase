(ns metabase-enterprise.dependencies.events-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.batch-processing.core :as grouper]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.dimension :as dimension]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(def ^:private table-query deps.test/table-query)

(def ^:private card-query deps.test/card-query)

(def ^:private pending? deps.test/dependency-pending?)

(def ^:private computed! deps.test/record-dependencies-computed!)

(defn- status-row-count []
  (reduce + (map t2/count [:model/DependencyStatus :model/ResultMetadataStatus :model/AnalysisFindingStatus])))

(deftest card-update-adds-no-status-test
  (testing "updating a card adds no status row, and triggers the jobs once it commits"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (let [submitted (atom [])
              before    (status-row-count)]
          (mt/with-dynamic-fn-redefs [grouper/submit! (fn [_queue write] (swap! submitted conj write))]
            (deps.test/do-with-immediate-hook-writes
             #(t2/update! :model/Card :id card-id {:dataset_query (table-query :orders)})))
          (is (= before (status-row-count)))
          (is (= [{:dependency-jobs true}] @submitted)))))))

(deftest card-update-without-feature-test
  (testing "without the dependencies feature the hooks trigger nothing"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (let [submitted (atom [])]
          (mt/with-dynamic-fn-redefs [grouper/submit! (fn [_queue write] (swap! submitted conj write))]
            (deps.test/do-with-immediate-hook-writes
             #(t2/update! :model/Card :id card-id {:dataset_query (table-query :orders)})))
          (is (= [] @submitted)))))))

(deftest update-marking-nothing-triggers-nothing-test
  (testing "an update that marks nothing triggers no job, as a sync storing only a field's fingerprint"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Field {field-id :id} {:table_id (mt/id :venues) :name "x"}]
        (let [submitted (atom [])]
          (mt/with-dynamic-fn-redefs [grouper/submit! (fn [_queue write] (swap! submitted conj write))]
            (deps.test/do-with-immediate-hook-writes
             #(field/update-field! field-id {:last_analyzed (t/offset-date-time)})))
          (is (= [] @submitted)))))))

(deftest output-columns-mark-dependents-test
  (testing "a metric rename, a field position and a table schema reach the cards reading them, a question rename and a
           table caveat don't"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :venues)}
                     :model/Card {card-id :id}   {:dataset_query (card-query source-id)}
                     :model/Card {metric-id :id} {:type          :metric
                                                  :dataset_query (lib/aggregate (table-query :venues) (lib/count))}]
        (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                       :to_entity_type   :card :to_entity_id   source-id})
        (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                       :to_entity_type   :card :to_entity_id   metric-id})
        (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id source-id
                                       :to_entity_type   :table :to_entity_id  (mt/id :venues)})
        (let [marks? (fn [card write!]
                       (deps.test/record-result-metadata-processed! card)
                       (write!)
                       (deps.test/result-metadata-pending? card))]
          (is (not (marks? card-id #(t2/update! :model/Card :id source-id {:name "Renamed"}))))
          (is (marks? card-id #(t2/update! :model/Card :id metric-id {:name "Renamed"})))
          (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:position 5}
            (is (marks? source-id #(field/update-field! (mt/id :venues :price) {:position 0}))))
          (mt/with-temp-vals-in-db :model/Table (mt/id :venues) {:schema "PUBLIC"}
            (is (marks? source-id #(table/update-table! (mt/id :venues) {:schema "OTHER"}))))
          (mt/with-temp [:model/TableUserSettings {settings-id :id} {:table_id (mt/id :venues)}]
            (is (not (marks? source-id #(table-user-settings/update-table-user-settings-rows!
                                         [{:id settings-id :caveats "Careful"}]))))))))))

(deftest card-metadata-dependents-see-test
  (testing "a card's result metadata change marks its dependents only when it changes what they see"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :venues)}
                     :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
        (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                       :to_entity_type   :card :to_entity_id   source-id})
        (let [metadata (t2/select-one-fn :result_metadata :model/Card :id source-id)
              marks?   (fn [f]
                         (deps.test/record-result-metadata-processed! card-id)
                         (t2/update! :model/Card :id source-id {:result_metadata (mapv f metadata)})
                         (deps.test/result-metadata-pending? card-id))]
          (is (not (marks? #(assoc % :fingerprint {:global {:distinct-count 3}}))))
          (is (marks? #(cond-> % (= "NAME" (:name %)) (assoc :display_name "Renamed")))))))))

(defn- with-card-and-dependent!
  "Call `f` with a card on `table-key` and a card on that card, whose result metadata and analysis are current, and a
  function telling whether both are pending for both jobs."
  [table-key f]
  (mt/with-temp [:model/Card {card-id :id}      {:dataset_query (table-query table-key)}
                 :model/Card {dependent-id :id} {:dataset_query (card-query card-id)}]
    (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                   :to_entity_type   :table :to_entity_id  (mt/id table-key)})
    (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id dependent-id
                                   :to_entity_type   :card :to_entity_id   card-id})
    (f (fn []
         (doseq [id [card-id dependent-id]]
           (deps.test/record-result-metadata-processed! id)
           (deps.test/record-analysis-finding-processed! :card id)))
       (fn []
         (every? (fn [id] (and (deps.test/result-metadata-pending? id)
                               (deps.test/analysis-finding-pending? :card id)))
                 [card-id dependent-id])))))

(deftest remap-marks-transitive-dependents-test
  (testing "an external remap, its human-readable field and that field's user settings mark every card that carries
           the remapped column"
    (mt/with-premium-features #{:dependencies}
      (with-card-and-dependent!
        :orders
        (fn [processed! both-pending?]
          (processed!)
          (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :orders :product_id)
                                             :type                    :external
                                             :name                    "Product"
                                             :human_readable_field_id (mt/id :products :title)}]
            (testing "adding the remap"
              (is (both-pending?)))
            (testing "changing its human-readable field"
              (processed!)
              (mt/with-temp-vals-in-db :model/Field (mt/id :products :title) {:display_name "Title"}
                (field/update-field! (mt/id :products :title) {:display_name "Renamed"})
                (is (both-pending?))))
            (testing "a user setting of its human-readable field"
              (processed!)
              (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :products :title) :display_name "Item"}]
                (is (both-pending?))))))))))

(deftest internal-remap-values-mark-transitive-dependents-test
  (testing "the FieldValues of an internally remapped field mark every card carrying the remapped column when they gain
           or lose human-readable values, and not when only their values change"
    (mt/with-premium-features #{:dependencies}
      (with-card-and-dependent!
        :venues
        (fn [processed! both-pending?]
          (mt/with-temp [:model/Dimension   _ {:field_id (mt/id :venues :price) :type :internal :name "Price"}
                         :model/FieldValues fv {:field_id (mt/id :venues :price) :type :full
                                                :values [1 2 3 4] :human_readable_values []}]
            (processed!)
            (field-values/update-field-values! [{:id (:id fv) :values [1 2 3 4 5]}])
            (is (not (both-pending?)))
            (field-values/update-field-values! [{:id (:id fv) :human_readable_values ["$" "$$" "$$$" "$$$$" "$$$$$"]}])
            (is (both-pending?))))))))

(deftest batched-marks-test
  (testing "a batch of field writes marks the cards reading their table once per status, and triggers the jobs once"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
        (t2/insert! :model/Dependency {:from_entity_type :card  :from_entity_id card-id
                                       :to_entity_type   :table :to_entity_id   (mt/id :venues)})
        (deps.test/record-result-metadata-processed! card-id)
        (let [marks     (atom [])
              submitted (atom [])
              mark!     (mt/original-fn #'dependencies.db/mark-dependents-result-metadata-statuses-stale!)]
          (mt/with-dynamic-fn-redefs [dependencies.db/mark-dependents-result-metadata-statuses-stale!
                                      (fn [entity-type entity-ids]
                                        (swap! marks conj [entity-type entity-ids])
                                        (mark! entity-type entity-ids))
                                      grouper/submit! (fn [_queue write] (swap! submitted conj write))]
            (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:position 5}
              (mt/with-temp-vals-in-db :model/Field (mt/id :venues :name) {:position 6}
                (reset! marks [])
                (reset! submitted [])
                (deps.test/do-with-immediate-hook-writes
                 #(events/with-batched-events
                    (field/update-field! (mt/id :venues :price) {:position 0})
                    (field/update-field! (mt/id :venues :name) {:position 1})))
                (is (= [[:table #{(mt/id :venues)}]] @marks))
                (is (= [{:dependency-jobs true}] @submitted))
                (is (deps.test/result-metadata-pending? card-id))))))))))

(deftest snippet-delete-marks-transitive-dependencies-test
  (testing "deleting a snippet nested in another marks the dependencies of the cards expanding it"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/NativeQuerySnippet {inner-id :id} {:name "inner delete" :content "VENUES"}
                     :model/NativeQuerySnippet {outer-id :id} {:name "outer delete" :content "{{snippet: inner delete}}"}
                     :model/Card              {card-id :id}  {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                                               "{{snippet: outer delete}}")}]
        (t2/insert! :model/Dependency {:from_entity_type :snippet :from_entity_id outer-id
                                       :to_entity_type   :snippet :to_entity_id   inner-id})
        (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                       :to_entity_type   :snippet :to_entity_id outer-id})
        (computed! :card card-id)
        (t2/delete! :model/NativeQuerySnippet :id inner-id)
        (is (pending? :card card-id))))))

(deftest card-marks-own-statuses-test
  (testing "an update of what a job reads of a card marks the card's own status for that job stale, and a question's
           rename marks nothing"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (computed! :card card-id)
        (t2/update! :model/Card :id card-id {:name "Renamed"})
        (is (not (pending? :card card-id)))
        (t2/update! :model/Card :id card-id {:dataset_query (table-query :orders)})
        (is (pending? :card card-id))))))

(deftest dashboard-parts-mark-dashboard-test
  (testing "inserting, updating and deleting a dashboard card, a series or a tab marks the dashboard's dependencies stale"
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                       :model/Card      {card-id :id}      {:dataset_query (table-query :products)}
                       :model/Card      {other-id :id}     {:dataset_query (table-query :orders)}]
          (let [changes? (fn [write!]
                           (computed! :dashboard dashboard-id)
                           (write!)
                           (pending? :dashboard dashboard-id))
                dashcard (atom nil)]
            (testing "inserting a dashboard card"
              (is (changes? #(reset! dashcard (:id (first (dashboard-card/create-dashboard-cards!
                                                           [{:dashboard_id dashboard-id :card_id card-id
                                                             :row 0 :col 0 :size_x 4 :size_y 4}])))))))
            (testing "pointing a dashboard card at another card"
              (is (changes? #(dashboard-card/update-dashboard-card-rows! [{:id @dashcard :card_id other-id}]))))
            (testing "adding a series"
              (is (changes? #(dashboard-card/update-dashboard-cards-series! {@dashcard [card-id]}))))
            (testing "removing a series"
              (is (changes? #(dashboard-card/update-dashboard-cards-series! {@dashcard []}))))
            (testing "adding and removing a tab"
              (let [tab-id (atom nil)]
                (is (changes? #(reset! tab-id (first (dashboard-tab/create-dashboard-tabs!
                                                      [{:dashboard_id dashboard-id :name "Tab"
                                                        :position 0}])))))
                (is (changes? #(dashboard-tab/do-update-tabs! dashboard-id
                                                              (t2/select :model/DashboardTab :id @tab-id)
                                                              [])))))
            (testing "removing a dashboard card"
              (is (changes? #(dashboard-card/delete-dashboard-cards! [@dashcard]))))
            (testing "nothing else"
              (computed! :dashboard dashboard-id)
              (is (not (pending? :dashboard dashboard-id))))))))))

(deftest table-parts-mark-cards-test
  (testing "a write of a table, its user settings, one of its fields, field user settings or dimensions, marks the cards
           on it stale"
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
          (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                         :to_entity_type   :table :to_entity_id (mt/id :venues)})
          (let [table-id (mt/id :venues)
                field-id (mt/id :venues :price)
                changes? (fn [write!]
                           (deps.test/record-result-metadata-processed! card-id)
                           (write!)
                           (deps.test/result-metadata-pending? card-id))]
            (mt/with-temp-vals-in-db :model/Table table-id {:display_name "Venues"}
              (is (changes? #(table/update-table! table-id {:display_name "Places"}))))
            (mt/with-temp-vals-in-db :model/Field field-id {:display_name "Price"}
              (is (changes? #(field/update-field! field-id {:display_name "Cost"}))))
            (mt/with-temp-vals-in-db :model/Field field-id {:display_name "Price"}
              (mt/with-temp [:model/FieldUserSettings {settings-id :id} {:field_id field-id :display_name "Cost"}]
                (is (changes? #(field-user-settings/update-field-user-settings-rows!
                                [{:id settings-id :display_name "Price"}])))))
            (mt/with-temp-vals-in-db :model/Table table-id {:display_name "Venues"}
              (let [settings-id (atom nil)]
                (is (changes? #(reset! settings-id (:id (first (table-user-settings/create-table-user-settings!
                                                                [{:table_id table-id :display_name "Places"}]))))))
                (is (changes? #(table-user-settings/update-table-user-settings-rows!
                                [{:id @settings-id :display_name "Spots"}])))
                (is (changes? #(table-user-settings/delete-table-user-settings! [table-id])))))
            (let [dimension-id (atom nil)]
              (is (changes? #(reset! dimension-id (:id (dimension/create-dimension!
                                                        {:field_id field-id :name "Price" :type :internal})))))
              (is (changes? #(dimension/delete-dimensions! [@dimension-id]))))))))))

(deftest card-writes-mark-resource-collection-apps-in-one-statement-test
  (testing "a card write in a data app's resource collection marks the app's dependencies stale in one statement,
           without looking the app up first"
    (mt/with-premium-features #{:dependencies}
      (data-apps.tu/with-published-tables! [(mt/id :products)]
        (mt/with-temp [:model/DataApp {app-id :id collection-id :resource_collection_id} {:slug         "birds"
                                                                                          :name         "Birds"
                                                                                          :bundle_path  "birds.js"}
                       :model/Collection {other-collection-id :id} {}
                       :model/Card card {:dataset_query (table-query :products) :collection_id collection-id}]
          (let [marks       (fn [hook!]
                              (computed! :data-app app-id)
                              {:statements (filterv (partial re-find #"(?i)\b(?:data_app|dependency_status)\b")
                                                    (deps.test/app-db-statements hook!))
                               :pending?   (pending? :data-app app-id)})
                one-update? {:statements [#"(?is)UPDATE\b.*"] :pending? true}]
            (testing "inserting a card"
              (is (=? one-update? (marks #(t2/insert! :model/Card {:name                   "inserted"
                                                                   :type                   :question
                                                                   :display                :table
                                                                   :dataset_query          (table-query :products)
                                                                   :visualization_settings {}
                                                                   :creator_id             (mt/user->id :rasta)
                                                                   :collection_id          collection-id})))))
            (testing "moving a card out"
              (is (=? one-update? (marks #(t2/update! :model/Card :id (:id card) {:collection_id other-collection-id})))))
            (testing "moving a card in"
              (is (=? one-update? (marks #(t2/update! :model/Card :id (:id card) {:collection_id collection-id})))))
            (testing "deleting a card"
              (is (=? one-update? (marks #(t2/delete! :model/Card :id (:id card))))))))))))

(deftest entity-delete-test
  (testing "the dependency job drops the dependencies and status of a deleted entity"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (t2/insert! :model/Dependency {:from_entity_type "card" :from_entity_id card-id
                                       :to_entity_type "table" :to_entity_id (mt/id :products)})
        (computed! :card card-id)
        (t2/delete! :model/Card :id card-id)
        (deps.test/synchronously-run-dependency-job!)
        (is (not (t2/exists? :model/Dependency :from_entity_type "card" :from_entity_id card-id)))
        (is (not (t2/exists? :model/DependencyStatus :entity_type "card" :entity_id card-id)))))))

(deftest concurrent-saves-of-dependent-cards-commit-test
  (testing "saving a card and then its dependent in one transaction, while another request saves the dependent, commits both"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card]
        (let [insert-card! (fn [query]
                             (t2/insert-returning-pk! :model/Card {:name                   (mt/random-name)
                                                                   :display                :table
                                                                   :visualization_settings {}
                                                                   :creator_id             (mt/user->id :crowberto)
                                                                   :database_id            (mt/id)
                                                                   :dataset_query          query}))
              card-a       (insert-card! (table-query :products))
              card-b       (insert-card! (card-query card-a))
              a-saved      (promise)
              save!        (fn [thunk]
                             (future
                               (try
                                 (thunk)
                                 :committed
                                 (catch Throwable e
                                   (ex-message (or (ex-cause e) e))))))]
          (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-b
                                         :to_entity_type   :card :to_entity_id   card-a})
          (let [cascade (save! #(t2/with-transaction [_conn]
                                  (t2/update! :model/Card :id card-a {:dataset_query (table-query :orders)})
                                  (deliver a-saved true)
                                  (t2/update! :model/Card :id card-b {:dataset_query (lib/limit (card-query card-a) 5)})))
                single  (save! #(do (deref a-saved 10000 nil)
                                    (t2/update! :model/Card :id card-b {:dataset_query (lib/limit (card-query card-a) 11)})))]
            (is (= [:committed :committed]
                   [(deref cascade 30000 :timeout) (deref single 30000 :timeout)]))))))))

(deftest serdes-load-triggers-jobs-test
  (testing "a serdes load triggers the jobs through the writes it makes"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card          {card-id :id}      {:dataset_query (table-query :products)}
                     :model/Dashboard     {dashboard-id :id} {}
                     :model/DashboardCard _                  {:dashboard_id dashboard-id :card_id card-id}]
        (let [exported  (ts/extract-one "Dashboard" dashboard-id)
              submitted (atom [])]
          (t2/insert! :model/DashboardCard {:dashboard_id dashboard-id :card_id card-id
                                            :row 4 :col 0 :size_x 4 :size_y 4})
          (mt/with-dynamic-fn-redefs [grouper/submit! (fn [_queue write] (swap! submitted conj write))]
            (deps.test/do-with-immediate-hook-writes
             #(serdes.load/load-metabase! (ts/ingestion-in-memory [exported]) :reindex? false)))
          (is (= 1 (t2/count :model/DashboardCard :dashboard_id dashboard-id)))
          (is (seq @submitted)))))))

(deftest dimension-rename-marks-remapped-dependents-test
  (testing "renaming a Dimension changes the remapped column's name, so the cards on its table are marked (master marked any Dimension update)"
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (deps.test/table-query :venues)}
                       :model/Dimension {dim-id :id} {:field_id (mt/id :venues :price) :name "Price" :type :internal}]
          (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                         :to_entity_type   :table :to_entity_id (mt/id :venues)})
          (deps.test/record-result-metadata-processed! card-id)
          (is (not (deps.test/result-metadata-pending? card-id)))
          (dimension/update-dimensions! [{:id dim-id :name "Cost"}])
          (is (deps.test/result-metadata-pending? card-id)
              "after a Dimension rename the card's result metadata status should be stale"))))))

(defn- dependency-statement-count!
  "The statements that the dependency consumer runs for `write`, a function of the ids of `n` new rows of `model` made
  from `row`, in one batch."
  [model row n write]
  (events.tu/consumer-statement-count! model
                                       (repeatedly n #(merge (mt/with-temp-defaults model) (row)))
                                       write
                                       #(mt/with-premium-features #{:dependencies} (%))
                                       #(mt/with-premium-features #{} (%))))

(deftest batch-of-writes-marks-with-fixed-statements-test
  (testing "writes of 2 or 6 rows in one batch mark what they make stale with the same number of statements"
    (mt/with-temp [:model/Card      {card-id :id}      {:dataset_query (table-query :venues)}
                   :model/Dashboard {dashboard-id :id} {}]
      (testing "an update of the queries of Cards"
        (let [count! #(dependency-statement-count! :model/Card
                                                   (constantly {:dataset_query (table-query :venues)})
                                                   %
                                                   (fn [ids]
                                                     (t2/update! :model/Card :id [:in ids]
                                                                 {:dataset_query (lib/limit (table-query :venues) 1)})))]
          (is (= (count! 2) (count! 6)))))
      (testing "an insert of series of dashcards, which reads the Dashboard of each dashcard"
        (let [count! #(dependency-statement-count! :model/DashboardCard
                                                   (constantly {:dashboard_id dashboard-id :card_id card-id})
                                                   %
                                                   (fn [ids]
                                                     (t2/insert! :model/DashboardCardSeries
                                                                 (for [id ids]
                                                                   {:dashboardcard_id id :card_id card-id :position 0}))))]
          (is (= (count! 2) (count! 6))))))))
