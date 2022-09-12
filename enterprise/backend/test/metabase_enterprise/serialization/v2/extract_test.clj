(ns metabase-enterprise.serialization.v2.extract-test
  (:require [cheshire.core :as json]
            [clojure.set :as set]
            [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.extract :as extract]
            [metabase.models :refer [Card Collection Dashboard DashboardCard Database Dimension Field FieldValues Metric
                                     NativeQuerySnippet Pulse PulseCard Segment Table Timeline TimelineEvent User]]
            [metabase.models.serialization.base :as serdes.base]
            [schema.core :as s])
  (:import [java.time LocalDateTime OffsetDateTime]))

(defn- select-one [model-name where]
  (first (into [] (serdes.base/raw-reducible-query model-name {:where where}))))

(defn- by-model [model-name extraction]
  (->> extraction
       (into [])
       (map (comp last :serdes/meta))
       (filter #(= model-name (:model %)))
       (map :id)
       set))

(deftest fundamentals-test
  (ts/with-empty-h2-app-db
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
        (let [ser (serdes.base/extract-one "Collection" {} (select-one "Collection" [:= :id coll-id]))]
          (is (schema= {:serdes/meta       (s/eq [{:model "Collection" :id coll-eid :label coll-slug}])
                        :personal_owner_id (s/eq nil)
                        :parent_id         (s/eq nil)
                        s/Keyword          s/Any}
                       ser))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))))

      (testing "a nested collection is extracted with the right parent_id"
        (let [ser (serdes.base/extract-one "Collection" {} (select-one "Collection" [:= :id child-id]))]
          (is (schema= {:serdes/meta       (s/eq [{:model "Collection" :id child-eid :label child-slug}])
                        :personal_owner_id (s/eq nil)
                        :parent_id         (s/eq coll-eid)
                        s/Keyword          s/Any}
                       ser))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))))

      (testing "personal collections are extracted with email as key"
        (let [ser (serdes.base/extract-one "Collection" {} (select-one "Collection" [:= :id pc-id]))]
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
                 (by-model "Collection" (extract/extract-metabase nil)))))

        (testing "valid user specified"
          (is (= #{coll-eid child-eid pc-eid}
                 (by-model "Collection" (extract/extract-metabase {:user mark-id})))))

        (testing "invalid user specified"
          (is (= #{coll-eid child-eid}
                 (by-model "Collection" (extract/extract-metabase {:user 218921})))))))))

