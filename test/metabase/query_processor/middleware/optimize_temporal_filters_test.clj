(ns metabase.query-processor.middleware.optimize-temporal-filters-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.optimize-temporal-filters :as optimize-temporal-filters]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util.date-2 :as u.date]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/database-supports? [::timezone-driver :set-timezone] [_driver _feature _db] true)

(deftest ^:parallel optimize-day-bucketed-filter-test
  (testing "Make sure we aren't doing anything wacky when optimzing filters against fields bucketed by day"
    (qp.store/with-metadata-provider meta/metadata-provider
      (letfn [(optimize [filter-type]
                (#'optimize-temporal-filters/optimize-filter
                 [filter-type
                  [:field 1 {:temporal-unit :day}]
                  [:absolute-datetime (t/zoned-date-time "2014-03-04T12:30Z[UTC]") :day]]))]
        (testing :<
          (is (= [:<
                  [:field 1 {:temporal-unit :default}]
                  [:absolute-datetime (t/zoned-date-time "2014-03-04T00:00Z[UTC]") :default]]
                 (optimize :<))
              "day(field) < day('2014-03-04T12:30') => day(field) < '2014-03-04' => field < '2014-03-04T00:00'"))
        (testing :<=
          (is (= [:<
                  [:field 1 {:temporal-unit :default}]
                  [:absolute-datetime (t/zoned-date-time "2014-03-05T00:00Z[UTC]") :default]]
                 (optimize :<=))
              "day(field) <= day('2014-03-04T12:30') => day(field) <= '2014-03-04' => field < '2014-03-05T00:00'"))
        (testing :>
          (is (= [:>=
                  [:field 1 {:temporal-unit :default}]
                  [:absolute-datetime (t/zoned-date-time "2014-03-05T00:00Z[UTC]") :default]]
                 (optimize :>))
              "day(field) > day('2014-03-04T12:30') => day(field) > '2014-03-04' => field >= '2014-03-05T00:00'"))
        (testing :>=
          (is (= [:>=
                  [:field 1 {:temporal-unit :default}]
                  [:absolute-datetime (t/zoned-date-time "2014-03-04T00:00Z[UTC]") :default]]
                 (optimize :>=))
              "day(field) >= day('2014-03-04T12:30') => day(field) >= '2014-03-04' => field >= '2014-03-04T00:00'"))))))

(def ^:private test-units-and-values
  [{:unit         :second
    :filter-value (u.date/parse "2019-09-24T12:19:30.500Z" "UTC")
    :lower        (u.date/parse "2019-09-24T12:19:30.000Z" "UTC")
    :upper        (u.date/parse "2019-09-24T12:19:31.000Z" "UTC")}
   {:unit         :minute
    :filter-value (u.date/parse "2019-09-24T12:19:30.000Z" "UTC")
    :lower        (u.date/parse "2019-09-24T12:19:00.000Z" "UTC")
    :upper        (u.date/parse "2019-09-24T12:20:00.000Z" "UTC")}
   {:unit         :hour
    :filter-value (u.date/parse "2019-09-24T12:30:00.000Z" "UTC")
    :lower        (u.date/parse "2019-09-24T12:00:00.000Z" "UTC")
    :upper        (u.date/parse "2019-09-24T13:00:00.000Z" "UTC")}
   {:unit         :day
    :filter-value (u.date/parse "2019-09-24T12:00:00.000Z" "UTC")
    :lower        (u.date/parse "2019-09-24" "UTC")
    :upper        (u.date/parse "2019-09-25" "UTC")}
   {:unit         :week
    :filter-value (u.date/parse "2019-09-24" "UTC")
    :lower        (u.date/parse "2019-09-22" "UTC")
    :upper        (u.date/parse "2019-09-29" "UTC")}
   {:unit         :month
    :filter-value (u.date/parse "2019-09-24" "UTC")
    :lower        (u.date/parse "2019-09-01" "UTC")
    :upper        (u.date/parse "2019-10-01" "UTC")}
   {:unit         :quarter
    :filter-value (u.date/parse "2019-09-01" "UTC")
    :lower        (u.date/parse "2019-07-01" "UTC")
    :upper        (u.date/parse "2019-10-01" "UTC")}
   {:unit         :year
    :filter-value (u.date/parse "2019-09-24" "UTC")
    :lower        (u.date/parse "2019-01-01" "UTC")
    :upper        (u.date/parse "2020-01-01" "UTC")}])

