(ns metabase.serialization.data-model-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- query-count [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(deftest extract-fields-test
  (testing "Fields export with their references, in as many queries for many Fields as for few"
    (let [fields  (t2/select :model/Field :table_id (mt/id :venues) {:order-by [[:id :asc]]})
          extract #(into [] (serialization/export :model/Field %))
          db-name (t2/select-one-fn :name :model/Database :id (mt/id))
          [price] (extract [(t2/select-one :model/Field :id (mt/id :venues :price))])]
      (is (=? {:serdes/meta [{:model "Field"}]
               :name        "PRICE"
               :table_id    [db-name "PUBLIC" "VENUES"]}
              price))
      (is (= [:model/Field [db-name "PUBLIC" "VENUES" "PRICE"]] (serialization/key-of price)))
      (testing "(without FK targets, which take their own query)"
        (let [fields (remove :fk_target_field_id fields)]
          (is (= (query-count #(extract (take 1 fields)))
                 (query-count #(extract fields)))))))))

(deftest field-round-trip-test
  (testing "an exported Field imports back to the same references"
    (let [field            (t2/select-one :model/Field :id (mt/id :venues :category_id))
          [exported]       (into [] (serialization/export :model/Field [field]))
          [imported]       (serialization/import :model/Field [exported])]
      (is (=? {:table_id           (mt/id :venues)
               :name               "CATEGORY_ID"
               :fk_target_field_id (mt/id :categories :id)}
              imported))
      (is (nil? (:parent_id imported))))))

(deftest extract-tables-test
  (testing "Tables export their Database by name, with one query for the names of all of them"
    (let [tables (t2/select :model/Table :db_id (mt/id) {:order-by [[:id :asc]]})
          db     (t2/select-one-fn :name :model/Database :id (mt/id))]
      (is (every? #(= db (:db_id %)) (into [] (serialization/export :model/Table tables))))
      (is (= (query-count #(into [] (serialization/export :model/Table (take 1 tables))))
             (query-count #(into [] (serialization/export :model/Table tables))))))))

(deftest table-definitions-transform-test
  (testing "Table definitions export their Fields and definition Table as paths, and import them back, with as many
           queries for many Tables as for one"
    (let [{export-fn :export import-fn :import} (get-in (serialization/spec :model/Table)
                                                        [:transform :eav_definition])
          id-order                {:order-by [[:id :asc]]}
          definitions             (for [table-id (t2/select-pks-vec :model/Table :db_id (mt/id) id-order)
                                        :let     [[entity-key-id property-value-id]
                                                  (t2/select-pks-vec :model/Field :table_id table-id id-order)]]
                                    {:entity_key       entity-key-id
                                     :property_value   property-value-id
                                     :property_name    nil
                                     :definition_table table-id})
          export-definitions      #(export-fn serialization/app-db-store nil (vec %) {})
          import-definitions      #(import-fn serialization/app-db-store nil (vec %) {})
          exported                (export-definitions definitions)
          {:keys [entity_key definition_table]} (first definitions)
          db-name                 (t2/select-one-fn :name :model/Database :id (mt/id))
          table-ref               ((juxt (constantly db-name) :schema :name)
                                   (t2/select-one :model/Table :id definition_table))]
      (is (= [(conj table-ref (t2/select-one-fn :name :model/Field :id entity_key)) table-ref]
             ((juxt :entity_key :definition_table) (first exported))))
      (is (nil? (:property_name (first exported))))
      (is (= (vec definitions) (import-definitions exported)))
      (is (= [nil] (export-definitions [nil]) (import-definitions [nil])))
      (is (= (query-count #(export-definitions (take 1 definitions))) (query-count #(export-definitions definitions))))
      (is (= (query-count #(import-definitions (take 1 exported))) (query-count #(import-definitions exported)))))))

(deftest legacy-field-dimensions-load-test
  (testing "older exports nest a Field's Dimension under it, which loads as the Field's Dimension"
    (mt/with-model-cleanup [:model/Dimension]
      (let [db-name  (t2/select-one-fn :name :model/Database :id (mt/id))
            [field]  (into [] (serialization/export :model/Field [(t2/select-one :model/Field :id (mt/id :venues :category_id))]))
            eid      "LegacyDimension000001"]
        (serialization/load :model/Field [(assoc field :dimensions [{:entity_id               eid
                                                                     :name                    "Category"
                                                                     :type                    "external"
                                                                     :human_readable_field_id [db-name "PUBLIC" "CATEGORIES" "NAME"]}])])
        (is (=? {:field_id                (mt/id :venues :category_id)
                 :human_readable_field_id (mt/id :categories :name)
                 :type                    :external}
                (t2/select-one :model/Dimension :entity_id eid)))))))

(deftest import-databases-query-count-test
  (testing "importing a change to many Databases takes as many queries as to few, and keeps their workspace schema"
    (mt/with-model-cleanup [:model/Database]
      (let [import-changed! (fn [n]
                              (let [dbs      (t2/insert-returning-instances!
                                              :model/Database
                                              (for [i (range n)]
                                                {:name        (str "serdes database " n " " i)
                                                 :engine      :postgres
                                                 :details     {:host "localhost" :dbname (str "db" i)}
                                                 :description "original"
                                                 :settings    {:database-enable-actions   true
                                                               :database-workspace-schema (str "ws" i)}}))
                                    exported (mapv #(assoc (first (into [] (serialization/export :model/Database [%])))
                                                           :description "changed")
                                                   dbs)]
                                (is (not-any? #(contains? (:settings %) :database-workspace-schema) exported))
                                (u/prog1 (query-count #(serialization/load :model/Database exported))
                                  (is (= (into #{} (map (fn [i] ["changed" (str "ws" i)])) (range n))
                                         (into #{}
                                               (map (juxt :description (comp :database-workspace-schema :settings)))
                                               (t2/select :model/Database :id [:in (map :id dbs)])))))))]
        (import-changed! 1)
        (is (= (import-changed! 4) (import-changed! 12)))))))
