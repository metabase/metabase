(ns metabase-enterprise.dependencies.events-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.hooks :as deps.hooks]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- run-with-dependencies-setup!
  "Run `thunk` with the dependencies feature, each write committing on its own so that `updated_at` moves between
  them as it does between real requests."
  [thunk]
  (mt/test-helpers-set-global-values!
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingStatus :model/DependencyStatus
                                :model/ResultMetadataStatus]
          (lib-be/with-metadata-provider-cache
            (let [mp (mt/metadata-provider)]
              (thunk mp))))))))

(defn- dependencies-pending?
  "Whether the dependencies of the entity `entity-type` `entity-id` were not computed from its current version."
  [entity-type entity-id]
  (boolean (some #(= entity-id (:id (first %)))
                 (deps.dependency-status/instances-for-dependency-calculation entity-type 100000))))

(defn- assert-pending
  "Assert that the dependencies of the given entity were not computed from its current version."
  [entity-type entity-id]
  (is (dependencies-pending? entity-type entity-id)
      (str "Expected " (name entity-type) " " entity-id " to be pending")))

(defn- analyzed-by-job!
  "The entities, as `[entity-type entity-id]`, that running the analysis finding job now analyzes."
  []
  (let [analyzed (atom #{})
        upsert!  (mt/original-fn #'models.analysis-finding/upsert-analysis!)]
    (mt/with-dynamic-fn-redefs [models.analysis-finding/upsert-analysis!
                                (fn [entity-type entity-id & args]
                                  (swap! analyzed conj [entity-type entity-id])
                                  (apply upsert! entity-type entity-id args))]
      (#'task.analysis-finding/check-entities!))
    @analyzed))

(defn- analyzed-among!
  "Which of the entities `nodes`, `[entity-type entity-id]`, running the analysis finding job now analyzes."
  [& nodes]
  (into #{} (filter (set nodes)) (analyzed-by-job!)))

(deftest dashboard-update-sets-correct-dependencies
  (run-with-dependencies-setup!
   (fn [mp]
     (let [products-id (mt/id :products)
           orders-id (mt/id :orders)
           products (lib.metadata/table mp products-id)
           orders (lib.metadata/table mp orders-id)
           category-field (lib.metadata/field mp (mt/id :products :category))]
       (mt/with-temp [:model/Card {basic-card-id :id} {:dataset_query (lib/query mp products)}
                      :model/Card {series-card-id :id} {:dataset_query (lib/query mp orders)}
                      :model/Card {param-source-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                                 (lib/aggregate (lib/count))
                                                                                 (lib/breakout category-field))}
                      :model/Dashboard {dashboard-id :id} {:parameters [{:id "category-param"
                                                                         :type "category"
                                                                         :values_source_type "card"
                                                                         :values_source_config {:card_id param-source-card-id}}]}
                      :model/DashboardCard {basic-dashcard-id :id} {:dashboard_id dashboard-id
                                                                    :card_id basic-card-id}
                      :model/DashboardCardSeries _ {:dashboardcard_id basic-dashcard-id
                                                    :card_id series-card-id
                                                    :position 0}]
         (assert-pending :dashboard dashboard-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (=? #{{:from_entity_type :dashboard
                    :from_entity_id dashboard-id
                    :to_entity_type :card
                    :to_entity_id basic-card-id}
                   {:from_entity_type :dashboard
                    :from_entity_id dashboard-id
                    :to_entity_type :card
                    :to_entity_id series-card-id}
                   {:from_entity_type :dashboard
                    :from_entity_id dashboard-id
                    :to_entity_type :card
                    :to_entity_id param-source-card-id}}
                 (into #{} (map #(dissoc % :id)
                                (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard)))))
         (t2/delete! :model/DashboardCard :id basic-dashcard-id)
         (t2/update! :model/Dashboard dashboard-id {:parameters []})
         (mt/with-temp [:model/Card {scalar-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                             (lib/aggregate (lib/count)))
                                                          :display :scalar}
                        :model/Card {scalar-click-target-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/DashboardCard _ {:dashboard_id dashboard-id
                                                :card_id scalar-card-id
                                                :visualization_settings {:click_behavior {:type "link"
                                                                                          :linkType "question"
                                                                                          :targetId scalar-click-target-card-id}}}
                        :model/Card {scalar-card-2-id :id} {:dataset_query (-> (lib/query mp orders)
                                                                               (lib/aggregate (lib/count)))
                                                            :display :scalar}
                        :model/Dashboard {scalar-click-target-dashboard-id :id} {}
                        :model/DashboardCard _ {:dashboard_id dashboard-id
                                                :card_id scalar-card-2-id
                                                :visualization_settings {:click_behavior {:type "link"
                                                                                          :linkType "dashboard"
                                                                                          :targetId scalar-click-target-dashboard-id}}}
                        :model/Card {table-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                            (lib/breakout category-field)
                                                                            (lib/aggregate (lib/count)))
                                                         :display :table}
                        :model/Card {column-click-target-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/DashboardCard _ {:dashboard_id dashboard-id
                                                :card_id table-card-id
                                                :visualization_settings {:column_settings {"[\"name\",\"CATEGORY\"]" {:click_behavior {:type "link"
                                                                                                                                       :linkType "question"
                                                                                                                                       :targetId column-click-target-card-id}}}}}
                        :model/Dashboard {column-click-target-dashboard-id :id} {}
                        :model/Card {table-card-2-id :id} {:dataset_query (-> (lib/query mp orders)
                                                                              (lib/breakout category-field)
                                                                              (lib/aggregate (lib/count)))
                                                           :display :table}
                        :model/DashboardCard _ {:dashboard_id dashboard-id
                                                :card_id table-card-2-id
                                                :visualization_settings {:column_settings {"[\"name\",\"CATEGORY\"]" {:click_behavior {:type "link"
                                                                                                                                       :linkType "dashboard"
                                                                                                                                       :targetId column-click-target-dashboard-id}}}}}]
           (deps.test/synchronously-run-dependency-job!)
           (is (=? #{{:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id scalar-card-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id scalar-click-target-card-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id scalar-card-2-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :dashboard
                      :to_entity_id scalar-click-target-dashboard-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id table-card-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id column-click-target-card-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id table-card-2-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :dashboard
                      :to_entity_id column-click-target-dashboard-id}}
                   (into #{} (map #(dissoc % :id)
                                  (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard)))))
           (t2/delete! :model/Dashboard dashboard-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (empty? (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard)))))))))