(defn- optimize-temporal-filters [filter-clause]
  (letfn [(thunk []
            (let [query {:database 1
                         :type     :query
                         :query    {:filter filter-clause}}]
              (-> (optimize-temporal-filters/optimize-temporal-filters query)
                  (get-in [:query :filter]))))]
    (if (qp.store/initialized?)
      (thunk)
      (qp.store/with-metadata-provider meta/metadata-provider
        (thunk)))))

(deftest ^:parallel optimize-temporal-filters-test
  (driver/with-driver ::timezone-driver
    (doseq [field-or-expr [[:field 1 {}]
                           [:expression "date" {}]]
            {:keys [unit filter-value lower upper]} test-units-and-values]
      (let [lower [:absolute-datetime lower :default]
            upper [:absolute-datetime upper :default]]
        (testing unit
          (testing :=
            (is (= [:and
                    [:>= (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) lower]
                    [:< (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) upper]]
                   (optimize-temporal-filters
                    [:=
                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                     [:absolute-datetime filter-value unit]]))))
          (testing :!=
            (is (= [:or
                    [:< (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) lower]
                    [:>= (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) upper]]
                   (optimize-temporal-filters
                    [:!=
                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                     [:absolute-datetime filter-value unit]]))))
          (testing :<
            (is (= [:< (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) lower]
                   (optimize-temporal-filters
                    [:<
                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                     [:absolute-datetime filter-value unit]]))))
          (testing :<=
            (is (= [:< (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) upper]
                   (optimize-temporal-filters
                    [:<=
                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                     [:absolute-datetime filter-value unit]]))))
          (testing :>
            (is (= [:>= (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) upper]
                   (optimize-temporal-filters
                    [:>
                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                     [:absolute-datetime filter-value unit]]))))
          (testing :>=
            (is (= [:>= (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) lower]
                   (optimize-temporal-filters
                    [:>=
                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                     [:absolute-datetime filter-value unit]]))))
          (testing :between
            (is (= [:and
                    [:>= (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) lower]
                    [:< (mbql.u/assoc-field-options field-or-expr :temporal-unit :default) upper]]
                   (optimize-temporal-filters
                    [:between
                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                     [:absolute-datetime filter-value unit]
                     [:absolute-datetime filter-value unit]])))))))))

(deftest ^:parallel optimize-less-than-or-equal-to-relative-datetime-test
  (testing "Optimize [:<= x <16 weeks ago>] correctly (#42291)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)])
                    (lib/filter (lib/<=
                                 (-> (meta/field-metadata :orders :created-at)
                                     (lib/with-temporal-bucket :default))
                                 (lib/relative-datetime -16 :week))))]
      (is (=? {:query {:filter [:<=
                                [:field (meta/id :orders :created-at) {:base-type :type/DateTimeWithLocalTZ, :temporal-unit :default}]
                                [:relative-datetime -16 :week]]}}
              (optimize-temporal-filters (lib.convert/->legacy-MBQL query)))))))

(deftest ^:parallel optimize-between-relative-datetime-test
  (testing "Optimize [:between x <17 weeks ago> <16 weeks ago>] correctly (#42291)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)])
                    (lib/filter (lib/between
                                  (-> (meta/field-metadata :orders :created-at)
                                      (lib/with-temporal-bucket :default))
                                  (lib/relative-datetime -17 :week)
                                  (lib/relative-datetime -16 :week))))]
      (is (=? {:query {:filter [:between
                                [:field (meta/id :orders :created-at) {:base-type :type/DateTimeWithLocalTZ, :temporal-unit :default}]
                                [:relative-datetime -17 :week]
                                [:relative-datetime -16 :week]]}}
              (optimize-temporal-filters (lib.convert/->legacy-MBQL query))))))
  (testing "Don't optimize different buckets"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)])
                    (lib/filter (lib/between
                                  (-> (meta/field-metadata :orders :created-at)
                                        (lib/with-temporal-bucket :day))
                                  (lib/relative-datetime -1 :week)
                                  (lib/relative-datetime 0 :week))))]
      (is (=? {:query {:filter [:between
                                [:field (meta/id :orders :created-at) {}]
                                [:relative-datetime -1 :week]
                                [:relative-datetime 0 :week]]}}
              (optimize-temporal-filters (lib.convert/->legacy-MBQL query)))))))

