(ns metabase.driver.sql.union-all-stages-test
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

(defn- query [branch-fields]
  {:lib/type :mbql/query
   :database (meta/id)
   :stages   [{:lib/type :mbql.stage/mbql :name "venues" :source-table (meta/id :venues)}
              {:lib/type :mbql.stage/mbql :name "cheap"
               :filters  [(clause := (field "PRICE" :type/Integer) 1)]
               :fields   [(field "NAME" :type/Text) (field "PRICE" :type/Integer)]}
              {:lib/type :mbql.stage/mbql :name "pricey" :source-stage "venues"
               :filters  [(clause := (field "PRICE" :type/Integer) 4)]
               :fields   branch-fields}
              {:lib/type :mbql.stage/mbql :source-stage "cheap" :union-all ["pricey"]
               :filters     [(clause :not-null (field "NAME" :type/Text))]
               :breakout    [(field "PRICE" :type/Integer)]
               :aggregation [(clause :count)]}]})

(defn- compile-sql [q]
  (driver/with-driver :postgres
    (qp.store/with-metadata-provider meta/metadata-provider
      (:query (qp.compile/compile q)))))

(deftest ^:parallel union-all-compile-test
  (testing "the source is the source stage's CTE with the branch's CTE appended, by position, under the source's names"
    (let [sql (compile-sql (query [(field "CATEGORY_ID" :type/Integer) (field "PRICE" :type/Integer)]))]
      (is (str/includes? sql (str "FROM (SELECT \"NAME\" AS \"NAME\", \"PRICE\" AS \"PRICE\" FROM \"__mb_stage_1\""
                                  " UNION ALL"
                                  " SELECT \"CATEGORY_ID\" AS \"NAME\", \"PRICE\" AS \"PRICE\" FROM \"__mb_stage_2\")"
                                  " AS \"__mb_source\"")))
      (testing "the stage's own clauses apply to the appended rows"
        (is (str/includes? sql "WHERE \"__mb_source\".\"NAME\" IS NOT NULL GROUP BY \"__mb_source\".\"PRICE\""))))))

(deftest ^:parallel union-all-column-count-test
  (testing "a branch with a different number of columns doesn't compile"
    (is (thrown-with-msg? Exception #"returns 1 columns"
                          (compile-sql (query [(field "NAME" :type/Text)]))))))

(deftest ^:parallel union-all-needs-ctes-test
  (testing "a driver that nests stages as subselects refuses a stage that appends others"
    (is (thrown-with-msg? Exception #"needs a database that compiles stages to CTEs"
                          (driver/with-driver :h2
                            (qp.store/with-metadata-provider meta/metadata-provider
                              (qp.compile/compile (query [(field "NAME" :type/Text) (field "PRICE" :type/Integer)]))))))))