(deftest dashboard-and-cards-test
  (ts/with-empty-h2-app-db
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
                                                               :dataset_query
                                                               (json/generate-string
                                                                 {:query {:source-table no-schema-id
                                                                          :filter [:>= [:field field-id nil] 18]
                                                                          :aggregation [[:count]]}
                                                                  :database db-id})}]
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
                       DashboardCard [{dc1-id  :id
                                       dc1-eid :entity_id}    {:card_id      c1-id
                                                               :dashboard_id dash-id
                                                               :parameter_mappings
                                                               [{:parameter_id "12345678"
                                                                 :card_id      c1-id
                                                                 :target [:dimension [:field field-id
                                                                                      {:source-field field2-id}]]}]}]
                       DashboardCard [{dc2-id  :id
                                       dc2-eid :entity_id}    {:card_id      c2-id
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
                                                                {(str "[\"ref\",[\"field\"," field2-id ",null]]") {:column_title "Locus"}}}}]]
      (testing "table and database are extracted as [db schema table] triples"
        (let [ser (serdes.base/extract-one "Card" {} (select-one "Card" [:= :id c1-id]))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Card" :id c1-eid}])
                        :table_id                    (s/eq ["My Database" nil "Schemaless Table"])
                        :creator_id                  (s/eq "mark@direstrai.ts")
                        :collection_id               (s/eq coll-eid)
                        :dataset_query               (s/eq {:query {:source-table ["My Database" nil "Schemaless Table"]
                                                                    :filter [">=" [:field ["My Database" nil "Schemaless Table" "Some Field"] nil] 18]
                                                                    :aggregation [[:count]]}
                                                            :database "My Database"})
                        :created_at                  LocalDateTime
                        (s/optional-key :updated_at) LocalDateTime
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
                   (set (serdes.base/serdes-dependencies ser))))))

        (let [ser (serdes.base/extract-one "Card" {} (select-one "Card" [:= :id c2-id]))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Card" :id c2-eid}])
                        :table_id                    (s/eq ["My Database" "PUBLIC" "Schema'd Table"])
                        :creator_id                  (s/eq "mark@direstrai.ts")
                        :collection_id               (s/eq coll-eid)
                        :dataset_query               (s/eq {})
                        :parameter_mappings          (s/eq [{:parameter_id "deadbeef"
                                                             :card_id      c1-eid
                                                             :target [:dimension [:field ["My Database" nil "Schemaless Table" "Some Field"]
                                                                                  {:source-field ["My Database" "PUBLIC" "Schema'd Table" "Other Field"]}]]}])
                        :created_at                  LocalDateTime
                        (s/optional-key :updated_at) LocalDateTime
                        s/Keyword      s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Table and Collection, and any fields in their parameter_mappings"
            (is (= #{[{:model "Database"   :id "My Database"}
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
                   (set (serdes.base/serdes-dependencies ser))))))

        (let [ser (serdes.base/extract-one "Card" {} (select-one "Card" [:= :id c3-id]))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Card" :id c3-eid}])
                        :table_id                    (s/eq ["My Database" "PUBLIC" "Schema'd Table"])
                        :creator_id                  (s/eq "mark@direstrai.ts")
                        :collection_id               (s/eq coll-eid)
                        :dataset_query               (s/eq {})
                        :visualization_settings
                        (s/eq {:table.pivot_column "SOURCE"
                               :table.cell_column "sum"
                               :table.columns
                               [{:name "SOME_FIELD"
                                 :fieldRef ["field" ["My Database" nil "Schemaless Table" "Some Field"] nil]
                                 :enabled true}
                                {:name "OTHER_FIELD"
                                 :fieldRef ["field" ["My Database" "PUBLIC" "Schema'd Table" "Other Field"] nil]
                                 :enabled true}
                                {:name "sum"
                                 :fieldRef ["field" "sum" {:base-type "type/Float"}]
                                 :enabled true}
                                {:name "count"
                                 :fieldRef ["field" "count" {:base-type "type/BigInteger"}]
                                 :enabled true}
                                {:name "Average order total"
                                 :fieldRef ["field" "Average order total" {:base-type "type/Float"}]
                                 :enabled true}]
                               :column_settings
                               {"[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Other Field\"],null]]" {:column_title "Locus"}}})
                        :created_at                  LocalDateTime
                        (s/optional-key :updated_at) LocalDateTime
                        s/Keyword      s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Table and Collection, and any fields in their visualization_settings"
            (is (= #{[{:model "Database"   :id "My Database"}
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
                   (set (serdes.base/serdes-dependencies ser))))))

        (let [ser (serdes.base/extract-one "DashboardCard" {} (select-one "DashboardCard" [:= :id dc1-id]))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Dashboard" :id dash-eid}
                                                            {:model "DashboardCard" :id dc1-eid}])
                        :dashboard_id                (s/eq dash-eid)
                        :parameter_mappings          (s/eq [{:parameter_id "12345678"
                                                             :card_id      c1-eid
                                                             :target [:dimension [:field ["My Database" nil "Schemaless Table" "Some Field"]
                                                                                  {:source-field ["My Database" "PUBLIC" "Schema'd Table" "Other Field"]}]]}])
                        s/Keyword      s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Dashboard and Card, and any fields in their parameter_mappings"
            (is (= #{[{:model "Card"       :id c1-eid}]
                     [{:model "Dashboard"  :id dash-eid}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}
                      {:model "Field"      :id "Other Field"}]}
                   (set (serdes.base/serdes-dependencies ser)))))))

      (testing "Dashcard :visualization_settings are included in their deps"
        (let [ser (serdes.base/extract-one "DashboardCard" {} (select-one "DashboardCard" [:= :id dc2-id]))]
          (is (schema= {:serdes/meta            (s/eq [{:model "Dashboard" :id other-dash}
                                                       {:model "DashboardCard" :id dc2-eid}])
                        :dashboard_id           (s/eq other-dash)
                        :visualization_settings (s/eq {:table.pivot_column "SOURCE"
                                                       :table.cell_column "sum"
                                                       :table.columns
                                                       [{:name "SOME_FIELD"
                                                         :fieldRef ["field" ["My Database" nil "Schemaless Table" "Some Field"] nil]
                                                         :enabled true}
                                                        {:name "sum"
                                                         :fieldRef ["field" "sum" {:base-type "type/Float"}]
                                                         :enabled true}
                                                        {:name "count"
                                                         :fieldRef ["field" "count" {:base-type "type/BigInteger"}]
                                                         :enabled true}
                                                        {:name "Average order total"
                                                         :fieldRef ["field" "Average order total" {:base-type "type/Float"}]
                                                         :enabled true}]
                                                       :column_settings
                                                       {"[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Other Field\"],null]]" {:column_title "Locus"}}})
                        s/Keyword      s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "DashboardCard depend on their Dashboard and Card, and any fields in their visualization_settings"
            (is (= #{[{:model "Card"       :id c2-eid}]
                     [{:model "Dashboard"  :id other-dash}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}
                      {:model "Field"      :id "Other Field"}]}
                   (set (serdes.base/serdes-dependencies ser)))))))

      (testing "collection filtering based on :user option"
        (testing "only unowned collections are returned with no user"
          (is (= ["Some Collection"]
                 (->> (serdes.base/extract-all "Collection" {})
                      (into [])
                      (map :name)))))
        (testing "unowned collections and the personal one with a user"
          (is (= #{coll-eid mark-coll-eid}
                 (by-model "Collection" (serdes.base/extract-all "Collection" {:user mark-id}))))
          (is (= #{coll-eid dave-coll-eid}
                 (by-model "Collection" (serdes.base/extract-all "Collection" {:user dave-id}))))))

      (testing "dashboards are filtered based on :user"
        (testing "dashboards in unowned collections are always returned"
          (is (= #{dash-eid}
                 (by-model "Dashboard" (serdes.base/extract-all "Dashboard" {}))))
          (is (= #{dash-eid}
                 (by-model "Dashboard" (serdes.base/extract-all "Dashboard" {:user mark-id})))))
        (testing "dashboards in personal collections are returned for the :user"
          (is (= #{dash-eid other-dash}
                 (by-model "Dashboard" (serdes.base/extract-all "Dashboard" {:user dave-id}))))))

      (testing "dashboard cards are filtered based on :user"
        (testing "dashboard cards whose dashboards are in unowned collections are always returned"
          (is (= #{dc1-eid}
                 (by-model "DashboardCard" (serdes.base/extract-all "DashboardCard" {}))))
          (is (= #{dc1-eid}
                 (by-model "DashboardCard" (serdes.base/extract-all "DashboardCard" {:user mark-id})))))
        (testing "dashboard cards whose dashboards are in personal collections are returned for the :user"
          (is (= #{dc1-eid dc2-eid}
                 (by-model "DashboardCard" (serdes.base/extract-all "DashboardCard" {:user dave-id})))))))))

