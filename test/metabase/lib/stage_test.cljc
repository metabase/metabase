(ns metabase.lib.stage-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(comment lib/keep-me)

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel col-info-field-ids-test
  (testing "make sure columns are coming back the way we'd expect for :field clauses"
    (let [query {:lib/type     :mbql/query
                 :type         :pipeline
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :lib/options  {:lib/uuid "0311c049-4973-4c2a-8153-1e2c887767f9"}
                                 :source-table (meta/id :venues)
                                 :fields       [(lib.tu/field-clause :venues :price)]}]
                 :database     (meta/id)
                 :lib/metadata meta/metadata-provider}]
      (is (mc/validate ::lib.schema/query query))
      (is (=? [(merge (meta/field-metadata :venues :price)
                      {:lib/source :source/fields})]
              (lib.metadata.calculation/metadata query -1 query))))))

(deftest ^:parallel deduplicate-expression-names-in-aggregations-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (let [query (lib.tu/venues-query-with-last-stage
                   {:aggregation [[:*
                                   {}
                                   0.9
                                   [:avg {} (lib.tu/field-clause :venues :price)]]
                                  [:*
                                   {}
                                   0.8
                                   [:avg {} (lib.tu/field-clause :venues :price)]]]})]
        (is (=? [{:base_type    :type/Float
                  :name         "0_9_times_avg_price"
                  :display_name "0.9 × Average of Price"}
                 {:base_type    :type/Float
                  :name         "0_8_times_avg_price"
                  :display_name "0.8 × Average of Price"}]
                (lib.metadata.calculation/metadata query -1 query)))))))

(deftest ^:parallel stage-display-name-card-source-query
  (let [query {:lib/type     :mbql/query
               :lib/metadata (lib.tu/mock-metadata-provider
                              {:cards [{:id   1
                                        :name "My Card"}]})
               :type         :pipeline
               :database     (meta/id)
               :stages       [{:lib/type     :mbql.stage/mbql
                               :lib/options  {:lib/uuid (str (random-uuid))}
                               :source-table "card__1"}]}]
    (is (= "My Card"
           (lib.metadata.calculation/display-name query -1 query)))))

(deftest ^:parallel adding-and-removing-stages
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
        query-with-new-stage (-> query
                                 lib/append-stage
                                 (lib/order-by 1 (lib/field "VENUES" "NAME") :asc))]
    (is (= 0 (count (lib/order-bys query-with-new-stage 0))))
    (is (= 1 (count (lib/order-bys query-with-new-stage 1))))
    (is (= query
           (-> query-with-new-stage
               (lib/filter (lib/= 1 (lib/field "VENUES" "NAME")))
               (lib/drop-stage))))
    (testing "Dropping with 1 stage should error"
      (is (thrown-with-msg? #?(:cljs :default :clj Exception) #"Cannot drop the only stage" (-> query (lib/drop-stage)))))))

(defn- query-with-expressions []
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "ID + 1" (lib/+ (lib/field "VENUES" "ID") 1))
                  (lib/expression "ID + 2" (lib/+ (lib/field "VENUES" "ID") 2)))]
    (is (=? {:stages [{:expressions {"ID + 1" [:+ {} [:field {} (meta/id :venues :id)] 1]
                                     "ID + 2" [:+ {} [:field {} (meta/id :venues :id)] 2]}}]}
            query))
    query))

(deftest ^:parallel default-fields-metadata-include-expressions-test
  (testing "all expressions should come back by default if `:fields` is not specified (#29734)"
    (is (=? [{:id (meta/id :venues :id),          :name "ID",          :lib/source :source/table-defaults}
             {:id (meta/id :venues :name),        :name "NAME",        :lib/source :source/table-defaults}
             {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :lib/source :source/table-defaults}
             {:id (meta/id :venues :latitude),    :name "LATITUDE",    :lib/source :source/table-defaults}
             {:id (meta/id :venues :longitude),   :name "LONGITUDE",   :lib/source :source/table-defaults}
             {:id (meta/id :venues :price),       :name "PRICE",       :lib/source :source/table-defaults}
             {:name "ID + 1", :lib/source :source/expressions}
             {:name "ID + 2", :lib/source :source/expressions}]
            (lib.metadata.calculation/metadata (query-with-expressions))))))

