(ns metabase.query-processor.middleware.resolve-joins-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.query-processor :as qp]
            [metabase.query-processor
             [store :as qp.store]
             [test-util :as qp.test-util]]
            [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

(defn- resolve-joins [{{:keys [source-table]} :query, :as query}]
  (if-not (qp.store/initialized?)
    (qp.store/with-store
      (resolve-joins query))
    (do
      (qp.test-util/store-referenced-database! query)
      (qp.store/fetch-and-store-tables! [source-table])
      (#'resolve-joins/resolve-joins* query))))

;; Does the middleware function if the query has no joins?
(expect
  (data/mbql-query venues)
  (resolve-joins
   (data/mbql-query venues)))

(defn- resolve-joins-and-inspect-store [query]
  (qp.store/with-store
    (qp.test-util/store-referenced-database! query)
    {:resolved (resolve-joins query)
     :store    (qp.test-util/store-contents)}))

;; Can we resolve some joins w/ fields = none?
(expect
  {:resolved
   (data/mbql-query venues
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
   (data/mbql-query venues
     {:joins [{:source-table $$categories
               :alias        "c"
               :condition    [:= $category_id [:joined-field "c" $categories.id]]
               :fields       :none}]})))

;; Can we resolve some joins w/ fields = all ???
(expect
  {:resolved
   (data/mbql-query venues
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
   (data/mbql-query venues
     {:fields [$venues.id $venues.name]
      :joins  [{:source-table $$categories
                :alias        "c"
                :condition    [:= $category_id [:joined-field "c" $categories.id]]
                :fields       :all}]})))

;; can we resolve joins w/ fields = <sequence>
(expect
  {:resolved
   (data/mbql-query venues
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
   (data/mbql-query venues
     {:fields [$venues.id $venues.name]
      :joins  [{:source-table $$categories
                :alias        "c"
                :condition    [:= $category_id [:joined-field "c" $categories.id]]
                :fields       [[:joined-field "c" $categories.name]]}]})))

;; Does joining the same table twice without an explicit alias give both joins unique aliases?
(expect
  (data/mbql-query venues
    {:joins        [{:source-table $$categories
                     :alias        "source"
                     :strategy     :left-join
                     :condition    [:= $category_id 1]}
                    {:source-table $$categories
                     :alias        "source_2"
                     :strategy     :left-join
                     :condition    [:= $category_id 2]}],
     :source-table (data/id :venues)})
  (resolve-joins
   (data/mbql-query venues
     {:joins [{:source-table $$categories
               :condition    [:= $category_id 1]}
              {:source-table $$categories
               :condition    [:= $category_id 2]}]})))

;; Should throw an Exception if a Joined Field using an alias that doesn't exist is used
(expect
  IllegalArgumentException
  (resolve-joins
   (data/mbql-query venues
     {:joins [{:source-table $$categories
               :condition    [:= $category_id [:joined-field "x" $categories.id]]}]})))

;; Test that joining against a table in a different DB throws an Exception
(expect
  clojure.lang.ExceptionInfo
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]]
    (resolve-joins
     (data/mbql-query venues
       {:joins [{:source-table table-id
                 :alias        "t"
                 :condition    [:= $category_id 1]}]}))))

;; test that resolving explicit joins still works if implict joins are present
(expect
  (data/mbql-query checkins
    {:source-table $$checkins
     :aggregation  [[:sum [:joined-field "USERS__via__USER_ID" $users.id]]]
     :breakout     [$id]
     :joins        [{:source-table $$users
                     :alias        "USERS__via__USER_ID"
                     :strategy     :left-join
                     :condition    [:= $user_id [:joined-field "USERS__via__USER_ID" $users.id]]
                     :fk-field-id  (data/id :checkins :user_id)}
                    {:alias        "u"
                     :source-table $$users
                     :strategy     :left-join
                     :condition    [:=
                                    [:field-literal "ID" :type/BigInteger]
                                    [:joined-field "u" $users.id]]}]
     :limit        10})
  (resolve-joins
   (data/mbql-query checkins
     {:source-table $$checkins
      :aggregation  [[:sum [:joined-field "USERS__via__USER_ID" $users.id]]]
      :breakout     [$id]
      :joins        [{:source-table $$users
                      :alias        "USERS__via__USER_ID"
                      :strategy     :left-join
                      :condition    [:= $user_id [:joined-field "USERS__via__USER_ID" $users.id]]
                      :fk-field-id  (data/id :checkins :user_id)
                      :fields       :none}
                     {:alias        "u"
                      :source-table $$users
                      :condition    [:=
                                     [:field-literal "ID" :type/BigInteger]
                                     [:joined-field "u" $users.id]]}]
      :limit        10})))

;; Does a join using a source query get its Tables resolved?
(expect
  {:store
   {:database "test-data",
    :tables   #{"VENUES" "CATEGORIES"}
    :fields   #{["VENUES" "CATEGORY_ID"]}}

   :resolved
   (data/mbql-query venues
     {:joins    [{:alias        "cat"
                  :source-query {:source-table $$categories}
                  :strategy     :left-join
                  :condition    [:=
                                 $category_id
                                 [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
      :order-by [[:asc $name]]
      :limit    3})}
  (resolve-joins-and-inspect-store
   (data/mbql-query venues
     {:joins    [{:alias        "cat"
                  :source-query {:source-table $$categories}
                  :condition    [:=
                                 $category_id
                                 [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
      :order-by [[:asc $name]]
      :limit    3})))

(deftest resolve-source-query-with-fields-all-test
  (testing "Can we resolve joins using a `:source-query` and `:fields` `:all`?"
    (let [source-metadata          (get-in (qp/process-userland-query (data/mbql-query categories {:limit 1}))
                                           [:data :results_metadata :columns])
          {:keys [resolved store]} (resolve-joins-and-inspect-store
                                    (data/mbql-query venues
                                      {:joins    [{:alias           "cat"
                                                   :source-query    {:source-table $$categories}
                                                   :source-metadata source-metadata
                                                   :fields          :all
                                                   :condition       [:=
                                                                     $category_id
                                                                     [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
                                       :order-by [[:asc $name]]
                                       :limit    3}))]
      (is (= (data/mbql-query venues
               {:fields   [[:joined-field "cat" [:field-literal "ID" :type/BigInteger]]
                           [:joined-field "cat" [:field-literal "NAME" :type/Text]]]
                :joins    [{:alias           "cat"
                            :source-query    {:source-table $$categories}
                            :source-metadata source-metadata
                            :strategy        :left-join
                            :condition       [:= $category_id [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
                :order-by [[:asc $name]]
                :limit    3})
             resolved))
      (is (= {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{["VENUES" "CATEGORY_ID"]}}
             store)))))

;; if the parent level has a breakout or aggregation, we shouldn't append Join fields to the parent level
(expect
  (data/mbql-query users
    {:joins       [{:source-table $$checkins
                    :alias        "c"
                    :strategy     :left-join
                    :condition    [:= $id [:joined-field "c" [:field-literal "USER_ID" :type/Integer]]]}],
     :aggregation [[:sum [:joined-field "c" [:field-literal "id" :type/Float]]]]
     :breakout    [[:datetime-field $last_login :month]]})
  (resolve-joins
   (data/mbql-query users
     {:joins       [{:fields       :all
                     :alias        "c"
                     :source-table $$checkins
                     :condition    [:= $id [:joined-field "c" [:field-literal "USER_ID" :type/Integer]]]}]
      :aggregation [[:sum [:joined-field "c" [:field-literal "id" :type/Float]]]]
      :breakout    [[:datetime-field $last_login :month]]})))
