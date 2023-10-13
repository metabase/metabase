(ns ^:mb/once metabase-enterprise.serialization.v2.extract-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase.models
    :refer [Action
            Card
            Collection
            Dashboard
            DashboardCard
            Database
            Dimension
            Field
            FieldValues
            Metric
            NativeQuerySnippet
            Pulse
            PulseCard
            Segment
            Table
            Timeline
            TimelineEvent
            User]]
   [metabase.models.action :as action]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import [java.time LocalDateTime OffsetDateTime]))

(defn- by-model [model-name extraction]
  (->> extraction
       (into [])
       (map (comp last :serdes/meta))
       (filter #(= model-name (:model %)))
       (map :id)
       set))

(deftest fundamentals-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [Collection [{coll-id    :id
                                    coll-eid   :entity_id
                                    coll-slug  :slug}      {:name "Some Collection"}]
                       Collection [{child-id   :id
                                    child-eid  :entity_id
                                    child-slug :slug}      {:name "Nested Collection"
                                                            :location (format "/%s/" coll-id)}]

                       User       [{mark-id :id} {:first_name "Mark"
                                                  :last_name  "Knopfler"
                                                  :email      "mark@direstrai.ts"}]
                       Collection [{pc-id   :id
                                    pc-eid  :entity_id
                                    pc-slug :slug}     {:name "Mark's Personal Collection"
                                                        :personal_owner_id mark-id}]]

      (testing "a top-level collection is extracted correctly"
        (let [ser (serdes/extract-one "Collection" {} (t2/select-one 'Collection :id coll-id))]
          (is (schema= {:serdes/meta       (s/eq [{:model "Collection" :id coll-eid :label coll-slug}])
                        :personal_owner_id (s/eq nil)
                        :parent_id         (s/eq nil)
                        s/Keyword          s/Any}
                       ser))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))))

      (testing "a nested collection is extracted with the right parent_id"
        (let [ser (serdes/extract-one "Collection" {} (t2/select-one 'Collection :id child-id))]
          (is (schema= {:serdes/meta       (s/eq [{:model "Collection" :id child-eid :label child-slug}])
                        :personal_owner_id (s/eq nil)
                        :parent_id         (s/eq coll-eid)
                        s/Keyword          s/Any}
                       ser))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))))

      (testing "personal collections are extracted with email as key"
        (let [ser (serdes/extract-one "Collection" {} (t2/select-one 'Collection :id pc-id))]
          (is (schema= {:serdes/meta       (s/eq [{:model "Collection" :id pc-eid :label pc-slug}])
                        :parent_id         (s/eq nil)
                        :personal_owner_id (s/eq "mark@direstrai.ts")
                        s/Keyword          s/Any}
                       ser))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))))

      (testing "overall extraction returns the expected set"
        (testing "no user specified"
          (is (= #{coll-eid child-eid}
                 (by-model "Collection" (extract/extract nil)))))

        (testing "valid user specified"
          (is (= #{coll-eid child-eid pc-eid}
                 (by-model "Collection" (extract/extract {:user-id mark-id})))))

        (testing "invalid user specified"
          (is (= #{coll-eid child-eid}
                 (by-model "Collection" (extract/extract {:user-id 218921})))))))))

(deftest database-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [Database   [_ {:name "My Database"}]]
      (testing "without :include-database-secrets"
        (let [extracted (extract/extract {})
              dbs       (filter #(= "Database" (:model (last (serdes/path %)))) extracted)]
          (is (= 1 (count dbs)))
          (is (not-any? :details dbs))))
      (testing "with :include-database-secrets"
        (let [extracted (extract/extract {:include-database-secrets true})
              dbs       (filter #(= "Database" (:model (last (serdes/path %)))) extracted)]
          (is (= 1 (count dbs)))
          (is (every? :details dbs)))))))

(deftest dashboard-and-cards-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [Collection [{coll-id    :id
                                    coll-eid   :entity_id}    {:name "Some Collection"}]
                       User       [{mark-id :id}              {:first_name "Mark"
                                                               :last_name  "Knopfler"
                                                               :email      "mark@direstrai.ts"}]
                       User       [{dave-id :id}              {:first_name "David"
                                                               :last_name  "Knopfler"
                                                               :email      "david@direstrai.ts"}]
                       Collection [{mark-coll-eid :entity_id} {:name "MK Personal"
                                                               :personal_owner_id mark-id}]
                       Collection [{dave-coll-id  :id
                                    dave-coll-eid :entity_id} {:name "DK Personal"
                                                               :personal_owner_id dave-id}]

                       Database   [{db-id      :id}           {:name "My Database"}]
                       Table      [{no-schema-id :id}         {:name "Schemaless Table" :db_id db-id}]
                       Field      [{field-id     :id}         {:name "Some Field" :table_id no-schema-id}]
                       Table      [{schema-id    :id}         {:name        "Schema'd Table"
                                                               :db_id       db-id
                                                               :schema      "PUBLIC"}]
                       Field      [{field2-id    :id}         {:name "Other Field" :table_id schema-id}]
                       Card       [{c1-id  :id
                                    c1-eid :entity_id}        {:name          "Some Question"
                                                               :database_id   db-id
                                                               :table_id      no-schema-id
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :dataset_query {:query {:source-table no-schema-id
                                                                                       :filter [:>= [:field field-id nil] 18]
                                                                                       :aggregation [[:count]]}
                                                                               :database db-id}}]
                       Card       [{model-id  :id}            {:name          "Some Model"
                                                               :database_id   db-id
                                                               :table_id      no-schema-id
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :dataset       true
                                                               :dataset_query {:query {:source-table no-schema-id
                                                                                       :filter [:>= [:field field-id nil] 18]
                                                                                       :aggregation [[:count]]}
                                                                               :database db-id}}]
                       Card       [{c2-id  :id
                                    c2-eid :entity_id}        {:name          "Second Question"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :parameter_mappings
                                                               [{:parameter_id "deadbeef"
                                                                 :card_id      c1-id
                                                                 :target [:dimension [:field field-id
                                                                                      {:source-field field2-id}]]}]}]
                       Card       [{c3-id  :id
                                    c3-eid :entity_id}        {:name          "Third Question"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :visualization_settings
                                                               {:table.pivot_column "SOURCE"
                                                                :table.cell_column "sum"
                                                                :table.columns
                                                                [{:name "SOME_FIELD"
                                                                  :fieldRef [:field field-id nil]
                                                                  :enabled true}
                                                                 {:name "OTHER_FIELD"
                                                                  :fieldRef [:field field2-id nil]
                                                                  :enabled true}
                                                                 {:name "sum"
                                                                  :fieldRef [:field "sum" {:base-type :type/Float}]
                                                                  :enabled true}
                                                                 {:name "count"
                                                                  :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                                                  :enabled true}
                                                                 {:name "Average order total"
                                                                  :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                                                  :enabled true}]
                                                                :column_settings
                                                                {(str "[\"ref\",[\"field\"," field2-id ",null]]") {:column_title "Locus"}}}}]

                       Card       [{c4-id  :id
                                    c4-eid :entity_id}        {:name          "Referenced Question"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :dataset_query
                                                               {:query {:source-table no-schema-id
                                                                        :filter [:>= [:field field-id nil] 18]}
                                                                :database db-id}}]
                       Card       [{c5-id  :id
                                    c5-eid :entity_id}        {:name          "Dependent Question"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :dataset_query
                                                               {:query {:source-table (str "card__" c4-id)
                                                                        :aggregation [[:count]]}
                                                                :database db-id}}]

                       Action     [{action-id    :id
                                    action-eid   :entity_id}  {:name "Some action"
                                                               :type :query
                                                               :model_id model-id}]

                       Dashboard  [{dash-id  :id
                                    dash-eid :entity_id}      {:name          "Shared Dashboard"
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :parameters    []}]
                       Dashboard  [{other-dash-id :id
                                    other-dash    :entity_id} {:name          "Dave's Dash"
                                                               :collection_id dave-coll-id
                                                               :creator_id    mark-id
                                                               :parameters    []}]
                       Dashboard  [{param-dash-id :id
                                    param-dash    :entity_id} {:name          "Dave's Dash with parameters"
                                                               :collection_id dave-coll-id
                                                               :creator_id    mark-id
                                                               :parameters    [{:id                   "abc"
                                                                                :type                 "category"
                                                                                :name                 "CATEGORY"
                                                                                :values_source_type   "card"
                                                                                ;; card_id is in a different collection with dashboard's collection
                                                                                :values_source_config {:card_id     c1-id
                                                                                                       :value_field [:field field-id nil]}}]}]

                       DashboardCard [_                       {:card_id      c1-id
                                                               :dashboard_id dash-id
                                                               :parameter_mappings
                                                               [{:parameter_id "12345678"
                                                                 :card_id      c1-id
                                                                 :target [:dimension [:field field-id
                                                                                      {:source-field field2-id}]]}]}]
                       DashboardCard [_                       {:card_id      c2-id
                                                               :dashboard_id other-dash-id
                                                               :visualization_settings
                                                               {:table.pivot_column "SOURCE"
                                                                :table.cell_column "sum"
                                                                :table.columns
                                                                [{:name "SOME_FIELD"
                                                                  :fieldRef [:field field-id nil]
                                                                  :enabled true}
                                                                 {:name "sum"
                                                                  :fieldRef [:field "sum" {:base-type :type/Float}]
                                                                  :enabled true}
                                                                 {:name "count"
                                                                  :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                                                  :enabled true}
                                                                 {:name "Average order total"
                                                                  :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                                                  :enabled true}]
                                                                :column_settings
                                                                {(str "[\"ref\",[\"field\"," field2-id ",null]]") {:column_title "Locus"}}}}]
                       DashboardCard [_                       {:action_id action-id
                                                               :dashboard_id other-dash-id}]]
      (testing "table and database are extracted as [db schema table] triples"
        (let [ser (serdes/extract-one "Card" {} (t2/select-one 'Card :id c1-id))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Card" :id c1-eid :label "some_question"}])
                        :table_id                    (s/eq ["My Database" nil "Schemaless Table"])
                        :creator_id                  (s/eq "mark@direstrai.ts")
                        :collection_id               (s/eq coll-eid)
                        :dataset_query               (s/eq {:query {:source-table ["My Database" nil "Schemaless Table"]
                                                                    :filter [:>= [:field ["My Database" nil "Schemaless Table" "Some Field"] nil] 18]
                                                                    :aggregation [[:count]]}
                                                            :database "My Database"})
                        :created_at                  LocalDateTime
                        s/Keyword                    s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Table and Collection, and also anything referenced in the query"
            (is (= #{[{:model "Database"   :id "My Database"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]
                     [{:model "Collection" :id coll-eid}]}
                   (set (serdes/dependencies ser))))))

        (let [ser (serdes/extract-one "Card" {} (t2/select-one 'Card :id c2-id))]
          (is (schema= {:serdes/meta         (s/eq [{:model "Card" :id c2-eid :label "second_question"}])
                        :table_id            (s/eq ["My Database" "PUBLIC" "Schema'd Table"])
                        :creator_id          (s/eq "mark@direstrai.ts")
                        :collection_id       (s/eq coll-eid)
                        :dataset_query       (s/eq {})
                        :parameter_mappings  (s/eq [{:parameter_id "deadbeef"
                                                     :card_id      c1-eid
                                                     :target [:dimension [:field ["My Database" nil "Schemaless Table" "Some Field"]
                                                                          {:source-field ["My Database" "PUBLIC" "Schema'd Table" "Other Field"]}]]}])
                        :created_at          LocalDateTime
                        s/Keyword            s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Database, Table and Collection, and any fields in their parameter_mappings"
            (is (= #{[{:model "Database"   :id "My Database"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}]
                     [{:model "Collection" :id coll-eid}]
                     [{:model "Card"       :id c1-eid}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}
                      {:model "Field"      :id "Other Field"}]}
                   (set (serdes/dependencies ser))))))

        (let [ser (serdes/extract-one "Card" {} (t2/select-one 'Card :id c3-id))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Card" :id c3-eid :label "third_question"}])
                        :table_id                    (s/eq ["My Database" "PUBLIC" "Schema'd Table"])
                        :creator_id                  (s/eq "mark@direstrai.ts")
                        :collection_id               (s/eq coll-eid)
                        :dataset_query               (s/eq {})
                        :visualization_settings
                        (s/eq {:table.pivot_column "SOURCE"
                               :table.cell_column "sum"
                               :table.columns
                               [{:name "SOME_FIELD"
                                 :fieldRef [:field ["My Database" nil "Schemaless Table" "Some Field"] nil]
                                 :enabled true}
                                {:name "OTHER_FIELD"
                                 :fieldRef [:field ["My Database" "PUBLIC" "Schema'd Table" "Other Field"] nil]
                                 :enabled true}
                                {:name "sum"
                                 :fieldRef [:field "sum" {:base-type :type/Float}]
                                 :enabled true}
                                {:name "count"
                                 :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                 :enabled true}
                                {:name "Average order total"
                                 :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                 :enabled true}]
                               :column_settings
                               {"[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Other Field\"],null]]" {:column_title "Locus"}}})
                        :created_at    LocalDateTime
                        s/Keyword      s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Database, Table and Collection, and any fields in their visualization_settings"
            (is (= #{[{:model "Database"   :id "My Database"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}]
                     [{:model "Collection" :id coll-eid}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}
                      {:model "Field"      :id "Other Field"}]}
                   (set (serdes/dependencies ser)))))))

      (testing "Cards can be based on other cards"
        (let [ser (serdes/extract-one "Card" {} (t2/select-one 'Card :id c5-id))]
          (is (schema= {:serdes/meta    (s/eq [{:model "Card" :id c5-eid :label "dependent_question"}])
                        :table_id       (s/eq ["My Database" "PUBLIC" "Schema'd Table"])
                        :creator_id     (s/eq "mark@direstrai.ts")
                        :collection_id  (s/eq coll-eid)
                        :dataset_query  (s/eq {:query    {:source-table c4-eid
                                                          :aggregation [[:count]]}
                                               :database "My Database"})
                        :created_at     LocalDateTime
                        s/Keyword       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "and depend on their Database, Table and Collection, and the upstream Card"
            (is (= #{[{:model "Database"   :id "My Database"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}]
                     [{:model "Collection" :id coll-eid}]
                     [{:model "Card"       :id c4-eid}]}
                   (set (serdes/dependencies ser)))))))

      (testing "Dashboards include their Dashcards"
        (let [ser (serdes/extract-one "Dashboard" {} (t2/select-one 'Dashboard :id other-dash-id))]
          (is (=? {:serdes/meta            [{:model "Dashboard" :id other-dash :label "dave_s_dash"}]
                   :entity_id              other-dash
                   :ordered_cards
                   [{:visualization_settings {:table.pivot_column "SOURCE"
                                              :table.cell_column "sum"
                                              :table.columns
                                              [{:name "SOME_FIELD"
                                                :fieldRef [:field ["My Database" nil "Schemaless Table" "Some Field"] nil]
                                                :enabled true}
                                               {:name "sum"
                                                :fieldRef [:field "sum" {:base-type :type/Float}]
                                                :enabled true}
                                               {:name "count"
                                                :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                                :enabled true}
                                               {:name "Average order total"
                                                :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                                :enabled true}]
                                              :column_settings
                                              {"[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Other Field\"],null]]" {:column_title "Locus"}}}
                     :created_at             LocalDateTime}
                    {:action_id action-eid}]
                   :created_at             LocalDateTime}
                  ser))
          (is (not (contains? ser :id)))

          (testing "and depend on all referenced cards and actions, including those in visualization_settings"
            (is (= #{[{:model "Card"       :id c2-eid}]
                     [{:model "Action"     :id action-eid}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}
                      {:model "Field"      :id "Other Field"}]
                     [{:model "Collection" :id dave-coll-eid}]}
                   (set (serdes/dependencies ser)))))))

     (testing "Dashboards with parameters where the source is a card"
       (let [ser (serdes/extract-one "Dashboard" {} (t2/select-one 'Dashboard :id param-dash-id))]
         (is (schema= {:parameters
                        (s/eq [{:id                   "abc"
                                :name                 "CATEGORY"
                                :type                 :category
                                :values_source_config {:card_id     c1-eid
                                                       :value_field [:field
                                                                     ["My Database" nil "Schemaless Table" "Some Field"]
                                                                     nil]},
                                :values_source_type "card"}])
                        s/Keyword s/Any}
               ser))
         (is (= #{[{:model "Collection" :id dave-coll-eid}]
                  [{:model "Card"       :id c1-eid}]
                  [{:model "Database", :id "My Database"}
                   {:model "Table",    :id "Schemaless Table"}
                   {:model "Field",    :id "Some Field"}]}
                (set (serdes/dependencies ser))))))

     (testing "Cards with parameters where the source is a card"
       (let [ser (serdes/extract-one "Dashboard" {} (t2/select-one 'Dashboard :id param-dash-id))]
         (is (schema= {:parameters
                       (s/eq [{:id                   "abc"
                               :name                 "CATEGORY"
                               :type                 :category
                               :values_source_config {:card_id     c1-eid
                                                      :value_field [:field
                                                                    ["My Database" nil "Schemaless Table" "Some Field"]
                                                                    nil]},
                               :values_source_type "card"}])
                       s/Keyword s/Any}
                      ser))
         (is (= #{[{:model "Collection" :id dave-coll-eid}]
                  [{:model "Card"       :id c1-eid}]
                  [{:model "Database", :id "My Database"}
                   {:model "Table",    :id "Schemaless Table"}
                   {:model "Field",    :id "Some Field"}]}
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
                     (by-model "Collection"))))
         (is (= #{coll-eid dave-coll-eid}
                (->> {:collection-set (#'extract/collection-set-for-user dave-id)}
                     (serdes/extract-all "Collection")
                     (by-model "Collection"))))))

     (testing "dashboards are filtered based on :user"
       (testing "dashboards in unowned collections are always returned"
         (is (= #{dash-eid}
                (->> {:collection-set #{coll-id}}
                     (serdes/extract-all "Dashboard")
                     (by-model "Dashboard"))))
         (is (= #{dash-eid}
                (->> {:collection-set (#'extract/collection-set-for-user mark-id)}
                     (serdes/extract-all "Dashboard")
                     (by-model "Dashboard")))))
       (testing "dashboards in personal collections are returned for the :user"
         (is (= #{dash-eid other-dash param-dash}
                (->> {:collection-set (#'extract/collection-set-for-user dave-id)}
                     (serdes/extract-all "Dashboard")
                     (by-model "Dashboard")))))))))

(deftest dimensions-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [;; Simple case: a singular field, no human-readable field.
                       Database   [{db-id        :id}        {:name "My Database"}]
                       Table      [{no-schema-id :id}        {:name "Schemaless Table" :db_id db-id}]
                       Field      [{email-id     :id}        {:name "email" :table_id no-schema-id}]
                       Dimension  [{dim1-eid     :entity_id} {:name       "Vanilla Dimension"
                                                              :field_id   email-id
                                                              :type       "internal"
                                                              :created_at (t/minus (t/offset-date-time)
                                                                                   (t/days 3))}]
                       ;; Advanced case: Dimension capturing a foreign relationship.
                       ;; The parent field (Orders.customer_id) is the foreign key.
                       ;; Dimension.field_id (Customers.id) is the foreign ID field;
                       ;; Dimension.human_readable_field_id (Customers.name) is what we want to render.
                       Table      [{customers    :id}        {:name        "Customers"
                                                              :db_id       db-id
                                                              :schema      "PUBLIC"}]
                       Field      [{cust-id      :id}        {:name "id" :table_id customers}]
                       Field      [{cust-name    :id}        {:name "name" :table_id customers}]
                       Table      [{orders       :id}        {:name        "Orders"
                                                              :db_id       db-id
                                                              :schema      "PUBLIC"}]
                       Field      [{fk-id        :id}        {:name     "customer_id"
                                                              :table_id orders
                                                              :fk_target_field_id cust-id}]
                       Dimension  [_                         {:name     "Customer Name"
                                                              :type     "external"
                                                              :field_id fk-id
                                                              :human_readable_field_id cust-name}]]
      (testing "dimensions without foreign keys are inlined into their Fields"
        (let [ser (serdes/extract-one "Field" {} (t2/select-one Field :id email-id))]
          (is (schema= {:serdes/meta   (s/eq [{:model "Database" :id "My Database"}
                                              {:model "Table"    :id "Schemaless Table"}
                                              {:model "Field"    :id "email"}])
                        :dimensions    [{(s/optional-key :human_readable_field_id) [(s/maybe s/Str)]
                                         :created_at                               LocalDateTime
                                         s/Keyword                                 s/Any}]
                        s/Keyword      s/Any}
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
        (let [ser (serdes/extract-one "Field" {} (t2/select-one Field :id fk-id))]
          (is (schema= {:serdes/meta        (s/eq [{:model "Database" :id "My Database"}
                                                   {:model "Schema"   :id "PUBLIC"}
                                                   {:model "Table"    :id "Orders"}
                                                   {:model "Field"    :id "customer_id"}])
                        :name               (s/eq "customer_id")
                        :fk_target_field_id (s/eq ["My Database" "PUBLIC" "Customers" "id"])
                        :dimensions         [{:human_readable_field_id [s/Str]
                                              :created_at              LocalDateTime
                                              s/Keyword                s/Any}]
                        s/Keyword           s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "dimensions are properly inlined"
            (is (schema= [{:human_readable_field_id (s/eq ["My Database" "PUBLIC" "Customers" "name"])
                           :created_at              LocalDateTime
                           s/Keyword                s/Any}]
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

(deftest metrics-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User       [{ann-id       :id}        {:first_name "Ann"
                                                              :last_name  "Wilson"
                                                              :email      "ann@heart.band"}]
                       Database   [{db-id        :id}        {:name "My Database"}]
                       Table      [{no-schema-id :id}        {:name "Schemaless Table" :db_id db-id}]
                       Field      [{field-id     :id}        {:name "Some Field" :table_id no-schema-id}]
                       Metric     [{m1-id        :id
                                    m1-eid       :entity_id} {:name       "My Metric"
                                                              :creator_id ann-id
                                                              :table_id   no-schema-id
                                                              :definition
                                                              {:source-table no-schema-id
                                                               :aggregation [[:sum [:field field-id nil]]]}}]]
      (testing "metrics"
        (let [ser (serdes/extract-one "Metric" {} (t2/select-one 'Metric :id m1-id))]
          (is (schema= {:serdes/meta (s/eq [{:model "Metric" :id m1-eid :label "my_metric"}])
                        :table_id    (s/eq ["My Database" nil "Schemaless Table"])
                        :creator_id  (s/eq "ann@heart.band")
                        :definition  (s/eq {:source-table ["My Database" nil "Schemaless Table"]
                                            :aggregation
                                            [[:sum [:field ["My Database" nil
                                                            "Schemaless Table" "Some Field"] nil]]]})
                        :created_at  LocalDateTime
                        s/Keyword    s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depend on the Table and any fields referenced in :definition"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]}
                   (set (serdes/dependencies ser))))))))))

(deftest native-query-snippets-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User               [{ann-id       :id}        {:first_name "Ann"
                                                                      :last_name  "Wilson"
                                                                      :email      "ann@heart.band"}]
                       Collection         [{coll-id     :id
                                            coll-eid    :entity_id}  {:name              "Shared Collection"
                                                                      :personal_owner_id nil
                                                                      :namespace         :snippets}]
                       NativeQuerySnippet [{s1-id       :id
                                            s1-eid      :entity_id}  {:name          "Snippet 1"
                                                                      :collection_id coll-id
                                                                      :creator_id    ann-id}]
                       NativeQuerySnippet [{s2-id       :id
                                            s2-eid      :entity_id}  {:name          "Snippet 2"
                                                                      :collection_id nil
                                                                      :creator_id    ann-id}]]
      (testing "native query snippets"
        (testing "can belong to :snippets collections"
          (let [ser (serdes/extract-one "NativeQuerySnippet" {} (t2/select-one 'NativeQuerySnippet :id s1-id))]
            (is (schema= {:serdes/meta   (s/eq [{:model "NativeQuerySnippet"
                                                 :id s1-eid
                                                 :label "snippet_1"}])
                          :collection_id (s/eq coll-eid)
                          :creator_id    (s/eq "ann@heart.band")
                          :created_at    OffsetDateTime
                          s/Keyword      s/Any}
                         ser))
            (is (not (contains? ser :id)))

            (testing "and depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes/dependencies ser)))))))

        (testing "or can be outside collections"
          (let [ser (serdes/extract-one "NativeQuerySnippet" {} (t2/select-one 'NativeQuerySnippet :id s2-id))]
            (is (schema= {:serdes/meta                    (s/eq [{:model "NativeQuerySnippet"
                                                                  :id s2-eid
                                                                  :label "snippet_2"}])
                          (s/optional-key :collection_id) (s/eq nil)
                          :creator_id                     (s/eq "ann@heart.band")
                          :created_at                     OffsetDateTime
                          s/Keyword                       s/Any}
                         ser))
            (is (not (contains? ser :id)))

            (testing "and has no deps"
              (is (empty? (serdes/dependencies ser))))))))))

(deftest timelines-and-events-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User               [{ann-id       :id}        {:first_name "Ann"
                                                                      :last_name  "Wilson"
                                                                      :email      "ann@heart.band"}]
                       Collection         [{coll-id     :id
                                            coll-eid    :entity_id}  {:name              "Shared Collection"
                                                                      :personal_owner_id nil}]
                       Timeline           [{empty-id    :id
                                            empty-eid   :entity_id}  {:name          "Empty Timeline"
                                                                      :collection_id coll-id
                                                                      :creator_id    ann-id}]
                       Timeline           [{line-id     :id
                                            line-eid    :entity_id}  {:name          "Populated Timeline"
                                                                      :collection_id coll-id
                                                                      :creator_id    ann-id}]
                       TimelineEvent      [_                         {:name          "First Event"
                                                                      :creator_id    ann-id
                                                                      :timestamp     #t "2020-04-11T00:00Z"
                                                                      :timeline_id   line-id}]]
      (testing "timelines"
        (testing "with no events"
          (let [ser (serdes/extract-one "Timeline" {} (t2/select-one 'Timeline :id empty-id))]
            (is (schema= {:serdes/meta   (s/eq [{:model "Timeline" :id empty-eid :label "empty_timeline"}])
                          :collection_id (s/eq coll-eid)
                          :creator_id    (s/eq "ann@heart.band")
                          :created_at    OffsetDateTime
                          s/Keyword      s/Any}
                         ser))
            (is (not (contains? ser :id)))

            (testing "depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes/dependencies ser)))))))

        (testing "with events"
          (let [ser   (serdes/extract-one "Timeline" {} (t2/select-one 'Timeline :id line-id))
                stamp "2020-04-11T00:00:00Z"]
            (is (schema= {:serdes/meta   (s/eq [{:model "Timeline" :id line-eid :label "populated_timeline"}])
                          :collection_id (s/eq coll-eid)
                          :creator_id    (s/eq "ann@heart.band")
                          :created_at    OffsetDateTime
                          :events        [{:timestamp   (s/eq stamp)
                                           :creator_id  (s/eq "ann@heart.band")
                                           :created_at  OffsetDateTime
                                           s/Keyword    s/Any}]
                          s/Keyword      s/Any}
                         ser))
            (is (not (contains? ser :id)))
            (is (not (contains? (-> ser :events first) :id)))

            (testing "depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes/dependencies ser)))))))))))

(deftest segments-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User       [{ann-id       :id}        {:first_name "Ann"
                                                              :last_name  "Wilson"
                                                              :email      "ann@heart.band"}]
                       Database   [{db-id        :id}        {:name "My Database"}]
                       Table      [{no-schema-id :id}        {:name "Schemaless Table" :db_id db-id}]
                       Field      [{field-id     :id}        {:name "Some Field" :table_id no-schema-id}]
                       Segment    [{s1-id        :id
                                    s1-eid       :entity_id} {:name       "My Segment"
                                                              :creator_id ann-id
                                                              :table_id   no-schema-id
                                                              :definition {:source-table no-schema-id
                                                                           :aggregation [[:count]]
                                                                           :filter [:< [:field field-id nil] 18]}}]]
      (testing "segment"
        (let [ser (serdes/extract-one "Segment" {} (t2/select-one 'Segment :id s1-id))]
          (is (schema= {:serdes/meta (s/eq [{:model "Segment" :id s1-eid :label "my_segment"}])
                        :table_id    (s/eq ["My Database" nil "Schemaless Table"])
                        :creator_id  (s/eq "ann@heart.band")
                        :definition  (s/eq {:source-table ["My Database" nil "Schemaless Table"]
                                            :aggregation [[:count]]
                                            :filter [:< [:field ["My Database" nil
                                                                 "Schemaless Table" "Some Field"]
                                                         nil] 18]})
                        :created_at  LocalDateTime
                        s/Keyword    s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depend on the Table and any fields from the definition"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]}
                   (set (serdes/dependencies ser))))))))))

(deftest implicit-action-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User       [{ann-id       :id} {:first_name "Ann"
                                                       :last_name  "Wilson"
                                                       :email      "ann@heart.band"}]
                       Database   [{db-id :id :as db} {:name "My Database"}]]
      (mt/with-db db
        (mt/with-actions [{card-id-1  :id
                           card-eid-1 :entity_id} {:name          "Source question"
                                                   :database_id   db-id
                                                   :dataset       true
                                                   :query_type    :native
                                                   :dataset_query (mt/native-query {:native "select 1"})
                                                   :creator_id    ann-id}
                          {:keys [action-id]} {:name          "My Action"
                                               :type          :implicit
                                               :kind          "row/update"
                                               :creator_id    ann-id
                                               :model_id      card-id-1}]
          (let [action (action/select-action :id action-id)]
            (testing "implicit action"
              (let [ser (serdes/extract-one "Action" {} action)]
                (is (schema= {:serdes/meta (s/eq [{:model "Action" :id (:entity_id action) :label "my_action"}])
                              :creator_id  (s/eq "ann@heart.band")
                              :type        (s/eq "implicit")
                              :kind        (s/eq "row/update")
                              :created_at  OffsetDateTime
                              :model_id    (s/eq card-eid-1)
                              s/Keyword    s/Any}
                             ser))
                (is (not (contains? ser :id)))

                (testing "depends on the Model"
                  (is (= #{[{:model "Card" :id card-eid-1}]}
                         (set (serdes/dependencies ser)))))))))))))

(deftest http-action-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User       [{ann-id       :id} {:first_name "Ann"
                                                       :last_name  "Wilson"
                                                       :email      "ann@heart.band"}]
                       Database   [{db-id :id :as db} {:name "My Database"}]]
      (mt/with-db db
        (mt/with-actions [{card-id-1  :id
                           card-eid-1 :entity_id} {:name          "Source question"
                                                   :database_id   db-id
                                                   :dataset       true
                                                   :query_type    :native
                                                   :dataset_query (mt/native-query {:native "select 1"})
                                                   :creator_id    ann-id}
                          {:keys [action-id]} {:name          "My Action"
                                               :type          :http
                                               :template      {}
                                               :creator_id    ann-id
                                               :model_id      card-id-1}]
          (let [action (action/select-action :id action-id)]
            (testing "action"
              (let [ser (serdes/extract-one "Action" {} action)]
                (is (schema= {:serdes/meta (s/eq [{:model "Action" :id (:entity_id action) :label "my_action"}])
                              :creator_id  (s/eq "ann@heart.band")
                              :type        (s/eq "http")
                              :created_at  OffsetDateTime
                              :template    (s/eq {})
                              :model_id    (s/eq card-eid-1)
                              s/Keyword    s/Any}
                             ser))
                (is (not (contains? ser :id)))

                (testing "depends on the Model"
                  (is (= #{[{:model "Card" :id card-eid-1}]}
                         (set (serdes/dependencies ser)))))))))))))

(deftest query-action-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User       [{ann-id       :id} {:first_name "Ann"
                                                       :last_name  "Wilson"
                                                       :email      "ann@heart.band"}]
                       Database   [{db-id :id :as db} {:name "My Database"}]]
      (mt/with-db db
        (mt/with-actions [{card-id-1  :id
                           card-eid-1 :entity_id} {:name          "Source question"
                                                   :database_id   db-id
                                                   :dataset       true
                                                   :query_type    :native
                                                   :dataset_query (mt/native-query {:native "select 1"})
                                                   :creator_id    ann-id}
                          {:keys [action-id]} {:name          "My Action"
                                               :type          :query
                                               :dataset_query {:type "native", :native {:native "select 1"}, :database db-id}
                                               :database_id   db-id
                                               :creator_id    ann-id
                                               :model_id      card-id-1}]
          (let [action (action/select-action :id action-id)]
            (testing "action"
              (let [ser (serdes/extract-one "Action" {} action)]
                (is (schema= {:serdes/meta   (s/eq [{:model "Action"
                                                     :id    (:entity_id action)
                                                     :label "my_action"}])
                              :type          (s/eq "query")
                              :creator_id    (s/eq "ann@heart.band")
                              :created_at    OffsetDateTime
                              :dataset_query (s/eq {:type "native", :native {:native "select 1"}, :database db-id})
                              :model_id      (s/eq card-eid-1)
                              s/Keyword      s/Any}
                             ser))
                (is (not (contains? ser :id)))

                (testing "depends on the Model and Database"
                  (is (= #{[{:model "Database" :id "My Database"}]
                           [{:model "Card" :id card-eid-1}]}
                         (set (serdes/dependencies ser)))))))))))))

(deftest field-values-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [Database   [{db-id        :id}        {:name "My Database"}]
                       Table      [{no-schema-id :id}        {:name "Schemaless Table" :db_id db-id}]
                       Field      [{field-id     :id}        {:name "Some Field"
                                                              :table_id no-schema-id
                                                              :fingerprint {:global {:distinct-count 75 :nil% 0.0}
                                                                            :type   {:type/Text {:percent-json   0.0
                                                                                                 :percent-url    0.0
                                                                                                 :percent-email  0.0
                                                                                                 :percent-state  0.0
                                                                                                 :average-length 8.333333333333334}}}}]
                       FieldValues [{fv-id       :id
                                     values      :values}
                                    {:field_id              field-id
                                     :hash_key              nil
                                     :has_more_values       false
                                     :type                  :full
                                     :human_readable_values []
                                     :values ["Artisan" "Asian" "BBQ" "Bakery" "Bar" "Brewery" "Burger" "Coffee Shop"
                                              "Diner" "Indian" "Italian" "Japanese" "Mexican" "Middle Eastern" "Pizza"
                                              "Seafood" "Steakhouse" "Tea Room" "Winery"]}]]
      (testing "field values"
        (let [ser (serdes/extract-one "FieldValues" {} (t2/select-one 'FieldValues :id fv-id))]
          (is (schema= {:serdes/meta (s/eq [{:model "Database" :id "My Database"}
                                            {:model "Table"    :id "Schemaless Table"}
                                            {:model "Field"    :id "Some Field"}
                                            {:model "FieldValues" :id "0"}]) ; Always 0.
                        :created_at  LocalDateTime
                        :values      (s/eq values)
                        s/Keyword    s/Any}
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
                 (by-model "FieldValues" (extract/extract {})))))
        (testing "with :include-field-values true"
          (let [models (->> {:include-field-values true} extract/extract (map (comp :model last :serdes/meta)))]
            ;; why 6?
            (is (= 6 (count (filter #{"FieldValues"} models))))))))))

(deftest pulses-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User       [{ann-id       :id}        {:first_name "Ann"
                                                              :last_name  "Wilson"
                                                              :email      "ann@heart.band"}]
                       Collection [{coll-id      :id
                                    coll-eid     :entity_id} {:name "Some Collection"}]
                       Dashboard  [{dash-id      :id
                                    dash-eid     :entity_id} {:name "A Dashboard"}]
                       Pulse      [{p-none-id    :id
                                    p-none-eid   :entity_id} {:name       "Pulse w/o collection or dashboard"
                                                              :creator_id ann-id}]
                       Pulse      [{p-coll-id    :id
                                    p-coll-eid   :entity_id} {:name          "Pulse with only collection"
                                                              :creator_id    ann-id
                                                              :collection_id coll-id}]
                       Pulse      [{p-dash-id    :id
                                    p-dash-eid   :entity_id} {:name         "Pulse with only dashboard"
                                                              :creator_id   ann-id
                                                              :dashboard_id dash-id}]
                       Pulse      [{p-both-id    :id
                                    p-both-eid   :entity_id} {:name          "Pulse with both collection and dashboard"
                                                              :creator_id    ann-id
                                                              :collection_id coll-id
                                                              :dashboard_id  dash-id}]]
      (testing "pulse with neither collection nor dashboard"
        (let [ser (serdes/extract-one "Pulse" {} (t2/select-one 'Pulse :id p-none-id))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse"
                                                                :id    p-none-eid
                                                                :label "pulse_w_o_collection_or_dashboard"}])
                        :creator_id                     (s/eq "ann@heart.band")
                        (s/optional-key :dashboard_id)  (s/eq nil)
                        (s/optional-key :collection_id) (s/eq nil)
                        :created_at                     LocalDateTime
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "has no deps"
            (is (= #{}
                   (set (serdes/dependencies ser)))))))

      (testing "pulse with just collection"
        (let [ser (serdes/extract-one "Pulse" {} (t2/select-one 'Pulse :id p-coll-id))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse"
                                                                :id    p-coll-eid
                                                                :label "pulse_with_only_collection"}])
                        :creator_id                     (s/eq "ann@heart.band")
                        (s/optional-key :dashboard_id)  (s/eq nil)
                        :collection_id                  (s/eq coll-eid)
                        :created_at                     LocalDateTime
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the collection"
            (is (= #{[{:model "Collection" :id coll-eid}]}
                   (set (serdes/dependencies ser)))))))

      (testing "pulse with just dashboard"
        (let [ser (serdes/extract-one "Pulse" {} (t2/select-one 'Pulse :id p-dash-id))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse"
                                                                :id    p-dash-eid
                                                                :label "pulse_with_only_dashboard"}])
                        :creator_id                     (s/eq "ann@heart.band")
                        :dashboard_id                   (s/eq dash-eid)
                        (s/optional-key :collection_id) (s/eq nil)
                        :created_at                     LocalDateTime
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the dashboard"
            (is (= #{[{:model "Dashboard" :id dash-eid}]}
                   (set (serdes/dependencies ser)))))))

      (testing "pulse with both collection and dashboard"
        (let [ser (serdes/extract-one "Pulse" {} (t2/select-one 'Pulse :id p-both-id))]
          (is (schema= {:serdes/meta   (s/eq [{:model "Pulse"
                                               :id    p-both-eid
                                               :label "pulse_with_both_collection_and_dashboard"}])
                        :creator_id    (s/eq "ann@heart.band")
                        :dashboard_id  (s/eq dash-eid)
                        :collection_id (s/eq coll-eid)
                        :created_at    LocalDateTime
                        s/Keyword      s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the collection and dashboard"
            (is (= #{[{:model "Collection" :id coll-eid}]
                     [{:model "Dashboard"  :id dash-eid}]}
                   (set (serdes/dependencies ser))))))))))

(deftest pulse-cards-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User          [{ann-id        :id}        {:first_name "Ann"
                                                                  :last_name  "Wilson"
                                                                  :email      "ann@heart.band"}]
                       Dashboard     [{dash-id       :id
                                       dash-eid      :entity_id} {:name "A Dashboard"}]
                       Database      [{db-id         :id}        {:name "My Database"}]
                       Table         [{table-id      :id}        {:name "Schemaless Table" :db_id db-id}]
                       Card          [{card1-id      :id
                                       card1-eid     :entity_id} {:name          "Some Question"
                                                                  :database_id   db-id
                                                                  :table_id      table-id
                                                                  :creator_id    ann-id
                                                                  :dataset_query "{\"json\": \"string values\"}"}]
                       DashboardCard [{dashcard-id   :id
                                       dashcard-eid  :entity_id} {:card_id       card1-id
                                                                  :dashboard_id  dash-id}]
                       Pulse         [{pulse-id      :id
                                       pulse-eid     :entity_id} {:name       "Legacy Pulse"
                                                                  :creator_id ann-id}]
                       Pulse         [{sub-id        :id
                                       sub-eid       :entity_id} {:name       "Dashboard sub"
                                                                  :creator_id ann-id
                                                                  :dashboard_id dash-id}]
                       PulseCard     [{pc1-pulse-id  :id
                                       pc1-pulse-eid :entity_id} {:pulse_id          pulse-id
                                                                  :card_id           card1-id
                                                                  :position          1}]
                       PulseCard     [{pc2-pulse-id  :id
                                       pc2-pulse-eid :entity_id} {:pulse_id          pulse-id
                                                                  :card_id           card1-id
                                                                  :position          2}]
                       PulseCard     [{pc1-sub-id    :id
                                       pc1-sub-eid   :entity_id} {:pulse_id          sub-id
                                                                  :card_id           card1-id
                                                                  :position          1
                                                                  :dashboard_card_id dashcard-id}]]
      (testing "legacy pulse cards"
        (let [ser (serdes/extract-one "PulseCard" {} (t2/select-one 'PulseCard :id pc1-pulse-id))]
          (is (schema= {:serdes/meta                        (s/eq [{:model "Pulse" :id pulse-eid}
                                                                   {:model "PulseCard" :id pc1-pulse-eid}])
                        :card_id                            (s/eq card1-eid)
                        (s/optional-key :dashboard_card_id) (s/eq nil)
                        s/Keyword                           s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the pulse and card"
            (is (= #{[{:model "Pulse" :id pulse-eid}]
                     [{:model "Card"  :id card1-eid}]}
                   (set (serdes/dependencies ser))))))

        (let [ser (serdes/extract-one "PulseCard" {} (t2/select-one 'PulseCard :id pc2-pulse-id))]
          (is (schema= {:serdes/meta                        (s/eq [{:model "Pulse" :id pulse-eid}
                                                                   {:model "PulseCard" :id pc2-pulse-eid}])
                        :card_id                            (s/eq card1-eid)
                        (s/optional-key :dashboard_card_id) (s/eq nil)
                        s/Keyword                           s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the pulse and card"
            (is (= #{[{:model "Pulse" :id pulse-eid}]
                     [{:model "Card"  :id card1-eid}]}
                   (set (serdes/dependencies ser)))))))

      (testing "dashboard sub cards"
        (let [ser (serdes/extract-one "PulseCard" {} (t2/select-one 'PulseCard :id pc1-sub-id))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse" :id sub-eid}
                                                               {:model "PulseCard" :id pc1-sub-eid}])
                        :card_id                        (s/eq card1-eid)
                        :dashboard_card_id              (s/eq [dash-eid dashcard-eid])
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the pulse, card and parent dashboard"
            (is (= #{[{:model "Pulse" :id sub-eid}]
                     [{:model "Card"  :id card1-eid}]
                     [{:model "Dashboard" :id dash-eid}]}
                   (set (serdes/dependencies ser))))))))))

(deftest cards-test
 (mt/with-empty-h2-app-db
   (ts/with-temp-dpc
     [User       [{mark-id :id}              {:first_name "Mark"
                                              :last_name  "Knopfler"
                                              :email      "mark@direstrai.ts"}]
      Database   [{db-id    :id}             {:name "My Database"}]
      Table      [{table-id :id}             {:name "Schemaless Table" :db_id db-id}]
      Field      [{field-id :id}             {:name "A Field" :table_id table-id}]
      Collection [{coll-id-1  :id}           {:name "1st collection"}]
      Collection [{coll-id-2  :id
                   coll-eid-2 :entity_id}    {:name "2nd collection"}]

      Card       [{card-id-1  :id
                   card-eid-1 :entity_id}    {:name          "Source question"
                                              :database_id   db-id
                                              :table_id      table-id
                                              :collection_id coll-id-1
                                              :creator_id    mark-id}]
      Card       [{card-id-2  :id}           {:name          "Card 2"
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
                                                                                      :value_field [:field field-id nil]}}]}]]
     (testing "Cards with parameter's source is another question"
       (let [ser (serdes/extract-one "Card" {} (t2/select-one Card :id card-id-2))]
         (is (= [{:id                   "abc",
                  :type                 :category,
                  :name                 "CATEGORY",
                  :values_source_type   "card",
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
                (set (serdes/dependencies ser)))))))))

(deftest selective-serialization-basic-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [User       [{mark-id :id}              {:first_name "Mark"
                                                               :last_name  "Knopfler"
                                                               :email      "mark@direstrai.ts"}]
                       Collection [{coll1-id   :id
                                    coll1-eid  :entity_id}    {:name "Some Collection"}]
                       Collection [{coll2-id   :id
                                    coll2-eid  :entity_id}    {:name     "Nested Collection"
                                                               :location (str "/" coll1-id "/")}]
                       Collection [{coll3-id   :id
                                    coll3-eid  :entity_id}    {:name     "Grandchild Collection"
                                                               :location (str "/" coll1-id "/" coll2-id "/")}]

                       Database   [{db-id      :id}           {:name "My Database"}]
                       Table      [{no-schema-id :id}         {:name "Schemaless Table" :db_id db-id}]
                       Field      [_                          {:name "Some Field" :table_id no-schema-id}]
                       Table      [{schema-id    :id}         {:name        "Schema'd Table"
                                                               :db_id       db-id
                                                               :schema      "PUBLIC"}]
                       Field      [{field-id :id}             {:name "Other Field" :table_id schema-id}]

                       ;; One dashboard and three cards in each of the three collections:
                       ;; Two cards contained in the dashboard and one freestanding.
                       Dashboard  [{dash1-id     :id
                                    dash1-eid    :entity_id}  {:name          "Dashboard 1"
                                                               :collection_id coll1-id
                                                               :creator_id    mark-id}]
                       Card       [{c1-1-id  :id
                                    c1-1-eid :entity_id}      {:name          "Question 1-1"
                                                               :database_id   db-id
                                                               :table_id      no-schema-id
                                                               :collection_id coll1-id
                                                               :creator_id    mark-id}]
                       Card       [{c1-2-id  :id
                                    c1-2-eid :entity_id}      {:name          "Question 1-2"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll1-id
                                                               :creator_id    mark-id}]
                       Card       [{c1-3-eid :entity_id}      {:name          "Question 1-3"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll1-id
                                                               :creator_id    mark-id}]

                       DashboardCard [_                       {:card_id      c1-1-id
                                                               :dashboard_id dash1-id}]
                       DashboardCard [_                       {:card_id      c1-2-id
                                                               :dashboard_id dash1-id}]

                       ;; Second dashboard, in the middle collection.
                       Dashboard  [{dash2-id     :id
                                    dash2-eid    :entity_id}  {:name          "Dashboard 2"
                                                               :collection_id coll2-id
                                                               :creator_id    mark-id}]
                       Card       [{c2-1-id  :id
                                    c2-1-eid :entity_id}      {:name          "Question 2-1"
                                                               :database_id   db-id
                                                               :table_id      no-schema-id
                                                               :collection_id coll2-id
                                                               :creator_id    mark-id}]
                       Card       [{c2-2-id  :id
                                    c2-2-eid :entity_id}      {:name          "Question 2-2"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll2-id
                                                               :creator_id    mark-id}]
                       Card       [{c2-3-eid :entity_id}      {:name          "Question 2-3"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll2-id
                                                               :creator_id    mark-id}]

                       DashboardCard [_                       {:card_id      c2-1-id
                                                               :dashboard_id dash2-id}]
                       DashboardCard [_                       {:card_id      c2-2-id
                                                               :dashboard_id dash2-id}]

                       ;; Third dashboard, in the grandchild collection.
                       Dashboard  [{dash3-id     :id
                                    dash3-eid    :entity_id}  {:name          "Dashboard 3"
                                                               :collection_id coll3-id
                                                               :creator_id    mark-id}]

                       Card       [{c3-1-id  :id
                                    c3-1-eid :entity_id}      {:name          "Question 3-1"
                                                               :database_id   db-id
                                                               :table_id      no-schema-id
                                                               :collection_id coll3-id
                                                               :creator_id    mark-id}]
                       Card       [{c3-2-id  :id
                                    c3-2-eid :entity_id}      {:name          "Question 3-2"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll3-id
                                                               :creator_id    mark-id}]
                       Card       [{c3-3-eid :entity_id}      {:name          "Question 3-3"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll3-id
                                                               :creator_id    mark-id}]

                       DashboardCard [_                       {:card_id      c3-1-id
                                                               :dashboard_id dash3-id}]
                       DashboardCard [_                       {:card_id      c3-2-id
                                                               :dashboard_id dash3-id}]

                       ;; Fourth dashboard where its parameter's source is another card
                       Collection   [{coll4-id   :id
                                      coll4-eid  :entity_id}    {:name     "Forth collection"}]
                       Card         [{c4-id  :id
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
                                                                                                         :value_field [:field field-id nil]}}]}]

                       Dashboard    [{dash4-id     :id
                                      dash4-eid    :entity_id}  {:name          "Dashboard 4"
                                                                 :collection_id coll4-id
                                                                 :creator_id    mark-id
                                                                 :parameters    [{:id                   "def"
                                                                                  :type                 "category"
                                                                                  :name                 "CATEGORY"
                                                                                  :values_source_type   "card"
                                                                                  ;; card_id is in a different collection with dashboard's collection
                                                                                  :values_source_config {:card_id     c1-2-id
                                                                                                         :value_field [:field field-id nil]}}]}]
                       DashboardCard [_                       {:card_id      c4-id
                                                               :dashboard_id dash4-id}]]

      (testing "selecting a collection includes settings and data model by default"
        (is (= #{"Card" "Collection" "Dashboard" "Database" "Setting"}
               (->> {:targets [["Collection" coll1-id]]}
                    extract/extract
                    (map (comp :model first serdes/path))
                    set))))

      (testing "selecting a dashboard gets all cards its dashcards depend on"
        (testing "grandparent dashboard"
          (is (= #{[{:model "Dashboard" :id dash1-eid :label "dashboard_1"}]
                   [{:model "Card"      :id c1-1-eid  :label "question_1_1"}]
                   [{:model "Card"      :id c1-2-eid  :label "question_1_2"}]}
                 (->> (extract/extract {:targets [["Dashboard" dash1-id]] :no-settings true :no-data-model true})
                      (map serdes/path)
                      set))))

        (testing "middle dashboard"
          (is (= #{[{:model "Dashboard" :id dash2-eid :label "dashboard_2"}]
                   [{:model "Card"      :id c2-1-eid  :label "question_2_1"}]
                   [{:model "Card"      :id c2-2-eid  :label "question_2_2"}]}
                 (->> (extract/extract {:targets [["Dashboard" dash2-id]] :no-settings true :no-data-model true})
                      (map serdes/path)
                      set))))

        (testing "grandchild dashboard"
          (is (= #{[{:model "Dashboard" :id dash3-eid :label "dashboard_3"}]
                   [{:model "Card"      :id c3-1-eid  :label "question_3_1"}]
                   [{:model "Card"      :id c3-2-eid  :label "question_3_2"}]}
                 (->> (extract/extract {:targets [["Dashboard" dash3-id]] :no-settings true :no-data-model true})
                      (map serdes/path)
                      set))))

        (testing "a dashboard that has parameter source is another card"
          (is (=? #{[{:model "Dashboard"     :id dash4-eid :label "dashboard_4"}]
                    [{:model "Card"          :id c4-eid  :label "question_4_1"}]
                    ;; card that parameter on dashboard linked to
                    [{:model "Card"          :id c1-1-eid  :label "question_1_1"}]
                    ;; card that the card on dashboard linked to
                    [{:model "Card"          :id c1-2-eid  :label "question_1_2"}]}
               (->> (extract/extract {:targets [["Dashboard" dash4-id]] :no-settings true :no-data-model true})
                    (map serdes/path)
                    set)))))

      (testing "selecting a collection gets all its contents"
        (let [grandchild-paths  #{[{:model "Collection"    :id coll3-eid :label "grandchild_collection"}]
                                  [{:model "Dashboard"     :id dash3-eid :label "dashboard_3"}]
                                  [{:model "Card"          :id c3-1-eid  :label "question_3_1"}]
                                  [{:model "Card"          :id c3-2-eid  :label "question_3_2"}]
                                  [{:model "Card"          :id c3-3-eid  :label "question_3_3"}]}
              middle-paths      #{[{:model "Collection"    :id coll2-eid :label "nested_collection"}]
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
                   (->> (extract/extract {:targets [["Collection" coll3-id]] :no-settings true :no-data-model true})
                        (map serdes/path)
                        set))))
          (testing "middle collection has all its own plus the grandchild and its contents"
            (is (= (set/union middle-paths grandchild-paths)
                   (->> (extract/extract {:targets [["Collection" coll2-id]] :no-settings true :no-data-model true})
                        (map serdes/path)
                        set))))
          (testing "grandparent collection has all its own plus the grandchild and middle collections with contents"
            (is (= (set/union grandparent-paths middle-paths grandchild-paths)
                   (->> (extract/extract {:targets [["Collection" coll1-id]] :no-settings true :no-data-model true})
                        (map serdes/path)
                        set))))

          (testing "select a collection where a dashboard contains parameter's source is card from another collection"
            (is (=? #{[{:model "Collection"    :id coll4-eid :label "forth_collection"}]
                      [{:model "Dashboard"     :id dash4-eid :label "dashboard_4"}]
                      [{:model "Card"          :id c4-eid  :label "question_4_1"}]
                      ;; card that parameter on dashboard linked to
                      [{:model "Card"          :id c1-1-eid  :label "question_1_1"}]
                      ;; card that the card on dashboard linked to
                      [{:model "Card"          :id c1-2-eid  :label "question_1_2"}]}
                 (->> (extract/extract {:targets [["Collection" coll4-id]] :no-settings true :no-data-model true})
                      (map serdes/path)
                      set)))))))))

(deftest foreign-key-field-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [Database   [{db-id         :id}        {:name "My Database"}]
                       Table      [{no-schema-id  :id}        {:name "Schemaless Table" :db_id db-id}]
                       Field      [{some-field-id :id}        {:name "Some Field" :table_id no-schema-id}]
                       Table      [{schema-id     :id}        {:name        "Schema'd Table"
                                                               :db_id       db-id
                                                               :schema      "PUBLIC"}]
                       Field      [_                          {:name "Other Field" :table_id schema-id}]
                       Field      [{fk-id         :id}        {:name     "Foreign Key"
                                                               :table_id schema-id
                                                               :fk_target_field_id some-field-id}]]

      (testing "fields that reference foreign keys are properly exported as Field references"
        (is (= ["My Database" nil "Schemaless Table" "Some Field"]
               (->> (t2/select-one Field :id fk-id)
                    (serdes/extract-one "Field" {})
                    :fk_target_field_id)))))))
