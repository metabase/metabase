(ns metabase.driver.sql-mbql5.pivot-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [honey.sql :as sql]
   [metabase.driver.sql-mbql5.pivot :as sql-mbql5.pivot]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.store :as qp.store]))

;;; ----- HoneySQL formatters -----

(deftest ^:parallel grouping-fn-formatter-test
  (testing "renders GROUPING(expr1, expr2, ...) for plain identifier args"
    (is (= ["GROUPING(col_a, col_b)"]
           (sql/format-expr [::sql-mbql5.pivot/grouping-fn :col-a :col-b]))))
  (testing "preserves args from nested expressions"
    (is (= ["GROUPING(CAST(foo AS ?), bar)" "int"]
           (sql/format-expr [::sql-mbql5.pivot/grouping-fn [:cast :foo "int"] :bar])))))

(deftest ^:parallel grouping-sets-formatter-test
  (testing "renders GROUPING SETS ((..), (..), ()) including the empty grand-total set"
    (is (= ["GROUPING SETS ((col_a, col_b), (col_a), ())"]
           (sql/format-expr [::sql-mbql5.pivot/grouping-sets [:col-a :col-b] [:col-a] []])))))

;;; ----- apply-top-level-clause [:sql-mbql5 :pivot] -----

(defn- field-clause [uuid alias field-id]
  [:field {:lib/uuid                                                  uuid
           :metabase.query-processor.util.add-alias-info/source-alias alias} field-id])

(defn- lower-pivot
  "Run the `[:sql-mbql5 :pivot]` dispatch and return its HoneySQL form result (not formatted SQL)."
  [breakouts pivot]
  (qp.store/with-metadata-provider meta/metadata-provider
    (let [stage    {:lib/type     :mbql.stage/mbql
                    :source-table (meta/id :orders)
                    :breakout     breakouts
                    :aggregation  [[:count {:lib/uuid "11111111-1111-1111-1111-aaaaaaaaaaaa"}]]
                    :pivot        pivot}
          starting {:select [:b1] :group-by [:b1]}]
      (binding [sql.qp/*inner-query* stage]
        (sql.qp/apply-top-level-clause :sql-mbql5 :pivot starting stage)))))

(def ^:private b1-uuid "11111111-1111-1111-1111-111111111111")
(def ^:private b2-uuid "22222222-2222-2222-2222-222222222222")

(defn- b1 [] (field-clause b1-uuid "CREATED_AT" (meta/id :orders :created-at)))
(defn- b2 [] (field-clause b2-uuid "USER_ID"    (meta/id :orders :user-id)))

(deftest ^:parallel one-breakout-rows-only-test
  (testing "single breakout, rows-only, both totals: SELECT gets GROUPING(..) AS pivot-grouping; GROUP BY becomes
            GROUPING SETS with detail + grand-total; ORDER BY prefixed with GROUPING(..) ASC."
    (is (=? {:select  [:b1
                       [[::sql-mbql5.pivot/grouping-fn some?] "pivot-grouping"]]
             :group-by [[::sql-mbql5.pivot/grouping-sets [some?] []]]
             :order-by [[[::sql-mbql5.pivot/grouping-fn some?] :asc]]}
            (lower-pivot [(b1)] {:rows [b1-uuid] :columns []
                                 :show-row-totals true :show-column-totals true})))))

(deftest ^:parallel grouping-args-reversed-test
  (testing "GROUPING() args appear in reverse breakout order so bit 0 = first breakout"
    (let [out         (lower-pivot [(b1) (b2)]
                                   {:rows [b1-uuid] :columns [b2-uuid]
                                    :show-row-totals true :show-column-totals true})
          [tag a1 a2] (-> out :select last first)]
      (testing "tag is ::grouping-fn and we have two args"
        (is (= ::sql-mbql5.pivot/grouping-fn tag))
        (is (some? a1))
        (is (some? a2)))
      (testing "the FIRST GROUPING arg matches the LAST breakout's hsql (and vice versa)"
        (let [breakouts-hsql (qp.store/with-metadata-provider meta/metadata-provider
                               (binding [sql.qp/*inner-query* {:lib/type :mbql.stage/mbql}]
                                 [(sql.qp/->honeysql :sql-mbql5 (b1))
                                  (sql.qp/->honeysql :sql-mbql5 (b2))]))]
          (is (= breakouts-hsql [a2 a1])))))))

(deftest ^:parallel grouping-sets-shape-test
  (testing "2-breakout rows+cols pivot with both totals → 4 grouping sets including grand-total ()"
    (let [out           (lower-pivot [(b1) (b2)]
                                     {:rows [b1-uuid] :columns [b2-uuid]
                                      :show-row-totals true :show-column-totals true})
          [_tag & sets] (-> out :group-by first)]
      (is (= 4 (count sets)))
      (is (some empty? sets) "one of the sets is the empty grand-total ()")))
  (testing "both totals off → only the detail grouping set"
    (let [out           (lower-pivot [(b1) (b2)]
                                     {:rows [b1-uuid] :columns [b2-uuid]
                                      :show-row-totals false :show-column-totals false})
          [_tag & sets] (-> out :group-by first)]
      (is (= 1 (count sets)))
      (is (= 2 (count (first sets))) "the single set has both breakouts"))))

(defn- lower-pivot-with-order-by [breakouts pivot order-by]
  (qp.store/with-metadata-provider meta/metadata-provider
    (let [stage    {:lib/type     :mbql.stage/mbql
                    :source-table (meta/id :orders)
                    :breakout     breakouts
                    :aggregation  [[:count {:lib/uuid "11111111-1111-1111-1111-aaaaaaaaaaaa"}]]
                    :pivot        pivot}
          starting {:select [:b1] :group-by [:b1] :order-by order-by}]
      (binding [sql.qp/*inner-query* stage]
        (sql.qp/apply-top-level-clause :sql-mbql5 :pivot starting stage)))))

(deftest ^:parallel order-by-prepends-grouping-test
  (testing "GROUPING(...) ASC is prepended as the primary sort; existing :order-by entries pass through untouched
            (callers are expected to have already stripped non-aggregation order-bys upstream)"
    (let [out (lower-pivot-with-order-by
               [(b1)]
               {:rows [b1-uuid] :columns [] :show-row-totals true :show-column-totals true}
               [[:count :desc]])]
      (is (=? [[[::sql-mbql5.pivot/grouping-fn some?] :asc]
               [:count :desc]]
              (:order-by out))))))
