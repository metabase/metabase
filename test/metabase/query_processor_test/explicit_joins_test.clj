(ns metabase.query-processor-test.explicit-joins-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets]
             [interface :as tx]]
            [toucan.util.test :as tt]))

(defn- native-form [query]
  (:query (qp/query->native query)))

;; Can we specify an *explicit* JOIN using the default options?
(expect
  (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\","
       " \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\","
       " \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\","
       " \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\","
       " \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\","
       " \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
       "FROM \"PUBLIC\".\"VENUES\" "
       "LEFT JOIN \"PUBLIC\".\"CATEGORIES\" \"source\""
       " ON \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" = 1 "
       "LIMIT 1048576")
  (native-form
   (data/mbql-query venues
     {:joins [{:source-table $$categories
               :condition    [:= $category_id 1]}]})))

(defn- query-with-strategy [strategy]
  (data/dataset bird-flocks
    (data/mbql-query bird
      {:fields   [$name &f.flock.name]
       :joins    [{:source-table $$flock
                   :condition    [:= $flock_id &f.flock.id]
                   :strategy     strategy
                   :alias        "f"}]
       :order-by [[:asc $name]]})))

;; Can we supply a custom alias? Can we do a left outer join ??
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  [["Big Red"          "Bayview Brood"]
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
  (qp.test/rows
    (qp/process-query
      (query-with-strategy :left-join))))

