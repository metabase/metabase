(ns metabase.query-processor-test.explicit-joins-test
  (:require [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets]
             [interface :as tx]]))

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
  (qp.test/format-rows-by [int str #(some-> % int) #(some-> % int) #(some-> % str)]
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
  (qp.test/format-rows-by [#(some-> % int) str #(some-> % str)]
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

;; TODO Can we join on bucketed datetimes?

;; TODO Can we join against a source nested MBQL query?

;; TODO Can we join against a source nested native query?

;; TODO Can we include a list of specific Field for the source nested query?

;; TODO Do joins inside nested queries work?

;; TODO Can we join the same table twice with different conditions?

;; TODO Can we join the same table twice with the same condition?

;; TODO - Can we run a wacko query that does duplicate joins against the same table?
(defn- x []
  (qp/process-query
    (data/mbql-query checkins
      {:source-query {:source-table $$checkins
                      :aggregation  [[:sum $user_id->users.id]]
                      :breakout     [[:field-id $id]]}
       :joins        [{:alias        "u"
                       :source-table $$users
                       :condition    [:=
                                      [:field-literal "ID" :type/BigInteger]
                                      [:joined-field "u" $users.id]]}]
       :limit        10})))
