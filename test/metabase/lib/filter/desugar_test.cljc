(ns metabase.lib.filter.desugar-test
  (:require
   #?@(:clj  ([metabase.lib-be.settings] ; for the start-of-week setting
              [metabase.test.util.i18n])
       :cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.filter.desugar :as lib.filter.desugar]))

#?(:clj  (comment metabase.lib-be.settings/keep-me)
   :cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- opts [& {:as kvs}]
  (merge {:lib/uuid (str (random-uuid))} kvs))

(deftest ^:parallel desugar-time-interval-test-1
  (testing "`time-interval` with value > 1 or < -1 should generate a `between` clause"
    (is (=? [:between {}
             [:expression {:temporal-unit :month} "CC"]
             [:relative-datetime {} 1 :month]
             [:relative-datetime {} 2 :month]]
            (lib.filter.desugar/desugar-filter-clause [:time-interval (opts) [:expression (opts) "CC"] 2 :month])))))

(deftest ^:parallel desugar-time-interval-test-2
  (testing "test the `include-current` option -- interval should start or end at `0` instead of `1`"
    (is (=? [:between {}
             [:expression {:temporal-unit :month} "CC"]
             [:relative-datetime {} 0 :month]
             [:relative-datetime {} 2 :month]]
            (lib.filter.desugar/desugar-filter-clause
             [:time-interval (opts :include-current true) [:expression (opts) "CC"] 2 :month])))))

(deftest ^:parallel desugar-time-interval-test-3
  (testing "`time-interval` with value = 1 should generate an `=` clause"
    (is (=? [:= {}
             [:expression {:temporal-unit :month} "CC"]
             [:relative-datetime {} 1 :month]]
            (lib.filter.desugar/desugar-filter-clause
             [:time-interval (opts) [:expression (opts) "CC"] 1 :month])))))

(deftest ^:parallel desugar-time-interval-test-4
  (testing "`time-interval` with value = -1 should generate an `=` clause"
    (is (=? [:= {}
             [:expression {:temporal-unit :week} "CC"]
             [:relative-datetime {} -1 :week]]
            (lib.filter.desugar/desugar-filter-clause
             [:time-interval (opts) [:expression (opts) "CC"] -1 :week])))))

(deftest ^:parallel desugar-time-interval-test-5
  (testing "`include-current` option"
    (testing "interval with value = 1 should generate a `between` clause"
      (is (=? [:between {}
               [:expression {:temporal-unit :month} "CC"]
               [:relative-datetime {} 0 :month]
               [:relative-datetime {} 1 :month]]
              (lib.filter.desugar/desugar-filter-clause
               [:time-interval (opts :include-current true)
                [:expression (opts) "CC"]
                1 :month]))))))

(deftest ^:parallel desugar-time-interval-test-6
  (testing "`include-current` option"
    (testing "`include-current` option -- interval with value = 1 should generate a `between` clause"
      (is (=? [:between {}
               [:expression {:temporal-unit :day} "CC"]
               [:relative-datetime {} -1 :day]
               [:relative-datetime {} 0 :day]]
              (lib.filter.desugar/desugar-filter-clause
               [:time-interval (opts :include-current true)
                [:expression (opts) "CC"]
                -1 :day]))))))

(deftest ^:parallel desugar-time-interval-test-7
  (testing "keywords like `:current` should work correctly"
    (is (=? [:= {}
             [:expression {:temporal-unit :week} "CC"]
             [:relative-datetime {} 0 :week]]
            (lib.filter.desugar/desugar-filter-clause
             [:time-interval (opts)
              [:expression (opts) "CC"]
              :current :week])))))

