(ns ^:mb/driver-tests metabase.driver.sql.stage-ctes-test
  "End-to-end tests for queries whose stages compile to CTEs (see [[metabase.driver.sql.query-processor/use-ctes-for-stages?]]).
  These recreate the questions used to test CTE compilation by hand: a multi-stage question with joins, a native
  question that selects from it with a variable, and a question that joins it."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- col
  "The column in `cols` named `col-name` (ignoring case), from the join with `join-alias` if given."
  ([cols col-name]
   (col cols col-name nil))
  ([cols col-name join-alias]
   (or (m/find-first #(and (= (u/lower-case-en (:name %)) col-name)
                           (= (lib/current-join-alias %) join-alias)
                           (not= (:lib/source %) :source/implicitly-joinable))
                     cols)
       (throw (ex-info "Column not found" {:name col-name, :join-alias join-alias})))))

(defn- join-alias
  "The alias of the last join in the last stage of `query`. Join aliases come from table names, which differ by driver."
  [query]
  (:alias (last (lib/joins query))))

(defn- multi-stage-query
  "Total order amount per user and product category, then per user source, sorted by the total:

  stage 0: orders, sum of total by user_id and product_id
  stage 1: join products, sum of the sum by user_id and products.category
  stage 2: join people, sum of the sum by people.source, ordered by the sum"
  [mp]
  (let [field #(lib.metadata/field mp (mt/id %1 %2))
        query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  (lib/aggregate (lib/sum (field :orders :total)))
                  (lib/breakout (field :orders :user_id))
                  (lib/breakout (field :orders :product_id))
                  lib/append-stage)
        query (lib/join query (lib/join-clause (lib.metadata/table mp (mt/id :products))
                                               [(lib/= (col (lib/visible-columns query) "product_id")
                                                       (field :products :id))]))
        query (-> query
                  (lib/aggregate (lib/sum (col (lib/visible-columns query) "sum")))
                  (lib/breakout (col (lib/breakoutable-columns query) "user_id"))
                  (lib/breakout (col (lib/breakoutable-columns query) "category" (join-alias query)))
                  lib/append-stage)
        query (lib/join query (lib/join-clause (lib.metadata/table mp (mt/id :people))
                                               [(lib/= (col (lib/visible-columns query) "user_id")
                                                       (field :people :id))]))
        query (-> query
                  (lib/aggregate (lib/sum (col (lib/visible-columns query) "sum")))
                  (lib/breakout (col (lib/breakoutable-columns query) "source" (join-alias query))))]
    (lib/order-by query (lib/aggregation-ref query 0))))

(defn- native-query-on-card
  "A native query that selects from Card 1 with a required number variable in the `WHERE` clause."
  [mp]
  ;; some databases (e.g. MySQL and Postgres before 16) require an alias for a subquery in FROM
  (let [sql   (str "SELECT * FROM {{#1-card-1}} source_card WHERE " (sql.u/quote-name driver/*driver* :field "sum") " < {{sum_limit}}")
        query (lib/native-query mp sql)]
    (lib/with-template-tags query (mapv (fn [tag]
                                          (cond-> tag
                                            (= (:name tag) "sum_limit") (assoc :type :number, :required true, :default "1")))
                                        (lib/template-tags query)))))

(defn- query-joining-card
  "People joined to Card 1 on source, count by birth year and creation year, then a filter on the count."
  [mp]
  (let [field #(lib.metadata/field mp (mt/id %1 %2))
        card  (lib.metadata/card mp 1)
        query (lib/query mp (lib.metadata/table mp (mt/id :people)))
        query (lib/join query (lib/join-clause card [(lib/= (field :people :source)
                                                            (col (lib/join-condition-rhs-columns query card nil nil) "source"))]))
        query (-> query
                  (lib/aggregate (lib/count))
                  (lib/breakout (lib/with-temporal-bucket (field :people :birth_date) :year))
                  (lib/breakout (lib/with-temporal-bucket (field :people :created_at) :year))
                  lib/append-stage)]
    (lib/filter query (lib/> (col (lib/filterable-columns query) "count") 11))))

(defn- uses-stage-ctes? [query]
  (boolean (re-find #"__mb_stage_" (:query (qp.compile/compile query)))))

(deftest ^:parallel multi-stage-questions-test
  (mt/test-drivers (filter #(isa? driver/hierarchy % :sql)
                           (mt/normal-drivers-with-feature :nested-queries :left-join :native-parameter-card-reference))
    ;; SQL Server allows ORDER BY in a subquery only with TOP, so Card 1 has a limit
    (let [mp         (qp.test-util/metadata-provider-with-cards-for-queries
                      [(lib/limit (multi-stage-query (mt/metadata-provider)) 100)])
          use-ctes?  (sql.qp/use-ctes-for-stages? driver/*driver*)
          round-sums (partial mt/formatted-rows [str #(u/round-to-decimals 2 (double %))])]
      (testing "multi-stage question with joins"
        (let [query (multi-stage-query mp)]
          (mt/with-native-query-testing-context query
            (is (= use-ctes? (uses-stage-ctes? query)))
            (is (= [["Affiliate" 281997.3]
                    ["Twitter"   302138.79]
                    ["Organic"   305583.3]
                    ["Google"    306376.03]
                    ["Facebook"  314522.28]]
                   (round-sums (qp/process-query query)))))))
      (testing "native question selecting from the multi-stage question with a variable"
        (let [query (assoc (native-query-on-card mp)
                           :parameters [{:type   :number/=
                                         :target [:variable [:template-tag "sum_limit"]]
                                         :value  [305000]}])]
          (mt/with-native-query-testing-context query
            (is (= use-ctes? (uses-stage-ctes? query)))
            ;; the native query has no ORDER BY, so the order of the rows is not defined
            (is (= [["Affiliate" 281997.3]
                    ["Twitter"   302138.79]]
                   (sort (round-sums (qp/process-query query))))))))
      (testing "question joining the multi-stage question, with more stages after the join"
        (let [query  (query-joining-card mp)
              counts (map (comp int last) (mt/rows (qp/process-query query)))]
          (mt/with-native-query-testing-context query
            (is (= use-ctes? (uses-stage-ctes? query)))
            ;; the year buckets depend on the report and database time zones, so only check the filter stage
            (is (seq counts))
            (is (every? #(> % 11) counts))))))))
