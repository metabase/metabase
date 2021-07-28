(ns metabase.query-processor-test.implicit-joins-test
  "Tests for joins that are created automatically when an `:fk->` column is present."
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.test :as mt]))

(deftest breakout-on-fk-field-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (testing "Test that we can breakout on an FK field (Note how the FK Field is returned in the results)"
      (mt/dataset tupac-sightings
        ;; The top 10 cities by number of Tupac sightings
        (is (= [["Arlington"    16]
                ["Albany"       15]
                ["Portland"     14]
                ["Louisville"   13]
                ["Philadelphia" 13]
                ["Anchorage"    12]
                ["Lincoln"      12]
                ["Houston"      11]
                ["Irvine"       11]
                ["Lakeland"     11]]
               (mt/formatted-rows [str int]
                 (mt/run-mbql-query sightings
                   {:aggregation [[:count]]
                    :breakout    [$city_id->cities.name]
                    :order-by    [[:desc [:aggregation 0]]]
                    :limit       10}))))))))

(deftest filter-by-fk-field-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (testing "Test that we can filter on an FK field"
      (mt/dataset tupac-sightings
        ;; Number of Tupac sightings in the Expa office (he was spotted here 60 times)
        (is (= [[60]]
               (mt/formatted-rows [int]
                 (mt/run-mbql-query sightings
                   {:aggregation [[:count]]
                    :filter      [:= $category_id->categories.id 8]}))))))))

(deftest fk-field-in-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (testing "Check that we can include an FK field in `:fields`"
      (mt/dataset tupac-sightings
        ;; THE 10 MOST RECENT TUPAC SIGHTINGS (!) (What he was doing when we saw him, sighting ID)
        (is (= [[772 "In the Park"]
                [894 "Working at a Pet Store"]
                [684 "At the Airport"]
                [199 "At a Restaurant"]
                [33 "Working as a Limo Driver"]
                [902 "At Starbucks"]
                [927 "On TV"]
                [996 "At a Restaurant"]
                [897 "Wearing a Biggie Shirt"]
                [499 "In the Expa Office"]]
               (mt/formatted-rows [int str]
                 (mt/run-mbql-query sightings
                   {:fields   [$id $category_id->categories.name]
                    :order-by [[:desc $timestamp]]
                    :limit    10}))))))))

(deftest join-multiple-tables-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (testing (str "1. Check that we can order by Foreign Keys (this query targets sightings and orders by cities.name "
                  "and categories.name)"
                  "\n"
                  "2. Check that we can join MULTIPLE tables in a single query (this query joins both cities and "
                  "categories)")
      (mt/dataset tupac-sightings
        ;; ID, CITY_ID, CATEGORY_ID
        ;; Cities are already alphabetized in the source data which is why CITY_ID is sorted
        (is (= [[6   1 12]
                [355 1 11]
                [596 1 11]
                [379 1 13]
                [413 1  5]
                [426 1  1]
                [67  2 11]
                [524 2 11]
                [77  2 13]
                [202 2 13]]
               (->> (mt/run-mbql-query sightings
                      {:order-by [[:asc $city_id->cities.name]
                                  [:desc $category_id->categories.name]
                                  [:asc $id]]
                       :limit    10})
                    ;; drop timestamps.
                    mt/rows
                    (map butlast)
                    (mt/format-rows-by [int int int]))))))))

(deftest feature-check-test
  (mt/test-drivers (mt/normal-drivers-without-feature :foreign-keys)
    (testing "Check that trying to use a Foreign Key fails for Mongo and other DBs"
      (is
       (thrown-with-msg?
        clojure.lang.ExceptionInfo
        (re-pattern (format "%s driver does not support foreign keys" driver/*driver*))
        (mt/dataset tupac-sightings
          (mt/run-mbql-query sightings
            {:order-by [[:asc $city_id->cities.name]
                        [:desc $category_id->categories.name]
                        [:asc $id]]
             :limit    10})))))))

(deftest field-refs-test
  (testing "Implicit joins should come back with `:fk->` field refs"
    (is (= (mt/$ids venues $category_id->categories.name)
           (-> (mt/cols
                 (mt/run-mbql-query :venues
                   {:fields   [$category_id->categories.name]
                    :order-by [[:asc $id]]
                    :limit    1}))
               first
               :field_ref)))))

(deftest multiple-joins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (testing "Can we join against the same table twice (multiple fks to a single table?)"
      (mt/dataset avian-singles
        ;; Query should look something like:
        ;; SELECT USERS__via__SENDER_ID.NAME AS NAME, count(*) AS count
        ;; FROM PUBLIC.MESSAGES
        ;; LEFT JOIN PUBLIC.USERS USERS__via__RECIEVER_ID
        ;;   ON PUBLIC.MESSAGES.RECIEVER_ID = USERS__via__RECIEVER_ID.ID
        ;; LEFT JOIN PUBLIC.USERS USERS__via__SENDER_ID
        ;;   ON PUBLIC.MESSAGES.SENDER_ID = USERS__via__SENDER_ID.ID
        ;; WHERE USERS__via__RECIEVER_ID.NAME = 'Rasta Toucan'
        ;; GROUP BY USERS__via__SENDER_ID.NAME
        ;; ORDER BY USERS__via__SENDER_ID.NAME ASC
        (is (= [["Bob the Sea Gull" 2]
                ["Brenda Blackbird" 2]
                ["Lucky Pigeon"     2]
                ["Peter Pelican"    5]
                ["Ronald Raven"     1]]
               (mt/formatted-rows [str int]
                 (mt/run-mbql-query messages
                   {:aggregation [[:count]]
                    :breakout    [$sender_id->users.name]
                    :filter      [:= $receiver_id->users.name "Rasta Toucan"]}))))))))

(deftest implicit-joins-with-expressions-test
  ;; Redshift excluded for now since the sample dataset seems to hang for Redshift -- see #14784
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :foreign-keys :expressions) :redshift)
    (testing "Should be able to run query with multiple implicit joins and breakouts"
      (mt/dataset sample-dataset
        (is (= [["Doohickey" "Facebook" "2019-01-01T00:00:00Z" 0 263]
                ["Doohickey" "Facebook" "2020-01-01T00:00:00Z" 0 89]
                ["Doohickey" "Google"   "2019-01-01T00:00:00Z" 0 276]
                ["Doohickey" "Google"   "2020-01-01T00:00:00Z" 0 100]
                ["Gizmo"     "Facebook" "2019-01-01T00:00:00Z" 0 361]]
               (mt/formatted-rows [str str str int int]
                 (mt/run-mbql-query orders
                   {:aggregation [[:count]]
                    :breakout    [$product_id->products.category
                                  $user_id->people.source
                                  !year.orders.created_at
                                  [:expression "pivot-grouping"]]
                    :filter      [:and
                                  [:= $user_id->people.source "Facebook" "Google"]
                                  [:= $product_id->products.category "Doohickey" "Gizmo"]
                                  [:time-interval $created_at -2 :year]]
                    :expressions {:pivot-grouping [:abs 0]}
                    :limit       5}))))))))
