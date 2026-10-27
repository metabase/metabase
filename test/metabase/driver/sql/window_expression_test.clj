(ns metabase.driver.sql.window-expression-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.compile :as qp.compile]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]))

(defn- field [column-name base-type]
  [:field {:lib/uuid (str (random-uuid)) :base-type base-type} column-name])

(defn- clause [tag & args]
  (into [tag {:lib/uuid (str (random-uuid))}] args))

(defn- window [expression-name opts f partitions orders]
  [:window (merge {:lib/uuid (str (random-uuid)) :lib/expression-name expression-name} opts)
   f
   (into [:partition-by {:lib/uuid (str (random-uuid))}] partitions)
   (into [:order-by {:lib/uuid (str (random-uuid))}] orders)])

(defn window-query
  "Venues with the windows product analytics uses, partitioned by category, after a filter on price."
  []
  {:lib/type :mbql/query
   :database (meta/id)
   :stages   [{:lib/type    :mbql.stage/mbql
               :source-table (meta/id :venues)
               :filters     [(clause :> (field "PRICE" :type/Integer) 1)]
               :expressions [(window "rn" {} (clause :row-number) [(field "CATEGORY_ID" :type/Integer)]
                                     [(clause :asc (field "PRICE" :type/Integer))
                                      (clause :desc (field "ID" :type/Integer))])
                             (window "later_min" {:frame {:mode :rows :start :unbounded-preceding :end [:preceding 1]}}
                                     (clause :min (field "PRICE" :type/Integer)) [(field "CATEGORY_ID" :type/Integer)]
                                     [(clause :desc (field "ID" :type/Integer))])
                             (window "next_name" {} (clause :lead (field "NAME" :type/Text) 2) [(field "CATEGORY_ID" :type/Integer)]
                                     [(clause :asc (field "ID" :type/Integer))])
                             (window "prev_name" {} (clause :lag (field "NAME" :type/Text) 1 "none") [(field "CATEGORY_ID" :type/Integer)]
                                     [(clause :asc (field "ID" :type/Integer))])
                             (window "running" {:frame {:mode :rows :start :unbounded-preceding :end :current-row}}
                                     (clause :sum (field "PRICE" :type/Integer)) [(field "CATEGORY_ID" :type/Integer)]
                                     [(clause :asc (field "ID" :type/Integer))])
                             (window "lowest" {} (clause :min (field "PRICE" :type/Integer)) [(field "CATEGORY_ID" :type/Integer)] [])
                             (window "total" {} (clause :count) [] [])]
               :fields      [(field "ID" :type/Integer)]}]})

(defn compile-sql
  "SQL for `query` compiled for the current driver against the test metadata."
  [query]
  (qp.store/with-metadata-provider meta/metadata-provider
    (:query (qp.compile/compile query))))

(defn- postgres-sql [query]
  (driver/with-driver :postgres
    (compile-sql query)))

(deftest ^:parallel window-compile-test
  (let [sql (postgres-sql (update-in (window-query) [:stages 0] dissoc :fields))]
    (are [fragment] (str/includes? sql fragment)
      "ROW_NUMBER() OVER (PARTITION BY \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" ORDER BY \"PUBLIC\".\"VENUES\".\"PRICE\" ASC, \"PUBLIC\".\"VENUES\".\"ID\" DESC) AS \"rn\""
      "MIN(\"PUBLIC\".\"VENUES\".\"PRICE\") OVER (PARTITION BY \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" ORDER BY \"PUBLIC\".\"VENUES\".\"ID\" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS \"later_min\""
      "LEAD(\"PUBLIC\".\"VENUES\".\"NAME\", 2) OVER (PARTITION BY \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" ORDER BY \"PUBLIC\".\"VENUES\".\"ID\" ASC) AS \"next_name\""
      "LAG(\"PUBLIC\".\"VENUES\".\"NAME\", 1, ?) OVER"
      "SUM(\"PUBLIC\".\"VENUES\".\"PRICE\") OVER (PARTITION BY \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" ORDER BY \"PUBLIC\".\"VENUES\".\"ID\" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS \"running\""
      "MIN(\"PUBLIC\".\"VENUES\".\"PRICE\") OVER (PARTITION BY \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\") AS \"lowest\""
      "COUNT(*) OVER () AS \"total\"")
    (testing "the filter is in the same SELECT, so it applies before the windows"
      (is (str/includes? sql "FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"PRICE\" > 1")))))

(deftest ^:parallel window-ordered-by-stays-with-filters-test
  (testing "ordering by a window nests the stage, and the filters stay with the windows in the inner one"
    (let [q   (-> (window-query)
                  (update-in [:stages 0] dissoc :fields)
                  (assoc-in [:stages 0 :order-by] [(clause :asc [:expression {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "rn"])]))
          sql (postgres-sql q)]
      (is (re-find #"(?s)WITH \"__mb_stage_0\" AS \(SELECT .*ROW_NUMBER\(\) OVER .* WHERE \"PUBLIC\"\.\"VENUES\"\.\"PRICE\" > 1\).* ORDER BY \"__mb_source\"\.\"rn\" ASC"
                   sql)))))

(deftest ^:parallel bare-window-function-test
  (testing "a window function outside a :window doesn't compile"
    (is (thrown? Exception
                 (postgres-sql (assoc-in (window-query) [:stages 0 :expressions]
                                         [(assoc-in (clause :lag (field "NAME" :type/Text) 1) [1 :lib/expression-name] "x")]))))))
