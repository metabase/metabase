(ns metabase.query-processor-test.explicit-joins-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.driver.util :as driver.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.mocks-31769 :as lib.tu.mocks-31769]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test.timezones-test :as timezones-test]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(deftest ^:parallel explict-join-with-default-options-test
  (testing "Can we specify an *explicit* JOIN using the default options?"
    (let [query (mt/mbql-query venues
                  {:joins [{:source-table $$categories
                            :condition    [:= $category_id 1]}]})]
      (mt/with-native-query-testing-context query
        (is (= '{:select    [VENUES.ID          AS ID
                             VENUES.NAME        AS NAME
                             VENUES.CATEGORY_ID AS CATEGORY_ID
                             VENUES.LATITUDE    AS LATITUDE
                             VENUES.LONGITUDE   AS LONGITUDE
                             VENUES.PRICE       AS PRICE]
                 :from      [VENUES]
                 :left-join [CATEGORIES AS __join
                             ON VENUES.CATEGORY_ID = 1]
                 :limit     [1048575]}
               (sql.qp-test-util/query->sql-map query)))))))

(defn- query-with-strategy [strategy]
  (mt/dataset bird-flocks
    (mt/mbql-query bird
      {:fields   [$name &f.flock.name]
       :joins    [{:source-table $$flock
                   :condition    [:= $flock_id &f.flock.id]
                   :strategy     strategy
                   :alias        "f"}]
       :order-by [[:asc $name]]})))

(deftest ^:parallel left-outer-join-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we supply a custom alias? Can we do a left outer join ??"
      (is (= [["Big Red"          "Bayview Brood"]
              ["Callie Crow"      "Mission Street Murder"]
              ["Camellia Crow"    nil]
              ["Carson Crow"      "Mission Street Murder"]
              ["Chicken Little"   "Bayview Brood"]
              ["Geoff Goose"      nil]
              ["Gerald Goose"     "Green Street Gaggle"]
              ["Greg Goose"       "Green Street Gaggle"]
              ["McNugget"         "Bayview Brood"]
              ["Olita Owl"        nil]
              ["Oliver Owl"       "Portrero Hill Parliament"]
              ["Orville Owl"      "Portrero Hill Parliament"]
              ["Oswald Owl"       nil]
              ["Pamela Pelican"   nil]
              ["Patricia Pelican" nil]
              ["Paul Pelican"     "SoMa Squadron"]
              ["Peter Pelican"    "SoMa Squadron"]
              ["Russell Crow"     "Mission Street Murder"]]
             (mt/rows
               (qp/process-query
                (query-with-strategy :left-join))))))))

