(ns metabase.lib-be.metadata.jvm-test
  (:require
   [clojure.test :refer :all]
   [malli.error :as me]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.invocation-tracker :as lib.metadata.invocation-tracker]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(deftest ^:parallel fetch-field-test
  (let [field (t2/select-one :metadata/column (mt/id :categories :id))]
    (is (not (me/humanize (mr/explain ::lib.schema.metadata/column field))))))

(deftest ^:parallel fetch-database-test
  (is (=? {:lib/type :metadata/database, :features set?}
          (lib.metadata/database (mt/metadata-provider))))
  (testing "Should return nil correctly"
    (is (nil? (lib.metadata.protocols/database (lib.metadata.jvm/application-database-metadata-provider Integer/MAX_VALUE))))))

(deftest ^:parallel saved-question-metadata-test
  (let [query  (mt/mbql-query venues
                 {:joins [{:fields       :all
                           :source-table $$categories
                           :condition    [:= $category_id &Cat.categories.id]
                           :alias        "Cat"}]})
        query (lib/query (mt/metadata-provider) query)]
    (is (=? [{:lib/desired-column-alias "ID"}
             {:lib/desired-column-alias "NAME"}
             {:lib/desired-column-alias "CATEGORY_ID"}
             {:lib/desired-column-alias "LATITUDE"}
             {:lib/desired-column-alias "LONGITUDE"}
             {:lib/desired-column-alias "PRICE"}
             {:lib/desired-column-alias "Cat__ID"}
             {:lib/desired-column-alias "Cat__NAME"}]
            (lib.metadata.calculation/returned-columns query)))))

(deftest ^:parallel join-with-aggregation-reference-in-fields-metadata-test
  (let [query      (mt/mbql-query products
                     {:joins  [{:source-query {:source-table $$orders
                                               :breakout     [$orders.product_id]
                                               :aggregation  [[:sum $orders.quantity]]}
                                :alias        "Orders"
                                :condition    [:= $id &Orders.orders.product_id]
                                :fields       [&Orders.orders.product_id
                                               &Orders.*sum/Integer]}]
                      :fields [$id]})
        mlv2-query (lib/query (mt/metadata-provider)
                              (lib.convert/->pMBQL query))]
    (is (=? [{:base-type                :type/BigInteger
              :semantic-type            :type/PK
              :table-id                 (mt/id :products)
              :name                     "ID"
              :lib/source               :source/table-defaults
              :lib/source-column-alias  "ID"
              :effective-type           :type/BigInteger
              :id                       (mt/id :products :id)
              :lib/desired-column-alias "ID"
              :display-name             "ID"}
             {:metabase.lib.join/join-alias "Orders"
              :base-type                    :type/Integer
              :semantic-type                :type/FK
              :table-id                     (mt/id :orders)
              :name                         "PRODUCT_ID"
              :lib/source                   :source/joins
              :lib/source-column-alias      "PRODUCT_ID"
              :effective-type               :type/Integer
              :id                           (mt/id :orders :product_id)
              :lib/desired-column-alias     "Orders__PRODUCT_ID"
              :display-name                 "Orders → Product ID"
              :lib/original-join-alias      "Orders"}
             {:metabase.lib.join/join-alias "Orders"
              :lib/type                     :metadata/column
              :base-type                    :type/Integer
              :name                         "sum"
              :lib/source                   :source/joins
              :lib/source-column-alias      "sum"
              :effective-type               :type/Integer
              :lib/desired-column-alias     "Orders__sum"
              :display-name                 "Orders → Sum of Quantity"
              :lib/original-join-alias      "Orders"}]
            (binding [lib.metadata.calculation/*display-name-style* :long]
              (lib.metadata.calculation/returned-columns mlv2-query))))))

(deftest ^:synchronized with-temp-source-question-metadata-test
  #_{:clj-kondo/ignore [:discouraged-var]}
  (mt/with-temp [:model/Card card {:dataset_query
                                   (mt/mbql-query venues
                                     {:joins
                                      [{:source-table $$categories
                                        :condition    [:= $category_id &c.categories.id]
                                        :fields       :all
                                        :alias        "c"}]})}]
    (let [query      {:database (mt/id)
                      :type     :query
                      :query    {:source-card (u/the-id card)}}
          mlv2-query (lib/query (mt/metadata-provider)
                                (lib.convert/->pMBQL query))
          breakouts  (lib/breakoutable-columns mlv2-query)
          agg-query  (-> mlv2-query
                         (lib/breakout (second breakouts))
                         (lib/breakout (peek breakouts)))]
      (is (=? [{:display-name      "ID"
                :long-display-name "ID"
                :effective-type    :type/BigInteger
                :semantic-type     :type/PK}
               {:display-name      "Name"
                :long-display-name "Name"
                :effective-type    :type/Text
                :semantic-type     :type/Name}
               {:display-name      "Category ID"
                :long-display-name "Category ID"
                :effective-type    :type/Integer
                :semantic-type     :type/FK}
               {:display-name      "Latitude"
                :long-display-name "Latitude"
                :effective-type    :type/Float
                :semantic-type     :type/Latitude}
               {:display-name      "Longitude"
                :long-display-name "Longitude"
                :effective-type    :type/Float
                :semantic-type     :type/Longitude}
               {:display-name      "Price"
                :long-display-name "Price"
                :effective-type    :type/Integer
                :semantic-type     :type/Category}
               {:display-name      "c → ID"
                :long-display-name "c → ID"
                :effective-type    :type/BigInteger
                :semantic-type     :type/PK}
               {:display-name      "c → Name"
                :long-display-name "c → Name"
                :effective-type    :type/Text
                :semantic-type     :type/Name}]
              (map #(lib/display-info mlv2-query %)
                   (lib.metadata.calculation/returned-columns mlv2-query))))
      (is (= ["Name"
              "c → Name"]
             (map :display-name (lib.metadata.calculation/returned-columns agg-query))))
      (is (=? [{:display-name      "Name"
                :long-display-name "Name"
                :effective-type    :type/Text
                :semantic-type     :type/Name}
               {:display-name      "c → Name"
                :long-display-name "c → Name"
                :effective-type    :type/Text
                :semantic-type     :type/Name}]
              (map #(lib/display-info agg-query %)
                   (lib.metadata.calculation/returned-columns agg-query)))))))

(deftest ^:synchronized external-remap-metadata-test
  (mt/with-column-remappings [venues.id categories.name]
    (is (=? {:lib/type           :metadata/column
             :name               "ID"
             :lib/external-remap {:lib/type :metadata.column.remapping/external
                                  :id       integer?
                                  :name     "ID [external remap]"
                                  :field-id (mt/id :categories :name)}}
            (lib.metadata/field
             (mt/metadata-provider)
             (mt/id :venues :id))))))

(deftest ^:synchronized internal-remap-metadata-test
  (mt/with-column-remappings [venues.id {1 "African", 2 "American", 3 "Artisan", 4 "BBQ"}]
    (is (=? {:lib/type           :metadata/column
             :name               "ID"
             :lib/internal-remap {:lib/type              :metadata.column.remapping/internal
                                  :id                    integer?
                                  :name                  "ID [internal remap]"
                                  :values                [1 2 3 4]
                                  :human-readable-values ["African" "American" "Artisan" "BBQ"]}}
            (lib.metadata/field
             (mt/metadata-provider)
             (mt/id :venues :id))))))

(deftest ^:synchronized persisted-info-metadata-test
  #_{:clj-kondo/ignore [:discouraged-var]}
  (mt/with-temp [:model/Card          {card-id :id} {:dataset_query {:database (mt/id)
                                                                     :type     :query
                                                                     :query    {:source-table (mt/id :venues)}}}
                 :model/PersistedInfo {}            {:card_id card-id, :database_id (mt/id)}]
    (is (=? {:lib/type           :metadata/card
             :id                 card-id
             :lib/persisted-info {:active     true
                                  :state      "persisted"
                                  :definition {}
                                  :query-hash string?
                                  :table-name string?}}
            (lib.metadata/card
             (mt/metadata-provider)
             card-id)))))

(deftest ^:parallel equality-test
  (is (= (mt/metadata-provider)
         (mt/metadata-provider))))

(deftest ^:synchronized all-methods-call-go-through-invocation-tracker-first-test
  (binding [lib.metadata.invocation-tracker/*to-track-metadata-types* #{:metadata/column}]
    (let [mp (mt/metadata-provider)]
      (testing "sanity check"
        (is (empty? (lib.metadata/invoked-ids mp :metadata/column))))
      (testing "getting card should invoke the tracker"
        (is (some? (lib.metadata/field mp (mt/id :orders :id))))
        (is (= [(mt/id :orders :id)] (lib.metadata/invoked-ids mp :metadata/column))))
      (testing "2nd call, card shoudld should be cached by now, but invocation still keeping track of ids"
        (is (some? (lib.metadata/field mp (mt/id :orders :id))))
        (is (= [(mt/id :orders :id) (mt/id :orders :id)] (lib.metadata/invoked-ids mp :metadata/column)))))))

(deftest ^:parallel tables-present-test
  (testing "`tables` function returns visible tables (the call includes app db call)"
    (let [mp (mt/metadata-provider)
          display-names ["Checkins" "Categories" "Orders" "People" "Products" "Reviews" "Users" "Venues"]
          metadata-fns (for [expected-display-name display-names]
                         (fn [{:keys [id display-name active visibility-type] :as _metadata}]
                           (and (= display-name expected-display-name)
                                (true? active)
                                (nil? visibility-type)
                                (pos-int? id))))
          result (lib.metadata/tables mp)]
      (is (every? #(some % result) metadata-fns)))))

(deftest ^:synchronized tables-not-present-test
  (testing "Non-visible tables are not returned from `tables` function (includes app db call)"
    (doseq [visibility-type table/visibility-types]
      (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:visibility_type visibility-type}
        (let [mp (mt/metadata-provider)]
          (testing visibility-type
            (is (not-any? (fn [{:keys [display-name] :as metadata}]
                            (when (= "Orders" display-name)
                              metadata))
                          (lib.metadata/tables mp)))))))))

(deftest ^:parallel metadatas-sanity-check-test
  (testing "Make sure various supported metadata specs compile to valid SQL and we are able to run a query against the app DB with them"
    (let [mp (mt/metadata-provider)]
      (are [metadata-spec] (sequential? (lib.metadata.protocols/metadatas mp metadata-spec))
        {:lib/type :metadata/table}
        {:lib/type :metadata/table, :id #{1}}
        {:lib/type :metadata/table, :name #{"Table"}}
        {:lib/type :metadata/column, :id #{1}}
        {:lib/type :metadata/column, :name #{"Field"}}
        {:lib/type :metadata/column, :table-id 1}
        {:lib/type :metadata/card, :id #{1}}
        {:lib/type :metadata/card, :name #{"Card"}}
        {:lib/type :metadata/metric, :id #{1}}
        {:lib/type :metadata/metric, :name #{"Metric"}}
        {:lib/type :metadata/metric, :table-id 1}
        {:lib/type :metadata/metric, :card-id 1}
        {:lib/type :metadata/segment, :id #{1}}
        {:lib/type :metadata/segment, :name #{"Segment"}}
        {:lib/type :metadata/segment, :table-id 1}
        {:lib/type :metadata/native-query-snippet, :id #{1}}
        {:lib/type :metadata/native-query-snippet, :name #{"Snippet"}}))))

(deftest ^:parallel return-database-require-filter-test
  (mt/with-temp [:model/Database db       {:engine :h2}
                 :model/Table    buyer    {:name "BUYER" :database_require_filter true :db_id (:id db)}
                 :model/Field    buyer-id {:name "ID" :table_id (:id buyer) :base_type :type/Integer :database_partitioned true}]
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (:id db))]
      (is (=? {:database-require-filter true}
              (lib.metadata/table mp (:id buyer))))
      (is (=? {:database-partitioned true}
              (lib.metadata/field mp (:id buyer-id)))))))
