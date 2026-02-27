(ns metabase.lib.walk.util-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.util.malli :as mu]))

(deftest ^:parallel all-source-table-ids-test
  (testing (str "make sure that `all-table-ids` can properly find all Tables in the query, even in cases where a map "
                "has a `:source-table` and some of its children also have a `:source-table`"))
  (is (= (lib.tu.macros/$ids nil
           #{$$checkins $$venues $$users $$categories})
         (lib.walk.util/all-source-table-ids
          (lib/query
           meta/metadata-provider
           (lib.tu.macros/mbql-query nil
             {:source-table $$checkins
              :joins        [{:source-table $$venues
                              :alias        "V"
                              :condition    [:=
                                             $checkins.venue-id
                                             &V.venues.id]}
                             {:source-query {:source-table $$users
                                             :joins        [{:source-table $$categories
                                                             :alias        "Cat"
                                                             :condition    [:=
                                                                            $users.id
                                                                            &Cat.categories.id]}]}
                              :alias        "U"
                              :condition    [:=
                                             $checkins.user-id
                                             &U.users.id]}]}))))))

(deftest ^:parallel all-field-ids-test
  (mu/disable-enforcement
    (is (= #{1 2}
           (lib/all-field-ids
            {:lib/type :mbql/query
             :database 1
             :stages   [{:lib/type     :mbql.stage/mbql
                         :fields       [[:field {} 1]
                                        [:field {} 2]
                                        [:field {} "wow"]]
                         :source-table 1}]})))))

(deftest ^:parallel all-source-card-ids-legacy-native-query-template-tags-test
  (let [query {:database 1
               :type     :native
               :native   {:query         "SELECT *;"
                          :template-tags {"tag_1" {:type    :card
                                                   :card-id 100}
                                          "tag_2" {:type    :card
                                                   :card-id 200}}}}]
    (mu/disable-enforcement
      (is (= #{100 200}
             (lib/all-source-card-ids (lib/query meta/metadata-provider query)))))))

(deftest ^:parallel all-source-card-ids-legacy-query-source-card-test
  (let [query {:database 1
               :type     :query
               :query    {:source-query {:source-table "card__1000"}}}]
    (is (= #{1000}
           (lib/all-source-card-ids (lib/query meta/metadata-provider query))))))

(deftest ^:parallel all-source-card-ids-pmbql-native-query-template-tags-test
  (let [query (lib/query meta/metadata-provider {:lib/type      :mbql.stage/native
                                                 :native        "SELECT *;"
                                                 :template-tags {"tag_1" {:name         "tag_1"
                                                                          :display-name "Tag 1"
                                                                          :type         :card
                                                                          :card-id      100}
                                                                 "tag_2" {:name         "tag_2"
                                                                          :display-name "Tag 2"
                                                                          :type         :card
                                                                          :card-id      200}}})]
    (is (= #{100 200}
           (lib/all-source-card-ids (lib/query meta/metadata-provider query))))))

(deftest ^:parallel all-source-card-ids-source-card-test
  (let [mp      (lib.tu/metadata-provider-with-cards-for-queries
                 meta/metadata-provider
                 [(lib/query meta/metadata-provider (lib.metadata/table meta/metadata-provider (meta/id :venues)))])
        query-with-source-card (lib/query mp (lib.metadata/card mp 1))]
    (is (= #{1}
           (lib/all-source-card-ids query-with-source-card)))))

(deftest ^:parallel all-implicitly-joined-field-ids-test
  (testing "Returns field IDs from implicitly joined tables (fields with :source-field but no :join-alias)"
    (is (= (lib.tu.macros/$ids nil #{%venues.name %users.name})
           (lib/all-implicitly-joined-field-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :fields [[:field $venues.name {:source-field %checkins.venue-id}]
                         [:field $users.name {:source-field %checkins.user-id}]]}))))))
  (testing "Ignores explicit joins (fields with both :source-field and :join-alias)"
    (is (= #{}
           (lib/all-implicitly-joined-field-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :fields [[:field $venues.name {:source-field %checkins.venue-id
                                               :join-alias "V"}]]
                :joins [{:source-table $$venues
                         :alias "V"
                         :condition [:= $checkins.venue-id &V.venues.id]}]}))))))
  (testing "Works with breakouts and aggregations"
    (is (= (lib.tu.macros/$ids nil #{%venues.name})
           (lib/all-implicitly-joined-field-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :breakout [[:field $venues.name {:source-field %checkins.venue-id}]]
                :aggregation [[:count]]}))))))
  (testing "Works with filters"
    (is (= (lib.tu.macros/$ids nil #{%venues.name})
           (lib/all-implicitly-joined-field-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :filter [:= [:field $venues.name {:source-field %checkins.venue-id}] "Bird's Nest"]}))))))
  (testing "Works with aggregations"
    (is (= (lib.tu.macros/$ids nil #{%venues.price})
           (lib/all-implicitly-joined-field-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :aggregation [[:sum [:field $venues.price {:source-field %checkins.venue-id}]]]}))))))
  (testing "Works with order-by"
    (is (= (lib.tu.macros/$ids nil #{%venues.name})
           (lib/all-implicitly-joined-field-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :order-by [[:asc [:field $venues.name {:source-field %checkins.venue-id}]]]}))))))
  (testing "Works in join conditions"
    (is (= (lib.tu.macros/$ids nil #{%categories.name})
           (lib/all-implicitly-joined-field-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$venues
                :joins [{:source-table $$users
                         :alias "U"
                         :condition [:= [:field $categories.name {:source-field %venues.category-id}] &U.users.name]}]})))))))