(deftest ^:parallel right-outer-join-test
  (mt/test-drivers (mt/normal-drivers-with-feature :right-join)
    (testing "Can we do a right outer join?"
      ;; the [nil "Fillmore Flock"] row will either come first or last depending on the driver; the rest of the rows will
      ;; be the same
      (let [rows [["Big Red"        "Bayview Brood"]
                  ["Callie Crow"    "Mission Street Murder"]
                  ["Carson Crow"    "Mission Street Murder"]
                  ["Chicken Little" "Bayview Brood"]
                  ["Gerald Goose"   "Green Street Gaggle"]
                  ["Greg Goose"     "Green Street Gaggle"]
                  ["McNugget"       "Bayview Brood"]
                  ["Oliver Owl"     "Portrero Hill Parliament"]
                  ["Orville Owl"    "Portrero Hill Parliament"]
                  ["Paul Pelican"   "SoMa Squadron"]
                  ["Peter Pelican"  "SoMa Squadron"]
                  ["Russell Crow"   "Mission Street Murder"]]
            rows (if (tx/sorts-nil-first? driver/*driver* :type/Text)
                   (cons [nil "Fillmore Flock"] rows)
                   (conj rows [nil "Fillmore Flock"]))]
        (is (= rows
               (mt/rows
                 (qp/process-query
                  (query-with-strategy :right-join)))))))))

(deftest ^:parallel inner-join-test
  (mt/test-drivers (mt/normal-drivers-with-feature :inner-join)
    (testing "Can we do an inner join?"
      (is (= [["Big Red"        "Bayview Brood"]
              ["Callie Crow"    "Mission Street Murder"]
              ["Carson Crow"    "Mission Street Murder"]
              ["Chicken Little" "Bayview Brood"]
              ["Gerald Goose"   "Green Street Gaggle"]
              ["Greg Goose"     "Green Street Gaggle"]
              ["McNugget"       "Bayview Brood"]
              ["Oliver Owl"     "Portrero Hill Parliament"]
              ["Orville Owl"    "Portrero Hill Parliament"]
              ["Paul Pelican"   "SoMa Squadron"]
              ["Peter Pelican"  "SoMa Squadron"]
              ["Russell Crow"   "Mission Street Murder"]]
             (mt/rows
               (qp/process-query
                (query-with-strategy :inner-join))))))))

(deftest ^:parallel full-join-test
  (mt/test-drivers (mt/normal-drivers-with-feature :full-join)
    (testing "Can we do a full join?"
      (let [rows [["Big Red"          "Bayview Brood"]
                  ["Callie Crow"      "Mission Street Murder"]
                  ["Camellia Crow"    nil]
                  ["Carson Crow"      "Mission Street Murder"]
                  ["Chicken Little"   "Bayview Brood"]
                  ["Geoff Goose"      nil]
                  ["Gerald Goose"     "Green Street Gaggle"]
                  ["Greg Goose"       "Green Street Gaggle"]
                  ["McNugget"         "Bayview Brood"]
                  ["Olita Owl"        nil]
                  ["Oliver Owl"       "Portrero Hill Parliament"]
                  ["Orville Owl"      "Portrero Hill Parliament"]
                  ["Oswald Owl"       nil]
                  ["Pamela Pelican"   nil]
                  ["Patricia Pelican" nil]
                  ["Paul Pelican"     "SoMa Squadron"]
                  ["Peter Pelican"    "SoMa Squadron"]
                  ["Russell Crow"     "Mission Street Murder"]]
            rows (if (tx/sorts-nil-first? driver/*driver* :type/Text)
                   (cons [nil "Fillmore Flock"] rows)
                   (conj rows [nil "Fillmore Flock"]))]
        (is (= rows
               (mt/rows
                 (qp/process-query
                  (query-with-strategy :full-join)))))))))

(deftest ^:parallel automatically-include-all-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we automatically include `:all` Fields?"
      (is (= {:columns (mapv mt/format-name ["id" "name" "flock_id" "id_2" "name_2"])
              :rows    [[2  "Big Red"          5   5   "Bayview Brood"]
                        [7  "Callie Crow"      4   4   "Mission Street Murder"]
                        [3  "Camellia Crow"    nil nil nil]
                        [16 "Carson Crow"      4   4   "Mission Street Murder"]
                        [12 "Chicken Little"   5   5   "Bayview Brood"]
                        [5  "Geoff Goose"      nil nil nil]
                        [9  "Gerald Goose"     1   1   "Green Street Gaggle"]
                        [6  "Greg Goose"       1   1   "Green Street Gaggle"]
                        [14 "McNugget"         5   5   "Bayview Brood"]
                        [17 "Olita Owl"        nil nil nil]
                        [18 "Oliver Owl"       3   3   "Portrero Hill Parliament"]
                        [15 "Orville Owl"      3   3   "Portrero Hill Parliament"]
                        [11 "Oswald Owl"       nil nil nil]
                        [10 "Pamela Pelican"   nil nil nil]
                        [8  "Patricia Pelican" nil nil nil]
                        [13 "Paul Pelican"     2   2   "SoMa Squadron"]
                        [4  "Peter Pelican"    2   2   "SoMa Squadron"]
                        [1  "Russell Crow"     4   4   "Mission Street Murder"]]}
             (mt/format-rows-by [int str #(some-> % int) #(some-> % int) identity]
               (mt/rows+column-names
                 (mt/dataset bird-flocks
                   (mt/run-mbql-query bird
                     {:joins    [{:source-table $$flock
                                  :condition    [:= $flock_id &f.flock.id]
                                  :alias        "f"
                                  :fields       :all}]
                      :order-by [[:asc $name]]})))))))))

(deftest ^:parallel include-no-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we include no Fields (with `:none`)"
      (is (= {:columns (mapv mt/format-name ["id" "name" "flock_id"])
              :rows    [[2  "Big Red"          5]
                        [7  "Callie Crow"      4]
                        [3  "Camellia Crow"    nil]
                        [16 "Carson Crow"      4]
                        [12 "Chicken Little"   5]
                        [5  "Geoff Goose"      nil]
                        [9  "Gerald Goose"     1]
                        [6  "Greg Goose"       1]
                        [14 "McNugget"         5]
                        [17 "Olita Owl"        nil]
                        [18 "Oliver Owl"       3]
                        [15 "Orville Owl"      3]
                        [11 "Oswald Owl"       nil]
                        [10 "Pamela Pelican"   nil]
                        [8  "Patricia Pelican" nil]
                        [13 "Paul Pelican"     2]
                        [4  "Peter Pelican"    2]
                        [1  "Russell Crow"     4]]}
             (mt/format-rows-by [#(some-> % int) str #(some-> % int)]
               (mt/rows+column-names
                 (mt/dataset bird-flocks
                   (mt/run-mbql-query bird
                     {:joins    [{:source-table $$flock
                                  :condition    [:= $flock_id &f.flock.id]
                                  :alias        "f"
                                  :fields       :none}]
                      :order-by [[:asc $name]]})))))))))

(deftest ^:parallel specific-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we include a list of specific Fields?"
      (let [{:keys [columns rows]} (mt/format-rows-by [#(some-> % int) str identity]
                                     (mt/rows+column-names
                                       (mt/dataset bird-flocks
                                         (mt/run-mbql-query bird
                                           {:fields   [$id $name]
                                            :joins    [{:source-table $$flock
                                                        :condition    [:= $flock_id &f.flock.id]
                                                        :alias        "f"
                                                        :fields       [&f.flock.name]}]
                                            :order-by [[:asc $name]]}))))]
        (is (= (mapv mt/format-name ["id" "name" "name_2"])
               columns))
        (is (= [[2  "Big Red"         "Bayview Brood"]
                [7  "Callie Crow"     "Mission Street Murder"]
                [3  "Camellia Crow"   nil]
                [16 "Carson Crow"     "Mission Street Murder"]
                [12 "Chicken Little"  "Bayview Brood"]
                [5  "Geoff Goose"     nil]
                [9  "Gerald Goose"    "Green Street Gaggle"]
                [6  "Greg Goose"      "Green Street Gaggle"]
                [14 "McNugget"        "Bayview Brood"]
                [17 "Olita Owl"       nil]
                [18 "Oliver Owl"      "Portrero Hill Parliament"]
                [15 "Orville Owl"     "Portrero Hill Parliament"]
                [11 "Oswald Owl"      nil]
                [10 "Pamela Pelican"  nil]
                [8  "Patricia Pelican"nil]
                [13 "Paul Pelican"    "SoMa Squadron"]
                [4  "Peter Pelican"   "SoMa Squadron"]
                [1  "Russell Crow"    "Mission Street Murder"]]
               rows))))))

(deftest ^:parallel all-fields-datetime-field-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing (str "Do Joins with `:fields``:all` work if the joined table includes Fields that come back wrapped in"
                  " `:datetime-field` forms?")
      (let [{:keys [columns rows]} (mt/format-rows-by [int identity identity int identity int int]
                                     (mt/rows+column-names
                                       (mt/run-mbql-query users
                                         {:source-table $$users
                                          :joins        [{:source-table $$checkins
                                                          :alias        "c"
                                                          :fields       "all"
                                                          :condition    [:= $id &c.checkins.id]}]
                                          :order-by     [["asc" &c.checkins.id]]
                                          :limit        3})))]
        (is (= (mapv mt/format-name ["id" "name" "last_login" "id_2" "date" "user_id" "venue_id"])
               columns))
        ;; not sure why only Oracle seems to do this
        (is (= [[1 "Plato Yeshua"        "2014-04-01T08:30:00Z" 1 "2014-04-07T00:00:00Z" 5 12]
                [2 "Felipinho Asklepios" "2014-12-05T15:15:00Z" 2 "2014-09-18T00:00:00Z" 1 31]
                [3 "Kaneonuskatew Eiran" "2014-11-06T16:15:00Z" 3 "2014-09-15T00:00:00Z" 8 56]]
               rows))))))

(deftest ^:parallel select-*-source-query-test
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :left-join)
                         ;; mongodb doesn't support foreign keys required by this test
                         :mongo)
    (testing "We should be able to run a query that for whatever reason ends up with a `SELECT *` for the source query"
      (let [{:keys [rows columns]} (mt/format-rows-by [int int]
                                     (mt/rows+column-names
                                       (mt/run-mbql-query checkins
                                         {:source-query {:source-table $$checkins
                                                         :aggregation  [[:sum $user_id->users.id]]
                                                         :breakout     [$id]}
                                          :joins        [{:alias        "u"
                                                          :source-table $$users
                                                          :condition    [:= *checkins.id &u.users.id]}]
                                          :order-by     [[:asc [:field (mt/format-name "id") {:base-type :type/Integer}]]]
                                          :limit        3})))]
        (is (= [(mt/format-name "id") "sum"]
               columns))
        (is (= [[1 5] [2 1] [3 8]]
               rows))))))

(deftest ^:parallel join-against-nested-mbql-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we join against a source nested MBQL query?"
      (is (= [[29 "20th Century Cafe" 12  37.775 -122.423 2]
              [ 8 "25°"               11 34.1015 -118.342 2]
              [93 "33 Taps"            7 34.1018 -118.326 2]]
             (mt/format-rows-by :venues
               (mt/rows
                 (mt/run-mbql-query venues
                   {:source-table $$venues
                    :joins        [{:alias        "cat"
                                    :source-query {:source-table $$categories}
                                    :condition    [:= $category_id &cat.*categories.id]}]
                    :order-by     [[:asc $name]]
                    :limit        3}))))))))

(deftest ^:parallel join-against-card-source-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we join against a `card__id` source query and use `:fields` `:all`?"
      (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                        [(mt/mbql-query categories)])
        (is (= {:rows
                [[29 "20th Century Cafe" 12 37.775  -122.423 2 12 "Café"]
                 [8  "25°"               11 34.1015 -118.342 2 11 "Burger"]
                 [93 "33 Taps"           7  34.1018 -118.326 2  7 "Bar"]]

                :columns
                (mapv mt/format-name ["id" "name" "category_id" "latitude" "longitude" "price" "id_2" "name_2"])}
               (mt/format-rows-by [int identity int 4.0 4.0 int int identity]
                 (mt/rows+column-names
                  (mt/run-mbql-query venues
                    {:joins    [{:alias        "cat"
                                 :source-table "card__1"
                                 :fields       :all
                                 :condition    [:= $category_id &cat.*categories.id]}]
                     :order-by [[:asc $name]]
                     :limit    3})))))))))

;; This is a very contrived test. We create two identical cards and join them both
;; in a third card. This means that first two cards bring fields that differ only in
;; their join aliases, but these "get lost" when the third card is joined to a table.
;; Since we have multiple fields with the same ID, the IDs cannot be used to
;; unambiguously refer to the underlying fields. The only way to reference them
;; properly is by the name they have in the source metadata.
(deftest ^:parallel join-against-multiple-card-copies-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "join against multiple copies of a card (#34227)"
      (mt/dataset test-data
        (let [metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                 [(mt/mbql-query orders
                                    {:breakout [$user_id]
                                     :aggregation [[:count]]})
                                  (mt/mbql-query orders
                                    {:breakout [$user_id]
                                     :aggregation [[:count]]})
                                  (mt/mbql-query people
                                    {:fields [$id]
                                     :joins [{:fields :all
                                              :alias "ord1"
                                              :source-table "card__1"
                                              :condition [:= $id &ord1.orders.user_id]}
                                             {:fields :all
                                              :alias "ord2"
                                              :source-table "card__2"
                                              :condition [:= $id &ord2.orders.user_id]}]})])]
          (qp.store/with-metadata-provider metadata-provider
            (let [top-card-query (mt/mbql-query people
                                   {:source-table "card__3"
                                    :limit        3})
                  [cid cuser-id ccount cuser-id2 ccount2] (->> top-card-query
                                                               qp.preprocess/query->expected-cols
                                                               (map :name))
                  cid2 (str cid "_2")
                  col-data-fn   (juxt            :id       :name     :source_alias)
                  top-card-cols [[(mt/id :people :id)      cid       nil]
                                 [(mt/id :orders :user_id) cuser-id  "ord1"]
                                 [nil                      ccount    "ord1"]
                                 [(mt/id :orders :user_id) cuser-id2 "ord2"]
                                 [nil                      ccount2   "ord2"]]]
              (testing "sanity"
                (is (= top-card-cols
                       (->> top-card-query
                            qp/process-query
                            mt/cols
                            (map col-data-fn)))))

              (when (= driver/*driver* :h2)
                (testing "suggested join condition references the FK by name"
                  (let [query (lib/query metadata-provider (lib.metadata/table metadata-provider (mt/id :people)))
                        card-meta (lib.metadata/card metadata-provider 3)]
                    (is (=? [[:= {} [:field {} (mt/id :people :id)] [:field {} cuser-id]]]
                            (lib/suggested-join-conditions query card-meta))))))

              (testing "the query runs and returns correct data"
                (is (= {:columns [cid cid2 cuser-id ccount cuser-id2 ccount2]
                        :rows    [[1  1    1        11     1         11]
                                  [2  nil  nil      nil    nil       nil]
                                  [3  3    3        10     3         10]]}
                       (-> (mt/mbql-query people
                             {:joins    [{:alias        "peeps"
                                          :source-table "card__3"
                                          :fields       :all
                                          :condition    [:= $id [:field cuser-id2 {:base-type :type/Integer
                                                                                   :join-alias "peeps"}]]}]
                              :fields [$id]
                              :order-by [[:asc $id]]
                              :limit    3})
                           qp/process-query
                           mt/rows+column-names
                           ;; Oracle is returning java.math.BigDecimal objects
                           (update :rows #(mt/format-rows-by [int int int int int int] %)))))))))))))

(deftest ^:parallel join-on-field-literal-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we join on a Field literal for a source query?"
      (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                        [(mt/mbql-query venues
                                           {:aggregation [[:count]]
                                            :breakout    [$category_id]})])
        ;; Also: if you join against an *explicit* source query, do all columns for both queries come back? (Only applies
        ;; if you include `:source-metadata`)
        (is (= {:rows    [[1 3 46 3] [2 9 40 9] [4 7 5 7]]
                :columns [(mt/format-name "venue_id") "count" (mt/format-name "category_id") "count_2"]}
               (mt/format-rows-by [int int int int]
                 (mt/rows+column-names
                  (mt/run-mbql-query checkins
                    {:source-query {:source-table $$checkins
                                    :aggregation  [[:count]]
                                    :breakout     [$venue_id]}
                     :joins
                     [{:fields       :all
                       :alias        "venues"
                       :source-table "card__1"
                       :strategy     :inner-join
                       :condition    [:=
                                      [:field "count" {:base-type :type/Number}]
                                      [:field "count" {:base-type :type/Number, :join-alias "venues"}]]}]
                     :order-by     [[:asc $venue_id]]
                     :limit        3})))))))))

(deftest ^:parallel aggregate-join-results-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we aggregate on the results of a JOIN?"
      (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                        [(mt/mbql-query checkins
                                           {:aggregation [[:count]]
                                            :breakout    [$user_id]})])
        (let [query (mt/mbql-query users
                      {:joins       [{:fields       :all
                                      :alias        "checkins_by_user"
                                      :source-table "card__1"
                                      :condition    [:= $id &checkins_by_user.*checkins.user_id]}]
                       :aggregation [[:avg &checkins_by_user.*count/Float]]
                       :breakout    [!month.last_login]})]
          (mt/with-native-query-testing-context query
            (is (= {:rows    [["2014-01-01T00:00:00Z" 77]
                              ["2014-02-01T00:00:00Z" 81]
                              ["2014-04-01T00:00:00Z" 49]
                              ["2014-07-01T00:00:00Z" 68]
                              ["2014-08-01T00:00:00Z" 64]
                              ["2014-10-01T00:00:00Z" 65]
                              ["2014-11-01T00:00:00Z" 74]
                              ["2014-12-01T00:00:00Z" 70]]
                    :columns [(mt/format-name "last_login") "avg"]}
                   (mt/format-rows-by [identity int]
                     (mt/rows+column-names
                      (qp/process-query query)))))))))))

(deftest ^:parallel get-all-columns-without-metadata-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "NEW! Can we still get all of our columns, even if we *DON'T* specify the metadata?"
      (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                        [(mt/mbql-query venues
                                           {:aggregation [[:count]]
                                            :breakout    [$category_id]})])
        (is (= {:rows    [[1 3 46 3] [2 9 40 9] [4 7 5 7]]
                :columns [(mt/format-name "venue_id") "count" (mt/format-name "category_id") "count_2"]}
               (mt/rows+column-names
                (mt/format-rows-by [int int int int]
                  (mt/run-mbql-query checkins
                    {:source-query {:source-table $$checkins
                                    :aggregation  [[:count]]
                                    :breakout     [$venue_id]}
                     :joins        [{:source-table "card__1"
                                     :alias        "venues"
                                     :fields       :all
                                     :strategy     :inner-join
                                     :condition    [:=
                                                    [:field "count" {:base-type :type/Number}]
                                                    [:field "count" {:base-type :type/Number, :join-alias "venues"}]]}]
                     :order-by     [[:asc $venue_id]]
                     :limit        3})))))))))

(deftest ^:parallel joined-field-in-time-interval-test
  (mt/test-drivers (mt/normal-drivers-with-feature :right-join)
    (testing "Should be able to use a joined field in a `:time-interval` clause"
      (is (= {:rows    []
              :columns (mapv mt/format-name ["id" "name" "category_id" "latitude" "longitude" "price"])}
             (mt/rows+column-names
               (mt/run-mbql-query venues
                 {:joins    [{:source-table $$checkins
                              :alias        "c"
                              :strategy     :right-join
                              :condition    [:= $id &c.checkins.venue_id]}]
                  :filter   [:time-interval &c.checkins.date -30 :day]
                  :order-by [[:asc &c.checkins.id]]
                  :limit    10})))))))

(deftest ^:parallel deduplicate-column-names-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing (str "Do we gracefully handle situtations where joins would produce multiple columns with the same name? "
                  "(Multiple columns named `id` in the example below)")
      (let [{:keys [rows columns]} (mt/rows+column-names
                                     (mt/format-rows-by [int  ; checkins.id
                                                         str  ; checkins.date
                                                         int  ; checkins.user_id
                                                         int  ; checkins.venue_id
                                                         int  ; users.id
                                                         str  ; users.name
                                                         str  ; users.last_login
                                                         int  ; venues.id
                                                         str  ; venues.name
                                                         int  ; venues.category_id
                                                         3.0  ; venues.latitude
                                                         3.0  ; venues.longitude
                                                         int] ; venues.price
                                       (mt/run-mbql-query checkins
                                         {:source-query {:source-table $$checkins
                                                         :joins
                                                         [{:fields       :all
                                                           :alias        "u"
                                                           :source-table $$users
                                                           :condition    [:= $user_id &u.users.id]}]}
                                          :joins        [{:fields       :all
                                                          :alias        "v"
                                                          :source-table $$venues
                                                          :condition    [:= $user_id &v.venues.id]}]
                                          :order-by     [[:asc $id]]
                                          :limit        2})))]
        (is (= (mapv
                mt/format-name
                ["id"   "date"   "user_id"     "venue_id"                       ; checkins
                 "id_2" "name"   "last_login"                                   ; users
                 "id_3" "name_2" "category_id" "latitude" "longitude" "price"]) ; venues
               columns))
        (is (= [[1 "2014-04-07T00:00:00Z" 5 12
                 5 "Quentin Sören" "2014-10-03T17:30:00Z"
                 5 "Brite Spot Family Restaurant" 20 34.078 -118.261 2]
                [2 "2014-09-18T00:00:00Z" 1 31
                 1 "Plato Yeshua" "2014-04-01T08:30:00Z"
                 1 "Red Medicine" 4 10.065 -165.374 3]]
               rows))))))

(deftest ^:parallel sql-question-source-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (testing "we should be able to use a SQL question as a source query in a Join"
      (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                        [(mt/native-query (qp.compile/compile (mt/mbql-query venues)))])
        (is (= [[1 "2014-04-07T00:00:00Z" 5 12 12 "The Misfit Restaurant + Bar" 2 34.0154 -118.497 2]
                [2 "2014-09-18T00:00:00Z" 1 31 31 "Bludso's BBQ"                5 33.8894 -118.207 2]]
               (mt/formatted-rows [int identity int int int identity int 4.0 4.0 int]
                 (mt/run-mbql-query checkins
                   {:joins    [{:fields       :all
                                :source-table "card__1"
                                :alias        "card"
                                :condition    [:= $venue_id &card.venues.id]}]
                    :order-by [[:asc $id]]
                    :limit    2}))))))))

(deftest ^:parallel joined-date-filter-test
  ;; TIMEZONE FIXME — The excluded drivers below don't have TIME types, so the `attempted-murders` dataset doesn't
  ;; currently work. We should use the closest equivalent types (e.g. `DATETIME` or `TIMESTAMP` so we can still load
  ;; the dataset and run tests using this dataset such as these, which doesn't even use the TIME type.
  (mt/test-drivers (set/difference (mt/normal-drivers-with-feature :nested-queries :left-join)
                                   timezones-test/broken-drivers)
    (testing "Date filter should behave the same for joined columns"
      (mt/dataset attempted-murders
        (is (= [["2019-11-01T07:23:18.331Z" "2019-11-01T07:23:18.331Z"]]
               (mt/rows
                (mt/run-mbql-query attempts
                  {:fields [$datetime_tz]
                   :filter [:and
                            [:between $datetime_tz "2019-11-01" "2019-11-01"]
                            [:between &attempts_joined.datetime_tz "2019-11-01" "2019-11-01"]]
                   :joins  [{:alias        "attempts_joined"
                             :condition    [:= $id &attempts_joined.id]
                             :fields       [&attempts_joined.datetime_tz]
                             :source-table $$attempts}]}))))))))

(deftest ^:parallel expressions-referencing-joined-aggregation-expressions-test
  (testing (mt/normal-drivers-with-feature :nested-queries :left-join :expressions)
    (testing "Should be able to use expressions against columns that come from aggregation expressions in joins"
      (is (= [[1 "Red Medicine" 4 10.065 -165.374 3 1.5 4 3 2 1]
              [2 "Stout Burgers & Beers" 11 34.1 -118.329 2 1.1 11 2 1 1]
              [3 "The Apple Pan" 11 34.041 -118.428 2 1.1 11 2 1 1]]
             (mt/formatted-rows [int str int 3.0 3.0 int 1.0 int int int int]
               (mt/run-mbql-query venues
                 {:fields      [$id
                                $name
                                $category_ID
                                $latitude
                                $longitude
                                $price
                                [:expression "RelativePrice"]]
                  :expressions {:RelativePrice [:/ $price &CategoriesStats.*AvgPrice/Integer]}
                  :joins       [{:condition    [:= $category_id &CategoriesStats.venues.category_id]
                                 :source-query {:source-table $$venues
                                                :aggregation  [[:aggregation-options [:max $price] {:name "MaxPrice"}]
                                                               [:aggregation-options [:avg $price] {:name "AvgPrice"}]
                                                               [:aggregation-options [:min $price] {:name "MinPrice"}]]
                                                :breakout     [$category_id]}
                                 :alias        "CategoriesStats"
                                 :fields       :all}]
                  :limit       3})))))))

(deftest ^:parallel join-source-queries-with-joins-test
  (testing "Should be able to join against source queries that themselves contain joins (#12928)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join :foreign-keys)
      (mt/dataset test-data
        (testing "(#12928)"
          (let [query (mt/mbql-query orders
                        {:source-query {:source-table $$orders
                                        :joins        [{:fields       :all
                                                        :source-table $$products
                                                        :condition    [:= $orders.product_id &P1.products.id]
                                                        :alias        "P1"}
                                                       {:fields       :all
                                                        :source-table $$people
                                                        :condition    [:= $orders.user_id &People.people.id]
                                                        :alias        "People"}]
                                        :aggregation  [[:count]]
                                        :breakout     [&P1.products.category
                                                       [:field %people.source {:join-alias "People"}]]}
                         :joins        [{:fields       :all
                                         :condition    [:= &P1.products.category &Q2.products.category]
                                         :alias        "Q2"
                                         :source-query {:source-table $$reviews
                                                        :joins        [{:fields       :all
                                                                        :source-table $$products
                                                                        :condition    [:=
                                                                                       $reviews.product_id
                                                                                       &P2.products.id]
                                                                        :alias        "P2"}]
                                                        :aggregation  [[:avg $reviews.rating]]
                                                        :breakout     [&P2.products.category]}}]
                         :order-by     [[:asc &P1.products.category]
                                        [:asc [:field %people.source {:join-alias "People"}]]]
                         :limit        2})]
            (mt/with-native-query-testing-context query
              (is (= [["Doohickey" "Affiliate" 783 "Doohickey" 3]
                      ["Doohickey" "Facebook" 816 "Doohickey" 3]]
                     (mt/formatted-rows [str str int str int]
                       (qp/process-query query)))))))

        (testing "and custom expressions (#13649) (#18086)"
          (let [query (mt/mbql-query orders
                        {:source-query {:source-table $$orders
                                        :aggregation  [[:count]]
                                        :breakout     [$product_id]
                                        :filter       [:= $product_id 4]}
                         :joins        [{:fields       :all
                                         :source-query {:source-table $$orders
                                                        :aggregation  [[:count]]
                                                        :breakout     [$product_id]
                                                        :filter       [:and
                                                                       [:= $product_id 4]
                                                                       [:> $quantity 3]]}
                                         :condition    [:= $product_id &Q2.orders.product_id]
                                         :alias        "Q2"}]
                         :expressions {:expr [:/
                                              [:field "count" {:base-type :type/BigInteger, :join-alias "Q2"}]
                                              [:field "count" {:base-type :type/BigInteger}]]}
                         :limit        2})]
            (mt/with-native-query-testing-context query
              ;; source.product_id, source.count, source.expr, source.Q2__product_id, source.Q2__count
              (is (= [[4 89 0.46 4 41]]
                     (mt/formatted-rows [int int 2.0 int int]
                       (qp/process-query query)))))))))))

(deftest ^:parallel join-against-saved-question-with-sort-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (testing "Should be able to join against a Saved Question that is sorted (#13744)"
      (mt/dataset test-data
        (let [query (mt/mbql-query products
                      {:joins    [{:source-query {:source-table $$products
                                                  :aggregation  [[:count]]
                                                  :breakout     [$category]
                                                  :order-by     [[:asc [:aggregation 0]]]}
                                   :alias        "Q1"
                                   :condition    [:= $category [:field %category {:join-alias "Q1"}]]
                                   :fields       :all}]
                       :order-by [[:asc $id]]
                       :limit    1})]
          (mt/with-native-query-testing-context query
            (is (= [[1
                     "1018947080336"
                     "Rustic Paper Wallet"
                     "Gizmo"
                     "Swaniawski, Casper and Hilll"
                     29.46
                     4.6
                     "2017-07-19T19:44:56.582Z"
                     "Gizmo"
                     51]]
                   (mt/formatted-rows [int str str str str 2.0 1.0 str str int]
                     (qp/process-query query))))))))))

(deftest ^:parallel join-with-space-in-alias-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (testing "Some drivers don't allow Table alises with spaces in them. Make sure joins still work."
      (mt/dataset test-data
        (mt/with-mock-fks-for-drivers-without-fk-constraints
          (let [query (mt/mbql-query products
                        {:joins    [{:source-query {:source-table $$orders}
                                     :alias        "Q 1"
                                     :condition    [:= $id [:field %orders.product_id {:join-alias "Q 1"}]]
                                     :fields       :all}]
                         :fields   [$id
                                    [:field %orders.id {:join-alias "Q 1"}]]
                         :order-by [[:asc $id]
                                    [:asc [:field %orders.id {:join-alias "Q 1"}]]]
                         :limit    2})]
            (mt/with-native-query-testing-context query
              (is (= [[1 448] [1 493]]
                     (mt/formatted-rows [int int]
                       (qp/process-query query)))))))))))

(deftest ^:parallel joining-nested-queries-with-same-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (testing (str "Should be able to join two nested queries with the same aggregation on a Field in their respective "
                  "source queries (#18512)")
      (mt/dataset test-data
        (let [query (mt/mbql-query reviews
                      {:source-query {:source-table $$reviews
                                      :joins        [{:source-table $$products
                                                      :alias        "Products"
                                                      :condition    [:= $product_id &Products.products.id]
                                                      :fields       :all}]
                                      :breakout     [!month.&Products.products.created_at]
                                      :aggregation  [[:distinct &Products.products.id]]
                                      :filter       [:= &Products.products.category "Doohickey"]}
                       :joins        [{:source-query {:source-table $$reviews
                                                      :joins        [{:source-table $$products
                                                                      :alias        "Products"
                                                                      :condition    [:= $product_id &Products.products.id]
                                                                      :fields       :all}]
                                                      :breakout     [!month.&Products.products.created_at]
                                                      :aggregation  [[:distinct &Products.products.id]]
                                                      :filter       [:= &Products.products.category "Gizmo"]}
                                       :alias        "Q2"
                                       ;; yes, `!month.products.created_at` is a so-called 'bad reference' (should
                                       ;; include the `:join-alias`) but this test is also testing that we detect this
                                       ;; situation and handle it appropriately.
                                       ;; See [[metabase.query-processor.middleware.fix-bad-references]]
                                       :condition    [:= !month.products.created_at !month.&Q2.products.created_at]
                                       :fields       :all}]
                       :order-by     [[:asc !month.&Products.products.created_at]]
                       :limit        3})]
          (mt/with-native-query-testing-context query
            (is (= [["2016-05-01T00:00:00Z" 3 nil nil]
                    ["2016-06-01T00:00:00Z" 2 "2016-06-01T00:00:00Z" 1]
                    ["2016-08-01T00:00:00Z" 2 nil nil]]
                   (mt/formatted-rows [str int str int]
                     (qp/process-query query))))))))))

(deftest ^:parallel join-against-same-table-as-source-query-source-table-test
  (testing "Joining against the same table as the source table of the source query should work (#18502)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
      (mt/dataset test-data
        (let [query (mt/mbql-query people
                      {:source-query {:source-table $$people
                                      :breakout     [!month.created_at]
                                      :aggregation  [[:count]]}
                       :joins        [{:source-query {:source-table $$people
                                                      :breakout     [!month.birth_date]
                                                      :aggregation  [[:count]]}
                                       :alias        "Q2"
                                       :condition    [:= !month.created_at !month.&Q2.birth_date]
                                       :fields       :all}]
                       :order-by     [[:asc !month.created_at]]
                       :limit        3})]
          (mt/with-native-query-testing-context query
            (is (= [["2016-04-01T00:00:00Z" 26 nil nil]
                    ["2016-05-01T00:00:00Z" 77 nil nil]
                    ["2016-06-01T00:00:00Z" 82 nil nil]]
                   (mt/formatted-rows [str int str int]
                     (qp/process-query query))))))))))

(deftest ^:parallel join-against-multiple-saved-questions-with-same-column-test
  (testing "Should be able to join multiple against saved questions on the same column (#15863, #20362)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
      (mt/dataset test-data
        (let [q1 (mt/mbql-query products {:breakout [$category], :aggregation [[:count]]})
              q2 (mt/mbql-query products {:breakout [$category], :aggregation [[:sum $price]]})
              q3 (mt/mbql-query products {:breakout [$category], :aggregation [[:avg $rating]]})]
          (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                            [q1 q2 q3])
            (let [query (mt/mbql-query products
                          {:source-table "card__1"
                           :joins        [{:fields       :all
                                           :source-table "card__2"
                                           :condition    [:=
                                                          $category
                                                          &Q2.category]
                                           :alias        "Q2"}
                                          {:fields       :all
                                           :source-table "card__3"
                                           :condition    [:=
                                                          $category
                                                          &Q3.category]
                                           :alias        "Q3"}]
                           :order-by     [[:asc $category]]})]
              (mt/with-native-query-testing-context query
                (let [results (qp/process-query query)]
                  (when (#{:postgres :h2} driver/*driver*)
                    (is (= ["Category" "Count" "Q2 → Category" "Q2 → Sum" "Q3 → Category" "Q3 → Avg"]
                           (map :display_name (get-in results [:data :results_metadata :columns])))))
                  (is (= [["Doohickey" 42 "Doohickey" 2185.89 "Doohickey" 3.73]
                          ["Gadget"    53 "Gadget"    3019.2  "Gadget"    3.43]
                          ["Gizmo"     51 "Gizmo"     2834.88 "Gizmo"     3.64]
                          ["Widget"    54 "Widget"    3109.31 "Widget"    3.15]]
                         (mt/formatted-rows [str int str 2.0 str 2.0] results))))))))))))

(deftest ^:parallel use-correct-source-alias-for-fields-from-joins-test
  (testing "Make sure we use the correct escaped alias for a Fields coming from joins (#20413)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
      (mt/dataset test-data
        (let [query (mt/mbql-query orders
                      {:joins       [{:source-table $$products
                                      :alias        "Products Renamed"
                                      :condition    [:=
                                                     $product_id
                                                     [:field %products.id {:join-alias "Products Renamed"}]]
                                      :fields       :all}]
                       :expressions {"CC" [:+ 1 1]}
                       :filter      [:=
                                     [:field %products.category {:join-alias "Products Renamed"}]
                                     "Doohickey"]
                       :order-by    [[:asc $id]]
                       :limit       2})]
          (mt/with-native-query-testing-context query
            (let [results (qp/process-query query)]
              (when (#{:h2 :postgres} driver/*driver*)
                (is (= ["ID"
                        "User ID"
                        "Product ID"
                        "Subtotal"
                        "Tax"
                        "Total"
                        "Discount"
                        "Created At"
                        "Quantity"
                        "CC"
                        "Products Renamed → ID"
                        "Products Renamed → Ean"
                        "Products Renamed → Title"
                        "Products Renamed → Category"
                        "Products Renamed → Vendor"
                        "Products Renamed → Price"
                        "Products Renamed → Rating"
                        "Products Renamed → Created At"]
                       (map :display_name (get-in results [:data :results_metadata :columns])))))
              (is (= [[6 1 60 29.8 1.64 31.44 nil "2019-11-06T16:38:50.134Z" 3 2
                       60 "4819782507258" "Rustic Paper Car" "Doohickey" "Stroman-Carroll" 19.87 4.1 "2017-12-16T11:14:43.264Z"]
                      [10 1 6 97.44 5.36 102.8 nil "2020-01-17T01:44:37.233Z" 2 2
                       6 "2293343551454" "Small Marble Hat" "Doohickey" "Nolan-Wolff" 64.96 3.8 "2017-03-29T05:43:40.15Z"]]
                     (mt/formatted-rows [int int int 2.0 2.0 2.0 2.0 str int int
                                         int str str str str 2.0 2.0 str]
                       results))))))))))

(deftest ^:parallel double-quotes-in-join-alias-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Make sure our we handle (escape) double quotes in join aliases. Make sure we prevent SQL injection (#20307)"
      (let [expected-rows (mt/rows
                           (mt/run-mbql-query venues
                             {:joins [{:source-table $$categories
                                       :alias        "Cat"
                                       :condition    [:= $id $id]
                                       :fields       [&Cat.categories.id]}]
                              :limit 1}))]
        (is (= 1
               (count expected-rows)))
        ;; these normally get ESCAPED by [[metabase.util.honey-sql-2/identifier]] when they're compiled to SQL,
        ;; but some fussy databases such as Oracle don't even allow escaped double quotes in identifiers. So make sure
        ;; that we don't allow SQL injection AND things still work
        (doseq [evil-join-alias ["users.id\" AS user_id, u.* FROM categories LEFT JOIN users u ON 1 = 1; --"
                                 "users.id\\\" AS user_id, u.* FROM categories LEFT JOIN users u ON 1 = 1; --"
                                 "users.id\\u0022 AS user_id, u.* FROM categories LEFT JOIN users u ON 1 = 1; --"
                                 "users.id` AS user_id, u.* FROM categories LEFT JOIN users u ON 1 = 1; --"
                                 "users.id\\` AS user_id, u.* FROM categories LEFT JOIN users u ON 1 = 1; --"]]
          (let [evil-query (mt/mbql-query venues
                             {:joins [{:source-table $$categories
                                       :alias        evil-join-alias
                                       :condition    [:= $id $id]
                                       :fields       [[:field %categories.id {:join-alias evil-join-alias}]]}]
                              :limit 1})]
            (mt/with-native-query-testing-context evil-query
              (is (= expected-rows
                     (mt/rows (qp/process-query evil-query)))))))))))

(def ^:private charsets
  {:ascii   (into (vec (for [i (range 26)]
                         (char (+ (int \A) i))))
                  [\_])
   :unicode (vec "가나다라마바사아자차카타파하")})

(defn- very-long-identifier [charset length]
  (str/join (for [i (range length)]
              (nth charset (mod i (count charset))))))

(deftest ^:parallel very-long-join-name-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Drivers should work correctly even if joins have REALLLLLLY long names (#15978)"
      (doseq [[charset-name charset] charsets
              alias-length           [100 300 1000]]
        (testing (format "\ncharset = %s\nalias-length = %d" charset-name alias-length)
          (let [join-alias   (very-long-identifier charset alias-length)
                join-alias-2 (str/join [join-alias "_2"])
                query      (mt/mbql-query venues
                             {:joins    [{:source-table $$categories
                                          :alias        join-alias
                                          :condition    [:= $category_id [:field %categories.id {:join-alias join-alias}]]
                                          :fields       :none}
                                         ;; make sure we don't just truncate the alias names -- if REALLY LONG names
                                         ;; differ just by some characters at the end that won't cut it
                                         {:source-table $$categories
                                          :alias        join-alias-2
                                          :condition    [:= $category_id [:field %categories.id {:join-alias join-alias-2}]]
                                          :fields       :none}]
                              :fields   [$id
                                         $name
                                         [:field %categories.name {:join-alias join-alias}]
                                         [:field %categories.name {:join-alias join-alias-2}]]
                              :order-by [[:asc $id]]
                              :limit    2})]
            (mt/with-native-query-testing-context query
              (is (= [[1 "Red Medicine"          "Asian"  "Asian"]
                      [2 "Stout Burgers & Beers" "Burger" "Burger"]]
                     (mt/formatted-rows [int str str str]
                       (qp/process-query query)))))))))))

(deftest ^:parallel join-against-implicit-join-test
  (testing "Should be able to explicitly join against an implicit join (#20519)"
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :left-join :expressions :basic-aggregations)
                           ;; mongodb doesn't support foreign keys required by this test
                           :mongo)
      (mt/dataset test-data
        (mt/with-mock-fks-for-drivers-without-fk-constraints
          (let [query (mt/mbql-query orders
                        {:source-query {:source-table $$orders
                                        :breakout     [$product_id->products.category]
                                        :aggregation  [[:count]]}
                         :joins        [{:source-table $$products
                                         :alias        "Products"
                                         :condition    [:= *products.category &Products.products.category]
                                         :fields       [&Products.products.id
                                                        &Products.products.title]}]
                         :expressions  {"CC" [:+ 1 1]}
                         :order-by     [[:asc &Products.products.id]]
                         :limit        2})]
            (mt/with-native-query-testing-context query
              (is (= [["Gizmo"     4784 2 1 "Rustic Paper Wallet"]
                      ["Doohickey" 3976 2 2 "Small Marble Shoes"]]
                     (mt/formatted-rows [str int int int str]
                       (qp/process-query query)))))))))))

(deftest ^:parallel join-order-test
  (testing "Joins should be emitted in the same order as they were specified in MBQL (#15342)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join :inner-join)
      ;; this is fixed for all SQL drivers.
      (when (or (isa? driver/hierarchy driver/*driver* :sql)
                (and (isa? driver/hierarchy driver/*driver* :mongo)
                     (-> (:dbms_version (mt/db))
                         :semantic-version
                         (driver.u/semantic-version-gte [5]))))
        (doseq [[first-join-strategy second-join-strategy] [[:inner-join :left-join]
                                                            [:left-join :inner-join]]
                :let [query (mt/mbql-query people
                              {:joins    [{:source-table $$orders
                                           :alias        "Orders"
                                           :condition    [:= $id &Orders.orders.user_id]
                                           :strategy     first-join-strategy}
                                          {:source-table $$products
                                           :alias        "Products"
                                           :condition    [:= &Orders.orders.product_id &Products.products.id]
                                           :strategy     second-join-strategy}]
                               :fields   [$id &Orders.orders.id &Products.products.id]
                               :order-by [[:asc $id]
                                          [:asc &Orders.orders.id]
                                          [:asc &Products.products.id]]
                               :limit    1})]]
          (testing (format "%s before %s" first-join-strategy second-join-strategy)
            (mt/with-native-query-testing-context query
              (is (= [[1 1 14]]
                     (mt/formatted-rows [int int int]
                       (qp/process-query query)))))))))))

(deftest ^:parallel join-with-brakout-and-aggregation-expression
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (let [query (mt/mbql-query orders
                  {:source-query {:source-table $$orders
                                  :joins    [{:source-table $$products
                                              :alias        "Products"
                                              :condition    [:= $product_id &Products.products.id]}]
                                  :filter   [:> $subtotal 100]
                                  :breakout [&Products.products.category
                                             &Products.products.vendor
                                             !month.created_at]
                                  :aggregation [[:sum $subtotal]]}
                   :expressions {:strange [:/ [:field "sum" {:base-type "type/Float"}] 100]}
                   :limit 3})]
      (mt/with-native-query-testing-context query
        (is (= [["Doohickey" "Balistreri-Ankunding" "2018-01-01T00:00:00Z" 210.24 2.1024]
                ["Doohickey" "Balistreri-Ankunding" "2018-02-01T00:00:00Z" 315.36 3.1536]
                ["Doohickey" "Balistreri-Ankunding" "2018-03-01T00:00:00Z" 315.36 3.1536]]
               (mt/formatted-rows [str str str 2.0 4.0]
                 (qp/process-query query))))))))

(deftest ^:parallel mlv2-references-in-join-conditions-test
  (testing "Make sure join conditions that contain MLv2-generated refs with extra info like `:base-type` work correctly (#33083)"
    (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-for-queries
                                      [(mt/mbql-query reviews
                                         {:joins       [{:source-table $$products
                                                         :alias        "Products"
                                                         :condition    [:= $product_id &Products.products.id]
                                                         :fields       :all}]
                                          :breakout    [!month.&Products.products.created_at]
                                          :aggregation [[:distinct &Products.products.id]]
                                          :filter      [:= &Products.products.category "Doohickey"]})
                                       (mt/mbql-query reviews
                                         {:joins       [{:source-table $$products
                                                         :alias        "Products"
                                                         :condition    [:= $product_id &Products.products.id]
                                                         :fields       :all}]
                                          :breakout    [!month.&Products.products.created_at]
                                          :aggregation [[:distinct &Products.products.id]]
                                          :filter      [:= &Products.products.category "Gizmo"]})])
      (let [query {:database (mt/id)
                   :type     :query
                   :query    {:source-table "card__1"
                              :joins        [{:fields       :all
                                              :strategy     :left-join
                                              :alias        "Card_2"
                                              :condition    [:=
                                                             [:field
                                                              "CREATED_AT"
                                                              {:base-type :type/DateTime, :temporal-unit :month}]
                                                             [:field
                                                              (mt/id :products :created_at)
                                                              {:base-type     :type/DateTime
                                                               :temporal-unit :month
                                                               :join-alias    "Card_2"}]]
                                              :source-table "card__2"}]
                              :order-by     [[:asc [:field "CREATED_AT" {:base-type :type/DateTime}]]]
                              :limit        2}}]
        (mt/with-native-query-testing-context query
          (is (= [["2016-05-01T00:00:00Z" 3 nil                    nil]
                  ["2016-06-01T00:00:00Z" 2 "2016-06-01T00:00:00Z" 1]]
                 (mt/rows (qp/process-query query)))))))))

(deftest ^:parallel test-31769
  (testing "Make sure queries built with MLv2 that have source Cards with joins work correctly (#31769) (#33083)"
    (let [metadata-provider (lib.tu.mocks-31769/mock-metadata-provider
                             (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                             mt/id)]
      (qp.store/with-metadata-provider metadata-provider
        (let [legacy-query (lib.convert/->legacy-MBQL
                            (lib.tu.mocks-31769/query metadata-provider))]
          (mt/with-native-query-testing-context legacy-query
            (is (= [["Doohickey" 3976 "Doohickey"]
                    ["Gadget"    4939 "Gadget"]]
                   (mt/rows (qp/process-query legacy-query))))))))))

(deftest ^:parallel test-13000
  (testing "Should join MBQL Saved Questions (#13000, #13649, #13744)"
    (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                             (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                             [(mt/mbql-query orders
                                {:breakout    [$product_id]
                                 :aggregation [[:sum $total]]
                                 :order-by    [[:asc [:aggregation 0]]]})
                              (mt/mbql-query products
                                {:breakout    [$id]
                                 :aggregation [[:sum $rating]]})])
          query             (lib/query metadata-provider
                              (mt/mbql-query nil
                                {:source-table "card__1"
                                 :joins        [{:source-table "card__2"
                                                 :alias        "Q2 - Product"
                                                 :condition    [:=
                                                                [:field "PRODUCT_ID" {:base-type :type/Integer}]
                                                                [:field "ID" {:base-type :type/BigInteger, :join-alias "Q2 - Product"}]]
                                                 :fields       [[:field "sum" {:base-type :type/Float, :join-alias "Q2 - Product"}]]}]
                                 :expressions  {"Sum Divide" [:/
                                                              [:field "sum" {:base-type :type/Float, :join-alias "Q2 - Product"}]
                                                              [:field "sum" {:base-type :type/Float}]]}
                                 :filter       [:=
                                                [:field %products.id {:base-type :type/BigInteger, :join-alias "Q2 - Product"}]
                                                12]}))]
      #_["PRODUCT_ID" "sum" "Sum Divide" "sum_2"]
      (is (= [[12 8887.4 0.0005 4.4]]
             (mt/formatted-rows [int 1.0 4.0 1.0]
               (qp/process-query query)))))))