(deftest ^:parallel desugar-relative-time-interval-negative-test
  (testing "Desugaring relative-date-time produces expected [:and (opts) [:>=..] [:<..]] expression"
    (let [value         -10
          bucket        :day
          offset-value  -8
          offset-bucket :week]
      (testing "expression reference is transformed correctly"
        (is (=? [:and {}
                 [:>= {}
                  [:expression {} "cc"]
                  [:+ {}
                   [:relative-datetime {} value bucket]
                   [:interval {} offset-value offset-bucket]]]
                 [:< {}
                  [:expression {} "cc"]
                  [:+ {}
                   [:relative-datetime {} 0 bucket]
                   [:interval {} offset-value offset-bucket]]]]
                (lib.filter.desugar/desugar-filter-clause
                 [:relative-time-interval (opts) [:expression (opts) "cc"] value bucket offset-value offset-bucket]))))
      (testing "field reference is transformed correctly"
        (is (=? [:and {}
                 [:>= {}
                  [:field {:temporal-unit :default} 100]
                  [:+ {}
                   [:relative-datetime {} value bucket]
                   [:interval {} offset-value offset-bucket]]]
                 [:< {}
                  [:field {:temporal-unit :default} 100]
                  [:+ {}
                   [:relative-datetime {} 0 bucket]
                   [:interval {} offset-value offset-bucket]]]]
                (lib.filter.desugar/desugar-filter-clause
                 [:relative-time-interval (opts)
                  [:field (opts :temporal-unit :default) 100]
                  value
                  bucket
                  offset-value
                  offset-bucket])))))))

(deftest ^:parallel desugar-relative-time-interval-positive-test
  (testing "Desugaring relative-date-time produces expected [:and (opts) [:>=..] [:<..]] expression"
    (let [value         10
          bucket        :day
          offset-value  8
          offset-bucket :week]
      (testing "expression reference is transformed correctly"
        (is (=? [:and {}
                 [:>= {} [:expression {} "cc"] [:+ {} [:relative-datetime {} 1           bucket] [:interval {} offset-value offset-bucket]]]
                 [:<  {} [:expression {} "cc"] [:+ {} [:relative-datetime {} (inc value) bucket] [:interval {} offset-value offset-bucket]]]]
                (lib.filter.desugar/desugar-filter-clause
                 [:relative-time-interval (opts)
                  [:expression (opts) "cc"]
                  value bucket offset-value offset-bucket]))))
      (testing "field reference is transformed correctly"
        (is (=? [:and {}
                 [:>= {} [:field {:temporal-unit :default} 100] [:+ {} [:relative-datetime {} 1           bucket] [:interval {} offset-value offset-bucket]]]
                 [:<  {} [:field {:temporal-unit :default} 100] [:+ {} [:relative-datetime {} (inc value) bucket] [:interval {} offset-value offset-bucket]]]]
                (lib.filter.desugar/desugar-filter-clause
                 [:relative-time-interval (opts)
                  [:field (opts :temporal-unit :default) 100]
                  value bucket offset-value offset-bucket])))))))

(deftest ^:parallel desugar-during-test
  (testing "Desugaring during filter produces expected [:and (opts) [:>=..] [:<..]] expression"
    (let [value "2020-01-01T13:24:32"]
      (doseq [{:keys [unit expected-lower expected-upper]}
              [{:unit :second
                :expected-lower "2020-01-01T13:24:32"
                :expected-upper "2020-01-01T13:24:33"}
               {:unit :minute
                :expected-lower "2020-01-01T13:24"
                :expected-upper "2020-01-01T13:25"}
               {:unit :hour
                :expected-lower "2020-01-01T13:00"
                :expected-upper "2020-01-01T14:00"}
               {:unit :day
                :expected-lower "2020-01-01T00:00"
                :expected-upper "2020-01-02T00:00"}
               {:unit :month
                :expected-lower "2020-01-01T00:00"
                :expected-upper "2020-02-01T00:00"}
               {:unit :year
                :expected-lower "2020-01-01T00:00"
                :expected-upper "2021-01-01T00:00"}]]
        (testing (str "expression reference is transformed correctly for unit " unit)
          (is (=? [:and {}
                   [:>= {} [:expression {} "cc"] expected-lower]
                   [:<  {} [:expression {} "cc"] expected-upper]]
                  (lib.filter.desugar/desugar-filter-clause
                   [:during (opts) [:expression (opts) "cc"] value unit]))))
        (testing (str "field reference is transformed correctly for unit " unit)
          (is (=? [:and {}
                   [:>= {} [:field {:temporal-unit :default} 100] expected-lower]
                   [:<  {} [:field {:temporal-unit :default} 100] expected-upper]]
                  (lib.filter.desugar/desugar-filter-clause [:during (opts) [:field (opts) 100] value unit]))))))))