(deftest document-update-sets-correct-dependencies
  (run-with-dependencies-setup!
   (fn [mp]
     (let [products-id (mt/id :products)
           products (lib.metadata/table mp products-id)]
       (mt/with-premium-features #{:dependencies}
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {embedded-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dashboard {dashboard-id :id} {}
                        :model/Document {document-id :id :as document} {:content_type "application/json+vnd.prose-mirror"
                                                                        :document {:type "doc"
                                                                                   :content [{:type "paragraph"
                                                                                              :content [{:type "smartLink"
                                                                                                         :attrs {"entityId" card-id
                                                                                                                 "model" "card"}}]}
                                                                                             {:type "cardEmbed"
                                                                                              :attrs {"id" embedded-card-id}}]}}]
           (assert-pending :document document-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (=? #{{:from_entity_type :document
                      :from_entity_id document-id
                      :to_entity_type :card
                      :to_entity_id card-id}
                     {:from_entity_type :document
                      :from_entity_id document-id
                      :to_entity_type :card
                      :to_entity_id embedded-card-id}}
                   (into #{} (map #(dissoc % :id)
                                  (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document)))))
           (let [updated-doc (assoc document :document {:type "doc"
                                                        :content [{:type "paragraph"
                                                                   :content [{:type "smartLink"
                                                                              :attrs {"entityId" dashboard-id
                                                                                      "model" "dashboard"}}
                                                                             {:type "smartLink"
                                                                              :attrs {"entityId" products-id
                                                                                      "model" "table"}}]}]})]
             (t2/update! :model/Document document-id updated-doc)
             (deps.test/synchronously-run-dependency-job!)
             (is (=? #{{:from_entity_type :document
                        :from_entity_id document-id
                        :to_entity_type :dashboard
                        :to_entity_id dashboard-id}
                       {:from_entity_type :document
                        :from_entity_id document-id
                        :to_entity_type :table
                        :to_entity_id products-id}}
                     (into #{} (map #(dissoc % :id)
                                    (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document)))))
             (t2/delete! :model/Document document-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (empty? (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document))))))))))

(deftest sandbox-update-sets-correct-dependencies
  (mt/with-premium-features #{:sandboxes}
    (run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "sandbox group"}
                      :model/Card {card1-id :id} {}
                      :model/Card {card2-id :id} {}
                      :model/Sandbox {sandbox-id :id :as sandbox} {:group_id group-id
                                                                   :table_id (mt/id :products)
                                                                   :card_id card1-id}]
         (assert-pending :sandbox sandbox-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (=? #{{:from_entity_type :sandbox
                    :from_entity_id sandbox-id
                    :to_entity_type :card
                    :to_entity_id card1-id}}
                 (into #{} (map #(dissoc % :id)
                                (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))
         (t2/update! :model/Sandbox sandbox-id (assoc sandbox :card_id card2-id))
         (deps.test/synchronously-run-dependency-job!)
         (is (=? #{{:from_entity_type :sandbox
                    :from_entity_id sandbox-id
                    :to_entity_type :card
                    :to_entity_id card2-id}}
                 (into #{} (map #(dissoc % :id)
                                (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))
         (t2/delete! :model/Sandbox sandbox-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (empty? (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox))))))))

