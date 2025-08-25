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
          (lib.metadata/database (lib.metadata.jvm/application-database-metadata-provider (mt/id)))))
  (testing "Should return nil correctly"
    (is (nil? (lib.metadata.protocols/database (lib.metadata.jvm/application-database-metadata-provider Integer/MAX_VALUE))))))

(deftest ^:parallel saved-question-metadata-test
  (let [query  (mt/mbql-query venues
                 {:joins [{:fields       :all
                           :source-table $$categories
                           :condition    [:= $category_id &Cat.categories.id]
                           :alias        "Cat"}]})
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
  (let [query      (mt/mbql-query products
                     {:joins  [{:source-query {:source-table $$orders
                                               :breakout     [$orders.product_id]
                                               :aggregation  [[:sum $orders.quantity]]}
                                :alias        "Orders"
                                :condition    [:= $id &Orders.orders.product_id]
                                :fields       [&Orders.orders.product_id
                                               &Orders.*sum/Integer]}]
                      :fields [$id]})
        mlv2-query (lib/query (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
              :source-alias                 "Orders"}
             {:metabase.lib.join/join-alias "Orders"
              :lib/type                     :metadata/column
              :base-type                    :type/Integer
              :name                         "sum"
              :lib/source                   :source/joins
              :lib/source-column-alias      "sum"
              :effective-type               :type/Integer
              :lib/desired-column-alias     "Orders__sum"
              :display-name                 "Orders → Sum of Quantity"
              :source-alias                 "Orders"}]
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

(deftest ^:parallel tables-present-test
  (testing "`tables` function returns visible tables (the call includes app db call)"
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
        (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
          (testing visibility-type
            (is (not-any? (fn [{:keys [display-name] :as metadata}]
                            (when (= "Orders" display-name)
                              metadata))
                          (lib.metadata/tables mp)))))))))

;; snippets-only metadata-provider

(deftest fetch-snippet-by-id-test
  (testing "Should fetch snippet by ID"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "test-snippet"
                                                      :content "WHERE x = {{param}}"
                                                      :description "Test snippet"}]
      (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)
            fetched (lib.metadata.protocols/native-query-snippet provider (:id snippet))]
        (is (some? fetched))
        (is (= (:id snippet) (:id fetched)))
        (is (= "test-snippet" (:name fetched)))
        (is (= "WHERE x = {{param}}" (:content fetched))))))

  (testing "Should return nil for non-existent snippet"
    (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)]
      (is (nil? (lib.metadata.protocols/native-query-snippet provider 999999))))))

(deftest fetch-snippet-by-name-test
  (testing "Should fetch snippet by name"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "test-snippet-by-name"
                                                      :content "WHERE y = {{param2}}"
                                                      :description "Test snippet for name lookup"}]
      (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)
            fetched (lib.metadata.protocols/native-query-snippet-by-name provider "test-snippet-by-name")]
        (is (some? fetched))
        (is (= (:id snippet) (:id fetched)))
        (is (= "test-snippet-by-name" (:name fetched))))))

  (testing "Should return nil for non-existent snippet name"
    (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)]
      (is (nil? (lib.metadata.protocols/native-query-snippet-by-name provider "non-existent-snippet"))))))

(deftest bulk-fetch-snippets-test
  (testing "Should fetch multiple snippets by IDs"
    (mt/with-temp [:model/NativeQuerySnippet snippet1 {:name "bulk-1" :content "WHERE a = 1"}
                   :model/NativeQuerySnippet snippet2 {:name "bulk-2" :content "WHERE b = 2"}
                   :model/NativeQuerySnippet snippet3 {:name "bulk-3" :content "WHERE c = 3"}]
      (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)
            ids [(:id snippet1) (:id snippet2) (:id snippet3)]
            fetched (lib.metadata.protocols/metadatas provider :metadata/native-query-snippet ids)]
        (is (= 3 (count fetched)))
        (is (= (set ids) (set (map :id fetched)))))))

  (testing "Should handle mix of existing and non-existing IDs"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "exists" :content "WHERE exists = true"}]
      (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)
            ids [(:id snippet) 999999 888888]
            fetched (lib.metadata.protocols/metadatas provider :metadata/native-query-snippet ids)]
        (is (= 1 (count fetched)))
        (is (= (:id snippet) (:id (first fetched)))))))

  (testing "Should fetch multiple snippets by names"
    (mt/with-temp [:model/NativeQuerySnippet snippet1 {:name "bulk-name-1" :content "WHERE a = 1"}
                   :model/NativeQuerySnippet snippet2 {:name "bulk-name-2" :content "WHERE b = 2"}
                   :model/NativeQuerySnippet snippet3 {:name "bulk-name-3" :content "WHERE c = 3"}]
      (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)
            names ["bulk-name-1" "bulk-name-2" "bulk-name-3"]
            fetched (lib.metadata.protocols/metadatas-by-name provider :metadata/native-query-snippet names)]
        (is (= 3 (count fetched)))
        (is (= (set names) (set (map :name fetched)))))))

  (testing "Should handle mix of existing and non-existing names"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "exists-by-name" :content "WHERE exists = true"}]
      (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)
            names ["exists-by-name" "does-not-exist" "also-does-not-exist"]
            fetched (lib.metadata.protocols/metadatas-by-name provider :metadata/native-query-snippet names)]
        (is (= 1 (count fetched)))
        (is (= "exists-by-name" (:name (first fetched))))))))

(deftest non-snippet-methods-test
  (testing "Non-snippet methods should handle gracefully"
    (let [provider (lib.metadata.jvm/snippets-only-metadata-provider)]
      (testing "database method returns nil"
        (is (nil? (lib.metadata.protocols/database provider))))

      (testing "tables method returns empty collection"
        (is (empty? (lib.metadata.protocols/tables provider))))

      (testing "metadatas for non-snippet types returns empty"
        (is (empty? (lib.metadata.protocols/metadatas provider :metadata/table [1 2 3])))
        (is (empty? (lib.metadata.protocols/metadatas provider :metadata/column [1 2 3]))))

      (testing "setting method returns nil"
        (is (nil? (lib.metadata.protocols/setting provider :some-setting)))))))

(deftest caching-behavior-test
  (testing "Provider should cache fetched snippets"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "cache-test" :content "cached content"}]
      (let [provider    (lib.metadata.jvm/snippets-only-metadata-provider)
            ;; First fetch - hits DB
            first-fetch (lib.metadata.protocols/native-query-snippet provider (:id snippet))]
        (is (some? first-fetch))
        ;; Second fetch - should use cache
        (let [second-fetch (lib.metadata.protocols/native-query-snippet provider (:id snippet))]
          (is (identical? first-fetch second-fetch)))))))