(deftest dimensions-test
  (ts/with-empty-h2-app-db
    (ts/with-temp-dpc [;; Simple case: a singular field, no human-readable field.
                       Database   [{db-id        :id}        {:name "My Database"}]
                       Table      [{no-schema-id :id}        {:name "Schemaless Table" :db_id db-id}]
                       Field      [{email-id     :id}        {:name "email" :table_id no-schema-id}]
                       Dimension  [{dim1-id      :id
                                    dim1-eid     :entity_id} {:name     "Vanilla Dimension"
                                                              :field_id email-id
                                                              :type     "internal"}]

                       ;; Advanced case: :field_id is the foreign key, :human_readable_field_id the real target field.
                       Table      [{this-table   :id}        {:name        "Schema'd Table"
                                                              :db_id       db-id
                                                              :schema      "PUBLIC"}]
                       Field      [{fk-id        :id}        {:name "foreign_id" :table_id this-table}]
                       Table      [{other-table  :id}        {:name        "Foreign Table"
                                                              :db_id       db-id
                                                              :schema      "PUBLIC"}]
                       Field      [{target-id    :id}        {:name "real_field" :table_id other-table}]
                       Dimension  [{dim2-id      :id
                                    dim2-eid     :entity_id} {:name     "Foreign Dimension"
                                                              :type     "external"
                                                              :field_id fk-id
                                                              :human_readable_field_id target-id}]]
      (testing "vanilla user-created dimensions"
        (let [ser (serdes.base/extract-one "Dimension" {} (select-one "Dimension" [:= :id dim1-id]))]
          (is (schema= {:serdes/meta             (s/eq [{:model "Dimension" :id dim1-eid}])
                        :field_id                (s/eq ["My Database" nil "Schemaless Table" "email"])
                        :human_readable_field_id (s/eq nil)
                        s/Keyword                s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depend on the one Field"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "email"}]}
                   (set (serdes.base/serdes-dependencies ser)))))))

      (testing "foreign key dimensions"
        (let [ser (serdes.base/extract-one "Dimension" {} (select-one "Dimension" [:= :id dim2-id]))]
          (is (schema= {:serdes/meta             (s/eq [{:model "Dimension" :id dim2-eid}])
                        :field_id                (s/eq ["My Database" "PUBLIC" "Schema'd Table" "foreign_id"])
                        :human_readable_field_id (s/eq ["My Database" "PUBLIC" "Foreign Table"  "real_field"])
                        s/Keyword                s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depend on both Fields"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}
                      {:model "Field"      :id "foreign_id"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Foreign Table"}
                      {:model "Field"      :id "real_field"}]}
                   (set (serdes.base/serdes-dependencies ser))))))))))