(deftest card-marks-pending-on-create-and-stale-on-update-test
  (testing "a created card is pending for the dependency job, and any update makes it pending again"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [products (lib.metadata/table mp (mt/id :products))
             orders   (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}]
           (assert-pending :card card-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                           :to_entity_type :table :to_entity_id (mt/id :products)))
           (is (not (dependencies-pending? :card card-id)))
           (t2/update! :model/Card card-id {:dataset_query (lib/query mp orders)})
           (assert-pending :card card-id)))))))

(deftest metric-dimensions-update-marks-stale-and-includes-mapped-table-test
  (testing "a metric dimension write marks the metric card stale and recomputes deps, including mapped-dimension tables"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [base (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/aggregate (lib/count)))]
         (mt/with-temp [:model/Card {card-id :id} {:type :metric :dataset_query base}]
           ;; Set the mappings after insert: a freshly-inserted metric with nil `:dimensions` counts as
           ;; uncurated, so the after-insert dimension auto-sync would seed dimensions from the query and
           ;; overwrite mappings passed to with-temp. A plain update sticks — the after-update hook only
           ;; re-syncs when `:dataset_query` changes.
           (t2/update! :model/Card card-id
                       {:dimension_mappings [{:type         :table
                                              :dimension-id "550e8400-e29b-41d4-a716-446655440000"
                                              :table-id     (mt/id :categories)
                                              :target       [:field {} (mt/id :categories :name)]}]})
           (assert-pending :card card-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                           :to_entity_type :table :to_entity_id (mt/id :categories))
               "the mapped dimension's table becomes a dependency")
           (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                           :to_entity_type :table :to_entity_id (mt/id :venues))
               "the query's own table remains a dependency")))))))

(deftest snippet-marks-pending-on-create-and-stale-on-update-test
  (testing "a created snippet is pending for the dependency job, and changing its content makes it pending again"
    (run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "test snippet"
                                                                  :content "SELECT 1"}]
         (assert-pending :snippet snippet-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (not (dependencies-pending? :snippet snippet-id)))
         (t2/update! :model/NativeQuerySnippet snippet-id {:content "SELECT 2"})
         (assert-pending :snippet snippet-id))))))