(deftest ^:parallel desugar-if-test-1
  (testing "Desugaring if produces expected [:case ..] expression"
    (is (=? [:case {}
             [[[:< {} [:field {} 1] 1] 2]
              [[:< {} [:field {} 3] 4] 5]]]
            (lib.filter.desugar/desugar-filter-clause
             [:if (opts)
              [[[:< (opts) [:field (opts) 1] 1] 2]
               [[:< (opts) [:field (opts) 3] 4] 5]]])))))

(deftest ^:parallel desugar-if-test-2
  (testing "Desugaring if produces expected [:case ..] expression"
    (is (=? [:case {:default 3}
             [[[:< {} [:field {} 1] 1] 2]]]
            (lib.filter.desugar/desugar-filter-clause
             [:if (opts :default 3)
              [[[:< (opts) [:field (opts) 1] 1] 2]]])))))

(deftest ^:parallel desugar-nested-if-test
  (testing "Desugaring if produces expected [:case ..] expression"
    (is (=? [:case {}
             [[[:case {}
                [[[:< {}
                   [:field {} 1]
                   1]
                  [:< {}
                   [:field {} 2]
                   2]]]
                [:< {}
                 [:field {} 3]
                 3]]
               [:case {}
                [[[:< {}
                   [:field {} 4]
                   4]
                  5]]]]]
             [:case {}
              [[[:< {}
                 [:field {} 6]
                 6]
                7]]]]
            (lib.filter.desugar/desugar-filter-clause
             [:if (opts)
              [[[:if (opts)
                 [[[:< (opts) [:field (opts) 1] 1]
                   [:< (opts) [:field (opts) 2] 2]]]
                 [:< (opts) [:field (opts) 3] 3]]
                [:if (opts)
                 [[[:< (opts) [:field (opts) 4] 4]
                   5]]]]]
              [:if (opts)
               [[[:< (opts)
                  [:field (opts) 6]
                  6]
                 7]]]])))))

(deftest ^:parallel desugar-if-with-default-value-test
  (is (= [:case {:lib/uuid "00000000-0000-0000-0000-000000000000", :lib/expression-name "If"}
          [[[:= {:lib/uuid "00000000-0000-0000-0000-000000000001"}
             [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 255] 1]
            "First"]
           [[:= {:lib/uuid "00000000-0000-0000-0000-000000000003"}
             [:field {:lib/uuid "00000000-0000-0000-0000-000000000004"} 255] 2]
            "Second"]]
          "Other"]
         (lib.filter.desugar/desugar-filter-clause
          [:if {:lib/uuid "00000000-0000-0000-0000-000000000000", :lib/expression-name "If"}
           [[[:= {:lib/uuid "00000000-0000-0000-0000-000000000001"}
              [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 255] 1]
             "First"]
            [[:= {:lib/uuid "00000000-0000-0000-0000-000000000003"}
              [:field {:lib/uuid "00000000-0000-0000-0000-000000000004"} 255] 2]
             "Second"]]
           "Other"]))))

