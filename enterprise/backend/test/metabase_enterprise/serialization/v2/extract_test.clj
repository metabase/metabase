(ns metabase-enterprise.serialization.v2.extract-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.extract :as extract]
            [metabase.models :refer [Card Collection Dashboard DashboardCard Database Dimension Field Metric
                                     NativeQuerySnippet Table User]]
            [metabase.models.serialization.base :as serdes.base])
  (:import java.time.ZonedDateTime))

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
          (is (= [{:model "Collection" :id coll-eid :label coll-slug}] (:serdes/meta ser)))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (nil? (:personal_owner_id ser)))
          (is (contains? ser :parent_id))
          (is (nil? (:parent_id ser)))))

      (testing "a nested collection is extracted with the right parent_id"
        (let [ser (serdes.base/extract-one "Collection" {} (select-one "Collection" [:= :id child-id]))]
          (is (= [{:model "Collection" :id child-eid :label child-slug}] (:serdes/meta ser)))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (= coll-eid (:parent_id ser)))
          (is (nil? (:personal_owner_id ser)))))

      (testing "personal collections are extracted with email as key"
        (let [ser (serdes.base/extract-one "Collection" {} (select-one "Collection" [:= :id pc-id]))]
          (is (= [{:model "Collection" :id pc-eid :label pc-slug}] (:serdes/meta ser)))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (nil? (:parent_id ser)))
          (is (= "mark@direstrai.ts" (:personal_owner_id ser)))))

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
                       Table      [{schema-id    :id}         {:name        "Schema'd Table"
                                                               :db_id       db-id
                                                               :schema      "PUBLIC"}]
                       Card       [{c1-id  :id
                                    c1-eid :entity_id}        {:name          "Some Question"
                                                               :database_id   db-id
                                                               :table_id      no-schema-id
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :dataset_query "{\"json\": \"string values\"}"}]
                       Card       [{c2-id  :id
                                    c2-eid :entity_id}        {:name          "Second Question"
                                                               :database_id   db-id
                                                               :table_id      schema-id
                                                               :collection_id coll-id
                                                               :creator_id    mark-id}]
                       Dashboard  [{dash-id  :id
                                    dash-eid :entity_id}      {:name          "Shared Dashboard"
                                                               :collection_id coll-id
                                                               :creator_id    mark-id
                                                               :parameters    []}]
                       Dashboard  [{other-dash-id :id
                                    other-dash :entity_id}    {:name          "Dave's Dash"
                                                               :collection_id dave-coll-id
                                                               :creator_id    mark-id
                                                               :parameters    []}]
                       DashboardCard [{dc1-eid :entity_id}    {:card_id      c1-id
                                                               :dashboard_id dash-id}]
                       DashboardCard [{dc2-eid :entity_id}    {:card_id      c2-id
                                                               :dashboard_id other-dash-id}]]
      (testing "table and database are extracted as [db schema table] triples"
        (let [ser (serdes.base/extract-one "Card" {} (select-one "Card" [:= :id c1-id]))]
          (is (= {:serdes/meta   [{:model "Card" :id c1-eid}]
                  :table_id      ["My Database" nil "Schemaless Table"]
                  :creator_id    "mark@direstrai.ts"
                  :collection_id coll-eid
                  :dataset_query "{\"json\": \"string values\"}"} ; Undecoded, still a string.
                 (select-keys ser [:serdes/meta :table_id :creator_id :collection_id :dataset_query])))
          (is (not (contains? ser :id)))
          (is (instance? ZonedDateTime (:created_at ser)))
          (is (or (nil? (:updated_at ser))
                  (instance? ZonedDateTime (:updated_at ser))))

          (testing "cards depend on their Table and Collection"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}]
                     [{:model "Collection" :id coll-eid}]}
                   (set (serdes.base/serdes-dependencies ser))))))

        (let [ser (serdes.base/extract-one "Card" {} (select-one "Card" [:= :id c2-id]))]
          (is (= {:serdes/meta   [{:model "Card" :id c2-eid}]
                  :table_id      ["My Database" "PUBLIC" "Schema'd Table"]
                  :creator_id    "mark@direstrai.ts"
                  :collection_id coll-eid
                  :dataset_query "{}"} ; Undecoded, still a string.
                 (select-keys ser [:serdes/meta :table_id :creator_id :collection_id :dataset_query])))
          (is (not (contains? ser :id)))

          (testing "cards depend on their Table and Collection"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Schema"     :id "PUBLIC"}
                      {:model "Table"      :id "Schema'd Table"}]
                     [{:model "Collection" :id coll-eid}]}
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
          (is (= {:serdes/meta             [{:model "Dimension" :id dim1-eid}]
                  :field_id                ["My Database" nil "Schemaless Table" "email"]
                  :human_readable_field_id nil}
                 (select-keys ser [:serdes/meta :field_id :human_readable_field_id])))
          (is (not (contains? ser :id)))

          (testing "depend on the one Field"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}
                      {:model "Field"      :id "email"}]}
                   (set (serdes.base/serdes-dependencies ser)))))))

      (testing "foreign key dimensions"
        (let [ser (serdes.base/extract-one "Dimension" {} (select-one "Dimension" [:= :id dim2-id]))]
          (is (= {:serdes/meta             [{:model "Dimension" :id dim2-eid}]
                  :field_id                ["My Database" "PUBLIC" "Schema'd Table" "foreign_id"]
                  :human_readable_field_id ["My Database" "PUBLIC" "Foreign Table"  "real_field"]}
                 (select-keys ser [:serdes/meta :field_id :human_readable_field_id])))
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
                       Metric     [{m1-id        :id
                                    m1-eid       :entity_id} {:name       "My Metric"
                                                              :creator_id ann-id
                                                              :table_id   no-schema-id}]]
      (testing "metrics"
        (let [ser (serdes.base/extract-one "Metric" {} (select-one "Metric" [:= :id m1-id]))]
          (is (= {:serdes/meta             [{:model "Metric" :id m1-eid :label "My Metric"}]
                  :table_id                ["My Database" nil "Schemaless Table"]
                  :creator_id              "ann@heart.band"}
                 (select-keys ser [:serdes/meta :table_id :creator_id])))
          (is (not (contains? ser :id)))

          (testing "depend on the Table"
            (is (= #{[{:model "Database"   :id "My Database"}
                      {:model "Table"      :id "Schemaless Table"}]}
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
            (is (= {:serdes/meta             [{:model "NativeQuerySnippet" :id s1-eid :label "Snippet 1"}]
                    :collection_id           coll-eid
                    :creator_id              "ann@heart.band"}
                   (select-keys ser [:serdes/meta :collection_id :creator_id])))
            (is (not (contains? ser :id)))
            (is (instance? ZonedDateTime (:created_at ser)))
            (is (or (nil? (:updated_at ser))
                    (instance? ZonedDateTime (:updated_at ser))))

            (testing "and depend on the Collection"
              (is (= #{[{:model "Collection" :id coll-eid}]}
                     (set (serdes.base/serdes-dependencies ser)))))))

        (testing "or can be outside collections"
          (let [ser (serdes.base/extract-one "NativeQuerySnippet" {} (select-one "NativeQuerySnippet" [:= :id s2-id]))]
            (is (= {:serdes/meta             [{:model "NativeQuerySnippet" :id s2-eid :label "Snippet 2"}]
                    :collection_id           nil
                    :creator_id              "ann@heart.band"}
                   (select-keys ser [:serdes/meta :collection_id :creator_id])))
            (is (not (contains? ser :id)))
            (is (instance? ZonedDateTime (:created_at ser)))
            (is (or (nil? (:updated_at ser))
                    (instance? ZonedDateTime (:updated_at ser))))

            (testing "and has no deps"
              (is (empty? (serdes.base/serdes-dependencies ser))))))))))
