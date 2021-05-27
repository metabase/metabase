(ns metabase.query-processor-test.explicit-joins-test
  (:require [clojure.set :as set]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.models :refer [Card]]
            [metabase.query-processor :as qp]
            [metabase.query-processor-test.timezones-test :as timezones-test]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]))

(defn- native-form [query]
  (:query (qp/query->native query)))

(deftest explict-join-with-default-options-test
  (testing "Can we specify an *explicit* JOIN using the default options?"
    (is (= (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\","
                " \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\","
                " \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\","
                " \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\","
                " \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\","
                " \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                "FROM \"PUBLIC\".\"VENUES\" "
                "LEFT JOIN \"PUBLIC\".\"CATEGORIES\" \"source\""
                " ON \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" = 1 "
                "LIMIT 1048575")
           (native-form
            (mt/mbql-query venues
              {:joins [{:source-table $$categories
                        :condition    [:= $category_id 1]}]}))))))

(defn- query-with-strategy [strategy]
  (mt/dataset bird-flocks
    (mt/mbql-query bird
      {:fields   [$name &f.flock.name]
       :joins    [{:source-table $$flock
                   :condition    [:= $flock_id &f.flock.id]
                   :strategy     strategy
                   :alias        "f"}]
       :order-by [[:asc $name]]})))