(deftest ^:parallel desugar-in-test
  (testing "Desugaring in and not-in produces expected [:= ..] and [:!= ..] expressions"
    (are [clause expected] (=? expected
                               (lib.filter.desugar/desugar-filter-clause clause))
      [:in (opts) [:field (opts) 1] 2]
      [:= {} [:field {} 1] 2]

      [:in (opts) [:field (opts) 1] [:field (opts) 2]]
      [:= {} [:field {} 1] [:field {} 2]]

      [:in (opts) [:field (opts) 1] 2 3]
      [:or {}
       [:= {}
        [:field {} 1]
        2]
       [:= {} [:field {} 1] 3]]

      [:not-in (opts)
       [:field (opts) 1]
       2]
      [:!= {} [:field {} 1] 2]

      [:not-in (opts)
       [:field (opts) 1]
       [:field (opts) 2]]
      [:!= {}
       [:field {} 1]
       [:field {} 2]]

      [:not-in (opts)
       [:field (opts) 1]
       2
       3]
      [:and {}
       [:!= {} [:field {} 1] 2]
       [:!= {} [:field {} 1] 3]])))

(deftest ^:parallel desugar-relative-datetime-with-current-test-1
  (testing "when comparing `:relative-datetime`to `:field`, it should take the temporal unit of the `:field`"
    (is (=? [:= {}
             [:field {:temporal-unit :minute} 1]
             [:relative-datetime {} 0 :minute]]
            (lib.filter.desugar/desugar-filter-clause
             [:= (opts)
              [:field (opts :temporal-unit :minute) 1]
              [:relative-datetime (opts) :current]])))))

(deftest ^:parallel desugar-relative-datetime-with-current-test-2
  (testing "otherwise it should just get a unit of `:default`"
    (is (=? [:= {}
             [:field {} 1]
             [:relative-datetime {} 0 :default]]
            (lib.filter.desugar/desugar-filter-clause
             [:= (opts)
              [:field (opts) 1]
              [:relative-datetime (opts) :current]])))))

(deftest ^:parallel desugar-relative-datetime-with-current-test-3
  (testing "we should be able to handle datetime fields even if they are nested inside another clause"
    (is (=? [:= {}
             [:field {:temporal-unit :week, :binning {:strategy :default}} 1]
             [:relative-datetime {} 0 :week]]
            (lib.filter.desugar/desugar-filter-clause
             [:= (opts)
              [:field (opts :temporal-unit :week, :binning {:strategy :default}) 1]
              [:relative-datetime (opts) :current]])))))

(deftest ^:parallel relative-datetime-current-inside-between-test
  (testing ":relative-datetime should work inside a :between clause (#19606)\n"
    (let [absolute "2022-03-11T15:48:00-08:00"
          relative (fn []
                     [:relative-datetime (opts) :current])
          expected (fn [v unit]
                     (cond
                       (string? v)                      absolute
                       (= (first v) :relative-datetime) [:relative-datetime {} 0 unit]))]
      (doseq [x    [(relative) absolute]
              y    [(relative) absolute]
              unit [:week :default]]
        (testing (pr-str [:between (opts) [:field {:temporal-unit unit} 1] x y])
          (is (=? [:between {}
                   [:field {:temporal-unit unit} 1]
                   (expected x unit)
                   (expected y unit)]
                  (lib.filter.desugar/desugar-filter-clause
                   [:between
                    (opts)
                    [:field (opts :temporal-unit unit) 1]
                    x
                    y]))))))))

(deftest ^:parallel desugar-other-filter-clauses-test-1
  (testing "desugaring := and :!= with extra args"
    (testing "= with extra args should get converted to or"
      (is (=? [:or {}
               [:= {} [:field {} 1] 2]
               [:= {} [:field {} 1] 3]
               [:= {} [:field {} 1] 4]
               [:= {} [:field {} 1] 5]]
              (lib.filter.desugar/desugar-filter-clause
               [:= (opts)
                [:field (opts) 1] 2 3 4 5]))))))

