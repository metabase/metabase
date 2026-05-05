(ns metabase-enterprise.dependencies.events-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(defn- run-with-dependencies-setup! [thunk]
  (mt/with-test-user :rasta
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding :model/DependencyStatus]
        (lib-be/with-metadata-provider-cache
          (let [mp (mt/metadata-provider)]
            (thunk mp)))))))

(defn- assert-stale
  "Assert that the given entity is marked stale in dependency_status."
  [entity-type entity-id]
  (is (t2/exists? :model/DependencyStatus :entity_type entity-type :entity_id entity-id :stale true)
      (str "Expected " (name entity-type) " " entity-id " to be marked stale")))

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
                      :model/Dashboard {dashboard-id :id :as dashboard} {:parameters [{:id "category-param"
                                                                                       :type "category"
                                                                                       :values_source_type "card"
                                                                                       :values_source_config {:card_id param-source-card-id}}]}
                      :model/DashboardCard {basic-dashcard-id :id} {:dashboard_id dashboard-id
                                                                    :card_id basic-card-id}
                      :model/DashboardCardSeries _ {:dashboardcard_id basic-dashcard-id
                                                    :card_id series-card-id
                                                    :position 0}]
         (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
         (assert-stale :dashboard dashboard-id)
         (deps.test/synchronously-run-backfill!)
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
           (let [updated-dashboard (t2/select-one :model/Dashboard :id dashboard-id)]
             (events/publish-event! :event/dashboard-update {:object updated-dashboard :user-id api/*current-user-id*})
             (deps.test/synchronously-run-backfill!)
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
             (events/publish-event! :event/dashboard-delete {:object updated-dashboard :user-id api/*current-user-id*})
             (is (empty? (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard))))))))))

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
                                                                                                         :attrs {:entityId card-id
                                                                                                                 :model "card"}}]}
                                                                                             {:type "cardEmbed"
                                                                                              :attrs {:id embedded-card-id}}]}}]
           (events/publish-event! :event/document-create {:object document :user-id api/*current-user-id*})
           (assert-stale :document document-id)
           (deps.test/synchronously-run-backfill!)
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
                                                                              :attrs {:entityId dashboard-id
                                                                                      :model "dashboard"}}
                                                                             {:type "smartLink"
                                                                              :attrs {:entityId products-id
                                                                                      :model "table"}}]}]})]
             (t2/update! :model/Document document-id updated-doc)
             (events/publish-event! :event/document-update {:object updated-doc :user-id api/*current-user-id*})
             (deps.test/synchronously-run-backfill!)
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
             (events/publish-event! :event/document-delete {:object document :user-id api/*current-user-id*})
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
         (events/publish-event! :event/sandbox-create {:object sandbox :user-id api/*current-user-id*})
         (assert-stale :sandbox sandbox-id)
         (deps.test/synchronously-run-backfill!)
         (is (=? #{{:from_entity_type :sandbox
                    :from_entity_id sandbox-id
                    :to_entity_type :card
                    :to_entity_id card1-id}}
                 (into #{} (map #(dissoc % :id)
                                (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))
         (t2/update! :model/Sandbox sandbox-id (assoc sandbox :card_id card2-id))
         (let [updated-sandbox (t2/select-one :model/Sandbox :id sandbox-id)]
           (events/publish-event! :event/sandbox-update {:object updated-sandbox :user-id api/*current-user-id*})
           (deps.test/synchronously-run-backfill!)
           (is (=? #{{:from_entity_type :sandbox
                      :from_entity_id sandbox-id
                      :to_entity_type :card
                      :to_entity_id card2-id}}
                   (into #{} (map #(dissoc % :id)
                                  (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))
           (t2/delete! :model/Sandbox sandbox-id)
           (events/publish-event! :event/sandbox-delete {:object sandbox :user-id api/*current-user-id*})
           (is (empty? (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))))))

(deftest card-marks-stale-on-create-update-test
  (testing "Card create/update events mark the entity stale in dependency_status"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}]
           (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
           (assert-stale :card card-id)
           (deps.test/synchronously-run-backfill!)
           (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                           :to_entity_type :table :to_entity_id (mt/id :products)))
           (events/publish-event! :event/card-update {:object card :previous-object card :user-id api/*current-user-id*})
           (assert-stale :card card-id)))))))

(deftest snippet-marks-stale-on-create-update-test
  (testing "Snippet create/update events mark the entity stale in dependency_status"
    (run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "test snippet"
                                                                              :content "SELECT 1"}]
         (events/publish-event! :event/snippet-create {:object snippet :user-id api/*current-user-id*})
         (assert-stale :snippet snippet-id)
         (events/publish-event! :event/snippet-update {:object snippet :user-id api/*current-user-id*})
         (assert-stale :snippet snippet-id))))))

(deftest mark-stale-failure-does-not-propagate-test
  (testing "When mark-stale! throws, the event handler catches the error and the API call is not affected"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}]
           (with-redefs [deps.dependency-status/mark-stale!
                         (fn [_ _] (throw (ex-info "Simulated DB failure" {})))]
             ;; Should not throw — the error is caught and logged
             (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*}))
           ;; Entity should NOT be stale (mark-stale! failed)
           (is (not (t2/exists? :model/DependencyStatus :entity_type :card :entity_id card-id :stale true))
               "Entity should not be marked stale when mark-stale! fails")))))))

(deftest ^:sequential native-transform-updates-dependencies-test
  (testing "native transform update events trigger dependency calculations"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/native-query mp "select * from orders")
                     :type :query}]
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:source source}]
           (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})
           (assert-stale :transform transform-id)
           (deps.test/synchronously-run-backfill!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:sequential mbql-transform-updates-dependencies-test
  (testing "mbql transform update events trigger dependency calculations"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                     :type :query}]
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:source source}]
           (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})
           (assert-stale :transform transform-id)
           (deps.test/synchronously-run-backfill!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:sequential python-transform-updates-dependencies-test
  (testing "python transform update events trigger dependency calculations"
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
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:source source}]
           (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})
           (assert-stale :transform transform-id)
           (deps.test/synchronously-run-backfill!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:sequential transform-run-updates-dependencies-test
  (testing "transform run events trigger dependency calculations"
    (run-with-dependencies-setup!
     (fn [_]
       (let [target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Transform {transform-id :id} {:target target}]
           ;; Transform after-insert creates the target table row via upsert-transform-target-table!
           (let [table-id (t2/select-one-pk :model/Table :db_id (mt/id) :schema "Other" :name "test_table")]
             (events/publish-event! :event/transform-run-complete
                                    {:object {:db-id (mt/id)
                                              :output-schema "Other"
                                              :output-table :test_table
                                              :transform-id transform-id}
                                     :user-id api/*current-user-id*})
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))

(deftest ^:sequential python-transform-update-handles-downstream-dependencies-test
  (testing "python transform update events handles downstream dependencies"
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
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:target target
                                                                           :source source}
                        ;; test_table is created by the Transform after-insert via upsert-transform-target-table!
                        :model/Table {} {:schema "Other", :db_id (mt/id), :name "test_table2"}]
           (let [table-id (t2/select-one-pk :model/Table :db_id (mt/id) :schema "Other" :name "test_table")]
             (testing "initial run"
               (events/publish-event! :event/transform-run-complete
                                      {:object {:db-id (mt/id)
                                                :output-schema "Other"
                                                :output-table :test_table
                                                :transform-id transform-id}
                                       :user-id api/*current-user-id*})
               (is (=? [{:from_entity_type :table
                         :from_entity_id table-id,
                         :to_entity_type :transform,
                         :to_entity_id transform-id}]
                       (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
             (testing "keeping target"
               (events/publish-event! :event/update-transform
                                      {:object transform
                                       :user-id api/*current-user-id*})
               (deps.test/synchronously-run-backfill!)
               (is (=? [{:from_entity_type :table
                         :from_entity_id table-id,
                         :to_entity_type :transform,
                         :to_entity_id transform-id}]
                       (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
             (testing "changing target update"
               (t2/update! :model/Transform transform-id {:target (assoc target :name "test_table2")})
               (let [updated (t2/select-one :model/Transform :id transform-id)]
                 (events/publish-event! :event/update-transform
                                        {:object updated
                                         :user-id api/*current-user-id*})
                 (deps.test/synchronously-run-backfill!)
                 (is (empty?
                      (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))))

(deftest ^:sequential query-transform-update-handles-downstream-dependencies-test
  (testing "query transform update events handles downstream dependencies"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/native-query mp "select * from orders")
                     :type :query}
             target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:target target :source source}
                        ;; test_table is created by the Transform after-insert via upsert-transform-target-table!
                        :model/Table {} {:schema "Other", :db_id (mt/id), :name "test_table2"}]
           (let [table-id (t2/select-one-pk :model/Table :db_id (mt/id) :schema "Other" :name "test_table")]
             (testing "initial run"
               (events/publish-event! :event/transform-run-complete
                                      {:object {:db-id (mt/id)
                                                :output-schema "Other"
                                                :output-table :test_table
                                                :transform-id transform-id}
                                       :user-id api/*current-user-id*})
               (is (=? [{:from_entity_type :table
                         :from_entity_id table-id,
                         :to_entity_type :transform,
                         :to_entity_id transform-id}]
                       (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
             (testing "keeping target"
               (events/publish-event! :event/update-transform
                                      {:object transform
                                       :user-id api/*current-user-id*})
               (deps.test/synchronously-run-backfill!)
               (is (=? [{:from_entity_type :table
                         :from_entity_id table-id,
                         :to_entity_type :transform,
                         :to_entity_id transform-id}]
                       (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
             (testing "changing target update"
               (t2/update! :model/Transform transform-id {:target (assoc target :name "test_table2")})
               (let [updated (t2/select-one :model/Transform :id transform-id)]
                 (events/publish-event! :event/update-transform
                                        {:object updated
                                         :user-id api/*current-user-id*})
                 (deps.test/synchronously-run-backfill!)
                 (is (empty?
                      (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))))

(deftest segment-update-sets-correct-dependencies
  (run-with-dependencies-setup!
   (fn [_]
     (let [products-id (mt/id :products)
           price-field-id (mt/id :products :price)
           category-field-id (mt/id :products :category)]
       (mt/with-temp [:model/Segment {segment-id :id :as segment} {:table_id products-id
                                                                   :definition {:filter [:> [:field price-field-id nil] 50]}}]
         (testing "creating a segment creates dependency to its table"
           (events/publish-event! :event/segment-create {:object segment :user-id api/*current-user-id*})
           (assert-stale :segment segment-id)
           (deps.test/synchronously-run-backfill!)
           (is (= #{{:from_entity_type :segment
                     :from_entity_id segment-id
                     :to_entity_type :table
                     :to_entity_id products-id}}
                  (into #{} (map #(dissoc % :id)
                                 (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment))))))
         (testing "updating segment definition recalculates dependencies"
           (t2/update! :model/Segment segment-id {:definition {:filter [:= [:field category-field-id nil] "Widget"]}})
           (let [updated-segment (t2/select-one :model/Segment :id segment-id)]
             (events/publish-event! :event/segment-update {:object updated-segment :user-id api/*current-user-id*})
             (deps.test/synchronously-run-backfill!)
             (is (= #{{:from_entity_type :segment
                       :from_entity_id segment-id
                       :to_entity_type :table
                       :to_entity_id products-id}}
                    (into #{} (map #(dissoc % :id)
                                   (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment)))))))
         (testing "deleting segment removes all dependencies"
           (t2/delete! :model/Segment segment-id)
           (events/publish-event! :event/segment-delete {:object segment :user-id api/*current-user-id*})
           (is (empty? (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment)))))))))

(deftest card-with-segment-dependencies
  (run-with-dependencies-setup!
   (fn [_]
     (let [products-id (mt/id :products)
           price-field-id (mt/id :products :price)]
       (mt/with-temp [:model/Segment {segment-id :id :as segment} {:table_id products-id
                                                                   :definition {:filter [:> [:field price-field-id nil] 50]}}]
         (testing "creating a card using a segment creates dependencies to both segment and table"
           (events/publish-event! :event/segment-create {:object segment :user-id api/*current-user-id*})
           (deps.test/synchronously-run-backfill!)
           (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query {:database (mt/id)
                                                                              :type :query
                                                                              :query {:source-table products-id
                                                                                      :filter [:segment segment-id]}}}]
             (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
             (deps.test/synchronously-run-backfill!)
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
         (mt/with-temp [:model/Measure {measure-id :id :as measure} {:table_id orders-id
                                                                     :definition (-> (lib/query mp orders)
                                                                                     (lib/aggregate (lib/sum quantity)))}]
           (testing "creating a measure creates dependency to its table"
             (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
             (assert-stale :measure measure-id)
             (deps.test/synchronously-run-backfill!)
             (is (= #{{:from_entity_type :measure
                       :from_entity_id measure-id
                       :to_entity_type :table
                       :to_entity_id orders-id}}
                    (into #{} (map #(dissoc % :id)
                                   (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))
           (testing "updating measure definition recalculates dependencies"
             (t2/update! :model/Measure measure-id {:definition (-> (lib/query mp orders)
                                                                    (lib/aggregate (lib/sum subtotal)))})
             (let [updated-measure (t2/select-one :model/Measure :id measure-id)]
               (events/publish-event! :event/measure-update {:object updated-measure :user-id api/*current-user-id*})
               (deps.test/synchronously-run-backfill!)
               (is (= #{{:from_entity_type :measure
                         :from_entity_id measure-id
                         :to_entity_type :table
                         :to_entity_id orders-id}}
                      (into #{} (map #(dissoc % :id)
                                     (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure)))))))
           (testing "deleting measure removes all dependencies"
             (t2/delete! :model/Measure measure-id)
             (events/publish-event! :event/measure-delete {:object measure :user-id api/*current-user-id*})
             (is (empty? (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))))))

(deftest measure-with-measure-dependencies
  (run-with-dependencies-setup!
   (fn [mp]
     (let [orders-id (mt/id :orders)
           orders (lib.metadata/table mp orders-id)
           quantity (lib.metadata/field mp (mt/id :orders :quantity))
           subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
       (mt/with-temp [:model/Measure {measure1-id :id :as measure1} {:table_id orders-id
                                                                     :definition (-> (lib/query mp orders)
                                                                                     (lib/aggregate (lib/sum quantity)))}]
         (let [mp' (mt/metadata-provider)]
           (mt/with-temp [:model/Measure {measure2-id :id :as measure2} {:table_id orders-id
                                                                         :definition (-> (lib/query mp' orders)
                                                                                         (lib/aggregate (lib/+ (lib.metadata/measure mp' measure1-id)
                                                                                                               (lib/sum subtotal))))}]
             (testing "creating a measure that references another measure creates dependencies to both"
               (events/publish-event! :event/measure-create {:object measure1 :user-id api/*current-user-id*})
               (events/publish-event! :event/measure-create {:object measure2 :user-id api/*current-user-id*})
               (deps.test/synchronously-run-backfill!)
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
       (mt/with-temp [:model/Measure {measure-id :id :as measure} {:table_id orders-id
                                                                   :definition (-> (lib/query mp orders)
                                                                                   (lib/aggregate (lib/sum quantity)))}]
         (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
         (deps.test/synchronously-run-backfill!)
         (testing "creating a card using a measure creates dependencies to both measure and table"
           (let [mp' (mt/metadata-provider)
                 query (-> (lib/query mp' orders)
                           (lib/aggregate (lib.metadata/measure mp' measure-id)))]
             (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query query}]
               (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
               (deps.test/synchronously-run-backfill!)
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

(deftest ^:sequential card-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Card updates should mark the card stale and trigger the background job"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {parent-card-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                        :model/Card {child-card-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           (events/publish-event! :event/card-update {:object parent-card :previous-object parent-card :user-id api/*current-user-id*})
           ;; No analysis record should exist yet - mark-entity-stale! is a no-op for never-analyzed entities
           (assert-has-analyses
            {:card {parent-card-id nil}})
           (is (nil? (t2/select-one-fn :analysis_version :model/AnalysisFinding
                                       :analyzed_entity_type :card
                                       :analyzed_entity_id child-card-id))
               "entities without analysis findings should not be marked: no fake analysis record should be created")))))))

(deftest ^:sequential card-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Card updates should mark the card stale, then the job re-analyzes and propagates"
       (let [products-id (mt/id :products)
             orders-id (mt/id :orders)
             products (lib.metadata/table mp products-id)
             orders (lib.metadata/table mp orders-id)
             old-version models.analysis-finding/*current-analysis-finding-version*]
         (mt/with-temp [:model/Card {parent-card-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                        :model/Card {child-card-id :id :as child-card} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                        :model/Card {other-card-id :id :as other-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           (deps.findings/upsert-analysis! parent-card)
           (deps.findings/upsert-analysis! child-card)
           (deps.findings/upsert-analysis! other-card)
           (testing "Checking that the initial analyses exist"
             (assert-has-analyses
              {:card {parent-card-id old-version
                      child-card-id old-version
                      other-card-id old-version}}))
           (testing "card update only marks direct dependents stale - not its own analysis"
             (events/publish-event! :event/card-update {:object parent-card :previous-object parent-card :user-id api/*current-user-id*})
             (assert-has-analyses
              {:card {parent-card-id old-version
                      child-card-id -1
                      other-card-id old-version}}))
           (testing "If the version changes, the job picks up only the stale cards"
             (binding [models.analysis-finding/*current-analysis-finding-version* (inc old-version)]
               (assert-has-analyses
                {:card {parent-card-id old-version
                        child-card-id -1
                        other-card-id old-version}})))))))))

;;; ------------------------------------------------ Analysis propagation tests ------------------------------------------------

(deftest ^:sequential card-update-transaction-rollback-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "If marking immediate dependents stale fails, analysis upsert is rolled back"
       (let [products (lib.metadata/table mp (mt/id :products))
             old-version models.analysis-finding/*current-analysis-finding-version*
             new-version (inc old-version)]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}]
           (deps.findings/upsert-analysis! card)
           (testing "Initial analysis exists"
             (is (= old-version (t2/select-one-fn :analysis_version :model/AnalysisFinding
                                                  :analyzed_entity_type :card
                                                  :analyzed_entity_id card-id))))
           (binding [models.analysis-finding/*current-analysis-finding-version* new-version]
             (with-redefs [deps.findings/mark-immediate-dependents-stale!
                           (fn [_ _] (throw (ex-info "Simulated failure" {})))]
               ;; analyze-and-propagate! wraps in a transaction, so the upsert should be rolled back
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Simulated failure"
                                     (#'deps.findings/analyze-and-propagate! card)))))
           (testing "Analysis should be unchanged after rolled-back transaction"
             (is (= old-version (t2/select-one-fn :analysis_version :model/AnalysisFinding
                                                  :analyzed_entity_type :card
                                                  :analyzed_entity_id card-id))))))))))

(deftest ^:sequential card-update-triggers-native-cards-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Card update marks entity stale, and the entity-check job re-analyzes it and marks dependents stale"
       (mt/with-temp [:model/Card {parent-id :id :as parent} {:dataset_query (lib/native-query mp "select * from products")}
                      :model/Card {child-id :id :as child} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                      :model/Dependency _ {:from_entity_type :card :from_entity_id child-id
                                           :to_entity_type :card :to_entity_id parent-id}]
         (deps.findings/upsert-analysis! parent)
         (deps.findings/upsert-analysis! child)
           ;; Event marks entity stale in analysis_finding
         (events/publish-event! :event/card-update {:object parent :previous-object parent :user-id api/*current-user-id*})
         (testing "Parent card should be marked stale"
           (is (true? (t2/select-one-fn :stale :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id parent-id))))
           ;; Run entity-check job to process stale entities
         (#'task.entity-check/check-entities!)
         (testing "Parent should be re-analyzed"
           (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                         :analyzed_entity_type :card
                                         :analyzed_entity_id parent-id))))
         (testing "Child should have been re-analyzed via wave propagation"
           (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                         :analyzed_entity_type :card
                                         :analyzed_entity_id child-id)))))))))

(deftest ^:sequential card-update-stops-on-transforms-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Card update marks immediate dependents stale including transforms, wave propagates through"
       (let [products (lib.metadata/table mp (mt/id :products))
             orders (lib.metadata/table mp (mt/id :orders))
             old-version models.analysis-finding/*current-analysis-finding-version*]
         (mt/with-temp [:model/Card {parent-card-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id :as transform} {:source {:type :query
                                                                                    :query (lib/query mp products)}
                                                                           :name "transform_sample"
                                                                           :target {:schema "public"
                                                                                    :name "sample"
                                                                                    :type :table}}
                        :model/Card {child-card-id :id :as child-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :transform :from_entity_id transform-id
                                             :to_entity_type :card :to_entity_id parent-card-id}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id child-card-id
                                             :to_entity_type :transform :to_entity_id transform-id}]
           (deps.findings/upsert-analysis! parent-card)
           (deps.findings/upsert-analysis! transform)
           (deps.findings/upsert-analysis! child-card)
           (assert-has-analyses
            {:card {parent-card-id old-version child-card-id old-version}
             :transform {transform-id old-version}})
           ;; Event marks parent stale in analysis_finding, which triggers entity-check
           (events/publish-event! :event/card-update {:object parent-card :previous-object parent-card :user-id api/*current-user-id*})
           ;; Run entity-check job — should propagate through transform to child via waves
           (#'task.entity-check/check-entities!)
           (testing "All entities should be re-analyzed after wave propagation"
             (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                           :analyzed_entity_type :card :analyzed_entity_id parent-card-id)))
             (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                           :analyzed_entity_type :transform :analyzed_entity_id transform-id)))
             (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                           :analyzed_entity_type :card :analyzed_entity_id child-card-id))))))))))

(deftest ^:sequential transform-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Transform update does not error when no analyses exist yet"
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Transform transform {:source {:type :query
                                                             :query (lib/query mp products)}
                                                    :name "transform_sample"
                                                    :target {:schema "public"
                                                             :name "sample"
                                                             :type :table}}]
           ;; Should not throw even when no analysis findings exist
           (is (some? (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})))))))))

(deftest ^:sequential transform-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Transform update marks entity stale, entity-check job re-analyzes it"
       (let [products (lib.metadata/table mp (mt/id :products))
             old-version models.analysis-finding/*current-analysis-finding-version*]
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:source {:type :query
                                                                                    :query (lib/query mp products)}
                                                                           :name "transform_sample"
                                                                           :target {:schema "public"
                                                                                    :name "sample"
                                                                                    :type :table}}]
           (deps.findings/upsert-analysis! transform)
           (assert-has-analyses {:transform {transform-id old-version}})
           (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})
           (testing "Transform should be marked stale"
             (is (true? (t2/select-one-fn :stale :model/AnalysisFinding
                                          :analyzed_entity_type :transform
                                          :analyzed_entity_id transform-id))))
           (#'task.entity-check/check-entities!)
           (testing "Transform should be re-analyzed"
             (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                           :analyzed_entity_type :transform
                                           :analyzed_entity_id transform-id))))))))))

(deftest ^:sequential transform-update-triggers-native-transforms-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Native transform updates do not error"
       (mt/with-temp [:model/Transform transform {:source {:type :query
                                                           :query (lib/native-query mp "select * from products")}
                                                  :name "transform_sample"
                                                  :target {:schema "public"
                                                           :name "sample"
                                                           :type :table}}]
         ;; Should not throw even for native transforms
         (is (some? (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*}))))))))

(deftest ^:sequential transform-run-works-with-no-analyses-test
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
           (is (some? (events/publish-event! :event/transform-run-complete
                                             {:object {:db-id (mt/id)
                                                       :output-schema "public"
                                                       :output-table "sample"
                                                       :transform-id transform-id}
                                              :user-id api/*current-user-id*})))))))))

(deftest ^:sequential transform-run-marks-dependents-stale-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Transform run marks immediate dependents stale"
       (let [products (lib.metadata/table mp (mt/id :products))
             orders (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id :as transform} {:source {:type :query :query (lib/query mp products)}
                                                                           :name "transform_sample"
                                                                           :target {:schema "public" :name "sample" :type :table}}
                        :model/Card {other-card-id :id :as other-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :transform :to_entity_id transform-id}]
           (deps.findings/upsert-analysis! card)
           (deps.findings/upsert-analysis! transform)
           (deps.findings/upsert-analysis! other-card)
           (events/publish-event! :event/transform-run-complete
                                  {:object {:db-id (mt/id)
                                            :output-schema "public"
                                            :output-table "sample"
                                            :transform-id transform-id}
                                   :user-id api/*current-user-id*})
           (testing "Dependent card should be marked stale"
             (is (true? (t2/select-one-fn :stale :model/AnalysisFinding
                                          :analyzed_entity_type :card :analyzed_entity_id card-id))))
           (testing "Other card should be unchanged"
             (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                           :analyzed_entity_type :card :analyzed_entity_id other-card-id))))
           (testing "Transform should be unchanged"
             (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                           :analyzed_entity_type :transform :analyzed_entity_id transform-id))))))))))

(deftest ^:sequential segment-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [_]
     (testing "Segment update does not error when no analyses exist yet"
       (let [products-id (mt/id :products)
             price-field-id (mt/id :products :price)]
         (mt/with-temp [:model/Segment segment {:table_id products-id
                                                :definition {:filter [:> [:field price-field-id nil] 50]}}]
           ;; Should not throw even when no analysis findings exist
           (is (some? (events/publish-event! :event/segment-update {:object segment :user-id api/*current-user-id*})))))))))

(deftest ^:sequential segment-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Segment update marks entity stale, entity-check job re-analyzes and propagates"
       (let [products-id (mt/id :products)
             price-field-id (mt/id :products :price)
             products (lib.metadata/table mp products-id)
             old-version models.analysis-finding/*current-analysis-finding-version*]
         (mt/with-temp [:model/Segment {segment-id :id :as segment} {:table_id products-id
                                                                     :definition {:filter [:> [:field price-field-id nil] 50]}}
                        :model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :segment :to_entity_id segment-id}]
           (deps.findings/upsert-analysis! segment)
           (deps.findings/upsert-analysis! card)
           (assert-has-analyses {:card {card-id old-version} :segment {segment-id old-version}})
           (events/publish-event! :event/segment-update {:object segment :user-id api/*current-user-id*})
           (testing "Segment should be marked stale"
             (is (true? (t2/select-one-fn :stale :model/AnalysisFinding
                                          :analyzed_entity_type :segment :analyzed_entity_id segment-id))))
           (#'task.entity-check/check-entities!)
           (testing "Both segment and dependent card should be re-analyzed"
             (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                           :analyzed_entity_type :segment :analyzed_entity_id segment-id)))
             (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                           :analyzed_entity_type :card :analyzed_entity_id card-id))))))))))

(deftest ^:sequential table-metadata-update-triggers-dependent-analysis-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Table metadata update marks immediate dependents stale"
       (let [products-id (mt/id :products)
             orders (lib.metadata/table mp (mt/id :orders))
             products (lib.metadata/table mp products-id)
             old-version models.analysis-finding/*current-analysis-finding-version*]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                        :model/Card {other-card-id :id :as other-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (deps.findings/upsert-analysis! card)
           (deps.findings/upsert-analysis! other-card)
           (assert-has-analyses {:card {card-id old-version other-card-id old-version}})
           (let [table (t2/select-one :model/Table :id products-id)]
             (events/publish-event! :event/table-update {:object table :user-id api/*current-user-id*})
             (testing "Card depending on updated table should be marked stale"
               (is (true? (t2/select-one-fn :stale :model/AnalysisFinding
                                            :analyzed_entity_type :card :analyzed_entity_id card-id))))
             (testing "Card not depending on updated table should not be stale"
               (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                             :analyzed_entity_type :card :analyzed_entity_id other-card-id)))))))))))

(deftest ^:sequential table-metadata-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Table metadata update does not error when no findings exist yet"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (let [table (t2/select-one :model/Table :id products-id)]
             (events/publish-event! :event/table-update {:object table :user-id api/*current-user-id*})
             (assert-has-analyses {:card {card-id nil}}))))))))

(deftest ^:sequential field-metadata-update-triggers-dependent-analysis-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Field metadata update marks dependents of the field's table stale"
       (let [products-id (mt/id :products)
             orders (lib.metadata/table mp (mt/id :orders))
             products (lib.metadata/table mp products-id)
             old-version models.analysis-finding/*current-analysis-finding-version*]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                        :model/Card {other-card-id :id :as other-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (deps.findings/upsert-analysis! card)
           (deps.findings/upsert-analysis! other-card)
           (assert-has-analyses {:card {card-id old-version other-card-id old-version}})
           (let [field (t2/select-one :model/Field :id (mt/id :products :category))]
             (events/publish-event! :event/field-update {:object field :user-id api/*current-user-id*})
             (testing "Card depending on the table whose field was updated should be stale"
               (is (true? (t2/select-one-fn :stale :model/AnalysisFinding
                                            :analyzed_entity_type :card :analyzed_entity_id card-id))))
             (testing "Card not depending on that table should not be stale"
               (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                             :analyzed_entity_type :card :analyzed_entity_id other-card-id)))))))))))

(deftest ^:sequential field-metadata-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Field metadata update does not error when no findings exist yet"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (let [field (t2/select-one :model/Field :id (mt/id :products :category))]
             (events/publish-event! :event/field-update {:object field :user-id api/*current-user-id*})
             (assert-has-analyses {:card {card-id nil}}))))))))