(deftest metrics-test
  (ts/with-empty-h2-app-db
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
        (let [ser (serdes.base/extract-one "Metric" {} (select-one "Metric" [:= :id m1-id]))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Metric" :id m1-eid :label "My Metric"}])
                        :table_id                    (s/eq ["My Database" nil "Schemaless Table"])
                        :creator_id                  (s/eq "ann@heart.band")
                        :definition                  (s/eq {:source-table ["My Database" nil "Schemaless Table"]
                                                            :aggregation
                                                            [[:sum [:field ["My Database" nil
                                                                            "Schemaless Table" "Some Field"] nil]]]})
                        :created_at                  LocalDateTime
                        (s/optional-key :updated_at) LocalDateTime
                        s/Keyword                    s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depend on the Table and any fields referenced in :definition"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]}
                   (set (serdes.base/serdes-dependencies ser))))))))))

(deftest native-query-snippets-test
  (ts/with-empty-h2-app-db
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
          (let [ser (serdes.base/extract-one "NativeQuerySnippet" {} (select-one "NativeQuerySnippet" [:= :id s1-id]))]
            (is (schema= {:serdes/meta                 (s/eq [{:model "NativeQuerySnippet"
                                                               :id s1-eid
                                                               :label "Snippet 1"}])
                          :collection_id               (s/eq coll-eid)
                          :creator_id                  (s/eq "ann@heart.band")
                          :created_at                  OffsetDateTime
                          (s/optional-key :updated_at) OffsetDateTime
                          s/Keyword                    s/Any}
                         ser))
            (is (not (contains? ser :id)))

            (testing "and depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes.base/serdes-dependencies ser)))))))

        (testing "or can be outside collections"
          (let [ser (serdes.base/extract-one "NativeQuerySnippet" {} (select-one "NativeQuerySnippet" [:= :id s2-id]))]
            (is (schema= {:serdes/meta                    (s/eq [{:model "NativeQuerySnippet"
                                                                  :id s2-eid
                                                                  :label "Snippet 2"}])
                          (s/optional-key :collection_id) (s/eq nil)
                          :creator_id                     (s/eq "ann@heart.band")
                          :created_at                     OffsetDateTime
                          (s/optional-key :updated_at)    OffsetDateTime
                          s/Keyword                       s/Any}
                         ser))
            (is (not (contains? ser :id)))

            (testing "and has no deps"
              (is (empty? (serdes.base/serdes-dependencies ser))))))))))

