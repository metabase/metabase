(ns metabase.lib.metadata.jvm-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.card :as lib.card]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.invocation-tracker :as lib.metadata.invocation-tracker]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.test :as mt]
   [metabase.util :as u]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel fetch-field-test
  (let [field (t2/select-one :metadata/column (mt/id :categories :id))]
    (is (not (me/humanize (mc/validate ::lib.schema.metadata/column field))))))

(deftest ^:parallel fetch-database-test
  (is (=? {:lib/type :metadata/database, :features set?}
          (lib.metadata/database (lib.metadata.jvm/application-database-metadata-provider (mt/id)))))
  (testing "Should return nil correctly"
    (is (nil? (lib.metadata.protocols/database (lib.metadata.jvm/application-database-metadata-provider Integer/MAX_VALUE))))))

(deftest ^:parallel saved-question-metadata-test
  (let [query  {:database (mt/id)
                :type     :query
                :query    {:source-table (mt/id :venues)
                           :joins        [{:fields       :all
                                           :source-table (mt/id :categories)
                                           :condition    [:=
                                                          [:field (mt/id :venues :category_id) nil]
                                                          [:field (mt/id :categories :id) {:join-alias "Cat"}]]
                                           :alias        "Cat"}]}}
        query (lib/query (lib.metadata.jvm/application-database-metadata-provider (mt/id)) query)]
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
  (mt/dataset test-data
    (let [query (mt/mbql-query products
                  {:joins [{:source-query {:source-table $$orders
                                           :breakout     [$orders.product_id]
                                           :aggregation  [[:sum $orders.quantity]]}
                            :alias        "Orders"
                            :condition    [:= $id &Orders.orders.product_id]
                            :fields       [&Orders.orders.product_id
                                           &Orders.*sum/Integer]}]
                   :fields [$id]})
          mlv2-query (lib/query (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                (lib.convert/->pMBQL query))]
      (is (=? [{:base-type :type/BigInteger
                :semantic-type :type/PK
                :table-id (mt/id :products)
                :name "ID"
                :lib/source :source/fields
                :lib/source-column-alias "ID"
                :effective-type :type/BigInteger
                :id (mt/id :products :id)
                :lib/desired-column-alias "ID"
                :display-name "ID"}
               {:metabase.lib.join/join-alias "Orders"
                :base-type :type/Integer
                :semantic-type :type/FK
                :table-id (mt/id :orders)
                :name "PRODUCT_ID"
                :lib/source :source/joins
                :lib/source-column-alias "PRODUCT_ID"
                :effective-type :type/Integer
                :id (mt/id :orders :product_id)
                :lib/desired-column-alias "Orders__PRODUCT_ID"
                :display-name "Product ID"
                :source-alias "Orders"}
               {:metabase.lib.join/join-alias "Orders"
                :lib/type :metadata/column
                :base-type :type/Integer
                :name "sum"
                :lib/source :source/joins
                :lib/source-column-alias "sum"
                :effective-type :type/Integer
                :lib/desired-column-alias "Orders__sum"
                :display-name "Sum of Quantity"
                :source-alias "Orders"}]
              (lib.metadata.calculation/returned-columns mlv2-query))))))

(deftest ^:synchronized with-temp-source-question-metadata-test
  (binding [lib.card/*force-broken-card-refs* false]
    (t2.with-temp/with-temp [:model/Card card {:dataset_query
                                               (mt/mbql-query venues
                                                 {:joins
                                                  [{:source-table $$categories
                                                    :condition    [:= $category_id &c.categories.id]
                                                    :fields       :all
                                                    :alias        "c"}]})}]
      (let [query      {:database (mt/id)
                        :type     :query
                        :query    {:source-card (u/the-id card)}}
            mlv2-query (lib/query (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
        (is (=? [{:display-name      "Name"
                  :long-display-name "Name"
                  :effective-type    :type/Text
                  :semantic-type     :type/Name}
                 {:display-name      "c → Name"
                  :long-display-name "c → Name"
                  :effective-type    :type/Text
                  :semantic-type     :type/Name}]
                (map #(lib/display-info agg-query %)
                     (lib.metadata.calculation/returned-columns agg-query))))))))

(deftest ^:synchronized external-remap-metadata-test
  (mt/with-column-remappings [venues.id categories.name]
    (is (=? {:lib/type           :metadata/column
             :name               "ID"
             :lib/external-remap {:lib/type :metadata.column.remapping/external
                                  :id       integer?
                                  :name     "ID [external remap]"
                                  :field-id (mt/id :categories :name)}}
            (lib.metadata/field
             (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
             (lib.metadata.jvm/application-database-metadata-provider (mt/id))
             (mt/id :venues :id))))))

(deftest ^:synchronized persisted-info-metadata-test
  (t2.with-temp/with-temp [:model/Card          {card-id :id} {:dataset_query {:database (mt/id)
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
             (lib.metadata.jvm/application-database-metadata-provider (mt/id))
             card-id)))))

(deftest ^:parallel equality-test
  (is (= (lib.metadata.jvm/application-database-metadata-provider (mt/id))
         (lib.metadata.jvm/application-database-metadata-provider (mt/id)))))

(deftest ^:synchronized all-methods-call-go-through-invocation-tracker-first-test
  (binding [lib.metadata.invocation-tracker/*to-track-metadata-types* #{:metadata/column}]
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      (testing "sanity check"
        (is (empty? (lib.metadata/invoked-ids mp :metadata/column))))
      (testing "getting card should invoke the tracker"
        (is (some? (lib.metadata/field mp (mt/id :orders :id))))
        (is (= [(mt/id :orders :id)] (lib.metadata/invoked-ids mp :metadata/column))))
      (testing "2nd call, card shoudld should be cached by now, but invocation still keeping track of ids"
        (is (some? (lib.metadata/field mp (mt/id :orders :id))))
        (is (= [(mt/id :orders :id) (mt/id :orders :id)] (lib.metadata/invoked-ids mp :metadata/column)))))))
