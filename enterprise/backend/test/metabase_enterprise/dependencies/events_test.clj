(ns metabase-enterprise.dependencies.events-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [toucan2.core :as t2]))

(deftest dashboard-update-sets-correct-dependencies
  (mt/with-test-user :rasta
    (let [mp (mt/metadata-provider)
          products-id (mt/id :products)
          orders-id (mt/id :orders)
          products (lib.metadata/table mp products-id)
          orders (lib.metadata/table mp orders-id)
          category-field (lib.metadata/field mp (mt/id :products :category))]
      (mt/with-premium-features #{:dependencies}
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
  (mt/with-test-user :rasta
    (let [mp (mt/metadata-provider)
          products-id (mt/id :products)
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
            (is (empty? (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document)))))))))

(deftest sandbox-update-sets-correct-dependencies
  (mt/with-premium-features #{:sandboxes}
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
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
    (mt/with-test-user :rasta
      (let [mp (mt/metadata-provider)
            products-id (mt/id :products)
            products (lib.metadata/table mp products-id)]
        (mt/with-premium-features #{:dependencies}
          (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (lib/query mp products)}]
            (log.capture/with-log-messages-for-level [messages ["metabase-enterprise.dependencies.events" :error]]
              (with-redefs [deps.calculation/upstream-deps:card (fn [_]
                                                                  (throw (ex-info "Dependency calculation failed"
                                                                                  {:card-id card-id})))]
                (testing "on create event"
                  (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
                  (is (some #(and (= "Dependency calculation failed" (ex-message (:e %)))
                                  (= :error (:level %)))
                            (messages)))
                  (is (= models.dependency/current-dependency-analysis-version
                         (t2/select-one-fn :dependency_analysis_version :model/Card :id card-id)))
                  (is (empty? (t2/select :model/Dependency :from_entity_id card-id :from_entity_type :card))))
                (testing "on update event"
                  (events/publish-event! :event/card-update {:object card :user-id api/*current-user-id*})
                  (is (some #(and (= "Dependency calculation failed" (ex-message (:e %)))
                                  (= :error (:level %)))
                            (messages)))
                  (is (= models.dependency/current-dependency-analysis-version
                         (t2/select-one-fn :dependency_analysis_version :model/Card :id card-id)))
                  (is (empty? (t2/select :model/Dependency :from_entity_id card-id :from_entity_type :card))))))))))))

(deftest snippet-dependency-calculation-error-handling-test
  (testing "When snippet dependency calculation throws an error, it should be logged and the version should still be updated"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
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

(deftest transform-dependency-calculation-error-handling-test
  (testing "When transform dependency calculation throws an error, it should be logged and the version should still be updated"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
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
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
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
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
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
      (mt/with-test-user :rasta
        (mt/with-premium-features #{:dependencies}
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