(deftest timelines-and-events-test
  (ts/with-empty-h2-app-db
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
                       TimelineEvent      [{e1-id       :id}         {:name          "First Event"
                                                                      :creator_id    ann-id
                                                                      :timestamp     #t "2020-04-11T00:00Z"
                                                                      :timeline_id   line-id}]]
      (testing "timelines"
        (testing "with no events"
          (let [ser (serdes.base/extract-one "Timeline" {} (select-one "Timeline" [:= :id empty-id]))]
            (is (schema= {:serdes/meta                 (s/eq [{:model "Timeline" :id empty-eid}])
                          :collection_id               (s/eq coll-eid)
                          :creator_id                  (s/eq "ann@heart.band")
                          :created_at                  OffsetDateTime
                          (s/optional-key :updated_at) OffsetDateTime
                          s/Keyword                    s/Any}
                         ser))
            (is (not (contains? ser :id)))

            (testing "depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes.base/serdes-dependencies ser)))))))

        (testing "with events"
          (let [ser   (serdes.base/extract-one "Timeline" {} (select-one "Timeline" [:= :id line-id]))]
            (is (schema= {:serdes/meta                    (s/eq [{:model "Timeline" :id line-eid}])
                          :collection_id                  (s/eq coll-eid)
                          :creator_id                     (s/eq "ann@heart.band")
                          :created_at                     OffsetDateTime
                          (s/optional-key :updated_at)    OffsetDateTime
                          s/Keyword                       s/Any}
                         ser))
            (is (not (contains? ser :id)))

            (testing "depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes.base/serdes-dependencies ser))))))))

      (testing "timeline events"
        (let [ser   (serdes.base/extract-one "TimelineEvent" {} (select-one "TimelineEvent" [:= :id e1-id]))
              stamp "2020-04-11T00:00:00Z"]
            (is (schema= {:serdes/meta                    (s/eq [{:model "Timeline" :id line-eid}
                                                                 {:model "TimelineEvent"
                                                                  :id    stamp
                                                                  :label "First Event"}])
                          :timestamp                      (s/eq stamp)
                          :timeline_id                    (s/eq line-eid)
                          :creator_id                     (s/eq "ann@heart.band")
                          :created_at                     OffsetDateTime
                          (s/optional-key :updated_at)    OffsetDateTime
                          s/Keyword                       s/Any}
                         ser))
            (is (not (contains? ser :id)))

            (testing "depend on the Timeline"
              (is (= #{[{:model "Timeline" :id line-eid}]}
                     (set (serdes.base/serdes-dependencies ser))))))))))

(deftest segments-test
  (ts/with-empty-h2-app-db
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
        (let [ser (serdes.base/extract-one "Segment" {} (select-one "Segment" [:= :id s1-id]))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Segment" :id s1-eid :label "My Segment"}])
                        :table_id                    (s/eq ["My Database" nil "Schemaless Table"])
                        :creator_id                  (s/eq "ann@heart.band")
                        :created_at                  LocalDateTime
                        :definition                  (s/eq {:source-table ["My Database" nil "Schemaless Table"]
                                                            :aggregation [[:count]]
                                                            :filter ["<" [:field ["My Database" nil
                                                                                 "Schemaless Table" "Some Field"]
                                                                         nil] 18]})
                        (s/optional-key :updated_at) LocalDateTime
                        s/Keyword                    s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depend on the Table and any fields from the definition"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}]
                     [{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]}
                   (set (serdes.base/serdes-dependencies ser))))))))))

(deftest field-values-test
  (ts/with-empty-h2-app-db
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
        (let [ser (serdes.base/extract-one "FieldValues" {} (select-one "FieldValues" [:= :id fv-id]))]
          (is (schema= {:serdes/meta                 (s/eq [{:model "Database" :id "My Database"}
                                                            {:model "Table"    :id "Schemaless Table"}
                                                            {:model "Field"    :id "Some Field"}
                                                            {:model "FieldValues" :id "0"}]) ; Always 0.
                        :created_at                  LocalDateTime
                        (s/optional-key :updated_at) OffsetDateTime
                        :values                      (s/eq (json/generate-string values))
                        s/Keyword                    s/Any}
                       ser))
          (is (not (contains? ser :id)))
          (is (not (contains? ser :field_id))
              ":field_id is dropped; its implied by the path")

          (testing "depend on the parent Field"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "Some Field"}]}
                   (set (serdes.base/serdes-dependencies ser))))))))))

