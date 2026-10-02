(ns metabase.driver.sql.pivot-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.sql.pivot :as sql.pivot]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.store :as qp.store]))

(driver/register! ::sql-with-native-pivot,    :parent :sql, :abstract? true)
(driver/register! ::sql-without-native-pivot, :parent :sql, :abstract? true)

(defmethod driver/database-supports? [::sql-with-native-pivot :native-pivot-tables]
  [_driver _feature _db] true)

;;; ----- HoneySQL formatters -----

(deftest ^:parallel grouping-fn-formatter-test
  (testing "renders GROUPING(expr1, expr2, ...) for plain identifier args"
    (is (= ["GROUPING(col_a, col_b)"]
           (sql/format-expr [::sql.pivot/grouping-fn :col-a :col-b]))))
  (testing "preserves args from nested expressions"
    (is (= ["GROUPING(CAST(foo AS ?), bar)" "int"]
           (sql/format-expr [::sql.pivot/grouping-fn [:cast :foo "int"] :bar])))))

(deftest ^:parallel grouping-id-fn-formatter-test
  (testing "renders GROUPING_ID(expr1, expr2, ...) for plain identifier args"
    (is (= ["GROUPING_ID(col_a, col_b)"]
           (sql/format-expr [::sql.pivot/grouping-id-fn :col-a :col-b]))))
  (testing "preserves args from nested expressions"
    (is (= ["GROUPING_ID(CAST(foo AS ?), bar)" "int"]
           (sql/format-expr [::sql.pivot/grouping-id-fn [:cast :foo "int"] :bar])))))

(deftest ^:parallel synthesise-grouping-bitmask-test
  (testing "single expr renders as bare GROUPING(expr) with no arithmetic"
    (is (= ["GROUPING(col_a)"]
           (sql/format-expr (sql.pivot/synthesise-grouping-bitmask [:col-a])))))
  (testing "three exprs render as a sum with descending powers of 2, no `* 1` on the last term"
    (is (= ["(GROUPING(col_a) * 4) + (GROUPING(col_b) * 2) + GROUPING(col_c)"]
           (sql/format-expr (sql.pivot/synthesise-grouping-bitmask [:col-a :col-b :col-c]))))))

(deftest ^:parallel grouping-sets-formatter-test
  (testing "renders GROUPING SETS ((..), (..), ()) including the empty grand-total set"
    (is (= ["GROUPING SETS ((col_a, col_b), (col_a), ())"]
           (sql/format-expr [::sql.pivot/grouping-sets [:col-a :col-b] [:col-a] []])))))

;;; ----- stage-has-window-fn-aggregation? -----

(defn- orders-stage-with-aggs [& agg-clauses]
  (lib.util/query-stage
   (reduce lib/aggregate
           (lib/query meta/metadata-provider (meta/table-metadata :orders))
           agg-clauses)
   -1))

(deftest ^:parallel stage-has-window-fn-aggregation?-test
  (testing "false when the stage has no aggregations"
    (is (false? (#'sql.pivot/stage-has-window-fn-aggregation?
                 (orders-stage-with-aggs)))))
  (testing "false when the stage has only non-window aggregations"
    (is (false? (#'sql.pivot/stage-has-window-fn-aggregation?
                 (orders-stage-with-aggs
                  (lib/count)
                  (lib/sum (meta/field-metadata :orders :total)))))))
  (testing "true when a :cum-sum aggregation is present"
    (is (true? (#'sql.pivot/stage-has-window-fn-aggregation?
                (orders-stage-with-aggs
                 (lib/count)
                 (lib/cum-sum (meta/field-metadata :orders :total)))))))
  (testing "true when a window aggregation is nested inside an expression"
    (is (true? (#'sql.pivot/stage-has-window-fn-aggregation?
                (orders-stage-with-aggs
                 (lib/- (lib/count) (lib/offset (lib/count) -1))))))))

;;; ----- use-grouping-sets? -----

(defn- lib-database [engine]
  {:lib/type :metadata/database, :id 1, :name "test-db", :engine engine})

