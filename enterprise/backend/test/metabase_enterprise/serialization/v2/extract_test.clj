(ns metabase-enterprise.serialization.v2.extract-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.round-trip-test :as round-trip-test]
   [metabase.actions.models :as action]
   [metabase.audit-app.core :as audit]
   [metabase.core.core :as mbc]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor :as qp]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(comment
  ;; Use this spell in your test body to add the given fixtures to the round trip baseline.
  (round-trip-test/add-to-baseline!))

(use-fixtures :each (fn [f] (search.tu/with-index-disabled (f))))

(defn- by-model [model-name extraction]
  (->> extraction
       (into [])
       (filter #(= model-name ((comp :model last :serdes/meta) %)))))

(defn- ids-by-model [model-name extraction]
  (->> (by-model model-name extraction)
       (map (comp :id last :serdes/meta))
       set))

(deftest fundamentals-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Collection
                       {coll-id   :id
                        coll-eid  :entity_id
                        coll-slug :slug}
                       {:name "Some Collection"}

                       :model/Collection
                       {child-id   :id
                        child-eid  :entity_id
                        child-slug :slug}
                       {:name     "Nested Collection"
                        :location (format "/%s/" coll-id)}

                       :model/User
                       {mark-id :id}
                       {:first_name "Mark"
                        :last_name  "Knopfler"
                        :email      "mark@direstrai.ts"}

                       :model/Collection
                       {pc-id   :id
                        pc-eid  :entity_id
                        pc-slug :slug}
                       {:name              "Mark's Personal Collection"
                        :personal_owner_id mark-id}]

      (testing "a top-level collection is extracted correctly"
        (let [ser (serdes/extract-one "Collection" {} (t2/select-one :model/Collection :id coll-id))]
          (is (=? {:serdes/meta       [{:model "Collection" :id coll-eid :label coll-slug}]
                   :personal_owner_id nil
                   :parent_id         nil}
                  ser))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))))

      (testing "a nested collection is extracted with the right parent_id"
        (let [ser (serdes/extract-one "Collection" {} (t2/select-one :model/Collection :id child-id))]
          (is (=? {:serdes/meta       [{:model "Collection" :id child-eid :label child-slug}]
                   :personal_owner_id nil
                   :parent_id         coll-eid}
                  ser))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))))

      (testing "personal collections are extracted with email as key"
        (let [ser (serdes/extract-one "Collection" {} (t2/select-one :model/Collection :id pc-id))]
          (is (=? {:serdes/meta       [{:model "Collection" :id pc-eid :label pc-slug}]
                   :parent_id         nil
                   :personal_owner_id "mark@direstrai.ts"}
                  ser))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))))

      (testing "overall extraction returns the expected set"
        (testing "no user specified"
          (is (= #{coll-eid child-eid}
                 (ids-by-model "Collection" (extract/extract nil)))))

        (testing "valid user specified"
          (is (= #{coll-eid child-eid pc-eid}
                 (ids-by-model "Collection" (extract/extract {:user-id mark-id})))))

        (testing "invalid user specified"
          (is (= #{coll-eid child-eid}
                 (ids-by-model "Collection" (extract/extract {:user-id 218921})))))))))

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest dashboard-and-cards-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Collection
                       {coll-id  :id
                        coll-eid :entity_id}
                       {:name "Some Collection"}

                       :model/User
                       {mark-id :id}
                       {:first_name "Mark"
                        :last_name  "Knopfler"
                        :email      "mark@direstrai.ts"}

                       :model/User
                       {dave-id :id}
                       {:first_name "David"
                        :last_name  "Knopfler"
                        :email      "david@direstrai.ts"}

                       :model/Collection
                       {mark-coll-eid :entity_id}
                       {:name              "MK Personal"
                        :personal_owner_id mark-id}

                       :model/Collection
                       {dave-coll-id  :id
                        dave-coll-eid :entity_id}
                       {:name              "DK Personal"
                        :personal_owner_id dave-id}

                       :model/Database
                       {db-id :id}
                       {:name "My Database"}

                       :model/Table
                       {no-schema-id :id}
                       {:name "Schemaless Table" :db_id db-id}

                       :model/Field
                       {field-id :id}
                       {:name "Some Field" :table_id no-schema-id}

                       :model/Table
                       {schema-id :id}
                       {:name   "Schema'd Table"
                        :db_id  db-id
                        :schema "PUBLIC"}

                       :model/Field
                       {field2-id :id}
                       {:name "Other Field" :table_id schema-id}

                       :model/Card
                       {c1-id  :id
                        c1-eid :entity_id}
                       {:name          "Some Question"
                        :database_id   db-id
                        :table_id      no-schema-id
                        :collection_id coll-id
                        :creator_id    mark-id
                        :dataset_query {:query    {:source-table no-schema-id
                                                   :filter       [:>= [:field field-id nil] 18]
                                                   :aggregation  [[:count]]}
                                        :type     :query
                                        :database db-id}}

                       :model/Card
                       {model-id :id}
                       {:name          "Some Model"
                        :database_id   db-id
                        :table_id      no-schema-id
                        :collection_id coll-id
                        :creator_id    mark-id
                        :type          :model
                        :dataset_query {:query    {:source-table no-schema-id
                                                   :filter       [:>= [:field field-id nil] 18]
                                                   :aggregation  [[:count]]}
                                        :type     :query
                                        :database db-id}}

                       :model/Card
                       {c2-id  :id
                        c2-eid :entity_id}
                       {:name          "Second Question"
                        :database_id   db-id
                        :table_id      schema-id
                        :collection_id coll-id
                        :creator_id    mark-id
                        :parameter_mappings
                        [{:parameter_id "deadbeef"
                          :card_id      c1-id
                          :target       [:dimension [:field field-id
                                                     {:source-field field2-id}]]}]}

                       :model/Card
                       {c3-id  :id
                        c3-eid :entity_id}
                       {:name          "Third Question"
                        :database_id   db-id
                        :table_id      schema-id
                        :collection_id coll-id
                        :creator_id    mark-id
                        :visualization_settings
                        {:table.pivot_column "SOURCE"
                         :table.cell_column  "sum"
                         :table.columns
                         [{:name     "SOME_FIELD"
                           :fieldRef [:field field-id nil]
                           :enabled  true}
                          {:name     "OTHER_FIELD"
                           :fieldRef [:field field2-id nil]
                           :enabled  true}
                          {:name     "sum"
                           :fieldRef [:field "sum" {:base-type :type/Float}]
                           :enabled  true}
                          {:name     "count"
                           :fieldRef [:field "count" {:base-type :type/BigInteger}]
                           :enabled  true}
                          {:name     "Average order total"
                           :fieldRef [:field "Average order total" {:base-type :type/Float}]
                           :enabled  true}]
                         :column_settings
                         {(str "[\"ref\",[\"field\"," field2-id ",null]]") {:column_title "Locus"}}}}

                       :model/Card       {c4-id  :id
                                          c4-eid :entity_id}        {:name          "Referenced Question"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll-id
                                                                     :creator_id    mark-id
                                                                     :dataset_query
                                                                     {:query    {:source-table no-schema-id
                                                                                 :filter       [:>= [:field field-id nil] 18]}
                                                                      :database db-id
                                                                      :type     :query}}
                       :model/Card
                       {c5-id  :id
                        c5-eid :entity_id}
                       {:name          "Dependent Question"
                        :database_id   db-id
                        :table_id      no-schema-id
                        :collection_id coll-id
                        :creator_id    mark-id
                        :dataset_query
                        {:query    {:source-table (str "card__" c4-id)
                                    :aggregation  [[:count]]}
                         :type     :query
                         :database db-id}}

                       :model/Action
                       {action-id  :id
                        action-eid :entity_id}
                       {:name     "Some action"
                        :type     :query
                        :model_id model-id}

                       :model/Dashboard
                       {dash-id  :id
                        dash-eid :entity_id}
                       {:name          "Shared Dashboard"
                        :collection_id coll-id
                        :creator_id    mark-id
                        :parameters    []}

                       :model/Dashboard
                       {other-dash-id :id
                        other-dash    :entity_id}
                       {:name          "Dave's Dash"
                        :collection_id dave-coll-id
                        :creator_id    mark-id
                        :parameters    []}

                       :model/Dashboard
                       {param-dash-id :id
                        param-dash    :entity_id}
                       {:name          "Dave's Dash with parameters"
                        :collection_id dave-coll-id
                        :creator_id    mark-id
                        :parameters    [{:id                   "abc"
                                         :type                 "category"
                                         :name                 "CATEGORY"
                                         :values_source_type   :card
                                         ;; card_id is in a different collection with dashboard's collection
                                         :values_source_config {:card_id     c1-id
                                                                :value_field [:field field-id nil]}}]}

                       :model/DashboardCard
                       _
                       {:card_id           c1-id
                        :dashboard_id      dash-id
                        :inline_parameters ["12345678"]
                        :parameter_mappings
                        [{:parameter_id "12345678"
                          :card_id      c1-id
                          :target       [:dimension [:field field-id
                                                     {:source-field field2-id}]]}]}

                       :model/DashboardCard
                       _
                       {:card_id      c2-id
                        :dashboard_id other-dash-id
                        :visualization_settings
                        {:table.pivot_column "SOURCE"
                         :table.cell_column  "sum"
                         :table.columns
                         [{:name     "SOME_FIELD"
                           :fieldRef [:field field-id nil]
                           :enabled  true}
                          {:name     "sum"
                           :fieldRef [:field "sum" {:base-type :type/Float}]
                           :enabled  true}
                          {:name     "count"
                           :fieldRef [:field "count" {:base-type :type/BigInteger}]
                           :enabled  true}
                          {:name     "Average order total"
                           :fieldRef [:field "Average order total" {:base-type :type/Float}]
                           :enabled  true}]
                         :column_settings
                         {(str "[\"ref\",[\"field\"," field2-id ",null]]") {:column_title "Locus"}}}}

                       :model/DashboardCard
                       _
                       {:action_id    action-id
                        :dashboard_id other-dash-id}]

      (testing "table and database are extracted as [db schema table] triples"
        (let [ser (serdes/extract-one "Card" {} (t2/select-one :model/Card :id c1-id))]
          (is (=? {:serdes/meta   [{:model "Card" :id c1-eid :label "some_question"}]
                   :table_id      ["My Database" nil "Schemaless Table"]
                   :creator_id    "mark@direstrai.ts"
                   :collection_id coll-eid
                   :dataset_query {:query    {:source-table ["My Database" nil "Schemaless Table"]
                                              :filter       [:>= [:field ["My Database" nil "Schemaless Table" "Some Field"] {}] 18]
                                              :aggregation  [[:count]]}
                                   :database "My Database"}
                   :created_at    string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Table and Collection, and also anything referenced in the query"
            (is (= #{[{:model "Database" :id "My Database"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Table" :id "Schemaless Table"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Table" :id "Schemaless Table"}
                      {:model "Field" :id "Some Field"}]
                     [{:model "Collection" :id coll-eid}]}
                   (set (serdes/dependencies ser))))))

        (let [ser (serdes/extract-one "Card" {} (t2/select-one :model/Card :id c2-id))]
          (is (=? {:serdes/meta        [{:model "Card" :id c2-eid :label "second_question"}]
                   :table_id           ["My Database" "PUBLIC" "Schema'd Table"]
                   :creator_id         "mark@direstrai.ts"
                   :collection_id      coll-eid
                   :dataset_query      {}
                   :parameter_mappings [{:parameter_id "deadbeef"
                                         :card_id      c1-eid
                                         :target       [:dimension [:field ["My Database" nil "Schemaless Table" "Some Field"]
                                                                    {:source-field ["My Database" "PUBLIC" "Schema'd Table" "Other Field"]}]]}]
                   :created_at         string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Database, Table and Collection, and any fields in their parameter_mappings"
            (is (= #{[{:model "Database" :id "My Database"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Schema" :id "PUBLIC"}
                      {:model "Table" :id "Schema'd Table"}]
                     [{:model "Collection" :id coll-eid}]
                     [{:model "Card" :id c1-eid}]
                     [{:model "Database" :id "My Database"}
                      {:model "Table" :id "Schemaless Table"}
                      {:model "Field" :id "Some Field"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Schema" :id "PUBLIC"}
                      {:model "Table" :id "Schema'd Table"}
                      {:model "Field" :id "Other Field"}]}
                   (set (serdes/dependencies ser))))))

        (let [ser (serdes/extract-one "Card" {} (t2/select-one :model/Card :id c3-id))]
          (is (=? {:serdes/meta   [{:model "Card" :id c3-eid :label "third_question"}]
                   :table_id      ["My Database" "PUBLIC" "Schema'd Table"]
                   :creator_id    "mark@direstrai.ts"
                   :collection_id coll-eid
                   :dataset_query {}
                   :visualization_settings
                   {:table.pivot_column "SOURCE"
                    :table.cell_column  "sum"
                    :table.columns
                    [{:name     "SOME_FIELD"
                      :fieldRef [:field ["My Database" nil "Schemaless Table" "Some Field"] nil]
                      :enabled  true}
                     {:name     "OTHER_FIELD"
                      :fieldRef [:field ["My Database" "PUBLIC" "Schema'd Table" "Other Field"] nil]
                      :enabled  true}
                     {:name     "sum"
                      :fieldRef [:field "sum" {:base-type :type/Float}]
                      :enabled  true}
                     {:name     "count"
                      :fieldRef [:field "count" {:base-type :type/BigInteger}]
                      :enabled  true}
                     {:name     "Average order total"
                      :fieldRef [:field "Average order total" {:base-type :type/Float}]
                      :enabled  true}]
                    :column_settings
                    {"[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Other Field\"],null]]" {:column_title "Locus"}}}
                   :created_at    string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Database, Table and Collection, and any fields in their visualization_settings"
            (is (= #{[{:model "Database" :id "My Database"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Schema" :id "PUBLIC"}
                      {:model "Table" :id "Schema'd Table"}]
                     [{:model "Collection" :id coll-eid}]
                     [{:model "Database" :id "My Database"}
                      {:model "Table" :id "Schemaless Table"}
                      {:model "Field" :id "Some Field"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Schema" :id "PUBLIC"}
                      {:model "Table" :id "Schema'd Table"}
                      {:model "Field" :id "Other Field"}]}
                   (set (serdes/dependencies ser)))))))

      (testing "Cards can be based on other cards"
        (let [ser (serdes/extract-one "Card" {} (t2/select-one :model/Card :id c5-id))]
          (is (=? {:serdes/meta   [{:model "Card" :id c5-eid :label "dependent_question"}]
                   :table_id      ["My Database" nil "Schemaless Table"]
                   :creator_id    "mark@direstrai.ts"
                   :collection_id coll-eid
                   :dataset_query {:query    {:source-table c4-eid
                                              :aggregation  [[:count]]}
                                   :database "My Database"}
                   :created_at    string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "and depend on their Database, Table and Collection, and the upstream Card"
            (is (= #{[{:model "Database" :id "My Database"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Table" :id "Schemaless Table"}]
                     [{:model "Collection" :id coll-eid}]
                     [{:model "Card" :id c4-eid}]}
                   (set (serdes/dependencies ser)))))))

      (testing "Dashboards include their Dashcards"
        (let [ser (ts/extract-one "Dashboard" other-dash-id)]
          (is (=? {:serdes/meta [{:model "Dashboard" :id other-dash :label "dave_s_dash"}]
                   :entity_id   other-dash
                   :dashcards
                   [{:visualization_settings {:table.pivot_column "SOURCE"
                                              :table.cell_column  "sum"
                                              :table.columns
                                              [{:name     "SOME_FIELD"
                                                :fieldRef [:field ["My Database" nil "Schemaless Table" "Some Field"] nil]
                                                :enabled  true}
                                               {:name     "sum"
                                                :fieldRef [:field "sum" {:base-type :type/Float}]
                                                :enabled  true}
                                               {:name     "count"
                                                :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                                :enabled  true}
                                               {:name     "Average order total"
                                                :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                                :enabled  true}]
                                              :column_settings
                                              {"[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Other Field\"],null]]" {:column_title "Locus"}}}
                     :created_at             string?}
                    {:action_id action-eid}]
                   :created_at  string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "and depend on all referenced cards and actions, including those in visualization_settings"
            (is (= #{[{:model "Card" :id c2-eid}]
                     [{:model "Action" :id action-eid}]
                     [{:model "Database" :id "My Database"}
                      {:model "Table" :id "Schemaless Table"}
                      {:model "Field" :id "Some Field"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Schema" :id "PUBLIC"}
                      {:model "Table" :id "Schema'd Table"}
                      {:model "Field" :id "Other Field"}]
                     [{:model "Collection" :id dave-coll-eid}]}
                   (set (serdes/dependencies ser)))))))

      (testing "Dashboards with parameters where the source is a card"
        (let [ser (ts/extract-one "Dashboard" param-dash-id)]
          (is (=? {:parameters
                   [{:id                   "abc"
                     :name                 "CATEGORY"
                     :type                 :category
                     :values_source_config {:card_id     c1-eid
                                            :value_field [:field
                                                          ["My Database" nil "Schemaless Table" "Some Field"]
                                                          nil]},
                     :values_source_type   :card}]}
                  ser))
          (is (= #{[{:model "Collection" :id dave-coll-eid}]
                   [{:model "Card" :id c1-eid}]
                   [{:model "Database", :id "My Database"}
                    {:model "Table", :id "Schemaless Table"}
                    {:model "Field", :id "Some Field"}]}
                 (set (serdes/dependencies ser))))))

      (testing "Cards with parameters where the source is a card"
        (let [ser (ts/extract-one "Dashboard" param-dash-id)]
          (is (=? {:parameters
                   [{:id                   "abc"
                     :name                 "CATEGORY"
                     :type                 :category
                     :values_source_config {:card_id     c1-eid
                                            :value_field [:field
                                                          ["My Database" nil "Schemaless Table" "Some Field"]
                                                          nil]},
                     :values_source_type   :card}]}
                  ser))
          (is (= #{[{:model "Collection" :id dave-coll-eid}]
                   [{:model "Card" :id c1-eid}]
                   [{:model "Database", :id "My Database"}
                    {:model "Table", :id "Schemaless Table"}
                    {:model "Field", :id "Some Field"}]}
                 (set (serdes/dependencies ser))))))

      (testing "collection filtering based on :user option"
        (testing "only unowned collections are returned with no user"
          (is (= ["Some Collection"]
                 (->> (serdes/extract-all "Collection" {:collection-set #{coll-id}})
                      (into [])
                      (map :name)))))
        (testing "unowned collections and the personal one with a user"
          (is (= #{coll-eid mark-coll-eid}
                 (->> {:collection-set (#'extract/collection-set-for-user mark-id)}
                      (serdes/extract-all "Collection")
                      (ids-by-model "Collection"))))
          (is (= #{coll-eid dave-coll-eid}
                 (->> {:collection-set (#'extract/collection-set-for-user dave-id)}
                      (serdes/extract-all "Collection")
                      (ids-by-model "Collection"))))))

      (testing "dashboards are filtered based on :user"
        (testing "dashboards in unowned collections are always returned"
          (is (= #{dash-eid}
                 (->> {:collection-set #{coll-id}}
                      (serdes/extract-all "Dashboard")
                      (ids-by-model "Dashboard"))))
          (is (= #{dash-eid}
                 (->> {:collection-set (#'extract/collection-set-for-user mark-id)}
                      (serdes/extract-all "Dashboard")
                      (ids-by-model "Dashboard")))))
        (testing "dashboards in personal collections are returned for the :user"
          (is (= #{dash-eid other-dash param-dash}
                 (->> {:collection-set (#'extract/collection-set-for-user dave-id)}
                      (serdes/extract-all "Dashboard")
                      (ids-by-model "Dashboard")))))))))

(deftest dashboard-card-series-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc
      [:model/Collection {coll-id :id, coll-eid :entity_id} {:name "Some Collection"}
       :model/Card {c1-id :id, c1-eid :entity_id} {:name "Some Question", :collection_id coll-id}
       :model/Card {c2-id :id, c2-eid :entity_id} {:name "Series Question A", :collection_id coll-id}
       :model/Card {c3-id :id, c3-eid :entity_id} {:name "Series Question B", :collection_id coll-id}
       :model/Dashboard {dash-id :id, dash-eid :entity_id} {:name "Shared Dashboard", :collection_id coll-id}
       :model/DashboardCard {dc1-id :id, dc1-eid :entity_id} {:card_id c1-id, :dashboard_id dash-id}
       :model/DashboardCard {dc2-eid :entity_id}             {:card_id c1-id, :dashboard_id dash-id}
       :model/DashboardCardSeries _ {:card_id c3-id, :dashboardcard_id dc1-id, :position 1}
       :model/DashboardCardSeries _ {:card_id c2-id, :dashboardcard_id dc1-id, :position 0}]
      (testing "Inlined dashcards include their series' card entity IDs"
        (let [ser (t2/with-call-count [q]
                    (u/prog1 (ts/extract-one "Dashboard" dash-id)
                      (is (< (q) 13))))]
          (is (=? {:entity_id dash-eid
                   :dashcards [{:entity_id dc1-eid
                                :series (mt/exactly=? [{:card_id c2-eid :position 0}
                                                       {:card_id c3-eid :position 1}])}
                               {:entity_id dc2-eid}]}
                  ser))

          (testing "and depend on all referenced cards, including cards from dashboard cards' series"
            (is (= #{[{:model "Card"       :id c1-eid}]
                     [{:model "Card"       :id c2-eid}]
                     [{:model "Card"       :id c3-eid}]
                     [{:model "Collection" :id coll-eid}]}
                   (set (serdes/dependencies ser))))))))))

(deftest dimensions-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [;; Simple case: a singular field, no human-readable field.
                       :model/Database   {db-id        :id}        {:name "My Database"}
                       :model/Table      {no-schema-id :id}        {:name "Schemaless Table" :db_id db-id}
                       :model/Field      {email-id     :id}        {:name "email" :table_id no-schema-id}
                       :model/Dimension  {dim1-eid     :entity_id} {:name       "Vanilla Dimension"
                                                                    :field_id   email-id
                                                                    :type       "internal"
                                                                    :created_at (t/minus (t/offset-date-time)
                                                                                         (t/days 3))}
                       ;; Advanced case: Dimension capturing a foreign relationship.
                       ;; The parent field (Orders.customer_id) is the foreign key.
                       ;; Dimension.field_id (Customers.id) is the foreign ID field;
                       ;; Dimension.human_readable_field_id (Customers.name) is what we want to render.
                       :model/Table      {customers    :id}        {:name        "Customers"
                                                                    :db_id       db-id
                                                                    :schema      "PUBLIC"}
                       :model/Field      {cust-id      :id}        {:name "id" :table_id customers}
                       :model/Field      {cust-name    :id}        {:name "name" :table_id customers}
                       :model/Table      {orders       :id}        {:name        "Orders"
                                                                    :db_id       db-id
                                                                    :schema      "PUBLIC"}
                       :model/Field      {fk-id        :id}        {:name     "customer_id"
                                                                    :table_id orders
                                                                    :fk_target_field_id cust-id}
                       :model/Dimension  _                         {:name     "Customer Name"
                                                                    :type     "external"
                                                                    :field_id fk-id
                                                                    :human_readable_field_id cust-name}]
      (testing "dimensions without foreign keys are inlined into their Fields\n"
        (let [ser (ts/extract-one "Field" email-id)]
          (is (malli= [:map
                       [:serdes/meta [:= [{:model "Database", :id "My Database"}
                                          {:model "Table", :id "Schemaless Table"}
                                          {:model "Field", :id "email"}]]]
                       [:dimensions  [:sequential
                                      [:map
                                       [:created_at :string]
                                       [:human_readable_field_id {:optional true} [:maybe [:sequential [:maybe :string]]]]]]]]
                      ser))
          (is (not (contains? ser :id)))

          (testing "As of #27062 a Field can only have one Dimension. For historic reasons it comes back as a list"
            (is (= [dim1-eid]
                   (->> ser :dimensions (map :entity_id)))))

          (testing "which depend on just the table"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}]}
                   (set (serdes/dependencies ser)))))))

      (testing "foreign key dimensions are inlined into their Fields"
        (let [ser (ts/extract-one "Field" fk-id)]
          (is (malli= [:map
                       [:serdes/meta        [:= [{:model "Database" :id "My Database"}
                                                 {:model "Schema" :id "PUBLIC"}
                                                 {:model "Table" :id "Orders"}
                                                 {:model "Field" :id "customer_id"}]]]
                       [:name               [:= "customer_id"]]
                       [:fk_target_field_id [:= ["My Database" "PUBLIC" "Customers" "id"]]]
                       [:dimensions         [:sequential
                                             [:map
                                              [:human_readable_field_id [:maybe [:sequential [:maybe :string]]]]
                                              [:created_at              :string]]]]]
                      ser))
          (is (not (contains? ser :id)))

          (testing "dimensions are properly inlined"
            (is (=? [{:human_readable_field_id ["My Database" "PUBLIC" "Customers" "name"]
                      :created_at              string?}]
                    (:dimensions ser))))

          (testing "which depend on the Table and both real and human-readable foreign Fields"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Orders"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Customers"}
                      {:model "Field"      :id "id"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Customers"}
                      {:model "Field"      :id "name"}]}
                   (set (serdes/dependencies ser))))))))))