;; Can we do a right outer join?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :right-join)
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
              ["Russell Crow"   "Mission Street Murder"]]]
    (if (tx/sorts-nil-first? driver/*driver*)
      (cons [nil "Fillmore Flock"] rows)
      (conj rows [nil "Fillmore Flock"])))
  (qp.test/rows
    (qp/process-query
      (query-with-strategy :right-join))))

;; Can we do an inner join?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :inner-join)
  [["Big Red"        "Bayview Brood"]
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
  (qp.test/rows
    (qp/process-query
      (query-with-strategy :inner-join))))

;; Can we do a full join?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :full-join)
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
              ["Russell Crow"     "Mission Street Murder"]]]
    (if (tx/sorts-nil-first? driver/*driver*)
      (cons [nil "Fillmore Flock"] rows)
      (conj rows [nil "Fillmore Flock"])))
  (qp.test/rows
    (qp/process-query
      (query-with-strategy :full-join))))

;; Can we automatically include `:all` Fields?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  {:columns (mapv data/format-name ["id" "name" "flock_id" "id_2" "name_2"])
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
    (qp.test/rows+column-names
      (data/dataset bird-flocks
        (mt/run-mbql-query bird
          {:joins    [{:source-table $$flock
                       :condition    [:= $flock_id &f.flock.id]
                       :alias        "f"
                       :fields       :all}]
           :order-by [[:asc [:field-id $name]]]})))))

;; Can we include no Fields (with `:none`)
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  {:columns (mapv data/format-name ["id" "name" "flock_id"])
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
    (qp.test/rows+column-names
      (data/dataset bird-flocks
        (mt/run-mbql-query bird
          {:joins    [{:source-table $$flock
                       :condition    [:= $flock_id &f.flock.id]
                       :alias        "f"
                       :fields       :none}]
           :order-by [[:asc [:field-id $name]]]})))))

(deftest specific-fields-test
  (datasets/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "Can we include a list of specific Fields?"
      (let [{:keys [columns rows]} (mt/format-rows-by [#(some-> % int) str identity]
                                     (qp.test/rows+column-names
                                       (data/dataset bird-flocks
                                         (mt/run-mbql-query bird
                                           {:fields   [$id $name]
                                            :joins    [{:source-table $$flock
                                                        :condition    [:= $flock_id &f.flock.id]
                                                        :alias        "f"
                                                        :fields       [&f.flock.name]}]
                                            :order-by [[:asc [:field-id $name]]]}))))]
        (is (= (mapv data/format-name ["id" "name" "name_2"])
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
  (datasets/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing (str "Do Joins with `:fields``:all` work if the joined table includes Fields that come back wrapped in"
                  " `:datetime-field` forms?")
      (let [{:keys [columns rows]} (mt/format-rows-by [int identity identity int identity int int]
                                     (qp.test/rows+column-names
                                       (mt/run-mbql-query users
                                         {:source-table $$users
                                          :joins        [{:source-table $$checkins
                                                          :alias        "c"
                                                          :fields       "all"
                                                          :condition    [:= $id &c.checkins.id]}]
                                          :order-by     [["asc" ["joined-field" "c" $checkins.id]]]
                                          :limit        3})))]
        (is (= (mapv data/format-name ["id" "name" "last_login" "id_2" "date" "user_id" "venue_id"])
               columns))
        ;; not sure why only Oracle seems to do this
        (is (= [[1 "Plato Yeshua"        "2014-04-01T08:30:00Z" 1 "2014-04-07T00:00:00Z" 5 12]
                [2 "Felipinho Asklepios" "2014-12-05T15:15:00Z" 2 "2014-09-18T00:00:00Z" 1 31]
                [3 "Kaneonuskatew Eiran" "2014-11-06T16:15:00Z" 3 "2014-09-15T00:00:00Z" 8 56]]
               rows))))))

(deftest select-*-source-query-test
  (datasets/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "We should be able to run a query that for whatever reason ends up with a `SELECT *` for the source query"
      (let [{:keys [rows columns]} (mt/format-rows-by [int int]
                                     (qp.test/rows+column-names
                                       (mt/run-mbql-query checkins
                                         {:source-query {:source-table $$checkins
                                                         :aggregation  [[:sum $user_id->users.id]]
                                                         :breakout     [$id]}
                                          :joins        [{:alias        "u"
                                                          :source-table $$users
                                                          :condition    [:= *checkins.id &u.users.id]}]
                                          :order-by     [[:asc [:field-literal (data/format-name "id") :type/Integer]]]
                                          :limit        3})))]
        (is (= [(data/format-name "id") "sum"]
               columns))
        (is (= [[1 5] [2 1] [3 8]]
               rows))))))

;; Can we join against a source nested MBQL query?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  [[29 "20th Century Cafe" 12  37.775 -122.423 2]
   [ 8 "25°"               11 34.1015 -118.342 2]
   [93 "33 Taps"            7 34.1018 -118.326 2]]
  (mt/format-rows-by :venues
    (qp.test/rows
      (mt/run-mbql-query venues
        {:source-table $$venues
         :joins        [{:alias        "cat"
                         :source-query {:source-table $$categories}
                         :condition    [:= $category_id &cat.*categories.id]}]
         :order-by     [[:asc $name]]
         :limit        3}))))

;; Can we join against a `card__id` source query and use `:fields` `:all`?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  {:rows
   [[29 "20th Century Cafe" 12 37.775  -122.423 2 12 "Café"]
    [8  "25°"               11 34.1015 -118.342 2 11 "Burger"]
    [93 "33 Taps"           7  34.1018 -118.326 2  7 "Bar"]]

   :columns
   (mapv data/format-name ["id" "name" "category_id" "latitude" "longitude" "price" "id_2" "name_2"])}
  (tt/with-temp Card [{card-id :id} (qp.test-util/card-with-source-metadata-for-query (data/mbql-query categories))]
    (mt/format-rows-by [int identity int 4.0 4.0 int int identity]
      (qp.test/rows+column-names
        (mt/run-mbql-query venues
          {:joins    [{:alias        "cat"
                       :source-table (str "card__" card-id)
                       :fields       :all
                       :condition    [:= $category_id &cat.*categories.id]}]
           :order-by [[:asc $name]]
           :limit    3})))))

;; Can we join on a Field literal for a source query?
;;
;; Also: if you join against an *explicit* source query, do all columns for both queries come back? (Only applies if
;; you include `:source-metadata`)
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  {:rows
   [["2013-01-01T00:00:00Z"  8 "2013-01-01T00:00:00Z"  8]
    ["2013-02-01T00:00:00Z" 11 "2013-02-01T00:00:00Z" 11]
    ["2013-03-01T00:00:00Z" 21 "2013-03-01T00:00:00Z" 21]
    ["2013-04-01T00:00:00Z" 26 "2013-04-01T00:00:00Z" 26]
    ["2013-05-01T00:00:00Z" 23 "2013-05-01T00:00:00Z" 23]
    ["2013-06-01T00:00:00Z" 26 "2013-06-01T00:00:00Z" 26]
    ["2013-07-01T00:00:00Z" 20 "2013-07-01T00:00:00Z" 20]
    ["2013-08-01T00:00:00Z" 22 "2013-08-01T00:00:00Z" 22]
    ["2013-09-01T00:00:00Z" 13 "2013-09-01T00:00:00Z" 13]
    ["2013-10-01T00:00:00Z" 26 "2013-10-01T00:00:00Z" 26]]
   :columns [(data/format-name "date") "count" (data/format-name "date_2") "count_2"]}
  (mt/format-rows-by [identity int identity int]
    (qp.test/rows+column-names
      (tt/with-temp Card [{card-id :id} (qp.test-util/card-with-source-metadata-for-query
                                         (data/mbql-query checkins
                                           {:aggregation [[:count]]
                                            :breakout    [!month.date]}))]
        (mt/run-mbql-query checkins
          {:source-query {:source-table $$checkins
                          :aggregation  [[:count]]
                          :breakout     [!month.date]}
           :joins
           [{:fields       :all
             :alias        "checkins_2"
             :source-table (str "card__" card-id)
             :condition    [:= !month.*date &checkins_2.*date]}]
           :order-by     [[:asc !month.*date]]
           :limit        10})))))

;; Can we aggregate on the results of a JOIN?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  ;; for whatever reason H2 gives slightly different answers :unamused:
  {:rows    (let [driver-avg #(if (= metabase.driver/*driver* :h2) %1 %2)]
              [["2014-01-01T00:00:00Z" 77]
               ["2014-02-01T00:00:00Z" 81]
               ["2014-04-01T00:00:00Z" (driver-avg 50 49)]
               ["2014-07-01T00:00:00Z" (driver-avg 69 68)]
               ["2014-08-01T00:00:00Z" 64]
               ["2014-10-01T00:00:00Z" (driver-avg 66 65)]
               ["2014-11-01T00:00:00Z" (driver-avg 75 74)]
               ["2014-12-01T00:00:00Z" 70]])
   :columns [(data/format-name "last_login") "avg"]}
  (mt/format-rows-by [identity int]
    (qp.test/rows+column-names
      (tt/with-temp Card [{card-id :id} (qp.test-util/card-with-source-metadata-for-query
                                         (data/mbql-query checkins
                                           {:aggregation [[:count]]
                                            :breakout    [$user_id]}))]
        (mt/run-mbql-query users
          {:joins       [{:fields       :all
                          :alias        "checkins_by_user"
                          :source-table (str "card__" card-id)
                          :condition    [:= $id &checkins_by_user.*checkins.user_id]}]
           :aggregation [[:avg &checkins_by_user.*count/Float]]
           :breakout    [!month.last_login]})))))

;; NEW! Can we still get all of our columns, even if we *DON'T* specify the metadata?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  {:rows    [["2013-01-01T00:00:00Z"  8 "2013-01-01T00:00:00Z"  8]
             ["2013-02-01T00:00:00Z" 11 "2013-02-01T00:00:00Z" 11]
             ["2013-03-01T00:00:00Z" 21 "2013-03-01T00:00:00Z" 21]]
   :columns [(data/format-name "date") "count" (data/format-name "date_2") "count_2"]}
  (tt/with-temp Card [{card-id               :id
                       {source-query :query} :dataset_query
                       source-metadata       :result_metadata} (qp.test-util/card-with-source-metadata-for-query
                       (data/mbql-query checkins
                         {:aggregation [[:count]]
                          :breakout    [!month.date]}))]
    (qp.test/rows+column-names
      (mt/format-rows-by [identity int identity int]
        (mt/run-mbql-query checkins
          {:source-query source-query
           :joins        [{:source-table (str "card__" card-id)
                           :alias        "checkins_by_month"
                           :fields       :all
                           :condition    [:= *checkins.date &checkins_by_month.*checkins.date]}]
           :order-by     [[:asc *checkins.date]]
           :limit        3})))))

;; Should be able to use a joined field in a `:time-interval` clause
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :left-join)
  {:rows    []
   :columns (mapv data/format-name ["id" "name" "category_id" "latitude" "longitude" "price"])}
  (qp.test/rows+column-names
    (mt/run-mbql-query venues
      {:joins    [{:source-table $$checkins
                   :alias        "c"
                   :strategy     :right-join
                   :condition    [:= $id &c.checkins.venue_id]}]
       :filter   [:time-interval &c.checkins.date -30 :day]
       :order-by [[:asc &c.checkins.id]]
       :limit    10})))

(deftest deduplicate-column-names-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing (str "Do we gracefully handle situtations where joins would produce multiple columns with the same name? "
                  "(Multiple columns named `id` in the example below)")
      (let [{:keys [rows columns]} (qp.test/rows+column-names
                                     (mt/format-rows-by [int       ; checkins.id
                                                         str       ; checkins.date
                                                         int       ; checkins.user_id
                                                         int       ; checkins.venue_id
                                                         int       ; users.id
                                                         str       ; users.name
                                                         str       ; users.last_login
                                                         int       ; venues.id
                                                         str       ; venues.name
                                                         int       ; venues.category_id
                                                         3.0       ; venues.latitude
                                                         3.0       ; venues.longitude
                                                         int]      ; venues.price
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
                                                          :condition    [:= *user_id &v.venues.id]}]
                                          :order-by     [[:asc $id]]
                                          :limit        2})))]
        (is (= (mapv
                data/format-name
                ["id"     "date"   "user_id"     "venue_id"                       ; checkins
                 "id_2"   "name"   "last_login"                                   ; users
                 "id_2_2" "name_2" "category_id" "latitude" "longitude" "price"]) ; venues
               columns))
        (is (= [[1 "2014-04-07T00:00:00Z" 5 12
                 5 "Quentin Sören" "2014-10-03T17:30:00Z"
                 5 "Brite Spot Family Restaurant" 20 34.078 -118.261 2]
                [2 "2014-09-18T00:00:00Z" 1 31
                 1 "Plato Yeshua" "2014-04-01T08:30:00Z"
                 1 "Red Medicine" 4 10.065 -165.374 3]]
               rows))))))

;; we should be able to use a SQL question as a source query in a Join
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
  [[1 "2014-04-07T00:00:00Z" 5 12 12 "The Misfit Restaurant + Bar" 2 34.0154 -118.497 2]
   [2 "2014-09-18T00:00:00Z" 1 31 31 "Bludso's BBQ"                5 33.8894 -118.207 2]]
  (tt/with-temp Card [{card-id :id, :as card} (qp.test-util/card-with-source-metadata-for-query
                                               (data/native-query (qp/query->native (data/mbql-query venues))))]
    (qp.test/formatted-rows [int identity int int int identity int 4.0 4.0 int]
      (mt/run-mbql-query checkins
        {:joins    [{:fields       :all
                     :source-table (str "card__" card-id)
                     :alias        "card"
                     :condition    [:= $venue_id &card.*venues.id]}]
         :order-by [[:asc $id]]
         :limit    2}))))