(deftest ^:parallel use-grouping-sets?-test
  (testing "true only when the driver supports :native-pivot-tables AND there is no window aggregation"
    (let [db-with      (lib-database ::sql-with-native-pivot)
          db-without   (lib-database ::sql-without-native-pivot)
          plain-stage  (orders-stage-with-aggs (lib/count))
          window-stage (orders-stage-with-aggs (lib/cum-count))]
      (are [database stage expected] (= expected (#'sql.pivot/use-grouping-sets? database stage))
        db-with    plain-stage  true
        db-with    window-stage false
        db-without plain-stage  false
        db-without window-stage false))))

;;; ----- apply-top-level-clause [:sql :pivot] -----

(defn- field-clause [uuid alias field-id]
  [:field {:lib/uuid                                                  uuid
           :metabase.query-processor.util.add-alias-info/source-alias alias} field-id])

(defn- compile-grouping-sets
  "Invoke `compile-grouping-sets-pivot` on a stage built from `breakouts` and `pivot`, returning its HoneySQL form."
  [breakouts pivot]
  (qp.store/with-metadata-provider meta/metadata-provider
    (let [stage    {:lib/type     :mbql.stage/mbql
                    :source-table (meta/id :orders)
                    :breakout     breakouts
                    :aggregation  [[:count {:lib/uuid "11111111-1111-1111-1111-aaaaaaaaaaaa"}]]
                    :pivot        pivot}
          starting {:select [:b1] :group-by [:b1]}]
      (binding [sql.qp/*inner-query* stage]
        (#'sql.pivot/compile-grouping-sets-pivot :sql starting stage)))))

(def ^:private b1-uuid "11111111-1111-1111-1111-111111111111")
(def ^:private b2-uuid "22222222-2222-2222-2222-222222222222")

(defn- b1 [] (field-clause b1-uuid "CREATED_AT" (meta/id :orders :created-at)))
(defn- b2 [] (field-clause b2-uuid "USER_ID"    (meta/id :orders :user-id)))

(deftest ^:parallel one-breakout-rows-only-test
  (testing "single breakout, rows-only, both totals: SELECT gets GROUPING(..) AS pivot-grouping; GROUP BY becomes
            GROUPING SETS with detail + grand-total; ORDER BY prefixed with GROUPING(..) ASC."
    (is (=? {:select  [:b1
                       [[::sql.pivot/grouping-fn some?] "pivot-grouping"]]
             :group-by [[::sql.pivot/grouping-sets [some?] []]]
             :order-by [[[::sql.pivot/grouping-fn some?] :asc]]}
            (compile-grouping-sets [(b1)] {:rows [b1-uuid] :columns []
                                           :show-row-totals true :show-column-totals true})))))

(deftest ^:parallel grouping-args-reversed-test
  (testing "GROUPING() args appear in reverse breakout order so bit 0 = first breakout"
    (let [out         (compile-grouping-sets [(b1) (b2)]
                                             {:rows [b1-uuid] :columns [b2-uuid]
                                              :show-row-totals true :show-column-totals true})
          [tag a1 a2] (-> out :select last first)]
      (testing "tag is ::grouping-fn and we have two args"
        (is (= ::sql.pivot/grouping-fn tag))
        (is (some? a1))
        (is (some? a2)))
      (testing "the FIRST GROUPING arg matches the LAST breakout's hsql (and vice versa)"
        (let [breakouts-hsql (qp.store/with-metadata-provider meta/metadata-provider
                               (binding [sql.qp/*inner-query* {:lib/type :mbql.stage/mbql}]
                                 [(sql.qp/->honeysql :sql (b1))
                                  (sql.qp/->honeysql :sql (b2))]))]
          (is (= breakouts-hsql [a2 a1])))))))

(deftest ^:parallel grouping-sets-shape-test
  (testing "2-breakout rows+cols pivot with both totals → 4 grouping sets including grand-total ()"
    (let [out           (compile-grouping-sets [(b1) (b2)]
                                               {:rows [b1-uuid] :columns [b2-uuid]
                                                :show-row-totals true :show-column-totals true})
          [_tag & sets] (-> out :group-by first)]
      (is (= 4 (count sets)))
      (is (some empty? sets) "one of the sets is the empty grand-total ()")))
  (testing "both totals off → only the detail grouping set"
    (let [out           (compile-grouping-sets [(b1) (b2)]
                                               {:rows [b1-uuid] :columns [b2-uuid]
                                                :show-row-totals false :show-column-totals false})
          [_tag & sets] (-> out :group-by first)]
      (is (= 1 (count sets)))
      (is (= 2 (count (first sets))) "the single set has both breakouts"))))

(defn- compile-grouping-sets-with-order-by [breakouts pivot order-by]
  (qp.store/with-metadata-provider meta/metadata-provider
    (let [stage    {:lib/type     :mbql.stage/mbql
                    :source-table (meta/id :orders)
                    :breakout     breakouts
                    :aggregation  [[:count {:lib/uuid "11111111-1111-1111-1111-aaaaaaaaaaaa"}]]
                    :pivot        pivot}
          starting {:select [:b1] :group-by [:b1] :order-by order-by}]
      (binding [sql.qp/*inner-query* stage]
        (#'sql.pivot/compile-grouping-sets-pivot :sql starting stage)))))

(deftest ^:parallel order-by-prepends-grouping-test
  (testing "GROUPING(...) ASC is prepended as the primary sort; existing :order-by entries pass through untouched
            (callers are expected to have already stripped non-aggregation order-bys upstream)"
    (let [out (compile-grouping-sets-with-order-by
               [(b1)]
               {:rows [b1-uuid] :columns [] :show-row-totals true :show-column-totals true}
               [[:count :desc]])]
      (is (=? [[[::sql.pivot/grouping-fn some?] :asc]
               [:count :desc]]
              (:order-by out))))))

(deftest ^:parallel order-by-skips-grouping-when-single-set-test
  (testing "When there is only one grouping set, the grouping bitmask is constant and the ORDER BY prefix is omitted"
    (let [out (compile-grouping-sets-with-order-by
               [(b1) (b2)]
               {:rows [b1-uuid] :columns [b2-uuid] :show-row-totals false :show-column-totals false}
               [[:count :desc]])]
      (is (= [[:count :desc]] (:order-by out))))))