(deftest native-query-snippets-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User               {ann-id :id}           {:first_name "Ann"
                                                                         :last_name  "Wilson"
                                                                         :email      "ann@heart.band"}
                       :model/Collection         {coll-id  :id
                                                  coll-eid :entity_id}  {:name              "Shared Collection"
                                                                         :personal_owner_id nil
                                                                         :namespace         :snippets}
                       :model/Collection         {coll2-id  :id}        {:name              "Card Collection"
                                                                         :personal_owner_id nil}
                       :model/NativeQuerySnippet {s1-id  :id
                                                  s1-eid :entity_id}    {:name          "Snippet 1"
                                                                         :collection_id coll-id
                                                                         :creator_id    ann-id}

                       :model/NativeQuerySnippet {s2-id  :id
                                                  s2-eid :entity_id}    {:name          "Snippet 2"
                                                                         :collection_id nil
                                                                         :creator_id    ann-id}
                       :model/Card               {card-id :id}          {:name          "Card using Snippet 1"
                                                                         :creator_id    ann-id
                                                                         :collection_id coll2-id
                                                                         :dataset_query
                                                                         (mt/native-query
                                                                          {:query         "select {{snippet}}"
                                                                           :template-tags {"snippet"
                                                                                           {:display-name "Snippet 1",
                                                                                            :id           s1-eid,
                                                                                            :name         "snippet",
                                                                                            :snippet-id   s1-id,
                                                                                            :snippet-name "snip",
                                                                                            :type         :number}}})}]
      (testing "native query snippets"
        (testing "can belong to :snippets collections"
          (let [ser (serdes/extract-one "NativeQuerySnippet" {} (t2/select-one :model/NativeQuerySnippet :id s1-id))]
            (is (=? {:serdes/meta   [{:model "NativeQuerySnippet"
                                      :id    s1-eid
                                      :label "snippet_1"}]
                     :collection_id coll-eid
                     :creator_id    "ann@heart.band"
                     :created_at    string?}
                    ser))
            (is (not (contains? ser :id)))

            (testing "and depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes/dependencies ser)))))

            (testing "and will bring collection to extraction"
              (is (= {["Collection" coll-id] {"NativeQuerySnippet" s1-id}}
                     (serdes/required "NativeQuerySnippet" s1-id))))))

        (testing "or can be outside collections"
          (let [ser (serdes/extract-one "NativeQuerySnippet" {} (t2/select-one :model/NativeQuerySnippet :id s2-id))]
            (is (malli= [:map
                         [:serdes/meta [:= [{:model "NativeQuerySnippet"
                                             :id    s2-eid
                                             :label "snippet_2"}]]]
                         [:creator_id  [:= "ann@heart.band"]]
                         [:created_at  :string]
                         [:collection_id {:optional true} :nil]]
                        ser))
            (is (not (contains? ser :id)))

            (testing "and has no deps"
              (is (empty? (serdes/dependencies ser))))))

        (testing "Snippet collection is exported when snippet is exported as a card dep (#51901)"
          (is (= {["Collection" coll2-id]      nil
                  ["Card" card-id]             {"Collection" coll2-id}
                  ["NativeQuerySnippet" s1-id] {"Card" card-id}
                  ["Collection" coll-id]       {"NativeQuerySnippet" s1-id}}
                 (#'extract/resolve-targets {:targets [["Collection" coll2-id]]} nil))))))))

(deftest resolve-targets-skip-archived-test
  (testing "resolve-targets with skip-archived handles archived collections and nested items"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection {parent-id :id}      {:name "Parent Collection"}
                         :model/Collection {archived-child-id :id} {:name     "Archived Child Collection"
                                                                    :archived true
                                                                    :location (format "/%d/" parent-id)}
                         :model/Collection {active-child-id :id}   {:name     "Active Child Collection"
                                                                    :archived false
                                                                    :location (format "/%d/" parent-id)}
                         :model/Card       {card-in-archived-id :id} {:name          "Card in archived collection"
                                                                      :collection_id archived-child-id}
                         :model/Card       {card-in-active-id :id}   {:name          "Card in active collection"
                                                                      :collection_id active-child-id}]
        (testing "archived child collections and their contents are excluded when skip-archived: true"
          (let [targets-with-skip (#'extract/resolve-targets {:targets       [["Collection" parent-id]]
                                                              :skip-archived true} nil)]
            (is (contains? targets-with-skip ["Collection" parent-id]))
            (is (contains? targets-with-skip ["Collection" active-child-id]))
            (is (not (contains? targets-with-skip ["Collection" archived-child-id])))
            (is (contains? targets-with-skip ["Card" card-in-active-id]))
            (is (not (contains? targets-with-skip ["Card" card-in-archived-id]))
                "cards in archived collections should not be included")))

        (testing "all collections and cards are included when skip-archived: false"
          (let [targets-without-skip (#'extract/resolve-targets {:targets       [["Collection" parent-id]]
                                                                 :skip-archived false} nil)]
            (is (contains? targets-without-skip ["Collection" parent-id]))
            (is (contains? targets-without-skip ["Collection" active-child-id]))
            (is (contains? targets-without-skip ["Collection" archived-child-id]))
            (is (contains? targets-without-skip ["Card" card-in-active-id]))
            (is (contains? targets-without-skip ["Card" card-in-archived-id]))))))))

(deftest extract-skip-archived-test
  (testing "extract with skip-archived: true excludes archived items from final extraction"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection {coll-id :id}       {:name "Test Collection"}
                         :model/Card       {active-card-id :id}   {:name          "Active Card"
                                                                   :archived      false
                                                                   :collection_id coll-id}
                         :model/Card       {archived-card-id :id} {:name          "Archived Card"
                                                                   :archived      true
                                                                   :collection_id coll-id}]
        (testing "archived cards are excluded from extraction with skip-archived: true"
          (let [extraction (extract/extract {:targets       [["Collection" coll-id]]
                                             :skip-archived true})
                card-ids   (into #{} (map (comp :id last :serdes/meta)) (by-model "Card" extraction))]
            (is (contains? card-ids (:entity_id (t2/select-one :model/Card :id active-card-id))))
            (is (not (contains? card-ids (:entity_id (t2/select-one :model/Card :id archived-card-id)))))))

        (testing "archived cards are included in extraction with skip-archived: false"
          (let [extraction (extract/extract {:targets       [["Collection" coll-id]]
                                             :skip-archived false})
                card-ids   (into #{} (map (comp :id last :serdes/meta)) (by-model "Card" extraction))]
            (is (contains? card-ids (:entity_id (t2/select-one :model/Card :id active-card-id))))
            (is (contains? card-ids (:entity_id (t2/select-one :model/Card :id archived-card-id))))))))))

(deftest timelines-and-events-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User
                       {ann-id :id}
                       {:first_name "Ann"
                        :last_name  "Wilson"
                        :email      "ann@heart.band"}

                       :model/Collection
                       {coll-id  :id
                        coll-eid :entity_id}
                       {:name              "Shared Collection"
                        :personal_owner_id nil}

                       :model/Timeline
                       {empty-id  :id
                        empty-eid :entity_id}
                       {:name          "Empty Timeline"
                        :collection_id coll-id
                        :creator_id    ann-id}

                       :model/Timeline
                       {line-id  :id
                        line-eid :entity_id}
                       {:name          "Populated Timeline"
                        :collection_id coll-id
                        :creator_id    ann-id}

                       :model/TimelineEvent
                       _
                       {:name        "First Event"
                        :creator_id  ann-id
                        :timestamp   #t "2020-04-11T00:00Z"
                        :timeline_id line-id}]
      (testing "timelines"
        (testing "with no events"
          (let [ser (ts/extract-one "Timeline" empty-id)]
            (is (=? {:serdes/meta   [{:model "Timeline" :id empty-eid :label "empty_timeline"}]
                     :collection_id coll-eid
                     :creator_id    "ann@heart.band"
                     :created_at    string?}
                    ser))
            (is (not (contains? ser :id)))

            (testing "depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes/dependencies ser)))))))

        (testing "with events"
          (let [ser (ts/extract-one "Timeline" line-id)]
            (is (=? {:serdes/meta   [{:model "Timeline" :id line-eid :label "populated_timeline"}]
                     :collection_id coll-eid
                     :creator_id    "ann@heart.band"
                     :created_at    string?
                     :events        [{:timestamp  "2020-04-11T00:00:00Z"
                                      :creator_id "ann@heart.band"
                                      :created_at string?}]}
                    ser))
            (is (not (contains? ser :id)))
            (is (not (contains? (-> ser :events first) :id)))

            (testing "depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes/dependencies ser)))))))))))

(deftest segments-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User       {ann-id :id}        {:first_name "Ann"
                                                              :last_name  "Wilson"
                                                              :email      "ann@heart.band"}
                       :model/Database   {db-id :id}        {:name "My Database"}
                       :model/Table      {no-schema-id :id} {:name "Schemaless Table" :db_id db-id}
                       :model/Field      {field-id :id}     {:name "Some Field" :table_id no-schema-id}

                       :model/Segment
                       {s1-id  :id
                        s1-eid :entity_id}
                       {:name       "My Segment"
                        :creator_id ann-id
                        :table_id   no-schema-id
                        :definition {:source-table no-schema-id
                                     :filter       [:< [:field field-id nil] 18]}}]
      (testing "segment"
        (let [ser (serdes/extract-one "Segment" {} (t2/select-one :model/Segment :id s1-id))]
          (is (=? {:serdes/meta [{:model "Segment" :id s1-eid :label "my_segment"}]
                   :table_id    ["My Database" nil "Schemaless Table"]
                   :creator_id  "ann@heart.band"
                   :definition  {:database "My Database",
                                 :type     :query,
                                 :query    {:source-table ["My Database" nil "Schemaless Table"],
                                            :filter       [:< [:field ["My Database" nil "Schemaless Table" "Some Field"] nil] 18]}}
                   :created_at  string?}
                  ser))
          (is (not (contains? ser :id)))
          (testing "depend on the Database, the Table and any fields from the definition"
            (is (= #{[{:model "Database" :id "My Database"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Table" :id "Schemaless Table"}]
                     [{:model "Database" :id "My Database"}
                      {:model "Table" :id "Schemaless Table"}
                      {:model "Field" :id "Some Field"}]}
                   (set (serdes/dependencies ser))))))))))

(defn- pmbql-measure-definition
  "Create an MBQL5 measure definition with a sum aggregation."
  [db-id table-id field-id]
  (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
        table (lib.metadata/table metadata-provider table-id)
        query (lib/query metadata-provider table)
        field (lib.metadata/field metadata-provider field-id)]
    (lib/aggregate query (lib/sum field))))

(deftest measures-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User       {ann-id :id}        {:first_name "Ann"
                                                              :last_name  "Wilson"
                                                              :email      "ann@heart.band"}
                       :model/Database   {db-id :id}        {:name "My Database"}
                       :model/Table      {no-schema-id :id} {:name "Schemaless Table" :db_id db-id}
                       :model/Field      {field-id :id}     {:name "Some Field" :table_id no-schema-id}]
      (let [definition (pmbql-measure-definition db-id no-schema-id field-id)]
        (ts/with-temp-dpc [:model/Measure
                           {m1-id  :id
                            m1-eid :entity_id}
                           {:name       "My Measure"
                            :creator_id ann-id
                            :table_id   no-schema-id
                            :definition definition}]
          ;; Uncomment to regenerate measure baseline: (round-trip-test/add-to-baseline!)
          (testing "measure"
            (let [ser (serdes/extract-one "Measure" {} (t2/select-one :model/Measure :id m1-id))]
              (is (=? {:serdes/meta [{:model "Measure" :id m1-eid :label "my_measure"}]
                       :table_id    ["My Database" nil "Schemaless Table"]
                       :creator_id  "ann@heart.band"
                       :definition  {:database "My Database"
                                     :type     :query
                                     :query    {:source-table ["My Database" nil "Schemaless Table"]
                                                :aggregation  [[:sum [:field ["My Database" nil "Schemaless Table" "Some Field"] map?]]]}}
                       :created_at  string?}
                      ser))
              (is (not (contains? ser :id)))
              (testing "depend on the Database, the Table and any fields from the definition"
                (is (= #{[{:model "Database" :id "My Database"}]
                         [{:model "Database" :id "My Database"}
                          {:model "Table" :id "Schemaless Table"}]
                         [{:model "Database" :id "My Database"}
                          {:model "Table" :id "Schemaless Table"}
                          {:model "Field" :id "Some Field"}]}
                       (set (serdes/dependencies ser))))))))))))