(deftest pulses-test
  (ts/with-empty-h2-app-db
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
        (let [ser (serdes.base/extract-one "Pulse" {} (select-one "Pulse" [:= :id p-none-id]))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse" :id p-none-eid}])
                        :creator_id                     (s/eq "ann@heart.band")
                        :created_at                     LocalDateTime
                        (s/optional-key :updated_at)    LocalDateTime
                        (s/optional-key :dashboard_id)  (s/eq nil)
                        (s/optional-key :collection_id) (s/eq nil)
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "has no deps"
            (is (= #{}
                   (set (serdes.base/serdes-dependencies ser)))))))

      (testing "pulse with just collection"
        (let [ser (serdes.base/extract-one "Pulse" {} (select-one "Pulse" [:= :id p-coll-id]))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse" :id p-coll-eid}])
                        :creator_id                     (s/eq "ann@heart.band")
                        :created_at                     LocalDateTime
                        (s/optional-key :updated_at)    LocalDateTime
                        (s/optional-key :dashboard_id)  (s/eq nil)
                        :collection_id                  (s/eq coll-eid)
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the collection"
            (is (= #{[{:model "Collection" :id coll-eid}]}
                   (set (serdes.base/serdes-dependencies ser)))))))

      (testing "pulse with just dashboard"
        (let [ser (serdes.base/extract-one "Pulse" {} (select-one "Pulse" [:= :id p-dash-id]))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse" :id p-dash-eid}])
                        :creator_id                     (s/eq "ann@heart.band")
                        :created_at                     LocalDateTime
                        (s/optional-key :updated_at)    LocalDateTime
                        :dashboard_id                   (s/eq dash-eid)
                        (s/optional-key :collection_id) (s/eq nil)
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the dashboard"
            (is (= #{[{:model "Dashboard" :id dash-eid}]}
                   (set (serdes.base/serdes-dependencies ser)))))))

      (testing "pulse with both collection and dashboard"
        (let [ser (serdes.base/extract-one "Pulse" {} (select-one "Pulse" [:= :id p-both-id]))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse" :id p-both-eid}])
                        :creator_id                     (s/eq "ann@heart.band")
                        :created_at                     LocalDateTime
                        (s/optional-key :updated_at)    LocalDateTime
                        :dashboard_id                   (s/eq dash-eid)
                        :collection_id                  (s/eq coll-eid)
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the collection and dashboard"
            (is (= #{[{:model "Collection" :id coll-eid}]
                     [{:model "Dashboard"  :id dash-eid}]}
                   (set (serdes.base/serdes-dependencies ser))))))))))

(deftest pulse-cards-test
  (ts/with-empty-h2-app-db
    (ts/with-temp-dpc [User          [{ann-id        :id}        {:first_name "Ann"
                                                                  :last_name  "Wilson"
                                                                  :email      "ann@heart.band"}]
                       Dashboard     [{dash-id       :id}        {:name "A Dashboard"}]
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
        (let [ser (serdes.base/extract-one "PulseCard" {} (select-one "PulseCard" [:= :id pc1-pulse-id]))]
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
                   (set (serdes.base/serdes-dependencies ser))))))

        (let [ser (serdes.base/extract-one "PulseCard" {} (select-one "PulseCard" [:= :id pc2-pulse-id]))]
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
                   (set (serdes.base/serdes-dependencies ser)))))))

      (testing "dashboard sub cards"
        (let [ser (serdes.base/extract-one "PulseCard" {} (select-one "PulseCard" [:= :id pc1-sub-id]))]
          (is (schema= {:serdes/meta                    (s/eq [{:model "Pulse" :id sub-eid}
                                                               {:model "PulseCard" :id pc1-sub-eid}])
                        :card_id                        (s/eq card1-eid)
                        :dashboard_card_id              (s/eq dashcard-eid)
                        s/Keyword                       s/Any}
                       ser))
          (is (not (contains? ser :id)))

          (testing "depends on the pulse, card and dashcard"
            (is (= #{[{:model "Pulse" :id sub-eid}]
                     [{:model "Card"  :id card1-eid}]
                     [{:model "DashboardCard" :id dashcard-eid}]}
                   (set (serdes.base/serdes-dependencies ser))))))))))

