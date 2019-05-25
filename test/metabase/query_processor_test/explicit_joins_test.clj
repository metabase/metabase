(ns metabase.query-processor-test.explicit-joins-test
  (:require [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [util :as u]]
            [metabase.models.card :refer [Card]]
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
               :condition    [:= [:field-id $category_id] 1]}]})))

(defn- query-with-strategy [strategy]
  (data/dataset bird-flocks
    (data/mbql-query bird
      {:fields   [[:field-id $name] [:joined-field "f" [:field-id $flock.name]]]
       :joins    [{:source-table $$flock
                   :condition    [:= [:field-id $flock_id] [:joined-field "f" [:field-id $flock.id]]]
                   :strategy     strategy
                   :alias        "f"}]
       :order-by [[:asc [:field-id $name]]]})))

;; Can we supply a custom alias? Can we do a left outer join ??
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
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
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :right-join)
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
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :inner-join)
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
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :full-join)
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
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
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
  (qp.test/format-rows-by [int str #(some-> % int) #(some-> % int) identity]
    (qp.test/rows+column-names
      (qp/process-query
        (data/dataset bird-flocks
          (data/mbql-query bird
            {:joins    [{:source-table $$flock
                         :condition    [:= [:field-id $flock_id] [:joined-field "f" [:field-id $flock.id]]]
                         :alias        "f"
                         :fields       :all}]
             :order-by [[:asc [:field-id $name]]]}))))))

;; Can we include no Fields (with `:none`)
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
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
  (qp.test/format-rows-by [#(some-> % int) str #(some-> % int)]
    (qp.test/rows+column-names
      (qp/process-query
        (data/dataset bird-flocks
          (data/mbql-query bird
            {:joins    [{:source-table $$flock
                         :condition    [:= [:field-id $flock_id] [:joined-field "f" [:field-id $flock.id]]]
                         :alias        "f"
                         :fields       :none}]
             :order-by [[:asc [:field-id $name]]]}))))))

;;Can we include a list of specific Fields?
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
  {:columns (mapv data/format-name ["id" "name" "name_2"])
   :rows    [[2  "Big Red"         "Bayview Brood"]
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
             [1  "Russell Crow"    "Mission Street Murder"]]}
  (qp.test/format-rows-by [#(some-> % int) str identity]
    (qp.test/rows+column-names
      (qp/process-query
        (data/dataset bird-flocks
          (data/mbql-query bird
            {:fields   [$id $name]
             :joins    [{:source-table $$flock
                         :condition    [:= [:field-id $flock_id] [:joined-field "f" [:field-id $flock.id]]]
                         :alias        "f"
                         :fields       [[:joined-field "f" $flock.name]]}]
             :order-by [[:asc [:field-id $name]]]}))))))

;; Do Joins with `:fields``:all` work if the joined table includes Fields that come back wrapped in `:datetime-field`
;; forms?
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
  {:columns
   (mapv data/format-name ["id" "name" "last_login" "id_2" "date" "user_id" "venue_id"])

   :rows
   [[1 "Plato Yeshua"        "2014-04-01T08:30:00.000Z" 1 "2014-04-07T00:00:00.000Z" 5 12]
    [2 "Felipinho Asklepios" "2014-12-05T15:15:00.000Z" 2 "2014-09-18T00:00:00.000Z" 1 31]
    [3 "Kaneonuskatew Eiran" "2014-11-06T16:15:00.000Z" 3 "2014-09-15T00:00:00.000Z" 8 56]]}
  (qp.test/format-rows-by [int identity identity int identity int int]
    (qp.test/rows+column-names
      (qp/process-query
        (data/mbql-query users
          {:source-table $$users
           :joins        [{:source-table $$checkins
                           :alias        "c"
                           :fields       "all"
                           :condition    [:= $id [:joined-field "c" $checkins.id]]}]
           :order-by     [["asc" ["joined-field" "c" $checkins.id]]]
           :limit        3})))))

;; Can we run a query that for whatever reason ends up with a `SELECT *` for the source query
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
  {:columns [(data/format-name "id") "sum"]
   :rows    [[1 5] [2 1] [3 8]]}
  (qp.test/format-rows-by [int int]
    (qp.test/rows+column-names
      (qp/process-query
        (data/mbql-query checkins
          {:source-query {:source-table $$checkins
                          :aggregation  [[:sum $user_id->users.id]]
                          :breakout     [$id]}
           :joins        [{:alias        "u"
                           :source-table $$users
                           :condition    [:=
                                          [:field-literal "ID" :type/BigInteger]
                                          [:joined-field "u" $users.id]]}]
           :order-by     [[:asc [:field-literal "ID" :type/Integer]]]
           :limit        3})))))

;; Can we join against a source nested MBQL query?
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
  [[29 "20th Century Cafe" 12  37.775 -122.423 2]
   [ 8 "25°"               11 34.1015 -118.342 2]
   [93 "33 Taps"            7 34.1018 -118.326 2]]
  (qp.test/formatted-venues-rows
   (qp.test/rows
     (qp/process-query
       (data/mbql-query venues
         {:source-table $$venues
          :joins        [{:alias        "cat"
                          :source-query {:source-table $$categories}
                          :condition    [:=
                                         $category_id
                                         [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
          :order-by     [[:asc $name]]
          :limit        3})))))

;; Can we join against a `card__id` source query and use `:fields` `:all`?
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
  {:rows
   [[29 "20th Century Cafe" 12 37.775  -122.423 2 12 "Café"]
    [8  "25°"               11 34.1015 -118.342 2 11 "Burger"]
    [93 "33 Taps"           7  34.1018 -118.326 2  7 "Bar"]]

   :columns
   (mapv data/format-name ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE" "ID_2" "NAME_2"])}
  (tt/with-temp Card [{card-id :id} {:dataset_query   (data/mbql-query categories)
                                     :result_metadata (get-in (qp/process-query (data/mbql-query categories {:limit 1}))
                                                              [:data :results_metadata :columns])}]
    (qp.test/format-rows-by [int identity int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int
                             int identity]
      (qp.test/rows+column-names
        (qp/process-query
          (data/mbql-query venues
            {:joins    [{:alias        "cat"
                         :source-table (str "card__" card-id)
                         :fields       :all
                         :condition    [:=
                                        $category_id
                                        [:joined-field "cat" [:field-literal "ID" :type/BigInteger]]]}]
             :order-by [[:asc $name]]
             :limit    3}))))))

;; TODO Can we join on bucketed datetimes?

;; TODO Can we join against a source nested native query?

;; TODO Can we include a list of specific Field for the source nested query?

;; TODO Do joins inside nested queries work?

;; TODO Can we join the same table twice with different conditions?

;; TODO Can we join the same table twice with the same condition?