(deftest ^:parallel all-implicitly-joined-table-ids-test
  (testing "Returns table IDs from implicit joins by resolving FK relationships"
    (is (= (lib.tu.macros/$ids nil #{$$venues $$users})
           (lib/all-implicitly-joined-table-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :fields [[:field $venues.name {:source-field %checkins.venue-id}]
                         [:field $users.name {:source-field %checkins.user-id}]]}))))))
  (testing "Returns empty set when no implicit joins"
    (is (= nil
           (lib/all-implicitly-joined-table-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :fields [$checkins.id $checkins.date]}))))))
  (testing "Ignores explicit joins"
    (is (= nil
           (lib/all-implicitly-joined-table-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :fields [[:field $venues.name {:source-field %checkins.venue-id
                                               :join-alias "V"}]]
                :joins [{:source-table $$venues
                         :alias "V"
                         :condition [:= $checkins.venue-id &V.venues.id]}]}))))))
  (testing "Works with breakouts"
    (is (= (lib.tu.macros/$ids nil #{$$venues})
           (lib/all-implicitly-joined-table-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :breakout [[:field $venues.name {:source-field %checkins.venue-id}]]
                :aggregation [[:count]]}))))))
  (testing "Works with filters"
    (is (= (lib.tu.macros/$ids nil #{$$venues})
           (lib/all-implicitly-joined-table-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :filter [:= [:field $venues.name {:source-field %checkins.venue-id}] "Bird's Nest"]}))))))
  (testing "Works with aggregations"
    (is (= (lib.tu.macros/$ids nil #{$$venues})
           (lib/all-implicitly-joined-table-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :aggregation [[:sum [:field $venues.price {:source-field %checkins.venue-id}]]]}))))))
  (testing "Works with order-by"
    (is (= (lib.tu.macros/$ids nil #{$$venues})
           (lib/all-implicitly-joined-table-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$checkins
                :order-by [[:asc [:field $venues.name {:source-field %checkins.venue-id}]]]}))))))
  (testing "Works in join conditions"
    (is (= (lib.tu.macros/$ids nil #{$$categories})
           (lib/all-implicitly-joined-table-ids
            (lib/query
             meta/metadata-provider
             (lib.tu.macros/mbql-query nil
               {:source-table $$venues
                :joins [{:source-table $$users
                         :alias "U"
                         :condition [:= [:field $categories.name {:source-field %venues.category-id}] &U.users.name]}]})))))))

(deftest ^:parallel all-referenced-entity-ids-mbql-test
  (let [products-query (lib/query meta/metadata-provider (meta/table-metadata :products))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 products-query)
        query          (as-> (lib/query mp (meta/table-metadata :orders)) q
                         (lib/join q (lib.metadata/card mp 1))
                         (lib/filter q (lib/= (first (filter #(= "CATEGORY" (:name %)) (lib/filterable-columns q))) "Widget")))]
    (is (= {:table   #{(meta/id :orders)}
            :card    #{1}
            :metric  #{}
            :measure #{}
            :segment #{}
            :snippet #{}}
           (lib/all-referenced-entity-ids [query])))))

(deftest ^:parallel all-referenced-entity-ids-native-test
  (let [query  (lib.query/query-with-stages
                meta/metadata-provider
                [{:lib/type      :mbql.stage/native
                  :native        "SELECT * FROM {{card}} WHERE {{category}} AND {{snippet}}"
                  :template-tags {"card"     {:name         "card"
                                              :display-name "Card"
                                              :type         :card
                                              :card-id      42}
                                  "category" {:name         "category"
                                              :display-name "Category"
                                              :type         :dimension
                                              :dimension    [:field (meta/id :products :category) nil]
                                              :widget-type  :string/=}
                                  "snippet"  {:name         "snippet"
                                              :display-name "Snippet"
                                              :type         :snippet
                                              :snippet-name "my-snippet"
                                              :snippet-id   99}}}])]
    (is (= {:table   #{(meta/id :products)}
            :card    #{42}
            :metric  #{}
            :measure #{}
            :segment #{}
            :snippet #{99}}
           (lib/all-referenced-entity-ids [query])))))