(deftest measure-referencing-measure-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User       {ann-id :id}        {:first_name "Ann"
                                                              :last_name  "Wilson"
                                                              :email      "ann@heart.band"}
                       :model/Database   {db-id :id}        {:name "My Database"}
                       :model/Table      {table-id :id}     {:name "My Table" :db_id db-id}
                       :model/Field      {field-id :id}     {:name "Amount" :table_id table-id}]
      (let [base-definition (pmbql-measure-definition db-id table-id field-id)]
        (ts/with-temp-dpc [:model/Measure
                           {m1-id  :id
                            m1-eid :entity_id}
                           {:name       "Base Measure"
                            :creator_id ann-id
                            :table_id   table-id
                            :definition base-definition}]
          ;; Create a measure that references the base measure
          (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
                table (lib.metadata/table metadata-provider table-id)
                query (lib/query metadata-provider table)
                measure-ref (lib.metadata/measure metadata-provider m1-id)
                derived-definition (lib/aggregate query (lib/* measure-ref 2))]
            (ts/with-temp-dpc [:model/Measure
                               {m2-id  :id
                                m2-eid :entity_id}
                               {:name       "Derived Measure"
                                :creator_id ann-id
                                :table_id   table-id
                                :definition derived-definition}]
              (testing "measure referencing another measure"
                (let [ser (serdes/extract-one "Measure" {} (t2/select-one :model/Measure :id m2-id))]
                  (is (=? {:serdes/meta [{:model "Measure" :id m2-eid :label "derived_measure"}]
                           :table_id    ["My Database" nil "My Table"]
                           :creator_id  "ann@heart.band"
                           :definition  {:database "My Database"
                                         :type     :query
                                         :query    {:source-table ["My Database" nil "My Table"]
                                                    :aggregation  [[:* [:measure m1-eid] 2]]}}}
                          ser))
                  (testing "depends on the referenced Measure"
                    (is (contains? (set (serdes/dependencies ser))
                                   [{:model "Measure" :id m1-eid}]))))))))))))

(deftest measure-referencing-segment-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User       {ann-id :id}        {:first_name "Ann"
                                                              :last_name  "Wilson"
                                                              :email      "ann@heart.band"}
                       :model/Database   {db-id :id}        {:name "My Database"}
                       :model/Table      {table-id :id}     {:name "My Table" :db_id db-id}
                       :model/Field      {field-id :id}     {:name "Price" :table_id table-id}
                       :model/Segment
                       {seg-id  :id
                        seg-eid :entity_id}
                       {:name       "Expensive Items"
                        :creator_id ann-id
                        :table_id   table-id
                        :definition {:source-table table-id
                                     :filter       [:> [:field field-id nil] 100]}}]
      ;; Create a measure that uses count-where with a segment reference
      (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
            table (lib.metadata/table metadata-provider table-id)
            query (lib/query metadata-provider table)
            segment-ref (lib.metadata/segment metadata-provider seg-id)
            measure-definition (lib/aggregate query (lib/count-where segment-ref))]
        (ts/with-temp-dpc [:model/Measure
                           {m-id  :id
                            m-eid :entity_id}
                           {:name       "Expensive Item Count"
                            :creator_id ann-id
                            :table_id   table-id
                            :definition measure-definition}]
          (testing "measure referencing a segment"
            (let [ser (serdes/extract-one "Measure" {} (t2/select-one :model/Measure :id m-id))]
              (is (=? {:serdes/meta [{:model "Measure" :id m-eid :label "expensive_item_count"}]
                       :table_id    ["My Database" nil "My Table"]
                       :creator_id  "ann@heart.band"
                       :definition  {:database "My Database"
                                     :type     :query
                                     :query    {:source-table ["My Database" nil "My Table"]
                                                :aggregation  [[:count-where [:segment seg-eid]]]}}}
                      ser))
              (testing "depends on the referenced Segment"
                (is (contains? (set (serdes/dependencies ser))
                               [{:model "Segment" :id seg-eid}]))))))))))

(deftest table-publishing-serdes-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Database   {db-id :id}           {:name "My Database"}
                       :model/Table      {table-id :id}        {:name "Schemaless Table" :db_id db-id}
                       :model/Collection {coll-id  :id
                                          coll-eid :entity_id} {:name "Publishing Collection"}
                       :model/Table      {pub-table-id :id}    {:name         "Published Table"
                                                                :db_id        db-id
                                                                :is_published true
                                                                :collection_id coll-id}
                       :model/Table      {unpub-table-id :id}  {:name         "Unpublished Table"
                                                                :db_id        db-id
                                                                :is_published false}]
      (testing "published table with collection_id"
        (let [ser (ts/extract-one "Table" pub-table-id)]
          (testing "is_published is included in extraction"
            (is (true? (:is_published ser))))
          (testing "collection_id is transformed to entity_id"
            (is (= coll-eid (:collection_id ser))))
          (testing "depends on the collection"
            (is (contains? (set (serdes/dependencies ser))
                           [{:model "Collection" :id coll-eid}])))))
      (testing "unpublished table without collection_id"
        (let [ser (ts/extract-one "Table" unpub-table-id)]
          (testing "is_published defaults to false"
            (is (false? (:is_published ser))))
          (testing "collection_id is nil"
            (is (nil? (:collection_id ser))))
          (testing "does not depend on any collection"
            (is (not (some #(= "Collection" (:model (first %)))
                           (serdes/dependencies ser)))))))
      (testing "regular table without publishing fields set"
        (let [ser (ts/extract-one "Table" table-id)]
          (testing "is_published defaults to false"
            (is (false? (:is_published ser))))

          (testing "collection_id is nil"
            (is (nil? (:collection_id ser)))))))))

(deftest implicit-action-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User     {ann-id :id} {:first_name "Ann"
                                                     :last_name  "Wilson"
                                                     :email      "ann@heart.band"}
                       :model/Database {db-id :id :as db} {:name "My Database"}]
      (mt/with-db db
        (mt/with-actions [{card-id-1  :id
                           card-eid-1 :entity_id}
                          {:name          "Source question"
                           :database_id   db-id
                           :type          :model
                           :query_type    :native
                           :dataset_query (mt/native-query {:query "select 1"})
                           :creator_id    ann-id}

                          {:keys [action-id]}
                          {:name       "My Action"
                           :type       :implicit
                           :kind       "row/update"
                           :creator_id ann-id
                           :model_id   card-id-1}]
          (let [action (action/select-action :id action-id)]
            (testing "implicit action"
              (let [ser (ts/extract-one "Action" action-id)]
                (is (=? {:serdes/meta [{:model "Action" :id (:entity_id action) :label "my_action"}]
                         :creator_id  "ann@heart.band"
                         :type        "implicit"
                         :created_at  string?
                         :model_id    card-eid-1
                         :implicit    [{:kind :row/update}]}
                        ser))
                (is (not (contains? ser :id)))
                (testing "depends on the Model"
                  (is (= #{[{:model "Card" :id card-eid-1}]}
                         (set (serdes/dependencies ser)))))))))))))

(deftest http-action-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User     {ann-id :id} {:first_name "Ann"
                                                     :last_name  "Wilson"
                                                     :email      "ann@heart.band"}
                       :model/Database {db-id :id :as db} {:name "My Database"}]
      (mt/with-db db
        (mt/with-actions [{card-id-1  :id
                           card-eid-1 :entity_id}
                          {:name          "Source question"
                           :database_id   db-id
                           :type          :model
                           :query_type    :native
                           :dataset_query (mt/native-query {:query "select 1"})
                           :creator_id    ann-id}

                          {:keys [action-id]}
                          {:name       "My Action"
                           :type       :http
                           :template   {:method "GET", :url "https://camsaul.com"}
                           :creator_id ann-id
                           :model_id   card-id-1}]
          (let [action (action/select-action :id action-id)]
            (testing "action"
              (let [ser (ts/extract-one "Action" action-id)]
                (is (=? {:serdes/meta [{:model "Action" :id (:entity_id action) :label "my_action"}]
                         :creator_id  "ann@heart.band"
                         :type        "http"
                         :created_at  string?
                         :model_id    card-eid-1
                         :http        [{:template {}}]}
                        ser))
                (is (not (contains? ser :id)))
                (testing "depends on the Model"
                  (is (= #{[{:model "Card" :id card-eid-1}]}
                         (set (serdes/dependencies ser)))))))))))))

(deftest query-action-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User     {ann-id :id} {:first_name "Ann"
                                                     :last_name  "Wilson"
                                                     :email      "ann@heart.band"}
                       :model/Database {db-id :id :as db} {:name "My Database"}]
      (mt/with-db db
        (mt/with-actions [{card-id-1  :id
                           card-eid-1 :entity_id}
                          {:name          "Source question"
                           :database_id   db-id
                           :type          :model
                           :query_type    :native
                           :dataset_query (mt/native-query {:query "select 1"})
                           :creator_id    ann-id}

                          {:keys [action-id]}
                          {:name          "My Action"
                           :type          :query
                           :dataset_query {:type "native", :native {:query "select 1"}, :database db-id}
                           :database_id   db-id
                           :creator_id    ann-id
                           :model_id      card-id-1}]
          (let [action (action/select-action :id action-id)]
            (testing "action"
              (let [ser (ts/extract-one "Action" action-id)]
                (is (=? {:serdes/meta [{:model "Action"
                                        :id    (:entity_id action)
                                        :label "my_action"}]
                         :type        "query"
                         :creator_id  "ann@heart.band"
                         :created_at  string?
                         :query       [{:dataset_query {:database "My Database"
                                                        :type     :native
                                                        :native   {:query "select 1"}}}]
                         :model_id    card-eid-1}
                        ser))
                (is (not (contains? ser :id)))

                (testing "depends on the Model and Database"
                  (is (= #{[{:model "Database" :id "My Database"}]
                           [{:model "Card" :id card-eid-1}]}
                         (set (serdes/dependencies ser)))))))))))))

(deftest field-values-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Database {db-id        :id} {:name "My Database"}
                       :model/Table    {no-schema-id :id} {:name "Schemaless Table" :db_id db-id}
                       :model/Field    {field-id     :id} {:name "Some Field"
                                                           :table_id no-schema-id
                                                           :fingerprint {:global {:distinct-count 75 :nil% 0.0}
                                                                         :type   {:type/Text {:percent-json   0.0
                                                                                              :percent-url    0.0
                                                                                              :percent-email  0.0
                                                                                              :percent-state  0.0
                                                                                              :average-length 8.333333333333334}}}}

                       :model/FieldValues
                       {fv-id       :id
                        values      :values}
                       {:field_id              field-id
                        :hash_key              nil
                        :has_more_values       false
                        :type                  :full
                        :human_readable_values []
                        :values ["Artisan" "Asian" "BBQ" "Bakery" "Bar" "Brewery" "Burger" "Coffee Shop"
                                 "Diner" "Indian" "Italian" "Japanese" "Mexican" "Middle Eastern" "Pizza"
                                 "Seafood" "Steakhouse" "Tea Room" "Winery"]}]
      (testing "field values"
        (let [ser (serdes/extract-one "FieldValues" {} (t2/select-one :model/FieldValues :id fv-id))]
          (is (=? {:serdes/meta [{:model "Database" :id "My Database"}
                                 {:model "Table"    :id "Schemaless Table"}
                                 {:model "Field"    :id "Some Field"}
                                 {:model "FieldValues" :id "0"}] ; Always 0.
                   :created_at  string?
                   :values      values}
                  ser))
          (is (not (contains? ser :id)))
          (is (not (contains? ser :field_id))
              ":field_id is dropped; its implied by the path")

          (testing "depend on the parent Field"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]}
                   (set (serdes/dependencies ser)))))))
      (testing "extract-metabase behavior"
        (testing "without :include-field-values"
          (is (= #{}
                 (ids-by-model "FieldValues" (extract/extract {})))))
        (testing "with :include-field-values true"
          (let [models (->> {:include-field-values true} extract/extract (map (comp :model last :serdes/meta)))]
            (is (= 1
                   (t2/count :model/FieldValues)
                   (count (filter #{"FieldValues"} models))))))))))

(deftest field-user-settings-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Database {db-id        :id} {:name "My Database"}
                       :model/Table    {no-schema-id :id} {:name "Schemaless Table" :db_id db-id}
                       :model/Field    {field-id     :id} {:name "Some Field" :table_id no-schema-id}

                       :model/FieldUserSettings {description :description}
                       {:field_id              field-id
                        :description "Some custom Description"}]
      (testing "field values"
        (let [ser (serdes/extract-one "FieldUserSettings" {} (t2/select-one :model/FieldUserSettings :field_id field-id))]
          (is (=? {:serdes/meta [{:model "Database" :id "My Database"}
                                 {:model "Table"    :id "Schemaless Table"}
                                 {:model "Field"    :id "Some Field"}
                                 {:model "FieldUserSettings" :id "1"}] ; Always 1.
                   :created_at  string?
                   :description description}
                  ser))
          (is (not (contains? ser :field_id))
              ":field_id is dropped; its implied by the path")

          (testing "depend on the parent Field"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]}
                   (set (serdes/dependencies ser)))))))
      (testing "extract-metabase behavior"
        (let [models (->> {} (extract/extract) (map (comp :model last :serdes/meta)))]
          (is (= 1
                 (t2/count :model/FieldUserSettings)
                 (count (filter #{"FieldUserSettings"} models)))))))))

(deftest cards-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc
      [:model/User       {mark-id :id}    {:first_name "Mark"
                                           :last_name  "Knopfler"
                                           :email      "mark@direstrai.ts"}
       :model/Database   {db-id    :id}   {:name "My Database"}
       :model/Table      {table-id :id}   {:name "Schemaless Table" :db_id db-id}
       :model/Field      {field-id :id}   {:name "A Field" :table_id table-id}
       :model/Collection {coll-id-1  :id} {:name "1st collection"}

       :model/Collection
       {coll-id-2  :id
        coll-eid-2 :entity_id}
       {:name "2nd collection"}

       :model/Card
       {card-id-1  :id
        card-eid-1 :entity_id}
       {:name          "Source question"
        :database_id   db-id
        :table_id      table-id
        :collection_id coll-id-1
        :creator_id    mark-id}

       :model/Card
       {card-id-2  :id}
       {:name          "Card 2"
        :database_id   db-id
        :table_id      table-id
        :collection_id coll-id-2
        :creator_id    mark-id
        :parameters    [{:id                   "abc"
                         :type                 "category"
                         :name                 "CATEGORY"
                         :values_source_type   "card"
                         ;; card_id is in a different collection with dashboard's collection
                         :values_source_config {:card_id     card-id-1
                                                :value_field [:field field-id nil]}}]}]
      (testing "Cards with parameter's source is another question"
        (let [ser (serdes/extract-one "Card" {} (t2/select-one :model/Card :id card-id-2))]
          (is (= [{:id                   "abc",
                   :type                 :category,
                   :name                 "CATEGORY",
                   :values_source_type   :card
                   :values_source_config {:card_id card-eid-1,
                                          :value_field [:field ["My Database" nil "Schemaless Table" "A Field"] nil]}}]
                 (:parameters ser)))
          (is (= #{[{:model "Database"   :id "My Database"}]
                   [{:model "Collection" :id coll-eid-2}]
                   [{:model "Database"   :id "My Database"}
                    {:model "Table"      :id "Schemaless Table"}]
                   [{:model "Card"       :id card-eid-1}]
                   [{:model "Database"   :id "My Database"}
                    {:model "Table"      :id "Schemaless Table"}
                    {:model "Field"      :id "A Field"}]}
                 (set (serdes/dependencies ser))))))
      (testing "Nullable transformations stay as nulls"
        (let [ser (serdes/extract-one "Card" {} (t2/select-one :model/Card :id card-id-2))]
          (is (=? {:made_public_by_id nil}
                  ser)))))))

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest selective-serialization-basic-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User       {mark-id :id}              {:first_name "Mark"
                                                                     :last_name  "Knopfler"
                                                                     :email      "mark@direstrai.ts"}
                       :model/Collection {coll1-id   :id
                                          coll1-eid  :entity_id}    {:name "Some Collection"}
                       :model/Collection {coll2-id   :id
                                          coll2-eid  :entity_id}    {:name     "Nested Collection"
                                                                     :location (str "/" coll1-id "/")}
                       :model/Collection {coll3-id   :id
                                          coll3-eid  :entity_id}    {:name     "Grandchild Collection"
                                                                     :location (str "/" coll1-id "/" coll2-id "/")}

                       :model/Database   {db-id      :id}           {:name "My Database"}
                       :model/Table      {no-schema-id :id}         {:name "Schemaless Table" :db_id db-id}
                       :model/Field      _                          {:name "Some Field" :table_id no-schema-id}
                       :model/Table      {schema-id    :id}         {:name        "Schema'd Table"
                                                                     :db_id       db-id
                                                                     :schema      "PUBLIC"}
                       :model/Field      {field-id :id}             {:name "Other Field" :table_id schema-id}
                       :model/Field      {field-id2 :id}            {:name "Field To Click 1" :table_id schema-id}
                       :model/Field      {field-id3 :id}            {:name "Field To Click 2" :table_id schema-id}

                       ;; One dashboard and three cards in each of the three collections:
                       ;; Two cards contained in the dashboard and one freestanding.
                       :model/Dashboard  {dash1-id     :id
                                          dash1-eid    :entity_id}  {:name          "Dashboard 1"
                                                                     :collection_id coll1-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c1-1-id  :id
                                          c1-1-eid :entity_id}      {:name          "Question 1-1"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll1-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c1-2-id  :id
                                          c1-2-eid :entity_id}      {:name          "Question 1-2"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll1-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c1-3-eid :entity_id}      {:name          "Question 1-3"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll1-id
                                                                     :creator_id    mark-id}

                       :model/DashboardCard _                       {:card_id      c1-1-id
                                                                     :dashboard_id dash1-id}
                       :model/DashboardCard _                       {:card_id      c1-2-id
                                                                     :dashboard_id dash1-id}

                       ;; Second dashboard, in the middle collection.
                       :model/Dashboard  {dash2-id     :id
                                          dash2-eid    :entity_id}  {:name          "Dashboard 2"
                                                                     :collection_id coll2-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c2-1-id  :id
                                          c2-1-eid :entity_id}      {:name          "Question 2-1"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll2-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c2-2-id  :id
                                          c2-2-eid :entity_id}      {:name          "Question 2-2"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll2-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c2-3-eid :entity_id}      {:name          "Question 2-3"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll2-id
                                                                     :creator_id    mark-id}

                       :model/DashboardCard _                       {:card_id      c2-1-id
                                                                     :dashboard_id dash2-id}
                       :model/DashboardCard _                       {:card_id      c2-2-id
                                                                     :dashboard_id dash2-id}

                       ;; Third dashboard, in the grandchild collection.
                       :model/Dashboard  {dash3-id     :id
                                          dash3-eid    :entity_id}  {:name          "Dashboard 3"
                                                                     :collection_id coll3-id
                                                                     :creator_id    mark-id}

                       :model/Card       {c3-1-id  :id
                                          c3-1-eid :entity_id}      {:name          "Question 3-1"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll3-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c3-2-id  :id
                                          c3-2-eid :entity_id}      {:name          "Question 3-2"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll3-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c3-3-eid :entity_id}      {:name          "Question 3-3"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll3-id
                                                                     :creator_id    mark-id}

                       :model/DashboardCard _                       {:card_id      c3-1-id
                                                                     :dashboard_id dash3-id}
                       :model/DashboardCard _                       {:card_id      c3-2-id
                                                                     :dashboard_id dash3-id}

                       ;; Fourth dashboard where its parameter's source is another card
                       :model/Collection   {coll4-id   :id
                                            _coll4-eid :entity_id}    {:name     "Forth collection"}
                       :model/Card         {c4-id  :id
                                            c4-eid :entity_id}        {:name          "Question 4-1"
                                                                       :database_id   db-id
                                                                       :table_id      no-schema-id
                                                                       :collection_id coll4-id
                                                                       :creator_id    mark-id
                                                                       :parameters    [{:id                   "abc"
                                                                                        :type                 "category"
                                                                                        :name                 "CATEGORY"
                                                                                        :values_source_type   "card"
                                                                                         ;; card_id is in a different collection with dashboard's collection
                                                                                        :values_source_config {:card_id     c1-1-id
                                                                                                               :value_field [:field field-id nil]}}]}

                       :model/Dashboard    {dash4-id     :id
                                            dash4-eid    :entity_id}  {:name          "Dashboard 4"
                                                                       :collection_id coll4-id
                                                                       :creator_id    mark-id
                                                                       :parameters    [{:id                   "def"
                                                                                        :type                 "category"
                                                                                        :name                 "CATEGORY"
                                                                                        :values_source_type   "card"
                                                                                         ;; card_id is in a different collection with dashboard's collection
                                                                                        :values_source_config {:card_id     c1-2-id
                                                                                                               :value_field [:field field-id nil]}}]}
                       :model/DashboardCard _                       {:card_id      c4-id
                                                                     :dashboard_id dash4-id}

                       ;; Fifth dashboard which has :click_behavior defined.
                       :model/Collection    {coll5-id      :id}        {:name          "Fifth collection"}
                       :model/Dashboard     {clickdash-id  :id
                                             clickdash-eid :entity_id} {:name          "Dashboard with click behavior"
                                                                        :collection_id coll5-id
                                                                        :creator_id    mark-id}
                       :model/DashboardCard _                          {:card_id      c3-1-id
                                                                        :dashboard_id clickdash-id
                                                                        :visualization_settings
                                                                 ;; Top-level click behavior for the card.
                                                                        (let [dimension  [:dimension [:field "something" {:base-type "type/Text"}]]
                                                                              mapping-id (json/encode dimension)]
                                                                          {:click_behavior {:type     "link"
                                                                                            :linkType "question"
                                                                                            :targetId c3-2-id
                                                                                            :parameterMapping
                                                                                            {mapping-id {:id     mapping-id
                                                                                                         :source {:type "column"
                                                                                                                  :id   "whatever"
                                                                                                                  :name "Just to serialize"}
                                                                                                         :target {:type      "dimension"
                                                                                                                  :id        mapping-id
                                                                                                                  :dimension dimension}}}}})}
                       ;;; stress-test that exporting various visualization_settings does not break
                       :model/DashboardCard _                          {:card_id c3-1-id
                                                                        :dashboard_id clickdash-id
                                                                        :visualization_settings
                                                                        {:column_settings
                                                                         {(str "[\"ref\",[\"field\"," field-id ",null]]")
                                                                          {:click_behavior
                                                                           {:type     "link"
                                                                            :linkType "dashboard"
                                                                            :targetId dash4-id}}
                                                                          (str "[\"ref\",[\"field\"," field-id2 ",null]]")
                                                                          {:click_behavior
                                                                           {:type "crossfilter"
                                                                            :parameterMapping
                                                                            {"abcdef" {:id "abcdef"
                                                                                       :source {:type "column"
                                                                                                :id field-id2
                                                                                                :name "Field To Click 1"}
                                                                                       :target {:type "parameter"
                                                                                                :id "abcdef"}}}}}
                                                                          (str "[\"ref\",[\"field\"," field-id3 ",null]]")
                                                                          (let [mapping-id (format "[\"dimension\",[\"fk->\",[\"field\",%d,null],[\"field\",%d,null]]]" field-id3 field-id)
                                                                                dimension [:dimension [:field field-id {:source-field field-id3}]]]
                                                                            {:click_behavior
                                                                             {:type "link"
                                                                              :linkType "question"
                                                                              :targetId c4-id
                                                                              :parameterMapping
                                                                              {mapping-id {:id mapping-id
                                                                                           :source {:type "column"
                                                                                                    :id   "Category_ID"
                                                                                                    :name "Category ID"}
                                                                                           :target {:type      "dimension"
                                                                                                    :id        mapping-id
                                                                                                    :dimension dimension}}}}})}}}]

      (testing "selecting a collection includes settings metabot and data model by default"
        (is (= #{"Card" "Collection" "Dashboard" "Database" "PythonLibrary" "Setting" "TransformTag" "TransformJob"}
               (->> (extract/extract {:targets [["Collection" coll1-id]]})
                    (map (comp :model first serdes/path))
                    set))))

      (testing "selecting a dashboard gets all cards its dashcards depend on"
        (testing "grandparent dashboard"
          (is (= #{[{:model "Dashboard" :id dash1-eid :label "dashboard_1"}]
                   [{:model "Card"      :id c1-1-eid  :label "question_1_1"}]
                   [{:model "Card"      :id c1-2-eid  :label "question_1_2"}]}
                 (->> (extract/extract {:targets [["Dashboard" dash1-id]] :no-settings true :no-data-model true :no-transforms true})
                      (map serdes/path)
                      set))))

        (testing "middle dashboard"
          (is (= #{[{:model "Dashboard" :id dash2-eid :label "dashboard_2"}]
                   [{:model "Card"      :id c2-1-eid  :label "question_2_1"}]
                   [{:model "Card"      :id c2-2-eid  :label "question_2_2"}]}
                 (->> (extract/extract {:targets [["Dashboard" dash2-id]] :no-settings true :no-data-model true :no-transforms true})
                      (map serdes/path)
                      set))))

        (testing "grandchild dashboard"
          (is (= #{[{:model "Dashboard" :id dash3-eid :label "dashboard_3"}]
                   [{:model "Card"      :id c3-1-eid  :label "question_3_1"}]
                   [{:model "Card"      :id c3-2-eid  :label "question_3_2"}]}
                 (->> (extract/extract {:targets [["Dashboard" dash3-id]] :no-settings true :no-data-model true :no-transforms true})
                      (map serdes/path)
                      set))))

        (testing "a dashboard that has parameter source is another card"
          (is (=? #{[{:model "Dashboard"     :id dash4-eid :label "dashboard_4"}]
                    [{:model "Card"          :id c4-eid  :label "question_4_1"}]
                    ;; card that parameter on dashboard linked to
                    [{:model "Card"          :id c1-1-eid  :label "question_1_1"}]
                    ;; card that the card on dashboard linked to
                    [{:model "Card"          :id c1-2-eid  :label "question_1_2"}]}
                  (->> (extract/extract {:targets [["Dashboard" dash4-id]] :no-settings true :no-data-model true :no-transforms true})
                       (map serdes/path)
                       set)))))

      (testing "selecting a dashboard gets any dashboards or cards it links to when clicked"
        (is (=? #{[{:model "Dashboard"       :id clickdash-eid :label "dashboard_with_click_behavior"}]
                  [{:model "Card"            :id c3-1-eid      :label "question_3_1"}]    ; Visualized card
                  [{:model "Dashboard"       :id dash4-eid     :label "dashboard_4"}]     ; Linked dashboard
                  [{:model "Card"            :id c3-2-eid      :label "question_3_2"}]    ; Linked card
                  [{:model "Card"            :id c4-eid        :label "question_4_1"}]    ; Transitive via dash4
                  [{:model "Card"            :id c1-1-eid      :label "question_1_1"}]    ; Linked by c4
                  [{:model "Card"            :id c1-2-eid      :label "question_1_2"}]}   ; Linked by dash4
                (->> (extract/extract {:targets [["Dashboard" clickdash-id]] :no-settings true :no-data-model true :no-transforms true})
                     (map serdes/path)
                     set))))

      (testing "selecting a collection gets all its contents"
        (let [grandchild-paths  #{[{:model "Collection"    :id coll1-eid :label "some_collection"}]
                                  [{:model "Collection"    :id coll2-eid :label "nested_collection"}]
                                  [{:model "Collection"    :id coll3-eid :label "grandchild_collection"}]
                                  [{:model "Dashboard"     :id dash3-eid :label "dashboard_3"}]
                                  [{:model "Card"          :id c3-1-eid  :label "question_3_1"}]
                                  [{:model "Card"          :id c3-2-eid  :label "question_3_2"}]
                                  [{:model "Card"          :id c3-3-eid  :label "question_3_3"}]}
              middle-paths      #{[{:model "Collection"    :id coll1-eid :label "some_collection"}]
                                  [{:model "Collection"    :id coll2-eid :label "nested_collection"}]
                                  [{:model "Dashboard"     :id dash2-eid :label "dashboard_2"}]
                                  [{:model "Card"          :id c2-1-eid  :label "question_2_1"}]
                                  [{:model "Card"          :id c2-2-eid  :label "question_2_2"}]
                                  [{:model "Card"          :id c2-3-eid  :label "question_2_3"}]}
              grandparent-paths #{[{:model "Collection"    :id coll1-eid :label "some_collection"}]
                                  [{:model "Dashboard"     :id dash1-eid :label "dashboard_1"}]
                                  [{:model "Card"          :id c1-1-eid  :label "question_1_1"}]
                                  [{:model "Card"          :id c1-2-eid  :label "question_1_2"}]
                                  [{:model "Card"          :id c1-3-eid  :label "question_1_3"}]}]
          (testing "grandchild collection has all its own contents"
            (is (= grandchild-paths ; Includes the third card not found in the collection
                   (->> (extract/extract {:targets [["Collection" coll3-id]] :no-settings true :no-data-model true :no-transforms true})
                        (map serdes/path)
                        set))))
          (testing "middle collection has all its own plus the grandchild and its contents"
            (is (= (set/union middle-paths grandchild-paths)
                   (->> (extract/extract {:targets [["Collection" coll2-id]] :no-settings true :no-data-model true :no-transforms true})
                        (map serdes/path)
                        set))))
          (testing "grandparent collection has all its own plus the grandchild and middle collections with contents"
            (is (= (set/union grandparent-paths middle-paths grandchild-paths)
                   (->> (extract/extract {:targets [["Collection" coll1-id]] :no-settings true :no-data-model true :no-transforms true})
                        (map serdes/path)
                        set))))

          (testing "depending on data from personal collections results in errors"
            (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
              (extract/extract {:targets [["Collection" coll4-id]] :no-settings true :no-data-model true :no-transforms true})
              (let [msgs (into #{}
                               (map :message)
                               (messages))]
                (is (some #(str/starts-with? % "Failed to export Dashboard") msgs))
                (is (some #(str/starts-with? % "Failed to export Cards") msgs))))))))))

(deftest click-behavior-references-to-deleted-cards
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User       {mark-id :id}              {:first_name "Mark"
                                                                     :last_name  "Knopfler"
                                                                     :email      "mark@direstrai.ts"}
                       :model/Collection {coll-id   :id
                                          coll-eid  :entity_id}    {:name "Some Collection"}
                       :model/Database   {db-id      :id}           {:name "My Database"}
                       :model/Table      {no-schema-id :id}         {:name "Schemaless Table" :db_id db-id}
                       :model/Field      _                          {:name "Some Field" :table_id no-schema-id}
                       :model/Table      {schema-id    :id}         {:name        "Schema'd Table"
                                                                     :db_id       db-id
                                                                     :schema      "PUBLIC"}
                       :model/Field      {field-id :id}             {:name "Other Field" :table_id schema-id}
                       :model/Field      {field-id3 :id}            {:name "Field To Click 2" :table_id schema-id}

                       :model/Card       {card-id  :id
                                          card-eid :entity_id}      {:name          "A Normal Question"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll-id
                                                                     :creator_id    mark-id}

                       :model/Card       {deleted-card-id :id}      {:collection_id coll-id}

                       :model/Dashboard  {deleted-dash-id :id}      {:collection_id coll-id}

                       :model/Dashboard     {clickdash-id  :id
                                             clickdash-eid :entity_id} {:name          "Dashboard"
                                                                        :collection_id coll-id
                                                                        :creator_id    mark-id}
                       :model/DashboardCard _                          {:card_id      card-id
                                                                        :dashboard_id clickdash-id
                                                                        :visualization_settings
                                                                        ;; links to a (soon-to-be) deleted card
                                                                        {:click_behavior {:type     "link"
                                                                                          :linkType "question"
                                                                                          :targetId deleted-card-id}}}
                       ;;; stress-test that exporting various visualization_settings does not break
                       :model/DashboardCard _                          {:card_id card-id
                                                                        :dashboard_id clickdash-id
                                                                        :visualization_settings
                                                                        {:column_settings
                                                                         {(str "[\"ref\",[\"field\"," field-id ",null]]")
                                                                          {:click_behavior
                                                                           {:type     "link"
                                                                            :linkType "dashboard"
                                                                            :targetId deleted-dash-id}}

                                                                          (str "[\"ref\",[\"field\"," field-id3 ",null]]")
                                                                          {:click_behavior
                                                                           {:type "link"
                                                                            :linkType "question"
                                                                            :targetId deleted-card-id}}}}}]

      (t2/delete! :model/Card deleted-card-id)
      (t2/delete! :model/Dashboard deleted-dash-id)
      (testing "the references to deleted cards and dashboards are ignored"
        (is (= #{[{:model "Dashboard" :id clickdash-eid :label "dashboard"}]
                 [{:model "Collection" :id coll-eid :label "some_collection"}]
                 [{:model "Card" :id card-eid :label "a_normal_question"}]}
               (->> {:targets [["Collection" coll-id]]
                     :no-settings true :no-data-model true :no-transforms true}
                    extract/extract
                    (map serdes/path)
                    (into #{})))))
      (testing "the click behavior looks sane"
        (is (= #{{:column_settings nil}
                 {:column_settings {"[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Other Field\"],null]]" {}
                                    "[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Field To Click 2\"],null]]" {}}}}
               (->> {:targets [["Collection" coll-id]]
                     :no-settings true :no-data-model true :no-transforms true}
                    extract/extract
                    (filter #(= (:entity_id %) clickdash-eid))
                    first
                    :dashcards
                    (map :visualization_settings)
                    (into #{}))))))))

(deftest field-references-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Database   {db-id          :id}        {:name "My Database"}
                       :model/Table      {no-schema-id   :id}        {:name "Schemaless Table" :db_id db-id}
                       :model/Field      {some-field-id  :id}        {:name "Some Field" :table_id no-schema-id}
                       :model/Table      {schema-id      :id}        {:name        "Schema'd Table"
                                                                      :db_id       db-id
                                                                      :schema      "PUBLIC"}
                       :model/Field      {other-field-id :id}        {:name "Other Field" :table_id schema-id}
                       :model/Field      {fk-id          :id}        {:name     "Foreign Key"
                                                                      :table_id schema-id
                                                                      :fk_target_field_id some-field-id}
                       :model/Field      {nested-id      :id}        {:name "Nested Field"
                                                                      :table_id schema-id
                                                                      :parent_id other-field-id}]

      (testing "fields that reference foreign keys are properly exported as Field references"
        (is (= ["My Database" nil "Schemaless Table" "Some Field"]
               (:fk_target_field_id (ts/extract-one "Field" fk-id)))))

      (testing "Fields that reference parents are properly exported as Field references"
        (is (= ["My Database" "PUBLIC" "Schema'd Table" "Other Field"]
               (:parent_id (ts/extract-one "Field" nested-id))))
        (is (= [{:model "Database", :id "My Database"}
                {:model "Schema", :id "PUBLIC"}
                {:model "Table", :id "Schema'd Table"}
                {:model "Field", :id "Other Field"}
                {:model "Field", :id "Nested Field"}]
               (:serdes/meta (ts/extract-one "Field" nested-id))))))))

(deftest escape-report-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Collection    {coll1-id :id} {:name "Some Collection"}
                       :model/Collection    {coll2-id :id} {:name "Other Collection"}
                       :model/Collection    {coll3-id :id} {:name "Third Collection"}
                       :model/Dashboard     {dash-id :id}  {:name "A Dashboard" :collection_id coll1-id}
                       :model/Database      {db-id :id}    {}
                       :model/Card          {card1-id :id} {:name "Some Card", :database_id db-id}
                       :model/DashboardCard _              {:card_id card1-id :dashboard_id dash-id}
                       :model/Card          _              {:name          "Dependent Card"
                                                            :collection_id coll2-id
                                                            :dataset_query {:type     :query
                                                                            :database db-id
                                                                            :query    {:source-table (str "card__" card1-id)}}}
                       :model/User          user           {:email "dirk@kirk.ir"}
                       :model/Collection    pcoll          {:name              "Personal Collection"
                                                            :personal_owner_id (:id user)}
                       :model/Card          pcard          {:name          "Personal Card"
                                                            :collection_id (:id pcoll)}
                       :model/Card          _              {:name          "External Card"
                                                            :dataset_query {:database db-id
                                                                            :type     :query
                                                                            :query    {:source-table (str "card__" (:id pcard))}}}
                       :model/Card          _              {:name          "Card with parameters"
                                                            :collection_id coll3-id
                                                            :parameters    [{:id                   "abc"
                                                                             :type                 "category"
                                                                             :values_source_type   "card"
                                                                             :values_source_config {:card_id card1-id}}]}]
      (testing "Complain about card not available for exporting"
        (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
          (extract/extract {:targets       [["Collection" coll1-id]]
                            :no-settings   true
                            :no-data-model true})
          (is (some #(str/starts-with? % "Failed to export Dashboard")
                    (into #{}
                          (map :message)
                          (messages))))))
      (testing "Complain about card depending on an outside card: "
        (testing "when its :source-table"
          (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
            (extract/extract {:targets       [["Collection" coll2-id]]
                              :no-settings   true
                              :no-data-model true})
            (is (some #(str/starts-with? % "Failed to export Cards")
                      (into #{}
                            (map :message)
                            (messages))))))
        (testing "when it's :parameters"
          (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
            (extract/extract {:targets       [["Collection" coll2-id]]
                              :no-settings   true
                              :no-data-model true})
            (is (some #(str/starts-with? % "Failed to export Cards")
                      (into #{}
                            (map :message)
                            (messages)))))))
      (testing "When exporting all collections"
        (testing "Complain about dependents in personal collections"
          (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
            (extract/extract {:no-settings   true
                              :no-data-model true})
            (is (some #(str/starts-with? % "Failed to export Cards")
                      (into #{}
                            (map :message)
                            (messages))))))))))

(deftest recursive-colls-test
  (mt/with-empty-h2-app-db!
    (mt/with-temp [:model/Collection {parent-id  :id
                                      parent-eid :entity_id} {:name "Top-Level Collection"}
                   :model/Collection {middle-id  :id
                                      middle-eid :entity_id} {:name     "Nested Collection"
                                                              :location (format "/%s/" parent-id)}
                   :model/Collection {nested-id  :id
                                      nested-eid :entity_id} {:name     "Nested Collection"
                                                              :location (format "/%s/%s/" parent-id middle-id)}
                   :model/Card       _                       {:name          "Card To Skip"
                                                              :collection_id parent-id}
                   :model/Card       {ncard-eid :entity_id}  {:name          "Card To Export"
                                                              :collection_id nested-id}]
      (let [ser (extract/extract {:targets       [["Collection" nested-id]]
                                  :no-settings   true
                                  :no-data-model true})]
        (is (= #{parent-eid middle-eid nested-eid}
               (ids-by-model "Collection" ser)))
        (is (= #{ncard-eid}
               (ids-by-model "Card" ser)))))))

(deftest skip-analytics-collections-test
  (testing "Collections in 'analytics' namespace should not be extracted, see #37453"
    (mt/with-empty-h2-app-db!
      (mbc/ensure-audit-db-installed!)
      (testing "sanity check that the audit collection exists"
        (is (some? (audit/default-audit-collection)))
        (is (some? (audit/default-custom-reports-collection))))
      (let [ser (extract/extract {:no-settings   true
                                  :no-data-model true})]
        (is (= #{} (ids-by-model "Collection" ser)))))))

(deftest xray-of-analytics-model-export-test
  (testing "X-rays of analytics models can be exported without errors"
    (mt/with-empty-h2-app-db!
      (mbc/ensure-audit-db-installed!)
      (testing "sanity check that the analytics content exists"
        (is (some? (audit/default-audit-collection)))
        ;; Find the Query log model (entity_id: QOtZaiTLf2FDD4AT6Oinb)
        (let [query-log-card (t2/select-one :model/Card :entity_id "QOtZaiTLf2FDD4AT6Oinb")]
          (is (some? query-log-card) "Query log model should exist in analytics")
          (when query-log-card
            ;; Create a card that depends on the analytics model (simulating an x-ray)
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Test Collection"}
                           :model/Card {_xray-card-id :id xray-card-eid :entity_id}
                           {:name          "X-ray of Query log"
                            :collection_id coll-id
                            :database_id   (:database_id query-log-card)
                            :dataset_query {:type     :query
                                            :database (:database_id query-log-card)
                                            :query    {:source-table (str "card__" (:id query-log-card))}}}]
              (testing "Export should succeed without warnings about analytics dependencies"
                (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
                  (let [ser (extract/extract {:targets       [["Collection" coll-id]]
                                              :no-settings   true
                                              :no-data-model true})]
                    (is (contains? (ids-by-model "Card" ser) xray-card-eid)
                        "X-ray card should be exported")
                    (is (contains? (ids-by-model "Collection" ser) coll-eid)
                        "Collection should be exported")
                    (is (not (contains? (ids-by-model "Card" ser) "QOtZaiTLf2FDD4AT6Oinb"))
                        "Analytics model should NOT be exported")
                    (let [warn-msgs (into #{} (map :message) (messages))]
                      (is (not (some #(str/starts-with? % "Failed to export") warn-msgs))
                          (str "Should not have export warnings, got: " warn-msgs)))))))))))))

(deftest entity-id-in-targets-test
  (mt/with-temp [:model/Collection c {:name "Top-Level Collection"}]
    (testing "Conversion from eid to id works"
      (is (= (:id c)
             (serdes/eid->id "Collection" (:entity_id c)))))
    (testing "Extracting by entity id works"
      (let [ser (extract/extract {:targets       [["Collection" (:entity_id c)]]
                                  :no-settings   true
                                  :no-data-model true})]
        (is (= #{(:entity_id c)}
               (ids-by-model "Collection" ser)))))))

(deftest extract-nested-test
  (testing "extract-nested working"
    (mt/with-temp [:model/Dashboard           d   {:name "Top Dash"}
                   :model/Card                c1  {:name "Some Card"}
                   :model/Card                c2  {:name "Some Inner Card"}
                   :model/DashboardCard       dc1 {:dashboard_id (:id d) :card_id (:id c1)}
                   :model/DashboardCardSeries s   {:dashboardcard_id (:id dc1) :card_id (:id c2)}]
      (let [spec (serdes/make-spec "DashboardCard" nil)]
        (is (= {(:id dc1) [s]}
               (#'serdes/transform->nested (-> spec :transform :series) {} [dc1])))
        (is (=? (assoc dc1 :series [s])
                (u/rfirst (serdes/extract-query "DashboardCard" {:where [:= :id (:id dc1)]})))))
      (let [spec (serdes/make-spec "Dashboard" nil)]
        (is (= {(:id d) [(assoc dc1 :series [s])]}
               (#'serdes/transform->nested (-> spec :transform :dashcards) {} [d])))
        (is (=? (assoc d
                       :dashcards [(assoc dc1 :series [s])]
                       :tabs nil)
                (u/rfirst (serdes/extract-query "Dashboard" {:where [:= :id (:id d)]}))))))))

(deftest extract-nested-efficient-test
  (testing "extract-nested is efficient"
    (mt/with-temp [:model/Dashboard           d1  {:name "Top Dash 1"}
                   :model/Dashboard           d2  {:name "Top Dash 2"}
                   :model/Card                c1  {:name "Some Card"}
                   :model/Card                c2  {:name "Some Inner Card"}
                   :model/Card                c3  {:name "Card for Dash 2"}
                   :model/DashboardCard       dc1 {:dashboard_id (:id d1) :card_id (:id c1)}
                   :model/DashboardCard       dc2 {:dashboard_id (:id d2) :card_id (:id c2)}
                   :model/DashboardCard       dc3 {:dashboard_id (:id d2) :card_id (:id c3)}
                   :model/DashboardCardSeries s   {:dashboardcard_id (:id dc1) :card_id (:id c2)}]
      (t2/with-call-count [qc]
        ;; Use sets to ensure order independence of `extract-query` result.
        (is (=? #{(assoc d1
                         :dashcards [(assoc dc1 :series [s])]
                         :tabs nil)
                  (assoc d2
                         :dashcards [(assoc dc2 :series nil)
                                     (assoc dc3 :series nil)]
                         :tabs nil)}
                (into #{} (map (fn [dashboard]
                                 (update dashboard :dashcards #(sort-by :id %))))
                      (serdes/extract-query "Dashboard" {:where [:in :id [(:id d1) (:id d2)]]}))))
        ;; 1 per dashboard/dashcard/series/tabs
        (is (= 4 (qc)))))))

(deftest extract-nested-partitioned-test
  (testing "extract-nested will partition stuff by 100s"
    (mt/with-empty-h2-app-db!
      (let [d   (ts/create! :model/Dashboard {:name "Dash"})
            c1  (ts/create! :model/Card {:name "Card"})
            dcs (vec (for [_ (range 7)]
                       (ts/create! :model/DashboardCard {:dashboard_id (:id d)
                                                         :card_id      (:id c1)})))]
        (t2/with-call-count [qc]
          (is (=? [(assoc d :dashcards dcs)]
                  (into [] (serdes/extract-query "Dashboard" {:batch-limit 5
                                                              :where [:= :id (:id d)]}))))
          ;; query count breakdown:
          ;; - 1 for dashboard
          ;; - 1 for tabs, there are none
          ;; - 1 for dashcards, there are 7
          ;; - 2 for series (7 dashcards / 5 -> 2 batches)
          (is (= 5 (qc))))))))

(deftest result-metadata-test
  (mt/with-temp [:model/Card c {:dataset_query (mt/query venues)}]
    (let [res (qp/process-query
               (qp/userland-query
                (:dataset_query c)
                {:card-id (:id c)}))]
      (when-not (= (:status res) :completed)
        (throw (ex-info "Query failed" res)))
      (let [ser (serdes/extract-one "Card" nil (t2/select-one :model/Card (:id c)))]
        (is (=? {:base_type          :type/Integer
                 :id                 [string? "PUBLIC" "VENUES" "CATEGORY_ID"]
                 :fk_target_field_id [string? "PUBLIC" "CATEGORIES" "ID"]
                 :field_ref          [:field [string? "PUBLIC" "VENUES" "CATEGORY_ID"] nil]}
                (->> (:result_metadata ser)
                     (u/seek #(= (:display_name %) "Category ID")))))))))

(deftest extract-single-collection-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc
      [:model/Collection    {coll-id :id}            {:name "Top-Level Collection"}
       :model/Dashboard     {dash-id :id
                             dash-eid :entity_id}    {:name "Top Dash"
                                                      :collection_id coll-id}
       :model/Card          {card-id-1 :id
                             card-eid-1 :entity_id} {:name "Some Card"
                                                     :collection_id coll-id}
       :model/Card          {card-id-2 :id
                             card-eid-2 :entity_id} {:name "Some Inner Card"
                                                     :collection_id coll-id}
       :model/DashboardTab  {tab-id-1 :id
                             tab-eid-1 :entity_id}  {:dashboard_id dash-id
                                                     :name "Tab 1"}
       :model/DashboardCard  _                      {:dashboard_id dash-id
                                                     :dashboard_tab_id tab-id-1
                                                     :card_id card-id-1}
       :model/DashboardTab  {tab-id-2 :id
                             tab-eid-2 :entity_id}  {:dashboard_id dash-id
                                                     :name "Tab 2"}
       :model/DashboardCard _                       {:dashboard_id dash-id
                                                     :dashboard_tab_id tab-id-2
                                                     :card_id card-id-2}]
      (let [extraction (extract/extract {:targets [["Collection" coll-id]] :no-settings true :no-data-model true})]
        (is (=? [{:name "Top Dash"
                  :dashcards [{:dashboard_tab_id [dash-eid tab-eid-1]
                               :card_id          card-eid-1}
                              {:dashboard_tab_id [dash-eid tab-eid-2]
                               :card_id          card-eid-2}]
                  :tabs [{:name "Tab 1"}
                         {:name "Tab 2"}]}]
                (by-model "Dashboard" extraction)))))))

(deftest metabot-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc
      [:model/Card {model-id :id
                    model-eid :entity_id} {:name "AI Model"
                                           :type :model}

       :model/Collection {coll-id :id
                          coll-eid :entity_id} {:name "Metabot Collection"}

       :model/Metabot {metabot-id :id
                       metabot-eid :entity_id} {:name "Test Metabot"
                                                :description "A test metabot"
                                                :use_verified_content false
                                                :collection_id coll-id}

       :model/MetabotPrompt {metabot-prompt-eid :entity_id} {:metabot_id metabot-id
                                                             :prompt "A sample prompt"
                                                             :model :model
                                                             :card_id model-id}]

      (testing "metabot extraction"
        (let [ser (ts/extract-one "Metabot" metabot-id)]
          (is (=? {:serdes/meta [{:model "Metabot" :id metabot-eid}]
                   :name "Test Metabot"
                   :description "A test metabot"
                   :entity_id metabot-eid
                   :collection_id coll-eid
                   :use_verified_content false
                   :prompts [{:prompt "A sample prompt"
                              :model "model"
                              :entity_id metabot-prompt-eid
                              :card_id model-eid
                              :serdes/meta [{:model "Metabot" :id metabot-eid}
                                            {:model "MetabotPrompt" :id metabot-prompt-eid}]
                              :created_at string?}]
                   :created_at string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "metabot depends on its model entities"
            (is (= #{[{:model "Card" :id model-eid}]}
                   (set (serdes/dependencies ser))))))))))

(deftest metabot-collection-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc
      [:model/Collection {model-id :id} {:name "AI Model"}

       :model/Card {card-id :id
                    card-eid :entity_id} {:name "AI Model"
                                          :type :model
                                          :collection_id model-id}

       :model/Collection {coll-id :id
                          coll-eid :entity_id} {:name "Metabot Collection"}

       :model/Metabot {metabot-id :id
                       metabot-eid :entity_id} {:name "Test Metabot"
                                                :description "A test metabot"
                                                :use_verified_content false
                                                :collection_id coll-id}

       :model/MetabotPrompt {metabot-prompt-eid :entity_id} {:metabot_id metabot-id
                                                             :prompt "A sample prompt"
                                                             :model :model
                                                             :card_id card-id}]

      (testing "metabot extraction"
        (let [ser (ts/extract-one "Metabot" metabot-id)]
          (is (=? {:serdes/meta [{:model "Metabot" :id metabot-eid}]
                   :name "Test Metabot"
                   :description "A test metabot"
                   :entity_id metabot-eid
                   :collection_id coll-eid
                   :use_verified_content false
                   :prompts [{:prompt "A sample prompt"
                              :model "model"
                              :entity_id metabot-prompt-eid
                              :card_id card-eid
                              :serdes/meta [{:model "Metabot" :id metabot-eid}
                                            {:model "MetabotPrompt" :id metabot-prompt-eid}]
                              :created_at string?}]
                   :created_at string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "metabot depends on its prompts' cards"
            (is (= #{[{:model "Card" :id card-eid}]}
                   (set (serdes/dependencies ser))))))))))

(deftest document-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Collection collection {}
                       :model/User user {:first_name "Mark"
                                         :last_name  "Knopfler"
                                         :email      "mark@direstrai.ts"}
                       :model/Document document {:name "Test Document"
                                                 :document {}
                                                 :content_type "application/json+vnd.prose-mirror"
                                                 :collection_id (:id collection)
                                                 :creator_id (:id user)}
                       :model/Card card {:name "Dependent Card"
                                         :document_id (u/the-id document)}
                       :model/Card linked-card {:name "Linked Card"}
                       :model/Dashboard dashboard {:name "Smart Linked Dashboard"}
                       :model/Table table {:name "linked_table"}]

      (t2/update! :model/Document :id (u/the-id document) {:document {:type "doc"
                                                                      :content [{:type "cardEmbed"
                                                                                 :attrs {:id (u/the-id card)}}
                                                                                {:type "smartLink"
                                                                                 :attrs {:entityId (u/the-id linked-card)
                                                                                         :model "card"}}
                                                                                {:type "smartLink"
                                                                                 :attrs {:entityId (u/the-id table)
                                                                                         :model "table"}}
                                                                                {:type "smartLink"
                                                                                 :attrs {:entityId (u/the-id dashboard)
                                                                                         :model "dashboard"}}]}})
      (testing "document extraction"
        (let [ser (ts/extract-one "Document" (u/the-id document))]
          (is (=? {:serdes/meta [{:model "Document" :id (:entity_id document)}]
                   :name "Test Document"
                   :entity_id (:entity_id document)
                   :document {:type "doc"
                              :content [{:type "cardEmbed"
                                         :attrs {:id [{:model "Card" :id (:entity_id card)}]}}
                                        {:type "smartLink"
                                         :attrs {:entityId [{:model "Card" :id (:entity_id linked-card)}]
                                                 :model "card"}}
                                        {:type "smartLink"
                                         :attrs {:entityId (serdes/generate-path "Table" table)
                                                 :model "table"}}
                                        {:type "smartLink"
                                         :attrs {:entityId [{:model "Dashboard" :id (:entity_id dashboard)}]
                                                 :model "dashboard"}}]}
                   :archived false
                   :archived_directly false
                   :creator_id (:email user)
                   :collection_id (:entity_id collection)
                   :content_type "application/json+vnd.prose-mirror"
                   :updated_at string?
                   :created_at string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "depends on its collection, cardEmbeds and smarkLinks "
            (is (= #{[{:model "Collection" :id (:entity_id collection)}]
                     [{:model "Card" :id (:entity_id card)}]
                     [{:model "Dashboard" :id (:entity_id dashboard)}]
                     [{:model "Card" :id (:entity_id linked-card)}]
                     (serdes/generate-path "Table" table)}
                   (set (serdes/dependencies ser))))))))))

(deftest visualizer-dashboard-card-settings-test
  (testing "visualizer settings transform entity IDs <-> card IDs"
    (let [card-entity-id "WcMlLFNVcy0iO49mKW3WH"
          card-id 621]
      (with-redefs [serdes/*import-fk* (fn [_entity-id _model]
                                         card-id)
                    serdes/*export-fk* (fn [_card-id _model]
                                         card-entity-id)]
        (testing "transforms sourceId in column mappings"
          (let [input {:visualization
                       {:columnValuesMapping
                        {:COLUMN_1 [{:sourceId (str "card:" card-entity-id)
                                     :originalName "CREATED_AT"
                                     :name "COLUMN_1"}]
                         :DIMENSION [(str "$_card:" card-entity-id "_name")]}}}
                expected {:visualization
                          {:columnValuesMapping
                           {:COLUMN_1 [{:sourceId (str "card:" card-id)
                                        :originalName "CREATED_AT"
                                        :name "COLUMN_1"}]
                            :DIMENSION [(str "$_card:" card-id "_name")]}}}
                result (serdes/import-visualizer-settings input)]
            (is (= expected result))))

        (testing "transforms sourceId in column mappings"
          (let [input {:visualization
                       {:columnValuesMapping
                        {:COLUMN_1 [{:sourceId (str "card:" card-id)
                                     :originalName "CREATED_AT"
                                     :name "COLUMN_1"}]
                         :DIMENSION [(str "$_card:" card-id "_name")]}}}
                expected {:visualization
                          {:columnValuesMapping
                           {:COLUMN_1 [{:sourceId (str "card:" card-entity-id)
                                        :originalName "CREATED_AT"
                                        :name "COLUMN_1"}]
                            :DIMENSION [(str "$_card:" card-entity-id "_name")]}}}
                result (serdes/export-visualizer-settings input)]
            (is (= expected result))))))))

(deftest glossary-test
  (testing "Glossary entries are extracted well"
    (mt/with-temp [:model/Glossary _ {:term       "foobar"
                                      :definition "It's foobar2000 actually"}]
      (let [ser (serdes/extract-one "Glossary" {} (t2/select-one :model/Glossary :term "foobar"))]
        (is (=? {:serdes/meta [{:model "Glossary" :id "foobar"}]
                 :term        "foobar"}
                ser))))))

(deftest transform-tag-extraction-test
  (testing "TransformTag extraction and serialization"
    (mt/with-premium-features #{:transforms}
      (mt/with-empty-h2-app-db!
        ;; Delete the existing built-in transform tags
        (t2/delete! :model/TransformTag)
        (ts/with-temp-dpc [;; Create built-in tags
                           :model/TransformTag
                           {hourly-tag-id :id
                            hourly-tag-eid :entity_id}
                           {:name "hourly" :built_in_type "hourly"}

                           :model/TransformTag
                           {daily-tag-eid :entity_id}
                           {:name "daily" :built_in_type "daily"}

                           ;; Create custom tag
                           :model/TransformTag
                           {custom-tag-id :id
                            custom-tag-eid :entity_id}
                           {:name "custom-etl"}]

          (testing "built-in tags extract correctly"
            (let [ser (serdes/extract-one "TransformTag" {} (t2/hydrate (t2/select-one :model/TransformTag :id hourly-tag-id) :tags))]
              (is (=? {:serdes/meta [{:model "TransformTag"
                                      :id hourly-tag-eid}]
                       :name "hourly"
                       :built_in_type "hourly"
                       :created_at string?}
                      ser))
              (is (not (contains? ser :id)))
              (is (empty? (serdes/dependencies ser)))))

          (testing "custom tags extract correctly"
            (let [ser (serdes/extract-one "TransformTag" {} (t2/hydrate (t2/select-one :model/TransformTag :id custom-tag-id) :tags))]
              (is (=? {:serdes/meta [{:model "TransformTag"
                                      :id custom-tag-eid}]
                       :name "custom-etl"
                       :built_in_type nil
                       :created_at string?}
                      ser))
              (is (not (contains? ser :id)))
              (is (empty? (serdes/dependencies ser)))))

          (testing "all transform tags are extracted"
            (is (= #{hourly-tag-eid daily-tag-eid custom-tag-eid}
                   (ids-by-model "TransformTag" (extract/extract {}))))))))))

(deftest transform-extraction-test
  (testing "Transform extraction and serialization"
    (mt/with-premium-features #{:transforms}
      (mt/with-empty-h2-app-db!
        ;; Delete the existing built-in transform tags
        (t2/delete! :model/TransformTag)
        (ts/with-temp-dpc [:model/Database
                           {db-id :id}
                           {:name "My Database"}

                           :model/Table
                           {table-id :id}
                           {:name "Schemaless Table" :db_id db-id}

                           :model/Field
                           {_field-id :id}
                           {:name "Some Field" :table_id table-id}

                           :model/Collection
                           {coll-id :id coll-eid :entity_id}
                           {:name "Transform Collection"
                            :namespace :transforms}

                           ;; Create tags for associations
                           :model/TransformTag
                           {hourly-tag-id :id
                            hourly-tag-eid :entity_id}
                           {:name "hourly" :built_in_type "hourly" :entity_id "hourlyhourlyhourlyxxx"}

                           :model/TransformTag
                           {daily-tag-id :id
                            daily-tag-eid :entity_id}
                           {:name "daily" :built_in_type "daily" :entity_id "dailydailydailydailyx"}

                           :model/TransformTag
                           {custom-tag-id :id
                            custom-tag-eid :entity_id}
                           {:name "custom-etl" :entity_id "custometlcustometlcus"}

                           ;; Create Transform
                           :model/Transform
                           {transform-id :id
                            transform-eid :entity_id}
                           {:name "Test Transform"
                            :description "A test transform for serialization"
                            :entity_id "2HzIFwJ6720JAx07UMavl"
                            :collection_id coll-id
                            :source {:query {:database db-id
                                             :type     "query"
                                             :query    {:source-table table-id}}
                                     :type "query"}
                            :target {:database db-id
                                     :type "table"
                                     :schema "public"
                                     :name "target_table"}}

                           ;; Create tag associations with specific positions
                           :model/TransformTransformTag
                           {}
                           {:transform_id transform-id
                            :tag_id hourly-tag-id
                            :position 0}

                           :model/TransformTransformTag
                           {}
                           {:transform_id transform-id
                            :tag_id custom-tag-id
                            :position 1}

                           :model/TransformTransformTag
                           {}
                           {:transform_id transform-id
                            :tag_id daily-tag-id
                            :position 2}]

          (let [ser (serdes/extract-one "Transform" {} (t2/hydrate (t2/select-one :model/Transform :id transform-id) :tags))]
            (testing "basic Transform structure"
              (is (=? {:serdes/meta [{:model "Transform"
                                      :id transform-eid}]
                       :name "Test Transform"
                       :description "A test transform for serialization"
                       :created_at string?}
                      ser))
              (is (not (contains? ser :id))))

            (testing "source and target MBQL export"
              (is (=? {:source {:query {:database "My Database" :type :query :query {:source-table ["My Database" nil "Schemaless Table"]}}}
                       :target {:database "My Database" :type "table" :schema "public" :name "target_table"}}
                      (select-keys ser [:source :target]))))

            (testing "tag associations with preserved order"
              (is (= 3 (count (:tags ser))))
              (let [tag-ids (map :tag_id (:tags ser))
                    positions (map :position (:tags ser))]
                (is (= [hourly-tag-eid custom-tag-eid daily-tag-eid] tag-ids))
                (is (= [0 1 2] positions))))

            (testing "dependencies include collection, source table, and tags"
              (let [deps (set (serdes/dependencies ser))]
                (is (contains? deps [{:model "Collection" :id coll-eid}]))
                (is (contains? deps [{:model "Database" :id "My Database"}
                                     {:model "Table" :id "Schemaless Table"}]))
                (is (contains? deps [{:model "TransformTag" :id hourly-tag-eid}]))
                (is (contains? deps [{:model "TransformTag" :id custom-tag-eid}]))
                (is (contains? deps [{:model "TransformTag" :id daily-tag-eid}])))))

          (testing "transform is extracted"
            (is (= #{transform-eid}
                   (ids-by-model "Transform" (extract/extract {}))))))))))

(deftest transform-job-extraction-test
  (testing "TransformJob extraction and serialization"
    (mt/with-premium-features #{:transforms}
      (mt/with-empty-h2-app-db!
        ;; Delete the existing built-in transform tags and jobs
        (t2/delete! :model/TransformTag)
        (t2/delete! :model/TransformJob)
        (ts/with-temp-dpc [;; Create tags for job associations
                           :model/TransformTag
                           {hourly-tag-id :id
                            hourly-tag-eid :entity_id}
                           {:name "hourly" :built_in_type "hourly"}

                           :model/TransformTag
                           {daily-tag-id :id
                            daily-tag-eid :entity_id}
                           {:name "daily" :built_in_type "daily"}

                           :model/TransformTag
                           {custom-tag-id :id
                            custom-tag-eid :entity_id}
                           {:name "custom-etl"}

                           ;; Create built-in TransformJob
                           :model/TransformJob
                           {hourly-job-id :id
                            hourly-job-eid :entity_id}
                           {:name "Hourly job"
                            :description "Executes transforms tagged with 'hourly' every hour"
                            :schedule "0 0 * * * ? *"
                            :built_in_type "hourly"}

                           ;; Create custom TransformJob
                           :model/TransformJob
                           {custom-job-id :id
                            custom-job-eid :entity_id}
                           {:name "Custom ETL Job"
                            :description "Custom data processing job"
                            :schedule "0 0 2 * * ? *"}

                           ;; Create job-tag associations
                           :model/TransformJobTransformTag
                           {}
                           {:job_id hourly-job-id
                            :tag_id hourly-tag-id
                            :position 0}

                           :model/TransformJobTransformTag
                           {}
                           {:job_id custom-job-id
                            :tag_id custom-tag-id
                            :position 0}

                           :model/TransformJobTransformTag
                           {}
                           {:job_id custom-job-id
                            :tag_id daily-tag-id
                            :position 1}]

          (testing "built-in job extracts correctly"
            (let [ser (serdes/extract-one "TransformJob" {} (t2/hydrate (t2/select-one :model/TransformJob :id hourly-job-id) :job_tags))]
              (is (=? {:serdes/meta [{:model "TransformJob"
                                      :id hourly-job-eid}]
                       :name "Hourly job"
                       :description "Executes transforms tagged with 'hourly' every hour"
                       :schedule "0 0 * * * ? *"
                       :built_in_type "hourly"
                       :created_at string?}
                      ser))
              (is (not (contains? ser :id)))
              (testing "job has associated tags"
                (is (= 1 (count (:job_tags ser))))
                (is (= hourly-tag-eid (-> ser :job_tags first :tag_id)))
                (is (= 0 (-> ser :job_tags first :position))))
              (testing "dependencies include referenced tags"
                (is (= #{[{:model "TransformTag" :id hourly-tag-eid}]}
                       (set (serdes/dependencies ser)))))))

          (testing "custom job extracts correctly"
            (let [ser (serdes/extract-one "TransformJob" {} (t2/hydrate (t2/select-one :model/TransformJob :id custom-job-id) :job_tags))]
              (is (=? {:serdes/meta [{:model "TransformJob"
                                      :id custom-job-eid}]
                       :name "Custom ETL Job"
                       :description "Custom data processing job"
                       :schedule "0 0 2 * * ? *"
                       :built_in_type nil
                       :created_at string?}
                      ser))
              (is (not (contains? ser :id)))
              (testing "job has multiple associated tags in correct order"
                (is (= 2 (count (:job_tags ser))))
                (let [tag-ids (map :tag_id (:job_tags ser))
                      positions (map :position (:job_tags ser))]
                  (is (= [custom-tag-eid daily-tag-eid] tag-ids))
                  (is (= [0 1] positions))))
              (testing "dependencies include all referenced tags"
                (is (= #{[{:model "TransformTag" :id custom-tag-eid}]
                         [{:model "TransformTag" :id daily-tag-eid}]}
                       (set (serdes/dependencies ser)))))))

          (testing "all transform jobs are extracted"
            (is (= #{hourly-job-eid custom-job-eid}
                   (ids-by-model "TransformJob" (extract/extract {}))))))))))

(deftest collection-export-includes-published-tables-test
  (testing "Exporting a collection includes published tables without requiring data_model flag"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Database   {db-id :id}   {:name "My Database"}
                         :model/Collection {coll-id :id} {:name "Export Collection"}
                         :model/Table      _             {:name          "Published Table"
                                                          :db_id         db-id
                                                          :is_published  true
                                                          :collection_id coll-id}
                         :model/Table      _             {:name          "Unpublished Table"
                                                          :db_id         db-id
                                                          :is_published  false}
                         :model/Table      _             {:name          "Other Table"
                                                          :db_id         db-id
                                                          :is_published  true
                                                          :collection_id nil}]
        (let [opts        {:targets       [["Collection" coll-id]]
                           :no-data-model true
                           :no-settings   true}
              extracted   (into [] (extract/extract opts))
              table-names (->> extracted
                               (filter #(= "Table" (-> % :serdes/meta last :model)))
                               (map :name)
                               set)]
          (testing "published table in target collection is exported"
            (is (contains? table-names "Published Table")))
          (testing "unpublished table is not exported"
            (is (not (contains? table-names "Unpublished Table"))))
          (testing "published table in other collection is not exported"
            (is (not (contains? table-names "Other Table"))))
          (testing "database is not exported (no-data-model: true)"
            (is (empty? (filter #(= "Database" (-> % :serdes/meta last :model)) extracted)))))))))

(deftest collection-export-includes-fields-and-segments-test
  (testing "Exporting a collection with published tables includes their Fields and Segments"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Database   {db-id :id}          {:name "My Database"}
                         :model/Collection {coll-id :id}        {:name "Export Collection"}
                         :model/Table      {table-id :id}       {:name          "Published Table"
                                                                 :db_id         db-id
                                                                 :is_published  true
                                                                 :collection_id coll-id}
                         :model/Field      {field1-id :id}      {:name      "Field One"
                                                                 :table_id  table-id
                                                                 :base_type :type/Integer}
                         :model/Field      {field2-id :id}      {:name      "Field Two"
                                                                 :table_id  table-id
                                                                 :base_type :type/Text}
                         :model/Segment    {segment-id :id}     {:name       "Test Segment"
                                                                 :table_id   table-id
                                                                 :definition {}}
                         ;; Create another table with fields that should NOT be exported
                         :model/Table      {other-table-id :id} {:name          "Other Table"
                                                                 :db_id         db-id
                                                                 :is_published  false}
                         :model/Field      _                    {:name      "Other Field"
                                                                 :table_id  other-table-id
                                                                 :base_type :type/Integer}]
        (let [opts        {:targets       [["Collection" coll-id]]
                           :no-data-model true
                           :no-settings   true}
              extracted   (into [] (extract/extract opts))
              field-ids   (->> extracted
                               (filter #(= "Field" (-> % :serdes/meta last :model)))
                               (map #(t2/select-one-pk :model/Field
                                                       :table_id (t2/select-one-pk :model/Table :name (-> % :serdes/meta butlast last :id))
                                                       :name (-> % :serdes/meta last :id)))
                               set)
              segment-ids (->> extracted
                               (filter #(= "Segment" (-> % :serdes/meta last :model)))
                               (map #(:id (t2/select-one :model/Segment :entity_id (:entity_id %))))
                               set)]
          (testing "fields from published table are exported"
            (is (contains? field-ids field1-id))
            (is (contains? field-ids field2-id)))
          (testing "segments from published table are exported"
            (is (contains? segment-ids segment-id)))
          (testing "fields from non-published table are NOT exported"
            (is (= 2 (count field-ids)))))))))

(deftest python-library-test
  (mt/with-empty-h2-app-db!
    ;; Delete any pre-existing python_library entries from migrations
    (t2/delete! :model/PythonLibrary)
    (ts/with-temp-dpc [:model/PythonLibrary {lib-id :id lib-entity-id :entity_id} {:path   "common"
                                                                                   :source "def helper():\n    return 42"}]
      (testing "python library extraction"
        (let [ser (serdes/extract-one "PythonLibrary" {} (t2/select-one :model/PythonLibrary :id lib-id))]
          (is (=? {:serdes/meta [{:model "PythonLibrary"
                                  :id    lib-entity-id}]
                   :path        "common.py"
                   :source      "def helper():\n    return 42"
                   :entity_id   lib-entity-id
                   :created_at  string?}
                  ser))
          (is (not (contains? ser :id)))

          (testing "has no dependencies"
            (is (empty? (serdes/dependencies ser)))))))))