(deftest ^:parallel desugar-other-filter-clauses-test-2
  (testing "desugaring := and :!= with extra args"
    (testing "!= with extra args should get converted to or"
      (is (=? [:and {}
               [:!= {} [:field {} 1] 2]
               [:!= {} [:field {} 1] 3]
               [:!= {} [:field {} 1] 4]
               [:!= {} [:field {} 1] 5]]
              (lib.filter.desugar/desugar-filter-clause
               [:!= (opts) [:field (opts) 1] 2 3 4 5]))))))

(deftest ^:parallel desugar-other-filter-clauses-test-3
  (testing "desugaring :inside"
    (is (=? [:and {}
             [:between {} [:field {} 1] -10.0 10.0]
             [:between {} [:field {} 2] -20.0 20.0]]
            (lib.filter.desugar/desugar-filter-clause
             [:inside (opts) [:field (opts) 1] [:field (opts) 2] 10.0 -20.0 -10.0 20.0])))))

(deftest ^:parallel desugar-other-filter-clauses-test-4
  (testing "desugaring :is-null"
    (is (=? [:= {} [:field {} 1] nil]
            (lib.filter.desugar/desugar-filter-clause
             [:is-null (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-5
  (testing "desugaring :not-null"
    (is (=? [:!= {} [:field {} 1] nil]
            (lib.filter.desugar/desugar-filter-clause
             [:not-null (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-6
  (testing "desugaring :is-empty of nil base-type"
    (is (=? [:= {} [:field {} 1] nil]
            (lib.filter.desugar/desugar-filter-clause
             [:is-empty (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-7
  (testing "desugaring :is-empty of emptyable base-type :type/Text"
    (is (=? [:or {}
             [:= {} [:field {:base-type :type/Text} 1] nil]
             [:= {} [:field {:base-type :type/Text} 1] ""]]
            (lib.filter.desugar/desugar-filter-clause
             [:is-empty (opts) [:field (opts :base-type :type/Text) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-8
  (testing "desugaring :is-empty of string expression #41265"
    (is (=? [:or {}
             [:= {}
              [:regex-match-first {} "foo" "bar"]
              nil]
             [:= {}
              [:regex-match-first {} "foo" "bar"]
              ""]]
            (lib.filter.desugar/desugar-filter-clause
             [:is-empty (opts) [:regex-match-first (opts) "foo" "bar"]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-9
  (testing "desugaring :is-empty of not emptyable base-type :type/DateTime"
    (is (=? [:= {}
             [:field {:base-type :type/DateTime} 1]
             nil]
            (lib.filter.desugar/desugar-filter-clause
             [:is-empty (opts) [:field (opts :base-type :type/DateTime) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-10
  (testing "desugaring :is-empty of :type/PostgresEnum #48022"
    (is (=? [:= {}
             [:field {:base-type :type/PostgresEnum} 1]
             nil]
            (lib.filter.desugar/desugar-filter-clause
             [:is-empty (opts) [:field (opts :base-type :type/PostgresEnum) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-11
  (testing "desugaring :not-empty of nil base-type"
    (is (=? [:!= {}
             [:field {} 1]
             nil]
            (lib.filter.desugar/desugar-filter-clause
             [:not-empty (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-12
  (testing "desugaring :not-empty of emptyable base-type :type/Text"
    (is (=? [:and {}
             [:!= {} [:field {:base-type :type/Text} 1] nil]
             [:!= {} [:field {:base-type :type/Text} 1] ""]]
            (lib.filter.desugar/desugar-filter-clause
             [:not-empty (opts) [:field (opts :base-type :type/Text) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-13
  (testing "desugaring :not-empty of string expression #41265"
    (is (=? [:and {}
             [:!= {} [:regex-match-first {} "foo" "bar"] nil]
             [:!= {} [:regex-match-first {} "foo" "bar"] ""]]
            (lib.filter.desugar/desugar-filter-clause
             [:not-empty (opts) [:regex-match-first (opts) "foo" "bar"]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-14
  (testing "desugaring :not-empty of not emptyable base-type"
    (is (=? [:!= {}
             [:field {:base-type :type/DateTime} 1]
             nil]
            (lib.filter.desugar/desugar-filter-clause
             [:not-empty (opts) [:field (opts :base-type :type/DateTime) 1]])))))

(deftest ^:parallel desugar-other-filter-clauses-test-15
  (testing "desugaring :not-empty of :type/PostgresEnum #48022"
    (is (=? [:!= {}
             [:field {:base-type :type/PostgresEnum} 1]
             nil]
            (lib.filter.desugar/desugar-filter-clause
             [:not-empty (opts) [:field (opts :base-type :type/PostgresEnum) 1]])))))

(deftest ^:parallel desugar-does-not-contain-test-1
  (testing "desugaring does-not-contain"
    (testing "without options"
      (is (=? [:not {}
               [:contains {} [:field {} 1] "ABC"]]
              (lib.filter.desugar/desugar-filter-clause
               [:does-not-contain (opts) [:field (opts) 1] "ABC"]))))))

(deftest ^:parallel desugar-does-not-contain-test-2
  (testing "desugaring does-not-contain"
    (testing "*with* options"
      (is (=? [:not {}
               [:contains {:case-sensitive false} [:field {} 1] "ABC"]]
              (lib.filter.desugar/desugar-filter-clause
               [:does-not-contain (opts :case-sensitive false)
                [:field (opts) 1]
                "ABC"]))))))

(deftest ^:parallel desugar-does-not-contain-test-3
  (testing "desugaring does-not-contain"
    (testing "desugaring does-not-contain with multiple arguments"
      (testing "without options"
        (is (=? [:and {}
                 [:not {}
                  [:contains {} [:field {} 1] "ABC"]]
                 [:not {}
                  [:contains {} [:field {} 1] "XYZ"]]]
                (lib.filter.desugar/desugar-filter-clause
                 [:does-not-contain (opts) [:field (opts) 1] "ABC" "XYZ"])))))))

(deftest ^:parallel desugar-does-not-contain-test-4
  (testing "desugaring does-not-contain"
    (testing "desugaring does-not-contain with multiple arguments"
      (testing "without options"
        (is (=? [:and {}
                 [:not {} [:contains {} [:field {} 1] "ABC"]]
                 [:not {} [:contains {} [:field {} 1] "XYZ"]]
                 [:not {} [:contains {} [:field {} 1] "LMN"]]]
                (lib.filter.desugar/desugar-filter-clause
                 [:does-not-contain (opts) [:field (opts) 1] "ABC" "XYZ" "LMN"])))))))

(deftest ^:parallel desugar-does-not-contain-test-5
  (testing "desugaring does-not-contain"
    (testing "desugaring does-not-contain with multiple arguments"
      (testing "*with* options"
        (is (=? [:and {}
                 [:not {} [:contains {:case-sensitive false} [:field {} 1] "ABC"]]
                 [:not {} [:contains {:case-sensitive false} [:field {} 1] "XYZ"]]]
                (lib.filter.desugar/desugar-filter-clause
                 [:does-not-contain (opts :case-sensitive false) [:field (opts) 1] "ABC" "XYZ"])))))))

(deftest ^:parallel desugar-does-not-contain-test-6
  (testing "desugaring does-not-contain"
    (testing "desugaring does-not-contain with multiple arguments"
      (testing "*with* options"
        (is (=? [:and {}
                 [:not {:case-sensitive false} [:contains {} [:field {} 1] "ABC"]]
                 [:not {:case-sensitive false} [:contains {} [:field {} 1] "XYZ"]]
                 [:not {:case-sensitive false} [:contains {} [:field {} 1] "LMN"]]]
                (lib.filter.desugar/desugar-filter-clause
                 [:does-not-contain (opts :case-sensitive false) [:field (opts) 1] "ABC" "XYZ" "LMN"])))))))

(deftest ^:parallel desugar-temporal-extract-test
  (testing "desugaring :get-year, :get-month, etc"
    (doseq [[[op mode] unit] @#'lib.filter.desugar/temporal-extract-ops->unit
            :let [clause (if mode
                           [op (opts) [:field (opts) 1] mode]
                           [op (opts) [:field (opts) 1]])]]
      (is (=? [:temporal-extract {} [:field {} 1] unit]
              (#'lib.filter.desugar/desugar-temporal-extract
               clause)))
      (is (=? [:+ {} [:temporal-extract {} [:field {} 1] unit] 1]
              (#'lib.filter.desugar/desugar-temporal-extract
               [:+ (opts) clause 1]))))))

(deftest ^:parallel desugar-divide-with-extra-args-test-1
  (testing '#'lib.filter.desugar/desugar-expression
    (are [expression expected] (=? expected (#'lib.filter.desugar/desugar-expression expression))
      [:/ (opts) 1 2]
      [:/ {} 1 2]

      [:/ (opts) 1 2 3]
      [:/ {} [:/ {} 1 2] 3]

      [:/ (opts) 1 2 3 4]
      [:/ {} [:/ {} [:/ {} 1 2] 3] 4])))

(deftest ^:parallel desugar-divide-with-extra-args-test-2
  (testing 'lib.filter.desugar/desugar-filter-clause
    (are [expression expected] (=? expected (lib.filter.desugar/desugar-filter-clause expression))
      [:= (opts) 1 [:/ (opts) 1 2]]
      [:=  {} 1 [:/ {} 1 2]]

      [:= (opts) 1 [:/ (opts) 1 2 3]]
      [:= {} 1 [:/ {} [:/ {} 1 2] 3]]

      [:= (opts) 1 [:/ (opts) 1 2 3 4]]
      [:= {} 1 [:/ {} [:/ {} [:/ {} 1 2] 3] 4]])))

(deftest ^:parallel desugar-time-interval-expression-test
  (is (=? [:= {}
           [:expression {:temporal-unit :quarter} "Date"]
           [:relative-datetime {} 0 :quarter]]
          (#'lib.filter.desugar/desugar-time-interval
           [:time-interval (opts) [:expression (opts) "Date"] :current :quarter]))))

(deftest ^:parallel desugar-month-quarter-day-name-test-1
  (testing "`month-name` should desugar to a `:case` clause with values for each month"
    (is (=? [:case
             {:default ""}
             [[[:= {} [:field {} 1] 1] "Jan"]
              [[:= {} [:field {} 1] 2] "Feb"]
              [[:= {} [:field {} 1] 3] "Mar"]
              [[:= {} [:field {} 1] 4] "Apr"]
              [[:= {} [:field {} 1] 5] "May"]
              [[:= {} [:field {} 1] 6] "Jun"]
              [[:= {} [:field {} 1] 7] "Jul"]
              [[:= {} [:field {} 1] 8] "Aug"]
              [[:= {} [:field {} 1] 9] "Sep"]
              [[:= {} [:field {} 1] 10] "Oct"]
              [[:= {} [:field {} 1] 11] "Nov"]
              [[:= {} [:field {} 1] 12] "Dec"]]]
            (#'lib.filter.desugar/desugar-expression [:month-name (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-month-quarter-day-name-test-2
  (testing "`quarter-name` should desugar to a `:case` clause with values for each quarter"
    (is (=? [:case {:default ""}
             [[[:= {} [:field {} 1] 1] "Q1"]
              [[:= {} [:field {} 1] 2] "Q2"]
              [[:= {} [:field {} 1] 3] "Q3"]
              [[:= {} [:field {} 1] 4] "Q4"]]]
            (#'lib.filter.desugar/desugar-expression [:quarter-name (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-month-quarter-day-name-test-3
  (testing "`day-name` should desugar to a `:case` clause with values for each weekday"
    (is (=? [:case {:default ""}
             [[[:= {} [:field {} 1] 1] "Sunday"]
              [[:= {} [:field {} 1] 2] "Monday"]
              [[:= {} [:field {} 1] 3] "Tuesday"]
              [[:= {} [:field {} 1] 4] "Wednesday"]
              [[:= {} [:field {} 1] 5] "Thursday"]
              [[:= {} [:field {} 1] 6] "Friday"]
              [[:= {} [:field {} 1] 7] "Saturday"]]]
            (#'lib.filter.desugar/desugar-expression [:day-name (opts) [:field (opts) 1]])))))
#?(:clj
   (deftest ^:synchronized desugar-month-quarter-day-name-i18n-test
     (metabase.test.util.i18n/with-user-locale "es"
       ;; JVM versions 17 and older for some languages (including Spanish) use eg. "oct.", while in JVMs 18+ they
       ;; use "oct". I wish I were joking, but I'm not. These tests were passing on 21 and failing on 17 and 11
       ;; before I made them flexible about the dot.
       (testing "`month-name` should desugar to a `:case` clause with values for each month"
         (is (=? [:case                   {:default ""}
                  [[[:= {} [:field {} 1] 1]  #(#{"ene"  "ene."}  %)]
                   [[:= {} [:field {} 1] 2]  #(#{"feb"  "feb."}  %)]
                   [[:= {} [:field {} 1] 3]  #(#{"mar"  "mar."}  %)]
                   [[:= {} [:field {} 1] 4]  #(#{"abr"  "abr."}  %)]
                   [[:= {} [:field {} 1] 5]  #(#{"may"  "may."}  %)]
                   [[:= {} [:field {} 1] 6]  #(#{"jun"  "jun."}  %)]
                   [[:= {} [:field {} 1] 7]  #(#{"jul"  "jul."}  %)]
                   [[:= {} [:field {} 1] 8]  #(#{"ago"  "ago."}  %)]
                   [[:= {} [:field {} 1] 9]  #(#{"sept" "sept."} %)]
                   [[:= {} [:field {} 1] 10] #(#{"oct"  "oct."}  %)]
                   [[:= {} [:field {} 1] 11] #(#{"nov"  "nov."}  %)]
                   [[:= {} [:field {} 1] 12] #(#{"dic"  "dic."}  %)]]]
                 (#'lib.filter.desugar/desugar-expression [:month-name (opts) [:field (opts) 1]])))))))

#?(:clj
   (deftest ^:synchronized desugar-month-quarter-day-name-i18n-test-2
     (metabase.test.util.i18n/with-user-locale "es"
       (testing "`quarter-name` should desugar to a `:case` clause with values for each quarter"
         (is (=? [:case {:default ""}
                  [[[:= {} [:field {} 1] 1] "Q1"]
                   [[:= {} [:field {} 1] 2] "Q2"]
                   [[:= {} [:field {} 1] 3] "Q3"]
                   [[:= {} [:field {} 1] 4] "Q4"]]]
                 (#'lib.filter.desugar/desugar-expression [:quarter-name (opts) [:field (opts) 1]])))))))

#?(:clj
   (deftest ^:synchronized desugar-month-quarter-day-name-i18n-test-3
     (metabase.test.util.i18n/with-user-locale "es"
       (testing "`day-name` should desugar to a `:case` clause with values for each weekday"
         (is (=? [:case {:default ""}
                  [[[:= {} [:field {} 1] 1] "domingo"]
                   [[:= {} [:field {} 1] 2] "lunes"]
                   [[:= {} [:field {} 1] 3] "martes"]
                   [[:= {} [:field {} 1] 4] "miércoles"]
                   [[:= {} [:field {} 1] 5] "jueves"]
                   [[:= {} [:field {} 1] 6] "viernes"]
                   [[:= {} [:field {} 1] 7] "sábado"]]]
                 (#'lib.filter.desugar/desugar-expression [:day-name (opts) [:field (opts) 1]])))))))

