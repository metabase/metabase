(ns metabase.query-processor.middleware.add-implicit-clauses-test
  (:require [clojure.test :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.add-implicit-clauses :as add-implicit-clauses]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(deftest ordering-test
  (testing "check we fetch Fields in the right order"
    (mt/with-temp-vals-in-db Field (mt/id :venues :price) {:position -1}
      (let [ids       (map second (#'add-implicit-clauses/sorted-implicit-fields-for-table (mt/id :venues)))
            id->field (u/key-by :id (db/select [Field :id :position :name :semantic_type] :id [:in ids]))]
        (is (= [ ;; sorted first because it has lowest positon
                {:position -1, :name "PRICE", :semantic_type :type/Category}
                ;; PK
                {:position 0, :name "ID", :semantic_type :type/PK}
                ;; Name
                {:position 1, :name "NAME", :semantic_type :type/Name}
                ;; The rest are sorted by name
                {:position 2, :name "CATEGORY_ID", :semantic_type :type/FK}
                {:position 3, :name "LATITUDE", :semantic_type :type/Latitude}
                {:position 4, :name "LONGITUDE", :semantic_type :type/Longitude}]
               (for [id ids]
                 (into {} (dissoc (id->field id) :id)))))))))

(deftest add-order-bys-for-breakouts-test
  (testing "we should add order-bys for breakout clauses"
    (is (= {:source-table 1
            :breakout     [[:field-id 1]]
            :order-by     [[:asc [:field-id 1]]]}
           (#'add-implicit-clauses/add-implicit-breakout-order-by
            {:source-table 1
             :breakout     [[:field-id 1]]})))
    (testing "Add Field to existing order-by"
      (is (= {:source-table 1
              :breakout     [[:field-id 2]]
              :order-by     [[:asc [:field-id 1]]
                             [:asc [:field-id 2]]]}
             (#'add-implicit-clauses/add-implicit-breakout-order-by
              {:source-table 1
               :breakout     [[:field-id 2]]
               :order-by     [[:asc [:field-id 1]]]}))))

    (testing "...but not if the Field is already in an order-by"
      (is (= {:source-table 1
              :breakout     [[:field-id 1]]
              :order-by     [[:asc [:field-id 1]]]}
             (#'add-implicit-clauses/add-implicit-breakout-order-by
              {:source-table 1
               :breakout     [[:field-id 1]]
               :order-by     [[:asc [:field-id 1]]]})))
      (is (= {:source-table 1
              :breakout     [[:field-id 1]]
              :order-by     [[:desc [:field-id 1]]]}
             (#'add-implicit-clauses/add-implicit-breakout-order-by
              {:source-table 1
               :breakout     [[:field-id 1]]
               :order-by     [[:desc [:field-id 1]]]})))
      (testing "With a datetime-field"
        (is (= {:source-table 1
                :breakout     [[:datetime-field [:field-id 1] :day]]
                :order-by     [[:asc [:field-id 1]]]}
               (#'add-implicit-clauses/add-implicit-breakout-order-by
                {:source-table 1
                 :breakout     [[:datetime-field [:field-id 1] :day]]
                 :order-by     [[:asc [:field-id 1]]]})))))))

(deftest add-order-bys-for-no-aggregations-test
  (testing "We should add sorted implicit Fields for a query with no aggregations"
    (is (= (:query
            (mt/mbql-query venues
              {:fields [ ;; :type/PK Fields should get sorted first
                        $id
                        ;; followed by :type/Name Fields
                        $name
                        ;; followed by other Fields sorted by name
                        $category_id $latitude $longitude $price]}))
           (#'add-implicit-clauses/add-implicit-fields (:query (mt/mbql-query venues)))))))

(deftest sort-by-field-position-test
  (testing "when adding sorted implicit Fields, Field positions should be taken into account"
    (mt/with-temp* [Field [field-1 {:table_id (mt/id :venues), :position 100, :name "bbbbb"}]
                    Field [field-2 {:table_id (mt/id :venues), :position 101, :name "aaaaa"}]]
      (is (= (:query
              (mt/mbql-query venues
                {:fields [ ;; all fields with lower positions should get sorted first according to rules above
                          $id $name $category_id $latitude $longitude $price
                          ;; followed by position = 100, then position = 101
                          [:field-id (u/the-id field-1)]
                          [:field-id (u/the-id field-2)]]}))
             (#'add-implicit-clauses/add-implicit-fields (:query (mt/mbql-query venues))))))))

(deftest default-bucketing-test
  (testing "datetime Fields should get default bucketing of :day"
    (mt/with-temp Field [field {:table_id (mt/id :venues), :position 2, :name "aaaaa", :base_type :type/DateTime}]
      (is (= (:query
              (mt/mbql-query venues
                {:fields [$id $name
                          [:datetime-field [:field-id (u/the-id field)] :default]
                          $category_id $latitude $longitude $price]}))
             (#'add-implicit-clauses/add-implicit-fields (:query (mt/mbql-query venues))))))))

(deftest add-implicit-fields-for-source-queries-test
  (testing "We should add implicit Fields for source queries that have source-metadata as appropriate"
    (let [{{source-query :query} :dataset_query
           source-metadata       :result_metadata}
          (qp.test-util/card-with-source-metadata-for-query
           (mt/mbql-query checkins
             {:aggregation [[:count]]
              :breakout    [!month.$date]}))]
      (is (schema= {:fields   (s/eq [[:field-id (mt/id :checkins :date)]
                                     [:field-literal "count" :type/BigInteger]])
                    s/Keyword s/Any}
                   (#'add-implicit-clauses/add-implicit-fields
                    (:query (mt/mbql-query checkins
                              {:source-query    source-query
                               :source-metadata source-metadata}))))))))

(deftest joined-field-test
  (testing "When adding implicit `:fields` clauses, should use `joined-field` clauses for joined fields (#14745)"
    (doseq [field-ref (mt/$ids
                        [[:joined-field "c" $categories.name]
                         [:datetime-field [:joined-field "c" $categories.name] :default]])]
      (testing (format "field ref = %s" (pr-str field-ref))
        (let [query (mt/mbql-query venues
                      {:source-query    {:source-table $$venues
                                         :fields       [$id &c.categories.name $category_id->categories.name]
                                         :joins        [{:fields       [&c.categories.name]
                                                         :source-table $$categories
                                                         :strategy     :left-join
                                                         :condition    [:= $category_id &c.categories.id]
                                                         :alias        "c"}]}
                       :source-metadata [{:table_id     $$venues
                                          :semantic_type :type/PK
                                          :name         "ID"
                                          :field_ref    $id
                                          :id           %id
                                          :display_name "ID"
                                          :base_type    :type/BigInteger}
                                         {:table_id     $$categories
                                          :semantic_type :type/Name
                                          :name         "NAME"
                                          :field_ref    field-ref
                                          :id           %categories.name
                                          :display_name "c → Name"
                                          :base_type    :type/Text
                                          :source_alias "c"}
                                         {:table_id     $$categories
                                          :name         "NAME"
                                          :field_ref    $category_id->categories.name
                                          :id           %categories.name
                                          :display_name "Category → Name"
                                          :base_type    :type/Text
                                          :source_alias "CATEGORIES__via__CATEGORY_ID"}]})]
          (is (= (mt/$ids [$venues.id &c.categories.name $venues.category_id->categories.name])
                 (get-in (mt/test-qp-middleware add-implicit-clauses/add-implicit-clauses query)
                         [:pre :query :fields]))))))))
