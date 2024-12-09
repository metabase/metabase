(ns metabase.query-processor.middleware.resolve-joins-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(defn- resolve-joins [query]
  (if (qp.store/initialized?)
    (resolve-joins/resolve-joins query)
    (qp.store/with-metadata-provider (mt/id)
      (resolve-joins/resolve-joins query))))

(deftest ^:parallel joins->fields-test
  (is (= [1 2 3 4]
         (#'resolve-joins/joins->fields [{:fields :all}
                                         {:fields [1 2]}
                                         {:fields [3 4]}]))))

(deftest ^:parallel no-op-test
  (testing "Does the middleware function if the query has no joins?"
    (is (= (mt/mbql-query venues)
           (resolve-joins
            (mt/mbql-query venues))))))

(deftest ^:parallel fields-none-test
  (testing "Can we resolve some joins w/ fields = none?"
    (is (= (mt/mbql-query venues
             {:joins
              [{:source-table $$categories
                :alias        "c"
                :strategy     :left-join
                :condition    [:= $category_id &c.categories.id]}]})
           (resolve-joins
            (mt/mbql-query venues
              {:joins [{:source-table $$categories
                        :alias        "c"
                        :condition    [:= $category_id &c.categories.id]
                        :fields       :none}]}))))))

(deftest ^:parallel fields-all-test
  (testing "Can we resolve some joins w/ fields = all ???"
    (is (query= (mt/mbql-query venues
                  {:joins
                   [{:source-table $$categories
                     :alias        "c"
                     :strategy     :left-join
                     :condition    [:= $category_id &c.categories.id]
                     :fields       [&c.categories.id
                                    &c.categories.name]}]
                   :fields [$venues.id
                            $venues.name
                            &c.categories.id
                            &c.categories.name]})
                (resolve-joins
                 (mt/mbql-query venues
                   {:fields [$venues.id $venues.name]
                    :joins  [{:source-table $$categories
                              :alias        "c"
                              :condition    [:= $category_id &c.categories.id]
                              :fields       :all}]}))))))

(deftest ^:parallel fields-sequence-test
  (testing "can we resolve joins w/ fields = <sequence>"
    (is (query= (mt/mbql-query venues
                  {:joins
                   [{:source-table $$categories
                     :alias        "c"
                     :strategy     :left-join
                     :condition    [:= $category_id &c.categories.id]
                     :fields       [&c.categories.name]}]
                   :fields [$venues.id
                            $venues.name
                            &c.categories.name]})
                (resolve-joins
                 (mt/mbql-query venues
                   {:fields [$venues.id $venues.name]
                    :joins  [{:source-table $$categories
                              :alias        "c"
                              :condition    [:= $category_id &c.categories.id]
                              :fields       [&c.categories.name]}]}))))))

(deftest ^:parallel join-table-without-alias-test
  (testing "Does joining a table an explicit alias add a default alias?"
    (is (= (mt/mbql-query venues
             {:joins        [{:source-table $$categories
                              :alias        "__join"
                              :strategy     :left-join
                              :condition    [:= $category_id 1]}
                             {:source-table $$categories
                              :alias        "__join"
                              :strategy     :left-join
                              :condition    [:= $category_id 2]}]
              :source-table (mt/id :venues)})
           (resolve-joins
            (mt/mbql-query venues
              {:joins [{:source-table $$categories
                        :condition    [:= $category_id 1]}
                       {:source-table $$categories
                        :condition    [:= $category_id 2]}]}))))))

(deftest ^:parallel disallow-joins-against-table-on-different-db-test
  (testing "Test that joining against a table in a different DB throws an Exception"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      {:database meta/database
                                       :tables   [(meta/table-metadata :venues)]})
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"\QFailed to fetch :metadata/table\E"
           (resolve-joins
            (mt/mbql-query venues
              {:joins [{:source-table (meta/id :categories)
                        :alias        "t"
                        :condition    [:= $category_id 1]}]})))))))

(deftest ^:parallel resolve-explicit-joins-when-implicit-joins-are-present-test
  (testing "test that resolving explicit joins still works if implict joins are present"
    (is (= (mt/mbql-query checkins
             {:source-table $$checkins
              :aggregation  [[:sum &USERS__via__USER_ID.users.id]]
              :breakout     [$id]
              :joins        [{:source-table $$users
                              :alias        "USERS__via__USER_ID"
                              :strategy     :left-join
                              :condition    [:= $user_id &USERS__via__USER_ID.users.id]
                              :fk-field-id  (mt/id :checkins :user_id)}
                             {:alias        "u"
                              :source-table $$users
                              :strategy     :left-join
                              :condition    [:=
                                             [:field "ID" {:base-type :type/BigInteger}]
                                             &u.users.id]}]
              :limit        10})
           (resolve-joins
            (mt/mbql-query checkins
              {:source-table $$checkins
               :aggregation  [[:sum &USERS__via__USER_ID.users.id]]
               :breakout     [$id]
               :joins        [{:source-table $$users
                               :alias        "USERS__via__USER_ID"
                               :strategy     :left-join
                               :condition    [:= $user_id &USERS__via__USER_ID.users.id]
                               :fk-field-id  (mt/id :checkins :user_id)
                               :fields       :none}
                              {:alias        "u"
                               :source-table $$users
                               :condition    [:=
                                              [:field "ID" {:base-type :type/BigInteger}]
                                              [:field %users.id {:join-alias "u"}]]}]
               :limit        10}))))))