(deftest ^:synchronized native-transform-create-sets-dependencies-test
  (testing "a created native transform is picked up by the dependency calculation"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/native-query mp "select * from orders")
                     :type :query}]
         (mt/with-temp [:model/Transform {transform-id :id} {:source source}]
           (assert-pending :transform transform-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:synchronized mbql-transform-create-sets-dependencies-test
  (testing "a created mbql transform is picked up by the dependency calculation"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                     :type :query}]
         (mt/with-temp [:model/Transform {transform-id :id} {:source source}]
           (assert-pending :transform transform-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:synchronized python-transform-create-sets-dependencies-test
  (testing "a created python transform is picked up by the dependency calculation"
    (run-with-dependencies-setup!
     (fn [_]
       (let [source {:type :python,
                     :source-database (mt/id),
                     :source-tables [{:alias "orders"
                                      :database_id (mt/id)
                                      :schema "public"
                                      :table "orders"
                                      :table_id (mt/id :orders)}],
                     :body
                     "import pandas as pd\n\ndef transform(orders):\n    return orders"}]
         (mt/with-temp [:model/Transform {transform-id :id} {:source source}]
           (assert-pending :transform transform-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:synchronized database-delete-marks-source-transforms-stale-test
  (testing "deleting a database marks its source transforms' analysis findings stale so they surface on /dependency-diagnostics/broken (GDGT-2447)"
    (run-with-dependencies-setup!
     (fn [_mp]
       (mt/with-temp [:model/Database {db-id :id} {}
                      :model/Transform {transform-id :id}
                      {:source {:type :query
                                :query {:database db-id
                                        :type :native
                                        :native {:query "SELECT 1"}}}
                       :target {:schema "public" :name "out" :type :table}}
                      :model/AnalysisFinding _ {:analyzed_entity_type :transform
                                                :analyzed_entity_id transform-id
                                                :result true
                                                :analysis_version models.analysis-finding/*current-analysis-finding-version*
                                                :analyzed_at :%now}]
         (t2/delete! :model/Database db-id)
         (is (nil? (t2/select-one :model/Database db-id))
             "the Database row is actually gone")
         (assert-pending :transform transform-id)
         (deps.test/synchronously-run-dependency-job!)
         (testing "and the analysis finding job flips :result false so the transform shows on broken-diagnostics"
           (#'task.analysis-finding/check-entities!)
           (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                         :analyzed_entity_type :transform
                                         :analyzed_entity_id transform-id)))
           (testing "an analysis_finding_error row points the transform at itself so the diagnostics page (`/graph/breaking`) surfaces it"
             (is (=? {:source_entity_type :transform
                      :source_entity_id   transform-id
                      :error_type         :validation-exception-error}
                     (t2/select-one :model/AnalysisFindingError
                                    :analyzed_entity_type :transform
                                    :analyzed_entity_id transform-id))))))))))

(deftest ^:synchronized transform-run-updates-dependencies-test
  (testing "transform run events trigger dependency calculations"
    (run-with-dependencies-setup!
     (fn [_]
       (let [target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Table     {table-id :id}     {:schema "Other", :db_id (mt/id), :name "test_table"}
                        :model/Transform {transform-id :id} {:target target}]
           (deps.hooks/after-transform-run transform-id table-id)
           (is (=? [{:from_entity_type :table
                     :from_entity_id table-id,
                     :to_entity_type :transform,
                     :to_entity_id transform-id}]
                   (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform)))))))))

(deftest ^:synchronized python-transform-update-handles-downstream-dependencies-test
  (testing "python transform updates handle downstream dependencies"
    (run-with-dependencies-setup!
     (fn [_]
       (let [source {:type :python,
                     :source-database (mt/id),
                     :source-tables [{:alias "orders"
                                      :database_id (mt/id)
                                      :schema "public"
                                      :table "orders"
                                      :table_id (mt/id :orders)}],
                     :body
                     "import pandas as pd\n\ndef transform(orders):\n    return orders"}
             target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Table     {table-id :id}                  {:schema "Other", :db_id (mt/id), :name "test_table"}
                        :model/Table     {}                              {:schema "Other", :db_id (mt/id), :name "test_table2"}
                        :model/Transform {transform-id :id} {:target target
                                                             :source source}]
           (testing "initial run"
             (deps.hooks/after-transform-run transform-id table-id)
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "keeping target"
             (t2/update! :model/Transform transform-id {:source (update source :body str "\n")})
             (assert-pending :transform transform-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "changing target update"
             (t2/update! :model/Transform transform-id {:target (assoc target :name "test_table2")})
             (deps.test/synchronously-run-dependency-job!)
             (is (empty?
                  (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))

(deftest ^:synchronized query-transform-update-handles-downstream-dependencies-test
  (testing "query transform updates handle downstream dependencies"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/native-query mp "select * from orders")
                     :type :query}
             target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Table     {table-id :id}                  {:schema "Other", :db_id (mt/id), :name "test_table"}
                        :model/Table     {}                              {:schema "Other", :db_id (mt/id), :name "test_table2"}
                        :model/Transform {transform-id :id} {:target target :source source}]
           (testing "initial run"
             (deps.hooks/after-transform-run transform-id table-id)
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "keeping target"
             (t2/update! :model/Transform transform-id {:source (assoc source :query (lib/native-query mp "select * from orders limit 10"))})
             (assert-pending :transform transform-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "changing target update"
             (t2/update! :model/Transform transform-id {:target (assoc target :name "test_table2")})
             (deps.test/synchronously-run-dependency-job!)
             (is (empty?
                  (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))

(deftest segment-update-sets-correct-dependencies
  (run-with-dependencies-setup!
   (fn [_]
     (let [products-id (mt/id :products)
           price-field-id (mt/id :products :price)
           category-field-id (mt/id :products :category)]
       (mt/with-temp [:model/Segment {segment-id :id} {:table_id products-id
                                                       :definition {:filter [:> [:field price-field-id nil] 50]}}]
         (testing "creating a segment creates dependency to its table"
           (assert-pending :segment segment-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{{:from_entity_type :segment
                     :from_entity_id segment-id
                     :to_entity_type :table
                     :to_entity_id products-id}}
                  (into #{} (map #(dissoc % :id)
                                 (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment))))))
         (testing "updating segment definition recalculates dependencies"
           (t2/update! :model/Segment segment-id {:definition {:filter [:= [:field category-field-id nil] "Widget"]}})
           (assert-pending :segment segment-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{{:from_entity_type :segment
                     :from_entity_id segment-id
                     :to_entity_type :table
                     :to_entity_id products-id}}
                  (into #{} (map #(dissoc % :id)
                                 (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment))))))
         (testing "deleting segment removes all dependencies"
           (t2/delete! :model/Segment segment-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (empty? (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment)))))))))

(deftest card-with-segment-dependencies
  (run-with-dependencies-setup!
   (fn [_]
     (let [products-id (mt/id :products)
           price-field-id (mt/id :products :price)]
       (mt/with-temp [:model/Segment {segment-id :id} {:table_id products-id
                                                       :definition {:filter [:> [:field price-field-id nil] 50]}}]
         (testing "creating a card using a segment creates dependencies to both segment and table"
           (deps.test/synchronously-run-dependency-job!)
           (mt/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                     :type :query
                                                                     :query {:source-table products-id
                                                                             :filter [:segment segment-id]}}}]
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{{:from_entity_type :card
                       :from_entity_id card-id
                       :to_entity_type :segment
                       :to_entity_id segment-id}
                      {:from_entity_type :card
                       :from_entity_id card-id
                       :to_entity_type :table
                       :to_entity_id products-id}}
                    (into #{} (map #(dissoc % :id)
                                   (t2/select :model/Dependency :from_entity_id card-id :from_entity_type :card))))))))))))

(deftest measure-update-sets-correct-dependencies
  (run-with-dependencies-setup!
   (fn [mp]
     (mt/with-test-user :rasta
       (let [orders-id (mt/id :orders)
             orders (lib.metadata/table mp orders-id)
             quantity (lib.metadata/field mp (mt/id :orders :quantity))
             subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
         (mt/with-temp [:model/Measure {measure-id :id} {:table_id orders-id
                                                         :definition (-> (lib/query mp orders)
                                                                         (lib/aggregate (lib/sum quantity)))}]
           (testing "creating a measure creates dependency to its table"
             (assert-pending :measure measure-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{{:from_entity_type :measure
                       :from_entity_id measure-id
                       :to_entity_type :table
                       :to_entity_id orders-id}}
                    (into #{} (map #(dissoc % :id)
                                   (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))
           (testing "updating measure definition recalculates dependencies"
             (t2/update! :model/Measure measure-id {:definition (-> (lib/query mp orders)
                                                                    (lib/aggregate (lib/sum subtotal)))})
             (assert-pending :measure measure-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{{:from_entity_type :measure
                       :from_entity_id measure-id
                       :to_entity_type :table
                       :to_entity_id orders-id}}
                    (into #{} (map #(dissoc % :id)
                                   (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))
           (testing "deleting measure removes all dependencies"
             (t2/delete! :model/Measure measure-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (empty? (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))))))

(deftest action-update-sets-correct-dependencies
  (run-with-dependencies-setup!
   (fn [mp]
     (let [action-deps (fn [action-id]
                         (t2/select-fn-set (juxt :to_entity_type :to_entity_id)
                                           :model/Dependency :from_entity_type :action :from_entity_id action-id))
           sql-query   #(lib/native-query mp (str "DELETE FROM " % " WHERE id = 1"))]
       (mt/with-temp [:model/Action {action-id :id} {:type :query, :name "Delete row"}
                      :model/QueryAction _ {:action_id     action-id
                                            :database_id   (mt/id)
                                            :dataset_query (sql-query "venues")}]
         (testing "creating an action creates dependencies on the tables its query reads"
           (assert-pending :action action-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{[:table (mt/id :venues)]}
                  (action-deps action-id))))
         (testing "updating an action's query recalculates its dependencies"
           (t2/update! :model/QueryAction action-id {:dataset_query (sql-query "checkins")})
           (assert-pending :action action-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{[:table (mt/id :checkins)]}
                  (action-deps action-id))))
         (testing "deleting an action removes its dependencies and status"
           (t2/delete! :model/Action action-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (empty? (action-deps action-id)))
           (is (not (t2/exists? :model/DependencyStatus :entity_type :action :entity_id action-id)))))))))

(defn- action-dependency-rows
  "The Dependency and DependencyStatus rows of the actions with `action-ids`."
  [action-ids]
  {:dependencies (set (t2/select-fn-set :from_entity_id :model/Dependency
                                        :from_entity_type :action :from_entity_id [:in action-ids]))
   :statuses     (set (t2/select-fn-set :entity_id :model/DependencyStatus
                                        :entity_type :action :entity_id [:in action-ids]))})

(deftest model-delete-removes-dependency-rows-of-its-actions-test
  (run-with-dependencies-setup!
   (fn [mp]
     (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                                :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}
                    :model/Action {implicit-id :id} {:type :implicit, :name "Create venue", :model_id model-id}
                    :model/ImplicitAction _ {:action_id implicit-id, :kind "row/create"}
                    :model/Action {query-id :id} {:type :query, :name "Delete venue", :model_id model-id}
                    :model/QueryAction _ {:action_id     query-id
                                          :database_id   (mt/id)
                                          :dataset_query (lib/native-query mp "DELETE FROM venues WHERE id = 1")}]
       (deps.test/synchronously-run-dependency-job!)
       (testing "the model's actions have dependency rows"
         (is (= {:dependencies #{implicit-id query-id}, :statuses #{implicit-id query-id}}
                (action-dependency-rows [implicit-id query-id]))))
       (testing "deleting the model removes the dependency rows of its actions"
         (t2/delete! :model/Card model-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (= {:dependencies #{}, :statuses #{}}
                (action-dependency-rows [implicit-id query-id]))))))))

(deftest database-delete-removes-dependency-rows-of-its-models-actions-test
  (run-with-dependencies-setup!
   (fn [_mp]
     (mt/with-temp [:model/Database {db-id :id} {:engine :h2, :details (:details (mt/db))}
                    :model/Table {table-id :id} {:db_id db-id, :name "VENUES", :schema "PUBLIC"}]
       (let [db-mp (lib-be/application-database-metadata-provider db-id)]
         (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                                    :database_id   db-id
                                                    :dataset_query (lib/native-query db-mp "SELECT * FROM venues")}
                        :model/Action {implicit-id :id} {:type :implicit, :name "Create venue", :model_id model-id}
                        :model/ImplicitAction _ {:action_id implicit-id, :kind "row/create"}
                        :model/Action {query-id :id} {:type :query, :name "Delete venue", :model_id model-id}
                        :model/QueryAction _ {:action_id     query-id
                                              :database_id   db-id
                                              :dataset_query (lib/native-query db-mp "DELETE FROM venues WHERE id = 1")}]
           (deps.test/synchronously-run-dependency-job!)
           (testing "the actions of the database's model have status rows"
             (is (= #{implicit-id query-id}
                    (:statuses (action-dependency-rows [implicit-id query-id])))))
           (testing "deleting the database removes the dependency rows of the actions of its models"
             (t2/delete! :model/Database db-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (= {:dependencies #{}, :statuses #{}}
                    (action-dependency-rows [implicit-id query-id]))))
           (is (some? table-id))))))))

(deftest measure-with-measure-dependencies
  (run-with-dependencies-setup!
   (fn [mp]
     (let [orders-id (mt/id :orders)
           orders (lib.metadata/table mp orders-id)
           quantity (lib.metadata/field mp (mt/id :orders :quantity))
           subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
       (mt/with-temp [:model/Measure {measure1-id :id} {:table_id orders-id
                                                        :definition (-> (lib/query mp orders)
                                                                        (lib/aggregate (lib/sum quantity)))}]
         (let [mp' (mt/metadata-provider)]
           (mt/with-temp [:model/Measure {measure2-id :id} {:table_id orders-id
                                                            :definition (-> (lib/query mp' orders)
                                                                            (lib/aggregate (lib/+ (lib.metadata/measure mp' measure1-id)
                                                                                                  (lib/sum subtotal))))}]
             (testing "creating a measure that references another measure creates dependencies to both"
               (deps.test/synchronously-run-dependency-job!)
               (is (= #{{:from_entity_type :measure
                         :from_entity_id measure2-id
                         :to_entity_type :table
                         :to_entity_id orders-id}
                        {:from_entity_type :measure
                         :from_entity_id measure2-id
                         :to_entity_type :measure
                         :to_entity_id measure1-id}}
                      (into #{} (map #(dissoc % :id)
                                     (t2/select :model/Dependency :from_entity_id measure2-id :from_entity_type :measure)))))))))))))

(deftest card-with-measure-dependencies
  (run-with-dependencies-setup!
   (fn [mp]
     (let [orders-id (mt/id :orders)
           orders (lib.metadata/table mp orders-id)
           quantity (lib.metadata/field mp (mt/id :orders :quantity))]
       (mt/with-temp [:model/Measure {measure-id :id} {:table_id orders-id
                                                       :definition (-> (lib/query mp orders)
                                                                       (lib/aggregate (lib/sum quantity)))}]
         (deps.test/synchronously-run-dependency-job!)
         (testing "creating a card using a measure creates dependencies to both measure and table"
           (let [mp' (mt/metadata-provider)
                 query (-> (lib/query mp' orders)
                           (lib/aggregate (lib.metadata/measure mp' measure-id)))]
             (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
               (deps.test/synchronously-run-dependency-job!)
               (is (= #{{:from_entity_type :card
                         :from_entity_id card-id
                         :to_entity_type :measure
                         :to_entity_id measure-id}
                        {:from_entity_type :card
                         :from_entity_id card-id
                         :to_entity_type :table
                         :to_entity_id orders-id}}
                      (into #{} (map #(dissoc % :id)
                                     (t2/select :model/Dependency :from_entity_id card-id :from_entity_type :card)))))))))))))

;; === Analysis finding tests (these are unchanged — they use AnalysisFinding, not dependency_analysis_version) ===

(defn- assert-has-analyses
  "Asserts that a given set of entities have the appropriate analysis version.

  Format is `{entity-type {entity-id analysis-version}}`.

  Use -1 for analysis-version if you want to check that an analysis exists without asserting a specific version.

  Use nil for analysis-version if you want to check that no analysis exists."
  [spec]
  (doseq [[entity-type ids-and-versions] spec]
    (let [analyses-map (->> (t2/select [:model/AnalysisFinding :analyzed_entity_id :analysis_version]
                                       :analyzed_entity_type entity-type)
                            (into {} (map (juxt :analyzed_entity_id :analysis_version))))]
      (doseq [[id expected-version] ids-and-versions]
        (testing (str "Checking " entity-type " " id)
          (if (= expected-version -1)
            (is (contains? analyses-map id))
            (is (= expected-version (analyses-map id)))))))))

(deftest ^:synchronized card-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Card updates should mark the card stale and trigger the background job"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {parent-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {child-card-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           (t2/update! :model/Card parent-card-id {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))})
           (assert-has-analyses
            {:card {parent-card-id nil}})
           (is (nil? (t2/select-one-fn :analysis_version :model/AnalysisFinding
                                       :analyzed_entity_type :card
                                       :analyzed_entity_id child-card-id))
               "an update writes no analysis record")))))))

(deftest ^:synchronized card-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "changing a card's query has the job re-analyze it and its dependents"
       (let [products (lib.metadata/table mp (mt/id :products))
             orders   (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {parent-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {child-card-id :id}  {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           (analyzed-by-job!)
           (t2/update! :model/Card parent-card-id {:dataset_query (lib/query mp orders)})
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{[:card parent-card-id] [:card child-card-id]}
                  (analyzed-among! [:card parent-card-id] [:card child-card-id])))))))))

;;; ------------------------------------------------ Analysis propagation tests ------------------------------------------------

(deftest ^:synchronized card-update-triggers-native-cards-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "a native card's update has the job re-analyze it and its transitive dependents"
       (mt/with-temp [:model/Card {parent-id :id} {:dataset_query (lib/native-query mp "select * from products")}
                      :model/Card {child-id :id}  {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                      :model/Dependency _ {:from_entity_type :card :from_entity_id child-id
                                           :to_entity_type :card :to_entity_id parent-id}]
         (analyzed-by-job!)
         (t2/update! :model/Card parent-id {:dataset_query (lib/native-query mp "select * from orders")})
         (deps.test/synchronously-run-dependency-job!)
         (is (= #{[:card parent-id] [:card child-id]}
                (analyzed-among! [:card parent-id] [:card child-id]))))))))

(deftest ^:synchronized card-update-stops-on-transforms-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "a card update has the job re-analyze its transitive dependents, transforms included"
       (let [products (lib.metadata/table mp (mt/id :products))
             orders   (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {parent-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id} {:source {:type :query
                                                                      :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public"
                                                                      :name "sample"
                                                                      :type :table}}
                        :model/Card {child-card-id :id} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :transform :from_entity_id transform-id
                                             :to_entity_type :card :to_entity_id parent-card-id}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id child-card-id
                                             :to_entity_type :transform :to_entity_id transform-id}]
           (analyzed-by-job!)
           (t2/update! :model/Card parent-card-id {:dataset_query (lib/query mp orders)})
           (is (= #{[:card parent-card-id] [:transform transform-id] [:card child-card-id]}
                  (analyzed-among! [:card parent-card-id] [:transform transform-id] [:card child-card-id])))))))))

(deftest ^:synchronized transform-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Transform update does not error when no analyses exist yet"
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Transform {transform-id :id} {:source {:type :query
                                                                      :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public"
                                                                      :name "sample"
                                                                      :type :table}}]
           (is (= 1 (t2/update! :model/Transform transform-id
                                {:source {:type :query
                                          :query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}})))))))))

(deftest ^:synchronized transform-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "a transform update has the job re-analyze it"
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Transform {transform-id :id} {:source {:type :query
                                                                      :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public"
                                                                      :name "sample"
                                                                      :type :table}}]
           (analyzed-by-job!)
           (t2/update! :model/Transform transform-id {:source {:type :query
                                                               :query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}})
           (is (= #{[:transform transform-id]} (analyzed-among! [:transform transform-id])))))))))

(deftest ^:synchronized transform-update-triggers-native-transforms-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Native transform updates do not error"
       (mt/with-temp [:model/Transform {transform-id :id} {:source {:type :query
                                                                    :query (lib/native-query mp "select * from products")}
                                                           :name "transform_sample"
                                                           :target {:schema "public"
                                                                    :name "sample"
                                                                    :type :table}}]
         (is (= 1 (t2/update! :model/Transform transform-id
                              {:source {:type :query
                                        :query (lib/native-query mp "select * from orders")}}))))))))

(deftest ^:synchronized transform-run-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Transform run completes without error when no analyses exist"
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id} {:source {:type :query :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public" :name "sample" :type :table}}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :transform :to_entity_id transform-id}]
           (is (nil? (deps.hooks/after-transform-run transform-id nil)))))))))

(deftest ^:synchronized transform-run-marks-dependents-stale-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "a transform run has the job re-analyze the transform's dependents, not the transform or unrelated cards"
       (let [products (lib.metadata/table mp (mt/id :products))
             orders   (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id} {:source {:type :query :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public" :name "sample" :type :table}}
                        :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :transform :to_entity_id transform-id}]
           (analyzed-by-job!)
           (deps.hooks/after-transform-run transform-id nil)
           (is (= #{[:card card-id]}
                  (analyzed-among! [:card card-id] [:transform transform-id] [:card other-card-id])))))))))

(deftest ^:synchronized segment-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [_]
     (testing "Segment update does not error when no analyses exist yet"
       (let [products-id (mt/id :products)
             price-field-id (mt/id :products :price)]
         (mt/with-temp [:model/Segment {segment-id :id} {:table_id products-id
                                                         :definition {:filter [:> [:field price-field-id nil] 50]}}]
           (is (= 1 (t2/update! :model/Segment segment-id
                                {:definition {:filter [:< [:field price-field-id nil] 50]}})))))))))

(deftest ^:synchronized segment-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "a segment update has the job re-analyze it and the cards depending on it"
       (let [products-id    (mt/id :products)
             price-field-id (mt/id :products :price)
             products       (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Segment {segment-id :id} {:table_id products-id
                                                         :definition {:filter [:> [:field price-field-id nil] 50]}}
                        :model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :segment :to_entity_id segment-id}]
           (analyzed-by-job!)
           (t2/update! :model/Segment segment-id {:definition {:filter [:< [:field price-field-id nil] 50]}})
           (is (= #{[:segment segment-id] [:card card-id]}
                  (analyzed-among! [:segment segment-id] [:card card-id])))))))))

(deftest ^:synchronized table-metadata-update-triggers-dependent-analysis-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "a table metadata update has the job re-analyze the table's dependents, not unrelated cards"
       (let [products-id (mt/id :products)
             orders      (lib.metadata/table mp (mt/id :orders))
             products    (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (analyzed-by-job!)
           (mt/with-temp [:model/TableUserSettings _ {:table_id products-id :display_name "Products renamed"}]
             (is (= #{[:card card-id]} (analyzed-among! [:card card-id] [:card other-card-id]))))))))))

(deftest ^:synchronized table-metadata-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Table metadata update does not error when no findings exist yet"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (mt/with-temp [:model/TableUserSettings _ {:table_id products-id :display_name "Products renamed"}]
             (assert-has-analyses {:card {card-id nil}}))))))))

(deftest ^:synchronized field-metadata-update-triggers-dependent-analysis-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "a field metadata update has the job re-analyze the dependents of the field's table"
       (let [products-id (mt/id :products)
             orders      (lib.metadata/table mp (mt/id :orders))
             products    (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (analyzed-by-job!)
           (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :products :category)
                                                      :display_name "Category renamed"}]
             (is (= #{[:card card-id]} (analyzed-among! [:card card-id] [:card other-card-id]))))))))))

(deftest ^:synchronized field-metadata-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Field metadata update does not error when no findings exist yet"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :products :category) :display_name "Category renamed"}]
             (assert-has-analyses {:card {card-id nil}}))))))))

(deftest serdes-load-recalculates-changed-entities-test
  (testing "a serdes load recalculates the dependencies of the entities it changes, and only those"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [card-deps #(t2/select-fn-set (juxt :to_entity_type :to_entity_id)
                                          :model/Dependency :from_entity_type :card :from_entity_id %)
             query     #(lib/query mp (lib.metadata/table mp (mt/id %)))
             load!     #(serdes/with-cache
                          (serdes.load/load-metabase! (ts/ingestion-in-memory %) :reindex? false))]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (query :products)}
                        :model/Card {other-id :id}         {:dataset_query (query :products)}]
           (let [exported (serdes/extract-one "Card" {} card)]
             (t2/update! :model/Card card-id {:dataset_query (query :orders)})
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{[:table (mt/id :orders)]} (card-deps card-id)))
             (load! [exported])
             (testing "only the changed card is pending"
               (assert-pending :card card-id)
               (is (not (dependencies-pending? :card other-id))))
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{[:table (mt/id :products)]} (card-deps card-id))))))))))