(deftest left-outer-join-test
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

(deftest right-outer-join-test
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
            rows (if (tx/sorts-nil-first? driver/*driver*)
                   (cons [nil "Fillmore Flock"] rows)
                   (conj rows [nil "Fillmore Flock"]))]
        (is (= rows
               (mt/rows
                 (qp/process-query
                  (query-with-strategy :right-join)))))))))

(deftest inner-join-test
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

(deftest full-join-test
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
            rows (if (tx/sorts-nil-first? driver/*driver*)
                   (cons [nil "Fillmore Flock"] rows)
                   (conj rows [nil "Fillmore Flock"]))]
        (is (= rows
               (mt/rows
                 (qp/process-query
                  (query-with-strategy :full-join)))))))))

(deftest automatically-include-all-fields-test
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
                      :order-by [[:asc [:field-id $name]]]})))))))))

(deftest include-no-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we include no Fields (with `:none`)"
      (is (= {:columns (mapv mt/format-name ["id" "name" "flock_id"])
              :rows    [[2  "Big Red"          5  ]
                        [7  "Callie Crow"      4  ]
                        [3  "Camellia Crow"    nil]
                        [16 "Carson Crow"      4  ]
                        [12 "Chicken Little"   5  ]
                        [5  "Geoff Goose"      nil]
                        [9  "Gerald Goose"     1  ]
                        [6  "Greg Goose"       1  ]
                        [14 "McNugget"         5  ]
                        [17 "Olita Owl"        nil]
                        [18 "Oliver Owl"       3  ]
                        [15 "Orville Owl"      3  ]
                        [11 "Oswald Owl"       nil]
                        [10 "Pamela Pelican"   nil]
                        [8  "Patricia Pelican" nil]
                        [13 "Paul Pelican"     2  ]
                        [4  "Peter Pelican"    2  ]
                        [1  "Russell Crow"     4  ]]}
             (mt/format-rows-by [#(some-> % int) str #(some-> % int)]
               (mt/rows+column-names
                 (mt/dataset bird-flocks
                   (mt/run-mbql-query bird
                     {:joins    [{:source-table $$flock
                                  :condition    [:= $flock_id &f.flock.id]
                                  :alias        "f"
                                  :fields       :none}]
                      :order-by [[:asc [:field-id $name]]]})))))))))

(deftest specific-fields-test
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
                                            :order-by [[:asc [:field-id $name]]]}))))]
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

(deftest all-fields-datetime-field-test
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

(deftest select-*-source-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
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

(deftest join-against-nested-mbql-query-test
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

(deftest join-against-card-source-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we join against a `card__id` source query and use `:fields` `:all`?"
      (is (= {:rows
              [[29 "20th Century Cafe" 12 37.775  -122.423 2 12 "Café"]
               [8  "25°"               11 34.1015 -118.342 2 11 "Burger"]
               [93 "33 Taps"           7  34.1018 -118.326 2  7 "Bar"]]

              :columns
              (mapv mt/format-name ["id" "name" "category_id" "latitude" "longitude" "price" "id_2" "name_2"])}
             (mt/with-temp Card [{card-id :id} (qp.test-util/card-with-source-metadata-for-query (mt/mbql-query categories))]
               (mt/format-rows-by [int identity int 4.0 4.0 int int identity]
                 (mt/rows+column-names
                   (mt/run-mbql-query venues
                     {:joins    [{:alias        "cat"
                                  :source-table (str "card__" card-id)
                                  :fields       :all
                                  :condition    [:= $category_id &cat.*categories.id]}]
                      :order-by [[:asc $name]]
                      :limit    3})))))))))

(deftest join-on-field-literal-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we join on a Field literal for a source query?"
      ;; Also: if you join against an *explicit* source query, do all columns for both queries come back? (Only applies
      ;; if you include `:source-metadata`)
      (is (= {:rows [[1 3 46 3] [2 9 40 9] [4 7 5 7]]
              :columns [(mt/format-name "venue_id") "count" (mt/format-name "category_id") "count_2"]}
             (mt/format-rows-by [int int int int]
               (mt/rows+column-names
                 (mt/with-temp Card [{card-id :id} (qp.test-util/card-with-source-metadata-for-query
                                                    (mt/mbql-query venues
                                                      {:aggregation [[:count]]
                                                       :breakout    [$category_id]}))]
                   (mt/run-mbql-query checkins
                     {:source-query {:source-table $$checkins
                                     :aggregation  [[:count]]
                                     :breakout     [$venue_id]}
                      :joins
                      [{:fields       :all
                        :alias        "venues"
                        :source-table (str "card__" card-id)
                        :strategy         :inner-join
                        :condition    [:=
                                       [:field "count" {:base-type :type/Number}]
                                       [:field "count" {:base-type :type/Number, :join-alias "venues"}]]}]
                      :order-by     [[:asc $venue_id]]
                      :limit        3})))))))))

(deftest aggregate-join-results-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we aggregate on the results of a JOIN?"
      ;; for whatever reason H2 gives slightly different answers :unamused:
      (is (= {:rows    (let [driver-avg #(if (= metabase.driver/*driver* :h2) %1 %2)]
                         [["2014-01-01T00:00:00Z" 77]
                          ["2014-02-01T00:00:00Z" 81]
                          ["2014-04-01T00:00:00Z" (driver-avg 50 49)]
                          ["2014-07-01T00:00:00Z" (driver-avg 69 68)]
                          ["2014-08-01T00:00:00Z" 64]
                          ["2014-10-01T00:00:00Z" (driver-avg 66 65)]
                          ["2014-11-01T00:00:00Z" (driver-avg 75 74)]
                          ["2014-12-01T00:00:00Z" 70]])
              :columns [(mt/format-name "last_login") "avg"]}
             (mt/format-rows-by [identity int]
               (mt/rows+column-names
                 (mt/with-temp Card [{card-id :id} (qp.test-util/card-with-source-metadata-for-query
                                                    (mt/mbql-query checkins
                                                      {:aggregation [[:count]]
                                                       :breakout    [$user_id]}))]
                   (mt/run-mbql-query users
                     {:joins       [{:fields       :all
                                     :alias        "checkins_by_user"
                                     :source-table (str "card__" card-id)
                                     :condition    [:= $id &checkins_by_user.*checkins.user_id]}]
                      :aggregation [[:avg &checkins_by_user.*count/Float]]
                      :breakout    [!month.last_login]})))))))))

(deftest get-all-columns-without-metadata-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "NEW! Can we still get all of our columns, even if we *DON'T* specify the metadata?"
      (mt/with-temp Card [{card-id               :id
                           {source-query :query} :dataset_query
                           source-metadata       :result_metadata} (qp.test-util/card-with-source-metadata-for-query
                                                                    (mt/mbql-query venues
                                                                      {:aggregation [[:count]]
                                                                       :breakout    [$category_id]}))]
        (is (= {:rows    [[1 3 46 3] [2 9 40 9] [4 7 5 7]]
                :columns [(mt/format-name "venue_id") "count" (mt/format-name "category_id") "count_2"]}
               (mt/rows+column-names
                 (mt/format-rows-by [int int int int]
                   (mt/run-mbql-query checkins
                     {:source-query {:source-table $$checkins
                                     :aggregation  [[:count]]
                                     :breakout     [$venue_id]}
                      :joins        [{:source-table (str "card__" card-id)
                                      :alias        "venues"
                                      :fields       :all
                                      :strategy     :inner-join
                                      :condition    [:=
                                                     [:field "count" {:base-type :type/Number}]
                                                     [:field "count" {:base-type :type/Number, :join-alias "venues"}]]}]
                      :order-by     [[:asc $venue_id]]
                      :limit        3})))))))))

(deftest joined-field-in-time-interval-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
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

(deftest deduplicate-column-names-test
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
                ["id"     "date"   "user_id"     "venue_id"                       ; checkins
                 "id_2"   "name"   "last_login"                                   ; users
                 "id_3" "name_2" "category_id" "latitude" "longitude" "price"]) ; venues
               columns))
        (is (= [[1 "2014-04-07T00:00:00Z" 5 12
                 5 "Quentin Sören" "2014-10-03T17:30:00Z"
                 5 "Brite Spot Family Restaurant" 20 34.078 -118.261 2]
                [2 "2014-09-18T00:00:00Z" 1 31
                 1 "Plato Yeshua" "2014-04-01T08:30:00Z"
                 1 "Red Medicine" 4 10.065 -165.374 3]]
               rows))))))

(deftest sql-question-source-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (testing "we should be able to use a SQL question as a source query in a Join"
      (mt/with-temp Card [{card-id :id, :as card} (qp.test-util/card-with-source-metadata-for-query
                                                   (mt/native-query (qp/query->native (mt/mbql-query venues))))]
        (is (= [[1 "2014-04-07T00:00:00Z" 5 12 12 "The Misfit Restaurant + Bar" 2 34.0154 -118.497 2]
                [2 "2014-09-18T00:00:00Z" 1 31 31 "Bludso's BBQ"                5 33.8894 -118.207 2]]
               (mt/formatted-rows [int identity int int int identity int 4.0 4.0 int]
                 (mt/run-mbql-query checkins
                   {:joins    [{:fields       :all
                                :source-table (str "card__" card-id)
                                :alias        "card"
                                :condition    [:= $venue_id &card.venues.id]}]
                    :order-by [[:asc $id]]
                    :limit    2}))))))))

(deftest joined-date-filter-test
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

(deftest expressions-referencing-joined-aggregation-expressions-test
  (testing (mt/normal-drivers-with-feature :nested-queries :left-join :expressions)
    (testing "Should be able to use expressions against columns that come from aggregation expressions in joins"
      (is (= [[1 "Red Medicine"          4  10.065 -165.374 3 1.5  4 3 2 1]
              [2 "Stout Burgers & Beers" 11 34.1   -118.329 2 2.0 11 2 1 1]
              [3 "The Apple Pan"         11 34.041 -118.428 2 2.0 11 2 1 1]]
             (mt/formatted-rows [int str int 3.0 3.0 int 1.0 int int int int]
               (mt/run-mbql-query venues
                 {:fields      [$id
                                $name
                                $category_ID
                                $latitude
                                $longitude
                                $price
                                [:expression "RelativePrice"]]
                  :expressions {:RelativePrice [:/ $price &CategoriesStats.*AvgPrice/Integer]},
                  :joins       [{:condition    [:= $category_id &CategoriesStats.venues.category_id]
                                 :source-query {:source-table $$venues
                                                :aggregation  [[:aggregation-options [:max $price] {:name "MaxPrice"}]
                                                               [:aggregation-options [:avg $price] {:name "AvgPrice"}]
                                                               [:aggregation-options [:min $price] {:name "MinPrice"}]],
                                                :breakout     [$category_id]}
                                 :alias        "CategoriesStats"
                                 :fields       :all}]
                  :limit       3})))))))

(deftest join-source-queries-with-joins-test
  (testing "Should be able to join against source queries that themselves contain joins (#12928)"
    ;; sample-dataset doesn't work on Redshift yet -- see #14784
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :nested-queries :left-join :foreign-keys) :redshift)
      (mt/dataset sample-dataset
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
                                         :condition    [:= $products.category &Q2.products.category]
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
                         :limit        2})]
            (is (= [["Doohickey" "Affiliate" 783 "Doohickey" 3]
                    ["Doohickey" "Facebook" 816 "Doohickey" 3]]
                   (mt/formatted-rows [str str int str int]
                     (qp/process-query query))))))

        (testing "and custom expressions (#13649)"
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
            (is (= [[4 41 0.46 41]]
                   (mt/formatted-rows [int int 2.0 int]
                     (qp/process-query query))))))))))