(deftest ^:parallel default-fields-metadata-return-expressions-before-joins-test
  (testing "expressions should come back BEFORE columns from joins"
    (let [query (-> (query-with-expressions)
                    (lib/join (-> (lib/join-clause (lib/table (meta/id :categories)))
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all))
                              (lib/=
                               (lib/field "VENUES" "CATEGORY_ID")
                               (-> (lib/field "CATEGORIES" "ID") (lib/with-join-alias "Cat")))))]
      (is (=? {:stages [{:joins       [{:alias     "Cat"
                                        :stages    [{:source-table (meta/id :categories)}]
                                        :condition [:=
                                                    {}
                                                    [:field {} (meta/id :venues :category-id)]
                                                    [:field {:join-alias "Cat"} (meta/id :categories :id)]]
                                        :fields    :all}]
                         :expressions {"ID + 1" [:+ {} [:field {} (meta/id :venues :id)] 1]
                                       "ID + 2" [:+ {} [:field {} (meta/id :venues :id)] 2]}}]}
              query))
      (is (=? [{:id (meta/id :venues :id),          :name "ID",          :lib/source :source/table-defaults}
               {:id (meta/id :venues :name),        :name "NAME",        :lib/source :source/table-defaults}
               {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :lib/source :source/table-defaults}
               {:id (meta/id :venues :latitude),    :name "LATITUDE",    :lib/source :source/table-defaults}
               {:id (meta/id :venues :longitude),   :name "LONGITUDE",   :lib/source :source/table-defaults}
               {:id (meta/id :venues :price),       :name "PRICE",       :lib/source :source/table-defaults}
               {:name "ID + 1", :lib/source :source/expressions}
               {:name "ID + 2", :lib/source :source/expressions}
               {:id           (meta/id :categories :id)
                :name         "ID_2"
                :lib/source   :source/joins
                :source_alias "Cat"
                :display_name "Categories → ID"}
               {:id           (meta/id :categories :name)
                :name         "NAME_2"
                :lib/source   :source/joins
                :source_alias "Cat"
                :display_name "Categories → Name"}]
              (lib.metadata.calculation/metadata query))))))

(deftest ^:parallel metadata-with-fields-only-include-expressions-in-fields-test
  (testing "If query includes :fields, only return expressions that are in :fields"
    (let [query     (query-with-expressions)
          id-plus-1 (first (lib/expressions query))]
      (is (=? {:lib/type     :metadata/field
               :base_type    :type/Integer
               :name         "ID + 1"
               :display_name "ID + 1"
               :lib/source   :source/expressions}
              id-plus-1))
      (let [query' (-> query
                       (lib/fields [id-plus-1]))]
        (is (=? {:stages [{:expressions {"ID + 1" [:+ {} [:field {} (meta/id :venues :id)] 1]
                                         "ID + 2" [:+ {} [:field {} (meta/id :venues :id)] 2]}
                           :fields      [[:expression {} "ID + 1"]]}]}
                query'))
        (testing "If `:fields` is specified, expressions should only come back if they are in `:fields`"
          (is (=? [{:name       "ID + 1"
                    ;; TODO -- I'm not really sure whether the source should be `:source/expressions` here, or
                    ;; `:source/fields`, since it's present in BOTH...
                    :lib/source :source/expressions}]
                  (lib.metadata.calculation/metadata query')))
          (testing "Should be able to convert the metadata back into a reference"
            (let [[id-plus-1] (lib.metadata.calculation/metadata query')]
              (is (=? [:expression {:base-type :type/Integer, :effective-type :type/Integer} "ID + 1"]
                      (lib/ref id-plus-1))))))))))