(deftest ^:parallel join-with-source-query-test
  (testing "Does a join using a source query get its Tables resolved?"
    (is (= (mt/mbql-query venues
             {:joins    [{:alias        "cat"
                          :source-query {:source-table $$categories}
                          :strategy     :left-join
                          :condition    [:=
                                         $category_id
                                         [:field "ID" {:base-type :type/BigInteger, :join-alias "cat"}]]}]
              :order-by [[:asc $name]]
              :limit    3})
           (resolve-joins
            (mt/mbql-query venues
              {:joins    [{:alias        "cat"
                           :source-query {:source-table $$categories}
                           :condition    [:=
                                          $category_id
                                          [:field "ID" {:base-type :type/BigInteger, :join-alias "cat"}]]}]
               :order-by [[:asc $name]]
               :limit    3}))))))

(deftest ^:parallel resolve-source-query-with-fields-all-test
  (testing "Can we resolve joins using a `:source-query` and `:fields` `:all`?"
    (let [source-metadata (get-in (qp/process-query
                                   (qp/userland-query
                                    (mt/mbql-query categories {:limit 1})))
                                  [:data :results_metadata :columns])
          resolved        (resolve-joins
                           (mt/mbql-query venues
                             {:joins    [{:alias           "cat"
                                          :source-query    {:source-table $$categories}
                                          :source-metadata source-metadata
                                          :fields          :all
                                          :condition       [:=
                                                            $category_id
                                                            [:field "ID" {:base-type :type/BigInteger, :join-alias "cat"}]]}]
                              :order-by [[:asc $name]]
                              :limit    3}))]
      (is (query= (mt/mbql-query venues
                    {:fields   [[:field (mt/id :categories :id) {:join-alias "cat"}]
                                [:field (mt/id :categories :name) {:join-alias "cat"}]]
                     :joins    [{:alias           "cat"
                                 :source-query    {:source-table $$categories}
                                 :source-metadata source-metadata
                                 :strategy        :left-join
                                 :condition       [:= $category_id [:field "ID" {:base-type :type/BigInteger, :join-alias "cat"}]]
                                 :fields          [&cat.categories.id
                                                   &cat.categories.name]}]
                     :order-by [[:asc $name]]
                     :limit    3})
                  resolved)))))

(deftest ^:parallel dont-append-fields-if-parent-has-breakout-or-aggregation-test
  (testing "if the parent level has a breakout or aggregation, we shouldn't append Join fields to the parent level"
    (is (query= (mt/mbql-query users
                  {:joins       [{:source-table $$checkins
                                  :alias        "c"
                                  :strategy     :left-join
                                  :condition    [:= $id [:field "USER_ID" {:base-type :type/Integer, :join-alias "c"}]]
                                  :fields       [&c.checkins.id
                                                 &c.checkins.date
                                                 &c.checkins.user_id
                                                 &c.checkins.venue_id]}]
                   :aggregation [[:sum [:field "id" {:base-type :type/Float, :join-alias "c"}]]]
                   :breakout    [[:field %last_login {:temporal-unit :month}]]})
                (resolve-joins
                 (mt/mbql-query users
                   {:joins       [{:fields       :all
                                   :alias        "c"
                                   :source-table $$checkins
                                   :condition    [:= $id [:field "USER_ID" {:base-type :type/Integer, :join-alias "c"}]]}]
                    :aggregation [[:sum [:field "id" {:base-type :type/Float, :join-alias "c"}]]]
                    :breakout    [[:field %last_login {:temporal-unit :month}]]}))))))

(deftest ^:parallel aggregation-field-ref-test
  (testing "Should correctly handle [:aggregation n] field refs"
    (is (some? (resolve-joins
                (mt/mbql-query users
                  {:fields [$id
                            $name
                            [:field %last_login {:temporal-unit :default}]]
                   :joins  [{:fields       :all
                             :alias        "__alias__"
                             :condition    [:= $id [:field %checkins.user_id {:join-alias "__alias__"}]]
                             :source-query {:source-table $$checkins
                                            :aggregation  [[:sum $checkins.id]]
                                            :breakout     [$checkins.user_id]}
                             :source-metadata
                             [{:name          "USER_ID"
                               :display_name  "User ID"
                               :base_type     :type/Integer
                               :semantic_type :type/FK
                               :id            %checkins.user_id
                               :field_ref     $checkins.user_id
                               :fingerprint   {:global {:distinct-count 15, :nil% 0.0}}}
                              {:name          "sum"
                               :display_name  "Sum of ID"
                               :base_type     :type/Decimal
                               :semantic_type :type/PK
                               :field_ref     [:aggregation 0]
                               :fingerprint   nil}]}]
                   :limit  10}))))))

(deftest ^:parallel join-against-source-query-test
  (is (query= (mt/mbql-query venues
                {:joins    [{:source-query {:source-table $$categories
                                            :fields       [$categories.id
                                                           $categories.name]}
                             :alias        "cat"
                             :condition    [:= $venues.category_id &cat.*ID/BigInteger]
                             :strategy     :left-join}]
                 :fields   [$venues.id
                            $venues.name
                            $venues.category_id
                            $venues.latitude
                            $venues.longitude
                            $venues.price]
                 :order-by [[:asc $venues.name]]
                 :limit    3})
              (resolve-joins
               (mt/mbql-query venues
                 {:joins    [{:source-query {:source-table $$categories
                                             :fields       [$categories.id
                                                            $categories.name]}
                              :alias        "cat"
                              :condition    [:= $venues.category_id &cat.*ID/BigInteger]}]
                  :fields   [$venues.id
                             $venues.name
                             $venues.category_id
                             $venues.latitude
                             $venues.longitude
                             $venues.price]
                  :order-by [[:asc $venues.name]]
                  :limit    3})))))
