(ns ^:mb/driver-tests metabase.query-processor-test.implicit-joins-test
  "Tests for joins that are created automatically when an `:fk->` column is present."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel breakout-on-fk-field-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
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
               (mt/formatted-rows
                [str int]
                (mt/run-mbql-query sightings
                  {:aggregation [[:count]]
                   :breakout    [$city_id->cities.name]
                   :order-by    [[:desc [:aggregation 0]]]
                   :limit       10}))))))))

(deftest ^:parallel filter-by-fk-field-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Test that we can filter on an FK field"
      (mt/dataset tupac-sightings
        ;; Number of Tupac sightings in the Expa office (he was spotted here 60 times)
        (is (= [[60]]
               (mt/formatted-rows
                [int]
                (mt/run-mbql-query sightings
                  {:aggregation [[:count]]
                   :filter      [:= $category_id->categories.id 8]}))))))))

(deftest ^:parallel fk-field-in-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
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
               (mt/formatted-rows
                [int str]
                (mt/run-mbql-query sightings
                  {:fields   [$id $category_id->categories.name]
                   :order-by [[:desc $timestamp]]
                   :limit    10}))))))))

(deftest ^:parallel join-multiple-tables-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
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

(deftest ^:parallel feature-check-test
  (mt/test-drivers (mt/normal-drivers-without-feature :left-join)
    (testing "Check that trying to use a implicit join fails for drivers without :left-join feature"
      (is
       (thrown-with-msg?
        clojure.lang.ExceptionInfo
        (re-pattern (format "%s driver does not support left join" driver/*driver*))
        (mt/dataset tupac-sightings
          (mt/run-mbql-query sightings
            {:order-by [[:asc $city_id->cities.name]
                        [:desc $category_id->categories.name]
                        [:asc $id]]
             :limit    10})))))))

(deftest ^:parallel field-refs-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :left-join)
    (testing "Implicit joins should come back with `:fk->` field refs"
      (is (= (mt/$ids venues $category_id->categories.name)
             (-> (mt/cols
                  (mt/run-mbql-query venues
                    {:fields   [$category_id->categories.name]
                     :order-by [[:asc $id]]
                     :limit    1}))
                 first
                 :field_ref))))))

(deftest ^:parallel multiple-joins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
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
               (mt/formatted-rows
                [str int]
                (mt/run-mbql-query messages
                  {:aggregation [[:count]]
                   :breakout    [$sender_id->users.name]
                   :filter      [:= $receiver_id->users.name "Rasta Toucan"]}))))))))

(deftest ^:parallel implicit-joins-with-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join :expressions)
    (testing "Should be able to run query with multiple implicit joins and breakouts"
      (mt/dataset test-data
        (let [query (mt/mbql-query orders
                      {:aggregation [[:count]]
                       :breakout    [$product_id->products.category
                                     $user_id->people.source
                                     !year.orders.created_at
                                     [:expression "pivot-grouping"]]
                       :filter      [:and
                                     [:= $user_id->people.source "Facebook" "Google"]
                                     [:= $product_id->products.category "Doohickey" "Gizmo"]
                                     [:time-interval $created_at (- 2020 (t/as (t/local-date) :year)) :year]]
                       :expressions {:pivot-grouping [:abs 0]}
                       :limit       5})]
          (mt/with-native-query-testing-context query
            (is (= [["Doohickey" "Facebook" "2020-01-01T00:00:00Z" 0 89]
                    ["Doohickey" "Google"   "2020-01-01T00:00:00Z" 0 100]
                    ["Gizmo"     "Facebook" "2020-01-01T00:00:00Z" 0 113]
                    ["Gizmo"     "Google"   "2020-01-01T00:00:00Z" 0 101]]
                   (mt/formatted-rows
                    [str str u.date/temporal-str->iso8601-str int int]
                    (qp/process-query query))))))))))

(deftest ^:parallel test-23293
  (mt/test-drivers
    (mt/normal-drivers-with-feature :left-join)
    (testing "Implicit joins in multiple levels of a query should work ok (#23293)"
      (mt/dataset
        test-data
        (qp.store/with-metadata-provider
          (lib/composed-metadata-provider
           (lib.tu/mock-metadata-provider
            {:cards [{:id            1
                      :name          "Card 1"
                      :database-id   (mt/id)
                      :dataset-query (mt/mbql-query orders
                                       {:fields
                                        [$id
                                         $user_id
                                         $subtotal
                                         $tax
                                         $total
                                         $discount
                                         $created_at
                                         $quantity
                                         $orders.product_id->products.category]})}]})
           (mt/metadata-provider))
          (is (= [["Doohickey" 3976]]
                 (mt/formatted-rows
                  [str int]
                  (qp/process-query
                   (mt/mbql-query
                     nil
                     {:source-table "card__1"
                      :breakout     [$orders.product_id->products.category]
                      :aggregation  [[:count]]
                      :limit        1})))))
          (testing "Should still work if the query is has refs generated by MLv2 that have extra keys"
            (is (= [["Doohickey" 3976]]
                   (mt/formatted-rows
                    [str int]
                    (qp/process-query
                     (mt/mbql-query
                       nil
                       {:source-table "card__1"
                        :breakout     [[:field
                                        (mt/id :products :category)
                                        {:source-field (mt/id :orders :product_id), :base-type :type/Integer}]]
                        :aggregation  [[:count]]
                        :limit        1})))))))))))

(mt/defdataset long-column-name-dataset
  [["long_col_name" [{:field-name "fk"
                      :base-type :type/Integer}
                     {:field-name "abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_"
                      :base-type :type/Text}]
    [[1 "a1"]
     [2 "a2"]
     [2 "a3"]]]
   ["long_col_name_2" [{:field-name "foo_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abc"
                        :base-type :type/Integer}
                       {:field-name "abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_"
                        :base-type :type/Text}]
    [[1 "b1"]
     [2 "b2"]
     [3 "b3"]]]])

(deftest long-col-name-repro-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (mt/dataset long-column-name-dataset
      (let [mp (mt/metadata-provider)
            table (lib.metadata/table mp (mt/id :long_col_name))
            query (lib/query mp table)
            fk-field (mt/id :long_col_name :fk)
            id-2-field (mt/id :long_col_name_2 :foo_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abcdefg_abc)]
        (t2/update! :model/Field fk-field {:semantic_type :type/FK
                                           :fk_target_field_id id-2-field})
        (testing "Implicit join with long column name should use actual DB column name as source alias (#67002)"
          (let [breakoutable-cols (lib/breakoutable-columns query)
                ;; Use case-insensitive matching because H2 stores column names in uppercase
                fk-col (m/find-first (fn [col]
                                       (and (:fk-field-id col)
                                            (str/starts-with? (u/lower-case-en (:name col)) "abcdefg")))
                                     breakoutable-cols)
                query (-> query
                          (lib/breakout fk-col))]
            (is (= [["b1"] ["b2"]]
                   (mt/rows (qp/process-query query))))))
        (testing "Explicit join with long column name should use desired alias as source alias"
          (let [table-2 (lib.metadata/table mp (mt/id :long_col_name_2))
                join-cols (lib/joinable-columns query -1 table-2)
                fk-col (lib.metadata/field mp (mt/id :long_col_name :fk))
                id-col (m/find-first #(str/starts-with? (u/lower-case-en (:name %)) "foo") join-cols)
                join-clause (-> (lib/join-clause table-2)
                                (lib/with-join-conditions [(lib/= fk-col id-col)])
                                (lib/with-join-fields :all))
                query (lib/join query join-clause)
                breakoutable-cols (lib/breakoutable-columns query)
                big-col (m/find-first (fn [col]
                                        (and (:metabase.lib.join/join-alias col)
                                             (str/starts-with? (u/lower-case-en (:name col)) "abcdefg")))
                                      breakoutable-cols)
                query (-> query
                          (lib/breakout big-col))]
            (is (= [["b1"] ["b2"]]
                   (mt/rows (qp/process-query query))))))))))

(mt/defdataset unix-timestamp-fk-dataset
  [["events" [{:field-name        "event_timestamp"
               :base-type         :type/Integer
               :effective-type    :type/DateTime
               :coercion-strategy :Coercion/UNIXSeconds->DateTime}
              {:field-name "name"
               :base-type  :type/Text}]
    ;; UNIX timestamps for dates in 2024
    [[1704067200 "New Year 2024"] ; 2024-01-01 00:00:00 UTC
     [1706745600 "Groundhog Day 2024"] ; 2024-02-01 00:00:00 UTC
     [1709251200 "March 2024"]]] ; 2024-03-01 00:00:00 UTC
   ["logs" [{:field-name "event_id"
             :base-type  :type/Integer
             :fk         :events}
            {:field-name "message"
             :base-type  :type/Text}]
    [[1 "Log entry 1"]
     [1 "Log entry 2"]
     [2 "Log entry 3"]
     [3 "Log entry 4"]
     [3 "Log entry 5"]]]])

(deftest coerced-field-via-implicit-join-test
  (testing "Filtering/aggregating on a coerced UNIX field via implicit join should apply coercion (#67704)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
      (mt/dataset unix-timestamp-fk-dataset
        (let [mp              (mt/metadata-provider)
              query           (lib/query mp (lib.metadata/table mp (mt/id :logs)))
              ;; Find the event_timestamp column that's implicitly joinable via FK.
              ;; Columns with :fk-field-id are from implicit joins.
              filterable-cols (lib/filterable-columns query)
              event-timestamp (lib/find-column-for-name filterable-cols "event_timestamp" :fk-field-id)
              _               (is (some? event-timestamp) "Should find event_timestamp via implicit join")]
          (testing "Filter on coerced field via implicit join"
            ;; This would fail with "operator does not exist: integer >= timestamp"
            ;; if coercion is not applied to the implicitly joined field.
            (let [query (-> query
                            (lib/aggregate (lib/count))
                            (lib/filter (lib/> event-timestamp
                                               (lib/absolute-datetime #t "2024-01-15T00:00:00Z" :default))))]
              (mt/with-native-query-testing-context query
                ;; 3 logs for events after Jan 15 (Groundhog Day + March)
                (is (= [[3]]
                       (mt/formatted-rows [int] (qp/process-query query)))))))
          (testing "Breakout on coerced field via implicit join"
            ;; This would fail with "function date_trunc(unknown, integer) does not exist"
            ;; if coercion is not applied to the implicitly joined field.
            (let [query (-> query
                            (lib/aggregate (lib/count))
                            (lib/breakout (lib/with-temporal-bucket event-timestamp :month)))]
              (mt/with-native-query-testing-context query
                ;; 3 months with log counts: Jan=2, Feb=1, Mar=2
                (is (= 3
                       (count (mt/rows (qp/process-query query)))))))))))))

(deftest coerced-field-via-explicit-join-test
  (testing "Coerced fields via explicit joins should also work correctly (sanity check for #67704 fix)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
      (mt/dataset unix-timestamp-fk-dataset
        (let [mp              (mt/metadata-provider)
              logs-table      (lib.metadata/table mp (mt/id :logs))
              events-table    (lib.metadata/table mp (mt/id :events))
              event-id-col    (lib.metadata/field mp (mt/id :logs :event_id))
              events-id-col   (lib.metadata/field mp (mt/id :events :id))
              ;; Create explicit join
              join-clause     (-> (lib/join-clause events-table)
                                  (lib/with-join-conditions [(lib/= event-id-col
                                                                    (lib/with-join-alias events-id-col "Events"))])
                                  (lib/with-join-fields :all))
              query           (-> (lib/query mp logs-table)
                                  (lib/join join-clause))
              ;; Find the event_timestamp column from the explicit join.
              ;; Columns from explicit joins have :metabase.lib.join/join-alias.
              filterable-cols (lib/filterable-columns query)
              event-timestamp (lib/find-column-for-name filterable-cols "event_timestamp" :metabase.lib.join/join-alias)
              _               (is (some? event-timestamp) "Should find event_timestamp via explicit join")]
          (testing "Filter on coerced field via explicit join"
            (let [query (-> query
                            (lib/aggregate (lib/count))
                            (lib/filter (lib/> event-timestamp
                                               (lib/absolute-datetime #t "2024-01-15T00:00:00Z" :default))))]
              (mt/with-native-query-testing-context query
                ;; 3 logs for events after Jan 15 (Groundhog Day + March)
                (is (= [[3]]
                       (mt/formatted-rows [int] (qp/process-query query)))))))
          (testing "Breakout on coerced field via explicit join"
            (let [query (-> query
                            (lib/aggregate (lib/count))
                            (lib/breakout (lib/with-temporal-bucket event-timestamp :month)))]
              (mt/with-native-query-testing-context query
                ;; 3 months with log counts
                (is (= 3
                       (count (mt/rows (qp/process-query query)))))))))))))
