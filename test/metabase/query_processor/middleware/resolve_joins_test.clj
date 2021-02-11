(ns metabase.query-processor.middleware.resolve-joins-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Database Table]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test :as mt]))

(defn- resolve-joins [{{:keys [source-table]} :query, :as query}]
  (mt/with-everything-store
    (#'resolve-joins/resolve-joins* query)))

(deftest no-op-test
  (testing "Does the middleware function if the query has no joins?"
    (is (= (mt/mbql-query venues)
           (resolve-joins
            (mt/mbql-query venues))))))

(defn- resolve-joins-and-inspect-store [query]
  (qp.store/with-store
    (qp.test-util/store-referenced-database! query)
    {:resolved (resolve-joins query)
     :store    (qp.test-util/store-contents)}))

(deftest fields-none-test
  (testing "Can we resolve some joins w/ fields = none?"
    (is (= {:resolved
            (mt/mbql-query venues
              {:joins
               [{:source-table $$categories
                 :alias        "c",
                 :strategy     :left-join
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]})
            :store
            {:database "test-data",
             :tables   #{"CATEGORIES" "VENUES"},
             :fields   #{["CATEGORIES" "ID"] ["VENUES" "CATEGORY_ID"]}}}
           (resolve-joins-and-inspect-store
            (mt/mbql-query venues
              {:joins [{:source-table $$categories
                        :alias        "c"
                        :condition    [:= $category_id [:joined-field "c" $categories.id]]
                        :fields       :none}]}))))))

(deftest fields-all-test
  (testing "Can we resolve some joins w/ fields = all ???"
    (is (= {:resolved
            (mt/mbql-query venues
              {:joins
               [{:source-table $$categories
                 :alias        "c"
                 :strategy     :left-join
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]
               :fields [$venues.id
                        $venues.name
                        [:joined-field "c" $categories.id]
                        [:joined-field "c" $categories.name]]})
            :store
            {:database "test-data"
             :tables   #{"CATEGORIES" "VENUES"}
             :fields   #{["CATEGORIES" "ID"]
                         ["VENUES" "CATEGORY_ID"]
                         ["CATEGORIES" "NAME"]}}}
           (resolve-joins-and-inspect-store
            (mt/mbql-query venues
              {:fields [$venues.id $venues.name]
               :joins  [{:source-table $$categories
                         :alias        "c"
                         :condition    [:= $category_id [:joined-field "c" $categories.id]]
                         :fields       :all}]}))))))

(deftest fields-sequence-test
  (testing "can we resolve joins w/ fields = <sequence>"
    (is (= {:resolved
            (mt/mbql-query venues
              {:joins
               [{:source-table $$categories
                 :alias        "c"
                 :strategy     :left-join
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]
               :fields [$venues.id
                        $venues.name
                        [:joined-field "c" $categories.name]]})
            :store
            {:database "test-data"
             :tables   #{"CATEGORIES" "VENUES"}
             :fields   #{["CATEGORIES" "ID"]
                         ["VENUES" "CATEGORY_ID"]
                         ["CATEGORIES" "NAME"]}}}
           (resolve-joins-and-inspect-store
            (mt/mbql-query venues
              {:fields [$venues.id $venues.name]
               :joins  [{:source-table $$categories
                         :alias        "c"
                         :condition    [:= $category_id [:joined-field "c" $categories.id]]
                         :fields       [[:joined-field "c" $categories.name]]}]}))))))

(deftest join-same-table-twice-test
  (testing "Does joining the same table twice without an explicit alias give both joins unique aliases?"
    (is (= (mt/mbql-query venues
             {:joins        [{:source-table $$categories
                              :alias        "source"
                              :strategy     :left-join
                              :condition    [:= $category_id 1]}
                             {:source-table $$categories
                              :alias        "source_2"
                              :strategy     :left-join
                              :condition    [:= $category_id 2]}],
              :source-table (mt/id :venues)})
           (resolve-joins
            (mt/mbql-query venues
              {:joins [{:source-table $$categories
                        :condition    [:= $category_id 1]}
                       {:source-table $$categories
                        :condition    [:= $category_id 2]}]}))))))

(deftest disallow-joins-against-table-on-different-db-test
  (testing "Test that joining against a table in a different DB throws an Exception"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}    {:db_id database-id}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Table does not exist, or belongs to a different Database"
           (resolve-joins
            (mt/mbql-query venues
              {:joins [{:source-table table-id
                        :alias        "t"
                        :condition    [:= $category_id 1]}]})))))))

(deftest resolve-explicit-joins-when-implicit-joins-are-present-test
  (testing "test that resolving explicit joins still works if implict joins are present"
    (is (= (mt/mbql-query checkins
             {:source-table $$checkins
              :aggregation  [[:sum [:joined-field "USERS__via__USER_ID" $users.id]]]
              :breakout     [$id]
              :joins        [{:source-table $$users
                              :alias        "USERS__via__USER_ID"
                              :strategy     :left-join
                              :condition    [:= $user_id [:joined-field "USERS__via__USER_ID" $users.id]]
                              :fk-field-id  (mt/id :checkins :user_id)}
                             {:alias        "u"
                              :source-table $$users
                              :strategy     :left-join
                              :condition    [:=
                                             [:field-literal "ID" :type/BigInteger]
                                             [:joined-field "u" $users.id]]}]
              :limit        10})
           (resolve-joins
            (mt/mbql-query checkins
              {:source-table $$checkins
               :aggregation  [[:sum [:joined-field "USERS__via__USER_ID" $users.id]]]
               :breakout     [$id]
               :joins        [{:source-table $$users
                               :alias        "USERS__via__USER_ID"
                               :strategy     :left-join
                               :condition    [:= $user_id [:joined-field "USERS__via__USER_ID" $users.id]]
                               :fk-field-id  (mt/id :checkins :user_id)
                               :fields       :none}
                              {:alias        "u"
                               :source-table $$users
                               :condition    [:=
                                              [:field-literal "ID" :type/BigInteger]
                                              [:joined-field "u" $users.id]]}]
               :limit        10}))))))

(deftest join-with-source-query-test
  (testing "Does a join using a source query get its Tables resolved?"
    (is (= {:store
            {:database "test-data",
             :tables   #{"VENUES" "CATEGORIES"}
             :fields   #{["VENUES" "CATEGORY_ID"]}}

            :resolved
            (mt/mbql-query venues
              {:joins    [{:alias        "cat"
                           :source-query {:source-table $$categories}
                           :strategy     :left-join
                           :condition    [:=
                                          $category_id
                                          [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
               :order-by [[:asc $name]]
               :limit    3})}
           (resolve-joins-and-inspect-store
            (mt/mbql-query venues
              {:joins    [{:alias        "cat"
                           :source-query {:source-table $$categories}
                           :condition    [:=
                                          $category_id
                                          [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
               :order-by [[:asc $name]]
               :limit    3}))))))

(deftest resolve-source-query-with-fields-all-test
  (testing "Can we resolve joins using a `:source-query` and `:fields` `:all`?"
    (let [source-metadata          (get-in (qp/process-userland-query (mt/mbql-query categories {:limit 1}))
                                           [:data :results_metadata :columns])
          {:keys [resolved store]} (resolve-joins-and-inspect-store
                                    (mt/mbql-query venues
                                      {:joins    [{:alias           "cat"
                                                   :source-query    {:source-table $$categories}
                                                   :source-metadata source-metadata
                                                   :fields          :all
                                                   :condition       [:=
                                                                     $category_id
                                                                     [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
                                       :order-by [[:asc $name]]
                                       :limit    3}))]
      (is (= (mt/mbql-query venues
               {:fields   [[:joined-field "cat" [:field-id (mt/id :categories :id)]]
                           [:joined-field "cat" [:field-id (mt/id :categories :name)]]]
                :joins    [{:alias           "cat"
                            :source-query    {:source-table $$categories}
                            :source-metadata source-metadata
                            :strategy        :left-join
                            :condition       [:= $category_id [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
                :order-by [[:asc $name]]
                :limit    3})
             resolved))
      (is (= {:database "test-data"
              :tables   #{"CATEGORIES" "VENUES"}
              :fields   #{["CATEGORIES" "ID"] ["VENUES" "CATEGORY_ID"] ["CATEGORIES" "NAME"]}}
             store)))))

(deftest dont-append-fields-if-parent-has-breakout-or-aggregation-test
  (testing "if the parent level has a breakout or aggregation, we shouldn't append Join fields to the parent level"
    (is (= (mt/mbql-query users
             {:joins       [{:source-table $$checkins
                             :alias        "c"
                             :strategy     :left-join
                             :condition    [:= $id [:joined-field "c" [:field-literal "USER_ID" :type/Integer]]]}],
              :aggregation [[:sum [:joined-field "c" [:field-literal "id" :type/Float]]]]
              :breakout    [[:datetime-field $last_login :month]]})
           (resolve-joins
            (mt/mbql-query users
              {:joins       [{:fields       :all
                              :alias        "c"
                              :source-table $$checkins
                              :condition    [:= $id [:joined-field "c" [:field-literal "USER_ID" :type/Integer]]]}]
               :aggregation [[:sum [:joined-field "c" [:field-literal "id" :type/Float]]]]
               :breakout    [[:datetime-field $last_login :month]]}))))))