(deftest selective-serialization-basic-test
  (ts/with-empty-h2-app-db
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
                       Field      [_                          {:name "Other Field" :table_id schema-id}]

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

                       DashboardCard [{dc1-1-eid :entity_id}  {:card_id      c1-1-id
                                                               :dashboard_id dash1-id}]
                       DashboardCard [{dc1-2-eid :entity_id}  {:card_id      c1-2-id
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

                       DashboardCard [{dc2-1-eid :entity_id}  {:card_id      c2-1-id
                                                               :dashboard_id dash2-id}]
                       DashboardCard [{dc2-2-eid :entity_id}  {:card_id      c2-2-id
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

                       DashboardCard [{dc3-1-eid :entity_id}  {:card_id      c3-1-id
                                                               :dashboard_id dash3-id}]
                       DashboardCard [{dc3-2-eid :entity_id}  {:card_id      c3-2-id
                                                               :dashboard_id dash3-id}]]

      (testing "selecting a dashboard gets its dashcards and cards as well"
        (testing "grandparent dashboard"
          (is (= #{[{:model "Dashboard" :id dash1-eid}]
                   [{:model "Dashboard" :id dash1-eid}
                    {:model "DashboardCard" :id dc1-1-eid}]
                   [{:model "Dashboard" :id dash1-eid}
                    {:model "DashboardCard" :id dc1-2-eid}]
                   [{:model "Card" :id c1-1-eid}]
                   [{:model "Card" :id c1-2-eid}]}
                 (->> (extract/extract-subtrees {:targets [["Dashboard" dash1-id]]})
                      (map serdes.base/serdes-path)
                      set))))

        (testing "middle dashboard"
          (is (= #{[{:model "Dashboard" :id dash2-eid}]
                   [{:model "Dashboard" :id dash2-eid}
                    {:model "DashboardCard" :id dc2-1-eid}]
                   [{:model "Dashboard" :id dash2-eid}
                    {:model "DashboardCard" :id dc2-2-eid}]
                   [{:model "Card" :id c2-1-eid}]
                   [{:model "Card" :id c2-2-eid}]}
                 (->> (extract/extract-subtrees {:targets [["Dashboard" dash2-id]]})
                      (map serdes.base/serdes-path)
                      set))))

        (testing "grandchild dashboard"
          (is (= #{[{:model "Dashboard" :id dash3-eid}]
                   [{:model "Dashboard" :id dash3-eid}
                    {:model "DashboardCard" :id dc3-1-eid}]
                   [{:model "Dashboard" :id dash3-eid}
                    {:model "DashboardCard" :id dc3-2-eid}]
                   [{:model "Card" :id c3-1-eid}]
                   [{:model "Card" :id c3-2-eid}]}
                 (->> (extract/extract-subtrees {:targets [["Dashboard" dash3-id]]})
                      (map serdes.base/serdes-path)
                      set)))))

      (testing "selecting a collection gets all its contents"
        (let [grandchild-paths  #{[{:model "Collection"    :id coll3-eid :label "grandchild_collection"}]
                                  [{:model "Dashboard"     :id dash3-eid}]
                                  [{:model "Dashboard"     :id dash3-eid}
                                   {:model "DashboardCard" :id dc3-1-eid}]
                                  [{:model "Dashboard"     :id dash3-eid}
                                   {:model "DashboardCard" :id dc3-2-eid}]
                                  [{:model "Card"          :id c3-1-eid}]
                                  [{:model "Card"          :id c3-2-eid}]
                                  [{:model "Card"          :id c3-3-eid}]}
              middle-paths      #{[{:model "Collection"    :id coll2-eid :label "nested_collection"}]
                                  [{:model "Dashboard"     :id dash2-eid}]
                                  [{:model "Dashboard"     :id dash2-eid}
                                   {:model "DashboardCard" :id dc2-1-eid}]
                                  [{:model "Dashboard"     :id dash2-eid}
                                   {:model "DashboardCard" :id dc2-2-eid}]
                                  [{:model "Card"          :id c2-1-eid}]
                                  [{:model "Card"          :id c2-2-eid}]
                                  [{:model "Card"          :id c2-3-eid}]}
              grandparent-paths #{[{:model "Collection"    :id coll1-eid :label "some_collection"}]
                                  [{:model "Dashboard"     :id dash1-eid}]
                                  [{:model "Dashboard"     :id dash1-eid}
                                   {:model "DashboardCard" :id dc1-1-eid}]
                                  [{:model "Dashboard"     :id dash1-eid}
                                   {:model "DashboardCard" :id dc1-2-eid}]
                                  [{:model "Card"          :id c1-1-eid}]
                                  [{:model "Card"          :id c1-2-eid}]
                                  [{:model "Card"          :id c1-3-eid}]}]
          (testing "grandchild collection has all its own contents"
            (is (= grandchild-paths ; Includes the third card not found in the collection
                   (->> (extract/extract-subtrees {:targets [["Collection" coll3-id]]})
                        (map serdes.base/serdes-path)
                        set))))
          (testing "middle collection has all its own plus the grandchild and its contents"
            (is (= (set/union middle-paths grandchild-paths)
                   (->> (extract/extract-subtrees {:targets [["Collection" coll2-id]]})
                        (map serdes.base/serdes-path)
                        set))))
          (testing "grandparent collection has all its own plus the grandchild and middle collections with contents"
            (is (= (set/union grandparent-paths middle-paths grandchild-paths)
                   (->> (extract/extract-subtrees {:targets [["Collection" coll1-id]]})
                        (map serdes.base/serdes-path)
                        set)))))))))