(defn- optimize-filter-clauses [t]
  (let [query {:database 1
               :type     :query
               :query    {:filter [:=
                                   [:field 1 {:temporal-unit :day}]
                                   [:absolute-datetime t :day]]}}]
    (-> (optimize-temporal-filters/optimize-temporal-filters query)
        (get-in [:query :filter]))))

(deftest timezones-test
  (driver/with-driver ::timezone-driver
    (qp.store/with-metadata-provider meta/metadata-provider
      (doseq [timezone-id ["UTC" "US/Pacific"]]
        (testing (format "%s timezone" timezone-id)
          (let [t     (u.date/parse "2015-11-18" timezone-id)
                lower (t/zoned-date-time (t/local-date 2015 11 18) (t/local-time 0) timezone-id)
                upper (t/zoned-date-time (t/local-date 2015 11 19) (t/local-time 0) timezone-id)]
            (mt/with-report-timezone-id! timezone-id
              (testing "lower-bound and upper-bound util fns"
                (is (= lower
                       (#'optimize-temporal-filters/temporal-literal-lower-bound :day t))
                    (format "lower bound of day(%s) in the %s timezone should be %s" t timezone-id lower))
                (is (= upper
                       (#'optimize-temporal-filters/temporal-literal-upper-bound :day t))
                    (format "upper bound of day(%s) in the %s timezone should be %s" t timezone-id upper)))
              (testing "optimize-with-datetime"
                (let [expected [:and
                                [:>= [:field 1 {:temporal-unit :default}] [:absolute-datetime lower :default]]
                                [:<  [:field 1 {:temporal-unit :default}] [:absolute-datetime upper :default]]]]
                  (is (= expected
                         (optimize-filter-clauses t))
                      (format "= %s in the %s timezone should be optimized to range %s -> %s"
                              t timezone-id lower upper)))))))))))

(deftest ^:parallel skip-optimization-test
  (let [clause [:= [:field 1 {:temporal-unit :day}] [:absolute-datetime #t "2019-01-01" :month]]]
    (is (= clause
           (optimize-temporal-filters clause))
        "Filters with different units in the datetime field and absolute-datetime shouldn't get optimized")))

;; Make sure the optimization logic is actually applied in the resulting native query!
(defn- filter->sql [filter-clause]
  (letfn [(thunk []
            (let [result (qp.compile/compile
                           (lib.tu.macros/mbql-query checkins
                             {:aggregation [[:count]]
                              :filter      filter-clause}))]
              (update result :query #(-> (last (re-matches #"^.*(WHERE .*$)" %))
                                         (str/replace #"\"" "")
                                         (str/replace #"PUBLIC\." "")))))]
    (if (qp.store/initialized?)
      (thunk)
      (qp.store/with-metadata-provider meta/metadata-provider
        (thunk)))))

(deftest ^:parallel e2e-test
  (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                    meta/metadata-provider
                                    {:fields [{:id             (meta/id :checkins :date)
                                               :effective-type :type/DateTimeWithZoneID}]})
    (testing :=
      (is (= {:query  "WHERE (CHECKINS.DATE >= ?) AND (CHECKINS.DATE < ?)"
              :params [#t "2019-09-24T00:00Z[UTC]"
                       #t "2019-09-25T00:00Z[UTC]"]}
             (lib.tu.macros/$ids checkins
               (filter->sql [:= !day.date "2019-09-24T12:00:00.000Z"])))))
    (testing :<
      (is (= {:query  "WHERE CHECKINS.DATE < ?"
              :params [#t "2019-09-24T00:00Z[UTC]"]}
             (lib.tu.macros/$ids checkins
               (filter->sql [:< !day.date "2019-09-24T12:00:00.000Z"])))))
    (testing :between
      (is (= {:query  "WHERE (CHECKINS.DATE >= ?) AND (CHECKINS.DATE < ?)"
              :params [#t "2019-09-01T00:00Z[UTC]"
                       #t "2019-11-01T00:00Z[UTC]"]}
             (lib.tu.macros/$ids checkins
               (filter->sql [:between !month.date "2019-09-02T12:00:00.000Z" "2019-10-05T12:00:00.000Z"]))))
      (is (= {:query "WHERE (CHECKINS.DATE >= ?) AND (CHECKINS.DATE < ?)"
              :params           [#t "2019-09-01T00:00Z[UTC]"
                                 #t "2019-10-02T00:00Z[UTC]"]}
             (lib.tu.macros/$ids checkins
               (filter->sql [:between !day.date "2019-09-01" "2019-10-01"])))))))

(deftest ^:parallel optimize-relative-datetimes-test
  (testing "Should optimize relative-datetime clauses (#11837)"
    (mt/dataset attempted-murders
      (qp.store/with-metadata-provider (mt/id)
        ;; second/millisecond are not currently allowed in `:relative-datetime`, but if we add them we can re-enable
        ;; their tests
        (doseq [field-or-expr [[:field (mt/id :attempts :datetime) {}]
                               [:expression "date" {}]]
                unit [#_:millisecond #_:second :minute :hour :day :week :month :quarter :year]]
          (testing (format "last %s" unit)
            (is (= (mt/mbql-query attempts
                     {:aggregation [[:count]]
                      :expression  {"date" $datetime}
                      :filter      [:and
                                    [:>=
                                     (mbql.u/assoc-field-options field-or-expr :temporal-unit :default)
                                     [:relative-datetime -1 unit]]
                                    [:<
                                     (mbql.u/assoc-field-options field-or-expr :temporal-unit :default)
                                     [:relative-datetime 0 unit]]]})

                   (optimize-temporal-filters
                    (mt/mbql-query attempts
                      {:aggregation [[:count]]
                       :expression  {"date" $datetime}
                       :filter      [:=
                                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                                     [:relative-datetime -1 unit]]})))))
          (testing (format "this %s" unit)
            ;; test the various different ways we might refer to 'now'
            (doseq [clause [[:relative-datetime 0]
                            [:relative-datetime :current]
                            [:relative-datetime 0 unit]]]
              (testing (format "clause = %s" (pr-str clause))
                (is (= (mt/mbql-query attempts
                         {:aggregation [[:count]]
                          :expression  {"date" $datetime}
                          :filter      [:and
                                        [:>=
                                         (mbql.u/assoc-field-options field-or-expr :temporal-unit :default)
                                         [:relative-datetime 0 unit]]
                                        [:<
                                         (mbql.u/assoc-field-options field-or-expr :temporal-unit :default)
                                         [:relative-datetime 1 unit]]]})
                       (optimize-temporal-filters
                        (mt/mbql-query attempts
                          {:aggregation [[:count]]
                           :expression  {"date" $datetime}
                           :filter      [:=
                                         (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                                         clause]})))))))
          (testing (format "next %s" unit)
            (is (= (mt/mbql-query attempts
                     {:aggregation [[:count]]
                      :expression  {"date" $datetime}
                      :filter      [:and
                                    [:>=
                                     (mbql.u/assoc-field-options field-or-expr :temporal-unit :default)
                                     [:relative-datetime 1 unit]]
                                    [:<
                                     (mbql.u/assoc-field-options field-or-expr :temporal-unit :default)
                                     [:relative-datetime 2 unit]]]})
                   (optimize-temporal-filters
                    (mt/mbql-query attempts
                      {:aggregation [[:count]]
                       :expression  {"date" $datetime}
                       :filter      [:=
                                     (mbql.u/assoc-field-options field-or-expr :temporal-unit unit)
                                     [:relative-datetime 1 unit]]}))))))))))

(deftest ^:parallel optimize-mixed-temporal-values-test
  (testing "We should be able to optimize mixed usages of `:absolute-datetime` and `:relative-datetime`"
    (mt/dataset attempted-murders
      (qp.store/with-metadata-provider (mt/id)
        (testing "between month(2021-01-15) and month(now) [inclusive]"
          ;; i.e. between 2021-01-01T00:00:00 and [first-day-of-next-month]T00:00:00
          (is (= (mt/mbql-query attempts
                   {:aggregation [[:count]]
                    :filter      [:and
                                  [:>=
                                   [:field %datetime {:temporal-unit :default}]
                                   [:absolute-datetime #t "2021-01-01T00:00:00Z" :default]]
                                  [:<
                                   [:field %datetime {:temporal-unit :default}]
                                   [:relative-datetime 1 :month]]]})
                 (optimize-temporal-filters
                  (mt/mbql-query attempts
                    {:aggregation [[:count]]
                     :filter      [:between
                                   [:field %datetime {:temporal-unit :month}]
                                   [:absolute-datetime #t "2021-01-15T00:00:00Z" :month]
                                   [:relative-datetime 0]]})))))))))

(deftest ^:parallel optimize-relative-datetimes-e2e-test
  (testing "Should optimize relative-datetime clauses (#11837)"
    (mt/dataset attempted-murders
      (qp.store/with-metadata-provider (mt/id)
        (is (= ["SELECT"
                "  COUNT(*) AS \"count\""
                "FROM"
                "  \"PUBLIC\".\"ATTEMPTS\""
                "WHERE"
                "  ("
                "    \"PUBLIC\".\"ATTEMPTS\".\"DATETIME\" >= DATE_TRUNC('month', DATEADD('month', -1, NOW()))"
                "  )"
                "  AND ("
                "    \"PUBLIC\".\"ATTEMPTS\".\"DATETIME\" < DATE_TRUNC('month', NOW())"
                "  )"]
               (->> (qp.compile/compile
                     (mt/mbql-query attempts
                       {:aggregation [[:count]]
                        :filter      [:time-interval $datetime :last :month]}))
                    :query
                    (driver/prettify-native-form :h2)
                    str/split-lines)))))))

(deftest ^:parallel flatten-filters-test
  (testing "Should flatten the `:filter` clause after optimizing"
    (lib.tu.macros/$ids checkins
      (is (= [:and
              [:= $venue-id 1]
              [:>= [:field %date {:temporal-unit :default}] [:relative-datetime -1 :month]]
              [:< [:field %date {:temporal-unit :default}] [:relative-datetime 0 :month]]]
             (optimize-temporal-filters
              [:and
               [:= $venue-id 1]
               [:= [:field %date {:temporal-unit :month}] [:relative-datetime -1 :month]]]))))))

(deftest ^:parallel deduplicate-filters-tets
  (testing "Should deduplicate the optimized filters with any existing ones"
    (lib.tu.macros/$ids checkins
      (is (= [:and
              [:< [:field %date {:temporal-unit :default}] [:relative-datetime 0 :month]]
              [:>= [:field %date {:temporal-unit :default}] [:relative-datetime -1 :month]]]
             (optimize-temporal-filters
              [:and
               [:< [:field %date {:temporal-unit :default}] [:relative-datetime 0 :month]]
               [:= [:field %date {:temporal-unit :month}] [:relative-datetime -1 :month]]]))))))

(deftest ^:parallel optimize-filters-all-levels-test
  (testing "Should optimize filters at all levels of the query"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= (lib.tu.macros/mbql-query checkins
               {:source-query
                {:source-table $$checkins
                 :filter       [:and
                                [:>= [:field %date {:temporal-unit :default}] [:relative-datetime -1 :month]]
                                [:< [:field %date {:temporal-unit :default}] [:relative-datetime 0 :month]]]}})
             (optimize-temporal-filters/optimize-temporal-filters
              (lib.tu.macros/mbql-query checkins
                {:source-query
                 {:source-table $$checkins
                  :filter       [:= [:field %date {:temporal-unit :month}] [:relative-datetime -1 :month]]}})))))))

(deftest ^:parallel optimize-filter-with-nested-compatible-field
  (testing "Should optimize fields when starting n :temporal-unit ago (#25378)"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= (lib.tu.macros/mbql-query users
               {:filter [:and
                         [:>=
                          [:+ [:field %last-login {:temporal-unit :default}] [:interval 3 :month]]
                          [:relative-datetime -12 :month]]
                         [:<
                          [:+ [:field %last-login {:temporal-unit :default}] [:interval 3 :month]]
                          [:relative-datetime 1 :month]]]
                :source-query {:source-table $$users
                               :aggregation [[:count]]
                               :breakout [[:field %last-login {:temporal-unit :month}]]}})
             (optimize-temporal-filters/optimize-temporal-filters
               (lib.tu.macros/mbql-query users
                 {:filter [:between
                           [:+ [:field %last-login {:temporal-unit :month}] [:interval 3 :month]]
                           [:relative-datetime -12 :month]
                           [:relative-datetime 0 :month]]
                  :source-query {:source-table $$users
                                 :aggregation [[:count]]
                                 :breakout [[:field %last-login {:temporal-unit :month}]]}}))))))
  (testing "Optimize when temporal unit on field is not specified. (#42291)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)])
                    (lib/filter (lib/between
                                  (lib/+
                                    (meta/field-metadata :orders :created-at)
                                    (lib/interval 10 :minute))
                                  (lib/relative-datetime -10 :minute)
                                  (lib/relative-datetime 0 :minute))))]
      (is (=? {:query {:filter [:and
                                [:>=
                                 [:+ [:field (meta/id :orders :created-at) {}]
                                  [:interval 10 :minute]]
                                 [:relative-datetime -10 :minute]]
                                [:<
                                 [:+ [:field (meta/id :orders :created-at) {}]
                                  [:interval 10 :minute]]
                                 [:relative-datetime 1 :minute]]]}}
              (optimize-temporal-filters (lib.convert/->legacy-MBQL query))))))
  (testing "Don't optimize when temporal units are different. (#42291)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)])
                    (lib/filter (lib/between
                                  (lib/+
                                    (-> (meta/field-metadata :orders :created-at)
                                        (lib/with-temporal-bucket :day))
                                    (lib/interval 2 :day))
                                  (lib/relative-datetime -1 :week)
                                  (lib/relative-datetime 0 :week))))]
      (is (=? {:query {:filter [:between
                                [:+ [:field (meta/id :orders :created-at) {}]
                                 [:interval 2 :day]]
                                [:relative-datetime -1 :week]
                                [:relative-datetime 0 :week]]}}
              (optimize-temporal-filters (lib.convert/->legacy-MBQL query)))))))

(deftest ^:parallel optimize-date-equals-date-filters-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (doseq [unit     [:day :default]
            operator [:= :!= :< :<= :> :>= :between]]
      (testing (format "Optimize %s(DATE) %s %s(DATE) filters by setting bucketing to :default and leaving as-is"
                       (name unit) (name operator) (name unit))
        (if (= operator :between)
          (is (=? {:query {:filter [:between
                                    [:field (meta/id :checkins :date) {:base-type :type/Date, :temporal-unit :default}]
                                    [:absolute-datetime #t "2014-05-08" :default]
                                    [:absolute-datetime #t "2014-05-09" :default]]}}
                  (optimize-temporal-filters/optimize-temporal-filters
                   (lib.tu.macros/mbql-query checkins
                     {:filter [:between
                               [:field (meta/id :checkins :date) {:base-type :type/Date, :temporal-unit unit}]
                               [:absolute-datetime #t "2014-05-08" unit]
                               [:absolute-datetime #t "2014-05-09" unit]]}))))
          (is (=? {:query {:filter [:=
                                    [:field (meta/id :checkins :date) {:base-type :type/Date, :temporal-unit :default}]
                                    [:absolute-datetime #t "2014-05-08" :default]]}}
                  (optimize-temporal-filters/optimize-temporal-filters
                   (lib.tu.macros/mbql-query checkins
                     {:filter [:=
                               [:field (meta/id :checkins :date) {:base-type :type/Date, :temporal-unit unit}]
                               [:absolute-datetime #t "2014-05-08" unit]]})))))))))

(deftest ^:parallel do-not-change-unit-of-relative-datetime-to-default-test
  (testing "Never change the unit of a relative datetime to :default. That would not make any sense."
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:database (meta/id)
              :type     :query
              :query    {:source-table (meta/id :checkins)
                         :filter       [:between
                                        [:field (meta/id :checkins :date) {:base-type :type/Date, :temporal-unit :default}]
                                        [:relative-datetime -30 :day]
                                        [:relative-datetime -1 :day]]}}
             (optimize-temporal-filters/optimize-temporal-filters
              {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :checkins)
                          :filter       [:between
                                         [:field (meta/id :checkins :date) {:base-type :type/Date, :temporal-unit :day}]
                                         [:relative-datetime -30 :day]
                                         [:relative-datetime -1 :day]]}}))))))

(defn- optimize [filter-clause]
  (qp.store/with-metadata-provider meta/metadata-provider
    (or (#'optimize-temporal-filters/optimize-filter filter-clause)
        filter-clause)))

(deftest ^:parallel optimize-with-expression-ref-test
  (testing "Filtering a DATETIME expression by a DATE literal string should do something sane (#17807)"
    (are [t expected-lower expected-upper] (= [:and
                                               [:>=
                                                [:expression "CC Created At" {:base-type :type/DateTimeWithLocalTZ}]
                                                [:absolute-datetime expected-lower :default]]
                                               [:<
                                                [:expression "CC Created At" {:base-type :type/DateTimeWithLocalTZ}]
                                                [:absolute-datetime expected-upper :default]]]
                                              (optimize
                                               [:=
                                                [:expression "CC Created At" {:base-type :type/DateTimeWithLocalTZ}]
                                                [:absolute-datetime t :day]]))
      #t "2017-10-07"
      #t "2017-10-07"
      #t "2017-10-08"

      ;; this is what the values should look like AFTER we call wrap-value-literals
      (t/offset-date-time #t "2017-10-07T00:00:00-00:00")
      (t/offset-date-time #t "2017-10-07T00:00Z")
      (t/offset-date-time #t "2017-10-08T00:00Z"))))

(deftest ^:parallel optimize-with-expression-ref-test-2
  (testing ":between is inclusive"
    (is (= [:and
            [:>=
             [:expression "CC Created At" {:base-type :type/DateTimeWithLocalTZ}]
             [:absolute-datetime #t "2017-10-07" :default]]
            [:<
             [:expression "CC Created At" {:base-type :type/DateTimeWithLocalTZ}]
             [:absolute-datetime #t "2017-10-09" :default]]]
           (optimize
            [:between
             [:expression "CC Created At" {:base-type :type/DateTimeWithLocalTZ}]
             [:absolute-datetime #t "2017-10-07" :day]
             [:absolute-datetime #t "2017-10-08" :day]])))))

(deftest ^:parallel unoptimizable-test
  (testing "Do not barf when things are unoptimizable (#35582)"
    (doseq [operator [:= :!= :< :> :<= :>=]]
      (testing operator
        (let [clause [operator
                      [:field 1 {:base-type :type/DateTime, :temporal-unit :day}]
                      [:field 2 {:base-type :type/DateTime, :temporal-unit :day}]]]
          (is (= clause
                 (optimize clause))))))
    (testing :between
      (let [clause [:between
                    [:field 1 {:base-type :type/DateTime, :temporal-unit :day}]
                    [:field 2 {:base-type :type/DateTime, :temporal-unit :day}]
                    [:field 3 {:base-type :type/DateTime, :temporal-unit :day}]]]
        (is (= clause
               (optimize clause)))))))
