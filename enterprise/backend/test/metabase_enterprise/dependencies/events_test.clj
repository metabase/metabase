(ns metabase-enterprise.dependencies.events-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(defn- run-with-dependencies-setup! [thunk]
  (mt/with-test-user :rasta
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding]
        (lib-be/with-metadata-provider-cache
          (let [mp (mt/metadata-provider)]
            (thunk mp)))))))

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
         (is (=? #{{:from_entity_type :sandbox
                    :from_entity_id sandbox-id
                    :to_entity_type :card
                    :to_entity_id card1-id}}
                 (into #{} (map #(dissoc % :id)
                                (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))
         (t2/update! :model/Sandbox sandbox-id (assoc sandbox :card_id card2-id))
         (let [updated-sandbox (t2/select-one :model/Sandbox :id sandbox-id)]
           (events/publish-event! :event/sandbox-update {:object updated-sandbox :user-id api/*current-user-id*})
           (is (=? #{{:from_entity_type :sandbox
                      :from_entity_id sandbox-id
                      :to_entity_type :card
                      :to_entity_id card2-id}}
                   (into #{} (map #(dissoc % :id)
                                  (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))
           (t2/delete! :model/Sandbox sandbox-id)
           (events/publish-event! :event/sandbox-delete {:object sandbox :user-id api/*current-user-id*})
           (is (empty? (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))))))

(deftest card-dependency-calculation-error-handling-test
  (testing "When dependency calculation throws an error, it should be logged and the version should still be updated"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}]
           (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
             (with-redefs [deps.calculation/upstream-deps:card (fn [_]
                                                                 (throw (ex-info "Dependency calculation failed"
                                                                                 {:card-id card-id})))]
               (testing "on create event"
                 (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
                 (is (some #(and (= "Dependency calculation failed" (ex-message (:e %)))
                                 (= :error (:level %))
                                 (str/includes? (:message %) "{:entity-type :card")
                                 (str/includes? (:message %) (str card-id)))
                           (messages)))
                 (is (= models.dependency/current-dependency-analysis-version
                        (t2/select-one-fn :dependency_analysis_version :model/Card :id card-id)))
                 (is (empty? (t2/select :model/Dependency :from_entity_id card-id :from_entity_type :card))))
               (testing "on update event"
                 (events/publish-event! :event/card-update {:object card :previous-object card :user-id api/*current-user-id*})
                 (is (some #(and (= "Dependency calculation failed" (ex-message (:e %)))
                                 (= :error (:level %))
                                 (str/includes? (:message %) "{:entity-type :card")
                                 (str/includes? (:message %) (str card-id)))
                           (messages)))
                 (is (= models.dependency/current-dependency-analysis-version
                        (t2/select-one-fn :dependency_analysis_version :model/Card :id card-id)))
                 (is (empty? (t2/select :model/Dependency :from_entity_id card-id :from_entity_type :card))))))))))))

(deftest snippet-dependency-calculation-error-handling-test
  (testing "When snippet dependency calculation throws an error, it should be logged and the version should still be updated"
    (run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "test snippet"
                                                                              :content "SELECT 1"}]
         (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
           (with-redefs [deps.calculation/upstream-deps:snippet (fn [_]
                                                                  (throw (ex-info "Snippet dependency calculation failed"
                                                                                  {:snippet-id snippet-id})))]
             (testing "on create event"
               (events/publish-event! :event/snippet-create {:object snippet :user-id api/*current-user-id*})
               (is (some #(and (= "Snippet dependency calculation failed" (ex-message (:e %)))
                               (= :error (:level %)))
                         (messages)))
               (is (= models.dependency/current-dependency-analysis-version
                      (t2/select-one-fn :dependency_analysis_version :model/NativeQuerySnippet :id snippet-id)))
               (is (empty? (t2/select :model/Dependency :from_entity_id snippet-id :from_entity_type :snippet))))
             (testing "on update event"
               (events/publish-event! :event/snippet-update {:object snippet :user-id api/*current-user-id*})
               (is (some #(and (= "Snippet dependency calculation failed" (ex-message (:e %)))
                               (= :error (:level %)))
                         (messages)))
               (is (= models.dependency/current-dependency-analysis-version
                      (t2/select-one-fn :dependency_analysis_version :model/NativeQuerySnippet :id snippet-id)))
               (is (empty? (t2/select :model/Dependency :from_entity_id snippet-id :from_entity_type :snippet)))))))))))

(deftest ^:sequential native-transform-updates-dependencies-test
  (testing "native transform update events trigger dependency calculations"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/native-query mp "select * from orders")
                     :type :query}]
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:source source}]
           (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})
           (is (= models.dependency/current-dependency-analysis-version
                  (t2/select-one-fn :dependency_analysis_version :model/Transform :id transform-id)))
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
           (is (= models.dependency/current-dependency-analysis-version
                  (t2/select-one-fn :dependency_analysis_version :model/Transform :id transform-id)))
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
                     :source-tables {"orders" {:database_id (mt/id),
                                               :schema "public",
                                               :table "orders",
                                               :table_id (mt/id :orders)}},
                     :body
                     "import pandas as pd\n\ndef transform(orders):\n    return orders"}]
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:source source}]
           (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})
           (is (= models.dependency/current-dependency-analysis-version
                  (t2/select-one-fn :dependency_analysis_version :model/Transform :id transform-id)))
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
         (mt/with-temp [:model/Transform {transform-id :id} {:target target}
                        :model/Table {table-id :id} {:schema "Other", :db_id (mt/id), :name "test_table"}]
           (events/publish-event! :event/transform-run-complete
                                  {:object {:db-id (mt/id)
                                            :output-schema "Other"
                                            :output-table :test_table
                                            :transform-id transform-id}
                                   :user-id api/*current-user-id*})
           (is (= models.dependency/current-dependency-analysis-version
                  (t2/select-one-fn :dependency_analysis_version :model/Transform :id transform-id)))
           (is (=? [{:from_entity_type :table
                     :from_entity_id table-id,
                     :to_entity_type :transform,
                     :to_entity_id transform-id}]
                   (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform)))))))))

(deftest ^:sequential python-transform-update-handles-downstream-dependencies-test
  (testing "python transform update events handles downstream dependencies"
    (run-with-dependencies-setup!
     (fn [_]
       (let [source {:type :python,
                     :source-database (mt/id),
                     :source-tables {"orders" {:database_id (mt/id),
                                               :schema "public",
                                               :table "orders",
                                               :table_id (mt/id :orders)}},
                     :body
                     "import pandas as pd\n\ndef transform(orders):\n    return orders"}
             target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:target target
                                                                           :source source}
                        :model/Table {table-id :id} {:schema "Other", :db_id (mt/id), :name "test_table"}
                        :model/Table {} {:schema "Other", :db_id (mt/id), :name "test_table2"}]
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
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "changing target update"
             (events/publish-event! :event/update-transform
                                    {:object (assoc-in transform [:target :name] "test_table2")
                                     :user-id api/*current-user-id*})
             (is (empty?
                  (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))

(deftest ^:sequential query-transform-update-handles-downstream-dependencies-test
  (testing "query transform update events handles downstream dependencies"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/native-query mp "select * from orders")
                     :type :query}
             target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Transform {transform-id :id :as transform} {:target target :source source}
                        :model/Table {table-id :id} {:schema "Other", :db_id (mt/id), :name "test_table"}
                        :model/Table {} {:schema "Other", :db_id (mt/id), :name "test_table2"}]
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
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "changing target update"
             (events/publish-event! :event/update-transform
                                    {:object (assoc-in transform [:target :name] "test_table2")
                                     :user-id api/*current-user-id*})
             (is (empty?
                  (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))

(deftest transform-dependency-calculation-error-handling-test
  (testing "When transform dependency calculation throws an error, it should be logged and the version should still be updated"
    (run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/Transform {transform-id :id :as transform} {}]
         (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
           (with-redefs [deps.calculation/upstream-deps:transform (fn [_]
                                                                    (throw (ex-info "Transform dependency calculation failed"
                                                                                    {:transform-id transform-id})))]
             (testing "on create event"
               (events/publish-event! :event/create-transform {:object transform :user-id api/*current-user-id*})
               (is (some #(and (= "Transform dependency calculation failed" (ex-message (:e %)))
                               (= :error (:level %)))
                         (messages)))
               (is (= models.dependency/current-dependency-analysis-version
                      (t2/select-one-fn :dependency_analysis_version :model/Transform :id transform-id)))
               (is (empty? (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform))))
             (testing "on update event"
               (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})
               (is (some #(and (= "Transform dependency calculation failed" (ex-message (:e %)))
                               (= :error (:level %)))
                         (messages)))
               (is (= models.dependency/current-dependency-analysis-version
                      (t2/select-one-fn :dependency_analysis_version :model/Transform :id transform-id)))
               (is (empty? (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))))

(deftest dashboard-dependency-calculation-error-handling-test
  (testing "When dashboard dependency calculation throws an error, it should be logged and the version should still be updated"
    (run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/Dashboard {dashboard-id :id :as dashboard} {}]
         (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
           (with-redefs [deps.calculation/upstream-deps:dashboard (fn [_]
                                                                    (throw (ex-info "Dashboard dependency calculation failed"
                                                                                    {:dashboard-id dashboard-id})))]
             (testing "on create event"
               (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
               (is (some #(and (= "Dashboard dependency calculation failed" (ex-message (:e %)))
                               (= :error (:level %)))
                         (messages)))
               (is (= models.dependency/current-dependency-analysis-version
                      (t2/select-one-fn :dependency_analysis_version :model/Dashboard :id dashboard-id)))
               (is (empty? (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard))))
             (testing "on update event"
               (events/publish-event! :event/dashboard-update {:object dashboard :user-id api/*current-user-id*})
               (is (some #(and (= "Dashboard dependency calculation failed" (ex-message (:e %)))
                               (= :error (:level %)))
                         (messages)))
               (is (= models.dependency/current-dependency-analysis-version
                      (t2/select-one-fn :dependency_analysis_version :model/Dashboard :id dashboard-id)))
               (is (empty? (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard)))))))))))

(deftest document-dependency-calculation-error-handling-test
  (testing "When document dependency calculation throws an error, it should be logged and the version should still be updated"
    (run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/Document {document-id :id :as document} {:content_type "application/json+vnd.prose-mirror"
                                                                      :document {:type "doc" :content []}}]
         (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
           (with-redefs [deps.calculation/upstream-deps:document (fn [_]
                                                                   (throw (ex-info "Document dependency calculation failed"
                                                                                   {:document-id document-id})))]
             (testing "on create event"
               (events/publish-event! :event/document-create {:object document :user-id api/*current-user-id*})
               (is (some #(and (= "Document dependency calculation failed" (ex-message (:e %)))
                               (= :error (:level %)))
                         (messages)))
               (is (= models.dependency/current-dependency-analysis-version
                      (t2/select-one-fn :dependency_analysis_version :model/Document :id document-id)))
               (is (empty? (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document))))
             (testing "on update event"
               (events/publish-event! :event/document-update {:object document :user-id api/*current-user-id*})
               (is (some #(and (= "Document dependency calculation failed" (ex-message (:e %)))
                               (= :error (:level %)))
                         (messages)))
               (is (= models.dependency/current-dependency-analysis-version
                      (t2/select-one-fn :dependency_analysis_version :model/Document :id document-id)))
               (is (empty? (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document)))))))))))

(deftest sandbox-dependency-calculation-error-handling-test
  (testing "When sandbox dependency calculation throws an error, it should be logged and the version should still be updated"
    (mt/with-premium-features #{:sandboxes}
      (run-with-dependencies-setup!
       (fn [_]
         (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "test group"}
                        :model/Card {card-id :id} {}
                        :model/Sandbox {sandbox-id :id :as sandbox} {:group_id group-id
                                                                     :table_id (mt/id :products)
                                                                     :card_id card-id}]
           (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
             (with-redefs [deps.calculation/upstream-deps:sandbox (fn [_]
                                                                    (throw (ex-info "Sandbox dependency calculation failed"
                                                                                    {:sandbox-id sandbox-id})))]
               (testing "on create event"
                 (events/publish-event! :event/sandbox-create {:object sandbox :user-id api/*current-user-id*})
                 (is (some #(and (= "Sandbox dependency calculation failed" (ex-message (:e %)))
                                 (= :error (:level %)))
                           (messages)))
                 (is (= models.dependency/current-dependency-analysis-version
                        (t2/select-one-fn :dependency_analysis_version :model/Sandbox :id sandbox-id)))
                 (is (empty? (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox))))
               (testing "on update event"
                 (events/publish-event! :event/sandbox-update {:object sandbox :user-id api/*current-user-id*})
                 (is (some #(and (= "Sandbox dependency calculation failed" (ex-message (:e %)))
                                 (= :error (:level %)))
                           (messages)))
                 (is (= models.dependency/current-dependency-analysis-version
                        (t2/select-one-fn :dependency_analysis_version :model/Sandbox :id sandbox-id)))
                 (is (empty? (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox))))))))))))

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
           (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query {:database (mt/id)
                                                                              :type :query
                                                                              :query {:source-table products-id
                                                                                      :filter [:segment segment-id]}}}]
             (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
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

(deftest segment-dependency-calculation-error-handling-test
  (testing "When segment dependency calculation throws an error, it should be logged and the version should still be updated"
    (run-with-dependencies-setup!
     (fn [_]
       (let [products-id (mt/id :products)
             price-field-id (mt/id :products :price)]
         (mt/with-temp [:model/Segment {segment-id :id :as segment} {:table_id products-id
                                                                     :definition {:filter [:> [:field price-field-id nil] 50]}}]
           (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
             (with-redefs [deps.calculation/upstream-deps:segment (fn [_]
                                                                    (throw (ex-info "Segment dependency calculation failed"
                                                                                    {:segment-id segment-id})))]
               (testing "on create event"
                 (events/publish-event! :event/segment-create {:object segment :user-id api/*current-user-id*})
                 (is (some #(and (= "Segment dependency calculation failed" (ex-message (:e %)))
                                 (= :error (:level %)))
                           (messages)))
                 (is (= models.dependency/current-dependency-analysis-version
                        (t2/select-one-fn :dependency_analysis_version :model/Segment :id segment-id)))
                 (is (empty? (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment))))
               (testing "on update event"
                 (events/publish-event! :event/segment-update {:object segment :user-id api/*current-user-id*})
                 (is (some #(and (= "Segment dependency calculation failed" (ex-message (:e %)))
                                 (= :error (:level %)))
                           (messages)))
                 (is (= models.dependency/current-dependency-analysis-version
                        (t2/select-one-fn :dependency_analysis_version :model/Segment :id segment-id)))
                 (is (empty? (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment))))))))))))

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
         (testing "creating a card using a measure creates dependencies to both measure and table"
           (let [mp' (mt/metadata-provider)
                 query (-> (lib/query mp' orders)
                           (lib/aggregate (lib.metadata/measure mp' measure-id)))]
             (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query query}]
               (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
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

(deftest measure-dependency-calculation-error-handling-test
  (testing "When measure dependency calculation throws an error, it should be logged and the version should still be updated"
    (run-with-dependencies-setup!
     (fn [mp]
       (let [orders-id (mt/id :orders)
             orders (lib.metadata/table mp orders-id)
             quantity (lib.metadata/field mp (mt/id :orders :quantity))]
         (mt/with-temp [:model/Measure {measure-id :id :as measure} {:table_id orders-id
                                                                     :definition (-> (lib/query mp orders)
                                                                                     (lib/aggregate (lib/sum quantity)))}]
           (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
             (with-redefs [deps.calculation/upstream-deps:measure (fn [_]
                                                                    (throw (ex-info "Measure dependency calculation failed"
                                                                                    {:measure-id measure-id})))]
               (testing "on create event"
                 (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
                 (is (some #(and (= "Measure dependency calculation failed" (ex-message (:e %)))
                                 (= :error (:level %)))
                           (messages)))
                 (is (= models.dependency/current-dependency-analysis-version
                        (t2/select-one-fn :dependency_analysis_version :model/Measure :id measure-id)))
                 (is (empty? (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))
               (testing "on update event"
                 (events/publish-event! :event/measure-update {:object measure :user-id api/*current-user-id*})
                 (is (some #(and (= "Measure dependency calculation failed" (ex-message (:e %)))
                                 (= :error (:level %)))
                           (messages)))
                 (is (= models.dependency/current-dependency-analysis-version
                        (t2/select-one-fn :dependency_analysis_version :model/Measure :id measure-id)))
                 (is (empty? (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))))))))

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
     (testing "Card updates should analyze the card and mark dependents stale for async processing"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {parent-card-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                        :model/Card {child-card-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           (events/publish-event! :event/card-update {:object parent-card :previous-object parent-card :user-id api/*current-user-id*})
           (assert-has-analyses
            {:card {parent-card-id -1}})
           (is (nil? (t2/select-one-fn :analysis_version :model/AnalysisFinding
                                       :analyzed_entity_type :card
                                       :analyzed_entity_id child-card-id))
               "entities without analysis findings should not be marked: no fake analysis record should be created")))))))

(deftest ^:sequential card-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Card updates should update the card's analysis and mark dependents stale"
       (let [products-id (mt/id :products)
             orders-id (mt/id :orders)
             products (lib.metadata/table mp products-id)
             orders (lib.metadata/table mp orders-id)
             old-version models.analysis-finding/*current-analysis-finding-version*
             new-version (inc models.analysis-finding/*current-analysis-finding-version*)]
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
           (t2/with-transaction [_conn]
             (binding [models.analysis-finding/*current-analysis-finding-version* new-version]
               (events/publish-event! :event/card-update {:object parent-card :previous-object parent-card :user-id api/*current-user-id*}))
             (testing "Parent should be re-analyzed synchronously"
               (assert-has-analyses
                {:card {parent-card-id new-version}}))
             (testing "Child should be marked stale (not re-analyzed yet)"
               (let [child-finding (t2/select-one :model/AnalysisFinding
                                                  :analyzed_entity_type :card
                                                  :analyzed_entity_id child-card-id)]
                 (is (= old-version (:analysis_version child-finding)))
                 (is (true? (:stale child-finding)))))
             (testing "Other card should be unchanged"
               (let [other-finding (t2/select-one :model/AnalysisFinding
                                                  :analyzed_entity_type :card
                                                  :analyzed_entity_id other-card-id)]
                 (is (= old-version (:analysis_version other-finding)))
                 (is (false? (:stale other-finding))))))))))))

(deftest ^:sequential stale-entities-are-processed-by-job-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Stale entities are re-analyzed when the job runs"
       (let [products (lib.metadata/table mp (mt/id :products))
             current-version models.analysis-finding/*current-analysis-finding-version*]
         (mt/with-temp [:model/Card {parent-card-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                        :model/Card {child-card-id :id :as child-card} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           ;; Create initial analyses for both cards
           (deps.findings/upsert-analysis! parent-card)
           (deps.findings/upsert-analysis! child-card)
           ;; Update parent - this marks child as stale
           (t2/with-transaction [_conn]
             (events/publish-event! :event/card-update {:object parent-card :previous-object parent-card :user-id api/*current-user-id*})
             ;; Verify child is stale
             (is (true? (t2/select-one-fn :stale :model/AnalysisFinding
                                          :analyzed_entity_type :card
                                          :analyzed_entity_id child-card-id))
                 "Child should be marked stale after parent update"))
           ;; Run the job to process stale entities
           (deps.findings/analyze-batch! :card 10)
           ;; Verify child is no longer stale and has been re-analyzed
           (let [child-finding (t2/select-one :model/AnalysisFinding
                                              :analyzed_entity_type :card
                                              :analyzed_entity_id child-card-id)]
             (is (false? (:stale child-finding))
                 "Child should no longer be stale after job runs")
             (is (= current-version (:analysis_version child-finding))
                 "Child should have current analysis version"))))))))

(deftest ^:sequential card-update-transaction-rollback-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "If marking dependents stale fails, analysis upsert is rolled back"
       (let [products (lib.metadata/table mp (mt/id :products))
             old-version models.analysis-finding/*current-analysis-finding-version*
             new-version (inc old-version)]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}]
           ;; Create initial analysis
           (deps.findings/upsert-analysis! card)
           (testing "Initial analysis exists"
             (is (= old-version (t2/select-one-fn :analysis_version :model/AnalysisFinding
                                                  :analyzed_entity_type :card
                                                  :analyzed_entity_id card-id))))
           ;; Try to update with mark-dependents-stale! throwing an exception
           (binding [models.analysis-finding/*current-analysis-finding-version* new-version]
             (with-redefs [deps.findings/mark-dependents-stale! (fn [_ _] (throw (ex-info "Simulated failure" {})))]
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Simulated failure"
                                     (events/publish-event! :event/card-update {:object card :previous-object card :user-id api/*current-user-id*})))))
           ;; Verify analysis was NOT updated (rolled back)
           (testing "Analysis should be unchanged after failed event"
             (is (= old-version (t2/select-one-fn :analysis_version :model/AnalysisFinding
                                                  :analyzed_entity_type :card
                                                  :analyzed_entity_id card-id))))))))))

(deftest ^:sequential card-update-ignores-native-cards-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Native card updates should not trigger analysis"
       (mt/with-temp [:model/Card {parent-card-id :id :as parent-card} {:dataset_query (lib/native-query mp "select * from products")}
                      :model/Card {child-card-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                      :model/Dependency _ {:from_entity_type :card
                                           :from_entity_id child-card-id
                                           :to_entity_type :card
                                           :to_entity_id parent-card-id}]
         (events/publish-event! :event/card-update {:object parent-card :previous-object parent-card :user-id api/*current-user-id*})
         (assert-has-analyses
          {:card {parent-card-id nil
                  child-card-id nil}}))))))

(deftest ^:sequential card-update-stops-on-transforms-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Card updates should continue analyzing through a transform"
       (let [products-id (mt/id :products)
             orders-id (mt/id :orders)
             products (lib.metadata/table mp products-id)
             orders (lib.metadata/table mp orders-id)
             old-version models.analysis-finding/*current-analysis-finding-version*
             new-version (inc models.analysis-finding/*current-analysis-finding-version*)]
         (mt/with-temp [:model/Card {parent-card-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id :as transform} {:source {:type :query
                                                                                    :query (lib/query mp products)}
                                                                           :name "transform_sample"
                                                                           :target {:schema "public"
                                                                                    :name "sample"
                                                                                    :type :table}}
                        :model/Card {child-card-id :id :as child-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :transform
                                             :to_entity_id transform-id}
                        :model/Dependency _ {:from_entity_type :transform
                                             :from_entity_id transform-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           (deps.findings/upsert-analysis! parent-card)
           (deps.findings/upsert-analysis! transform)
           (deps.findings/upsert-analysis! child-card)
           (testing "Checking that initial analyses exist"
             (assert-has-analyses
              {:card {parent-card-id old-version
                      child-card-id old-version}
               :transform {transform-id old-version}}))
           (binding [models.analysis-finding/*current-analysis-finding-version* new-version]
             (t2/with-transaction [_conn]
               (events/publish-event! :event/card-update {:object parent-card :previous-object parent-card :user-id api/*current-user-id*})
               (testing "parent card should be re-analyzed synchronously"
                 (is (=? {:analysis_version new-version :stale false}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id parent-card-id))))
               (testing "transform (direct dependent) should be marked stale"
                 (is (=? {:analysis_version old-version :stale true}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :transform
                                        :analyzed_entity_id transform-id))))
               (testing "child card (transitive dependent) should be marked stale"
                 (is (=? {:analysis_version old-version :stale true}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id child-card-id))))))))))))

(deftest ^:sequential transform-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "transform update creates new analyses"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id :as transform} {:source {:type :query
                                                                                    :query (lib/query mp products)}
                                                                           :name "transform_sample"
                                                                           :target {:schema "public"
                                                                                    :name "sample"
                                                                                    :type :table}}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :transform
                                             :to_entity_id transform-id}]
           (events/publish-event! :event/transform-update {:object transform :user-id api/*current-user-id*})
           (assert-has-analyses
            ;; child cards shouldn't be updated on transform update, only on run
            {:card {card-id nil}
             :transform {transform-id -1}})))))))

(deftest ^:sequential transform-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "transform update updates analyses when they exist"
       (let [products-id (mt/id :products)
             orders-id (mt/id :orders)
             products (lib.metadata/table mp products-id)
             orders (lib.metadata/table mp orders-id)
             old-version models.analysis-finding/*current-analysis-finding-version*
             new-version (inc models.analysis-finding/*current-analysis-finding-version*)]
         (mt/with-premium-features #{:dependencies}
           (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                          :model/Transform {transform-id :id :as transform} {:source {:type :query
                                                                                      :query (lib/query mp products)}
                                                                             :name "transform_sample"
                                                                             :target {:schema "public"
                                                                                      :name "sample"
                                                                                      :type :table}}
                          :model/Card {other-card-id :id :as other-card} {:dataset_query (lib/query mp orders)}
                          :model/Dependency _ {:from_entity_type :card
                                               :from_entity_id card-id
                                               :to_entity_type :transform
                                               :to_entity_id transform-id}]
             (deps.findings/upsert-analysis! card)
             (deps.findings/upsert-analysis! transform)
             (deps.findings/upsert-analysis! other-card)
             (testing "Checking that initial analyses exist"
               (assert-has-analyses
                {:card {card-id old-version
                        other-card-id old-version}
                 :transform {transform-id old-version}}))
             (binding [models.analysis-finding/*current-analysis-finding-version* new-version]
               (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*}))
             (testing "Checking that the correct analyses were updated"
               (assert-has-analyses
                ;; neither unrelated cards nor dependent cards should be updated on transform update
                {:card {card-id old-version
                        other-card-id old-version}
                 :transform {transform-id new-version}})))))))))

(deftest ^:sequential transform-update-ignores-native-transforms-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Native transform updates should not trigger analysis"
       (mt/with-temp [:model/Transform {transform-id :id :as transform} {:source {:type :query
                                                                                  :query (lib/native-query mp "select * from products")}
                                                                         :name "transform_sample"
                                                                         :target {:schema "public"
                                                                                  :name "sample"
                                                                                  :type :table}}]
         (events/publish-event! :event/update-transform {:object transform :user-id api/*current-user-id*})
         (assert-has-analyses
          {:transform {transform-id nil}}))))))

(deftest ^:sequential transform-run-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "transform runs work when dependent cards have no pre-existing analyses"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id} {:source {:type :query
                                                                      :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public"
                                                                      :name "sample"
                                                                      :type :table}}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :transform
                                             :to_entity_id transform-id}]
           ;; Event should complete without error even when there are no pre-existing analyses
           (is (some? (events/publish-event! :event/transform-run-complete
                                             {:object {:db-id (mt/id)
                                                       :output-schema "public"
                                                       :output-table "sample"
                                                       :transform-id transform-id}
                                              :user-id api/*current-user-id*})))))))))

(deftest ^:sequential transform-run-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "transform runs update existing analyses when they exist"
       (let [products-id (mt/id :products)
             orders-id (mt/id :orders)
             products (lib.metadata/table mp products-id)
             orders (lib.metadata/table mp orders-id)
             old-version models.analysis-finding/*current-analysis-finding-version*]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id :as transform} {:source {:type :query
                                                                                    :query (lib/query mp products)}
                                                                           :name "transform_sample"
                                                                           :target {:schema "public"
                                                                                    :name "sample"
                                                                                    :type :table}}
                        :model/Card {other-card-id :id :as other-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :transform
                                             :to_entity_id transform-id}]
           (deps.findings/upsert-analysis! card)
           (deps.findings/upsert-analysis! transform)
           (deps.findings/upsert-analysis! other-card)
           (testing "checking that initial analyses exist"
             (assert-has-analyses
              {:card {card-id old-version
                      other-card-id old-version}
               :transform {transform-id old-version}}))
           (t2/with-transaction [_conn]
             (events/publish-event! :event/transform-run-complete
                                    {:object {:db-id (mt/id)
                                              :output-schema "public"
                                              :output-table "sample"
                                              :transform-id transform-id}
                                     :user-id api/*current-user-id*})
             (testing "dependent card should be marked stale"
               (is (=? {:analysis_version old-version :stale true}
                       (t2/select-one :model/AnalysisFinding
                                      :analyzed_entity_type :card
                                      :analyzed_entity_id card-id))))
             (testing "other card should be unchanged"
               (is (=? {:analysis_version old-version :stale false}
                       (t2/select-one :model/AnalysisFinding
                                      :analyzed_entity_type :card
                                      :analyzed_entity_id other-card-id))))
             (testing "transform should be unchanged"
               (is (=? {:analysis_version old-version :stale false}
                       (t2/select-one :model/AnalysisFinding
                                      :analyzed_entity_type :transform
                                      :analyzed_entity_id transform-id)))))))))))

(deftest ^:sequential segment-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "segment update creates analysis for the segment itself"
       (let [products-id (mt/id :products)
             price-field-id (mt/id :products :price)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Segment {segment-id :id :as segment} {:table_id products-id
                                                                     :definition {:filter [:> [:field price-field-id nil] 50]}}
                        :model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :segment
                                             :to_entity_id segment-id}]
           (events/publish-event! :event/segment-update {:object segment :user-id api/*current-user-id*})
           ;; Segment should be analyzed synchronously
           (assert-has-analyses
            {:segment {segment-id -1}})))))))

(deftest ^:sequential segment-update-updates-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "segment update updates analyses when they exist"
       (let [products-id (mt/id :products)
             price-field-id (mt/id :products :price)
             products (lib.metadata/table mp products-id)
             old-version models.analysis-finding/*current-analysis-finding-version*
             new-version (inc models.analysis-finding/*current-analysis-finding-version*)]
         (mt/with-temp [:model/Segment {segment-id :id :as segment} {:table_id products-id
                                                                     :definition {:filter [:> [:field price-field-id nil] 50]}}
                        :model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :segment
                                             :to_entity_id segment-id}]
           (deps.findings/upsert-analysis! segment)
           (deps.findings/upsert-analysis! card)
           (testing "checking that initial analyses exist"
             (assert-has-analyses
              {:card {card-id old-version}
               :segment {segment-id old-version}}))
           (binding [models.analysis-finding/*current-analysis-finding-version* new-version]
             (t2/with-transaction [_conn]
               (events/publish-event! :event/segment-update {:object segment :user-id api/*current-user-id*})
               (testing "segment should be re-analyzed synchronously"
                 (is (=? {:analysis_version new-version :stale false}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :segment
                                        :analyzed_entity_id segment-id))))
               (testing "dependent card should be marked stale"
                 (is (=? {:analysis_version old-version :stale true}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id card-id))))))))))))

;;; ### Table Metadata Update Tests
(deftest ^:sequential table-metadata-update-triggers-dependent-analysis-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Table metadata update triggers re-analysis of dependent cards"
       (let [products-id (mt/id :products)
             orders-id (mt/id :orders)
             products (lib.metadata/table mp products-id)
             orders (lib.metadata/table mp orders-id)
             old-version models.analysis-finding/*current-analysis-finding-version*
             new-version (inc models.analysis-finding/*current-analysis-finding-version*)]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                        :model/Card {other-card-id :id :as other-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :table
                                             :to_entity_id products-id}]
           (deps.findings/upsert-analysis! card)
           (deps.findings/upsert-analysis! other-card)
           (testing "checking that initial analyses exist"
             (assert-has-analyses
              {:card {card-id old-version
                      other-card-id old-version}}))
           (let [table (t2/select-one :model/Table :id products-id)]
             (t2/with-transaction [_conn]
               (binding [models.analysis-finding/*current-analysis-finding-version* new-version]
                 (events/publish-event! :event/table-update {:object table :user-id api/*current-user-id*}))
               (testing "card that depends on the updated table should be marked stale"
                 (is (=? {:analysis_version old-version ; It hasn't been re-analyzed yet
                          :stale            true}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id   card-id))))
               (testing "card that does not depend on the updated table should not be marked stale"
                 (is (=? {:analysis_version old-version
                          :stale            false}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id   other-card-id))))))))))))

(deftest ^:sequential table-metadata-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Table metadata update does not error when no findings exist yet"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :table
                                             :to_entity_id products-id}]
           (let [table (t2/select-one :model/Table :id products-id)]
             (t2/with-transaction [_conn]
               (events/publish-event! :event/table-update {:object table :user-id api/*current-user-id*})
               (assert-has-analyses
                {:card {card-id nil}})))))))))

;;; ### Field Metadata Update Tests

(deftest ^:sequential field-metadata-update-triggers-dependent-analysis-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Field metadata update triggers re-analysis of cards depending on the field's table"
       (let [products-id (mt/id :products)
             orders-id (mt/id :orders)
             products (lib.metadata/table mp products-id)
             orders (lib.metadata/table mp orders-id)
             old-version models.analysis-finding/*current-analysis-finding-version*
             new-version (inc models.analysis-finding/*current-analysis-finding-version*)]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}
                        :model/Card {other-card-id :id :as other-card} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :table
                                             :to_entity_id products-id}]
           (deps.findings/upsert-analysis! card)
           (deps.findings/upsert-analysis! other-card)
           (testing "checking that initial analyses exist"
             (assert-has-analyses
              {:card {card-id old-version
                      other-card-id old-version}}))
           (let [field (t2/select-one :model/Field :id (mt/id :products :category))]
             (t2/with-transaction [_conn]
               (binding [models.analysis-finding/*current-analysis-finding-version* new-version]
                 (events/publish-event! :event/field-update {:object field :user-id api/*current-user-id*}))
               (testing "card that depends on the table whose field was updated should be marked stale"
                 (is (=? {:analysis_version old-version ; It hasn't been re-analyzed yet
                          :stale            true}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id   card-id))))
               (testing "card that does not depend on the table whose field was updated should not be marked stale"
                 (is (=? {:analysis_version old-version ; It hasn't been re-analyzed yet
                          :stale            false}
                         (t2/select-one :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id   other-card-id))))))))))))

(deftest ^:sequential field-metadata-update-works-with-no-analyses-test
  (run-with-dependencies-setup!
   (fn [mp]
     (testing "Field metadata update does not error when no findings exist yet"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id card-id
                                             :to_entity_type :table
                                             :to_entity_id products-id}]
           (let [field (t2/select-one :model/Field :id (mt/id :products :category))]
             (t2/with-transaction [_conn]
               (events/publish-event! :event/field-update {:object field :user-id api/*current-user-id*})
               (assert-has-analyses
                {:card {card-id nil}})))))))))
