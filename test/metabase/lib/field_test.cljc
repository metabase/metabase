(ns metabase.lib.field-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel field-from-results-metadata-test
  (let [field-metadata (lib.metadata/stage-column (lib/saved-question-query
                                                   meta/metadata-provider
                                                   meta/saved-question)
                                                  "ID")]
    (is (=? {:lib/type :metadata/field
             :name     "ID"}
            field-metadata))
    (is (=? [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]
            (lib/ref field-metadata)))))

(defn- grandparent-parent-child-id [field]
  (+ (meta/id :venues :id)
     (case field
       :grandparent 50
       :parent      60
       :child       70)))

(def ^:private grandparent-parent-child-metadata-provider
  "A MetadataProvider for a Table that nested Fields: grandparent, parent, and child"
  (let [grandparent {:lib/type  :metadata/field
                     :name      "grandparent"
                     :id        (grandparent-parent-child-id :grandparent)
                     :base_type :type/Text}
        parent      {:lib/type  :metadata/field
                     :name      "parent"
                     :parent_id (grandparent-parent-child-id :grandparent)
                     :id        (grandparent-parent-child-id :parent)
                     :base_type :type/Text}
        child       {:lib/type  :metadata/field
                     :name      "child"
                     :parent_id (grandparent-parent-child-id :parent)
                     :id        (grandparent-parent-child-id :child)
                     :base_type :type/Text}]
    (lib.tu/mock-metadata-provider
     {:database meta/metadata
      :tables   [(meta/table-metadata :venues)]
      :fields   (mapv (fn [field-metadata]
                        (merge {:visibility_type :normal
                                :table_id        (meta/id :venues)}
                               field-metadata))
                      [grandparent parent child])})))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (letfn [(col-info [a-field-clause]
            (lib.metadata.calculation/metadata
             {:lib/type     :mbql/query
              :lib/metadata grandparent-parent-child-metadata-provider
              :type         :pipeline
              :database     (meta/id)
              :stages       [{:lib/type     :mbql.stage/mbql
                              :lib/options  {:lib/uuid (str (random-uuid))}
                              :source-table (meta/id :venues)}]}
             -1
             a-field-clause))]
    (testing "For fields with parents we should return them with a combined name including parent's name"
      (is (=? {:table_id          (meta/id :venues)
               :name              "grandparent.parent"
               :parent_id         (grandparent-parent-child-id :grandparent)
               :id                (grandparent-parent-child-id :parent)
               :visibility_type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (grandparent-parent-child-id :parent)]))))
    (testing "nested-nested fields should include grandparent name (etc)"
      (is (=? {:table_id          (meta/id :venues)
               :name              "grandparent.parent.child"
               :parent_id         (grandparent-parent-child-id :parent)
               :id                (grandparent-parent-child-id :child)
               :visibility_type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (grandparent-parent-child-id :child)]))))))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:lib/stage-metadata` if it was supplied"
    (is (=? {:name          "sum"
             :display_name  "sum of User ID"
             :base_type     :type/Integer
             :semantic_type :type/FK}
            (lib.metadata.calculation/metadata
             (lib.tu/native-query)
             -1
             [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "sum"])))))

(deftest ^:parallel joined-field-display-name-test
  (let [query {:lib/type     :mbql/query
               :type         :pipeline
               :stages       [{:lib/type     :mbql.stage/mbql
                               :lib/options  {:lib/uuid "fdcfaa06-8e65-471d-be5a-f1e821022482"}
                               :source-table (meta/id :venues)
                               :fields       [[:field
                                               {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
                                               (meta/id :categories :name)]]
                               :joins        [{:lib/type    :mbql/join
                                               :lib/options {:lib/uuid "490a5abb-54c2-4e62-9196-7e9e99e8d291"}
                                               :alias       "CATEGORIES__via__CATEGORY_ID"
                                               :conditions  [[:=
                                                              {:lib/uuid "cc5f6c43-1acb-49c2-aeb5-e3ff9c70541f"}
                                                              (lib.tu/field-clause :venues :category-id)
                                                              (lib.tu/field-clause :categories :id {:join-alias "CATEGORIES__via__CATEGORY_ID"})]]
                                               :strategy    :left-join
                                               :fk-field-id (meta/id :venues :category-id)
                                               :stages      [{:lib/type     :mbql.stage/mbql
                                                              :lib/options  {:lib/uuid "bbbae500-c972-4550-b100-e0584eb72c4d"}
                                                              :source-table (meta/id :categories)}]}]}]
               :database     (meta/id)
               :lib/metadata meta/metadata-provider}
        field [:field
               {:join-alias "CATEGORIES__via__CATEGORY_ID"
                :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
               (meta/id :categories :name)]]
    (is (= "Categories → Name"
           (lib.metadata.calculation/display-name query -1 field)))
    (is (=? {:display_name "Categories → Name"}
            (lib.metadata.calculation/metadata query -1 field)))))

(deftest ^:parallel field-with-temporal-unit-test
  (let [query (lib/query-for-table-name meta/metadata-provider "CHECKINS")
        f (lib/temporal-bucket (lib/field (meta/id :checkins :date)) :year)]
    (is (fn? f))
    (let [field (f query -1)]
      (is (=? [:field {:temporal-unit :year} (meta/id :checkins :date)]
              field))
      (is (=? :year
              (lib.temporal-bucket/current-temporal-bucket (lib.metadata.calculation/metadata query -1 field))))
      (is (= "Date (year)"
             (lib.metadata.calculation/display-name query -1 field))))))

(deftest ^:parallel joined-field-column-name-test
  (let [card  {:dataset_query {:database (meta/id)
                               :type     :query
                               :query    {:source-table (meta/id :venues)
                                          :joins        [{:fields       :all
                                                          :source-table (meta/id :categories)
                                                          :conditions   [[:=
                                                                          [:field (meta/id :venues :category-id) nil]
                                                                          [:field (meta/id :categories :id) {:join-alias "Cat"}]]]
                                                          :alias        "Cat"}]}}}
        query (lib/saved-question-query
               meta/metadata-provider
               card)]
    (is (=? [{:lib/desired-column-alias "ID"}
             {:lib/desired-column-alias "NAME"}
             {:lib/desired-column-alias "CATEGORY_ID"}
             {:lib/desired-column-alias "LATITUDE"}
             {:lib/desired-column-alias "LONGITUDE"}
             {:lib/desired-column-alias "PRICE"}
             {:lib/desired-column-alias "Cat__ID"}
             {:lib/desired-column-alias "Cat__NAME"}]
            (lib.metadata.calculation/metadata query)))))

(deftest ^:parallel field-ref-type-of-test
  (testing "Make sure we can calculate field ref type information correctly"
    (let [clause [:field {:lib/uuid (str (random-uuid))} (meta/id :venues :id)]]
      (is (= ::lib.schema.expression/type.unknown
             (lib.schema.expression/type-of clause)))
      (is (= :type/BigInteger
             (lib.metadata.calculation/type-of lib.tu/venues-query clause))))))

(deftest ^:parallel implicitly-joinable-field-display-name-test
  (testing "Should be able to calculate a display name for an implicitly joinable Field"
    (let [query           (lib/query-for-table-name meta/metadata-provider "VENUES")
          categories-name (m/find-first #(= (:id %) (meta/id :categories :name))
                                        (lib/orderable-columns query))]
      (is (= "Categories → Name"
             (lib/display-name query categories-name)))
      (let [query' (lib/order-by query categories-name)]
        (is (= "Venues, Sorted by Categories → Name ascending"
               (lib/describe-query query')))))))

(deftest ^:parallel source-card-table-display-info-test
  (let [query (assoc lib.tu/venues-query :lib/metadata lib.tu/metadata-provider-with-card)
        field (lib.metadata.calculation/metadata query (assoc (lib.metadata/field query (meta/id :venues :name))
                                                              :table_id "card__1"))]
    (is (=? {:name           "NAME"
             :display_name   "Name"
             :semantic_type  :type/Name
             :effective_type :type/Text
             :table          {:name "My Card", :display_name "My Card"}}
            (lib/display-info query field)))))

(deftest ^:parallel resolve-column-name-in-join-test
  (testing ":field refs with string names should work if the Field comes from a :join"
    (let [card-1            {:name          "My Card"
                             :id            1
                             :dataset_query {:database (meta/id)
                                             :type     :query
                                             :query    {:source-table (meta/id :checkins)
                                                        :aggregation  [[:count]]
                                                        :breakout     [[:field (meta/id :checkins :user-id) nil]]}}}
          metadata-provider (lib.tu/composed-metadata-provider
                             meta/metadata-provider
                             (lib.tu/mock-metadata-provider
                              {:cards [card-1]}))
          query             {:lib/type     :mbql/query
                             :lib/metadata metadata-provider
                             :database     (meta/id)
                             :type         :pipeline
                             :stages       [{:lib/type     :mbql.stage/mbql
                                             :source-table (meta/id :checkins)
                                             :joins        [{:lib/type    :mbql/join
                                                             :lib/options {:lib/uuid "d7ebb6bd-e7ac-411a-9d09-d8b18329ad46"}
                                                             :stages      [{:lib/type     :mbql.stage/mbql
                                                                            :source-table "card__1"}]
                                                             :alias       "checkins_by_user"
                                                             :conditions  [[:=
                                                                            {:lib/uuid "1cb124b0-757f-4717-b8ee-9cf12a7c3f62"}
                                                                            [:field
                                                                             {:lib/uuid "a2eb96a0-420b-4465-817d-f3c9f789eff4"}
                                                                             (meta/id :users :id)]
                                                                            [:field
                                                                             {:base-type  :type/Integer
                                                                              :join-alias "checkins_by_user"
                                                                              :lib/uuid   "b23a769d-774a-4eb5-8fb8-1f6a33c9a8d5"}
                                                                             "USER_ID"]]]
                                                             :fields      :all}]
                                             :breakout     [[:field
                                                             {:temporal-unit :month, :lib/uuid "90c646e8-ed1c-42d3-b50c-c51b21286852"}
                                                             (meta/id :users :last-login)]]
                                             :aggregation  [[:avg
                                                             {:lib/uuid "2e97a042-5eec-4c18-acda-e5485f794c60"}
                                                             [:field
                                                              {:base-type  :type/Float
                                                               :join-alias "checkins_by_user"
                                                               :lib/uuid   "222b407e-ca3f-4bce-81cb-0ddfb1c6a79c"}
                                                              "count"]]]}]}]
      (is (=? [{:id                       (meta/id :users :last-login)
                :name                     "LAST_LOGIN"
                :lib/source               :source/breakouts
                :lib/source-column-alias  "LAST_LOGIN"
                :lib/desired-column-alias "LAST_LOGIN"}
               {:name                     "avg_count"
                :lib/source               :source/aggregations
                :lib/source-column-alias  "avg_count"
                :lib/desired-column-alias "avg_count"}]
              (lib.metadata.calculation/metadata query))))))
