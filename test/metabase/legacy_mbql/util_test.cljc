(ns metabase.legacy-mbql.util-test
  {:clj-kondo/config '{:linters {:deprecated-var {:level :off}}}}
  (:require
   #?@(:clj  ([metabase.test.util.i18n])
       :cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :as t]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.types.core]
   [metabase.util.malli :as mu]))

(comment metabase.types.core/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private query-with-some-nesting
  {:database 1
   :type     :query
   :query    {:source-query {:source-table 1
                             :aggregation  [[:stddev [:field 1 nil]]
                                            [:min [:field 1 nil]]]}
              :aggregation  [[:avg [:field 1 nil]]
                             [:max [:field 1 nil]]]}})

(t/deftest ^:parallel aggregation-at-index-test
  (doseq [[input expected] {[0]   [:avg [:field 1 nil]]
                            [1]   [:max [:field 1 nil]]
                            [0 0] [:avg [:field 1 nil]]
                            [0 1] [:stddev [:field 1 nil]]
                            [1 1] [:min [:field 1 nil]]}]
    (t/testing (pr-str (cons 'aggregation-at-index input))
      (t/is (= expected
               (apply mbql.u/aggregation-at-index query-with-some-nesting input))))))

;;; --------------------------------------------- query->max-rows-limit ----------------------------------------------

#_{:clj-kondo/ignore [:deprecated-var]}
(t/deftest ^:parallel query->max-rows-limit-test
  (doseq [[group query->expected]
          {"should return `:limit` if set"
           {{:database 1, :type :query, :query {:source-table 1, :limit 10}} 10}

           "should return `:page` items if set"
           {{:database 1, :type :query, :query {:source-table 1, :page {:page 1, :items 5}}} 5}

           "if `:max-results` is set return that"
           {{:database 1, :type :query, :query {:source-table 1}, :constraints {:max-results 15}} 15}

           "if `:max-results-bare-rows` is set AND query has no aggregations, return that"
           {{:database    1
             :type        :query
             :query       {:source-table 1}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 10
            {:database    1
             :type        :native
             :native      {:query "SELECT * FROM my_table"}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 10}

           "if `:max-results-bare-rows` is set but query has aggregations, return `:max-results` instead"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :aggregation [[:count]]}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 5}

           "if both `:limit` and `:page` are set (not sure makes sense), return the smaller of the two"
           {{:database 1, :type :query, :query {:source-table 1, :limit 10, :page {:page 1, :items 5}}} 5
            {:database 1, :type :query, :query {:source-table 1, :limit 5, :page {:page 1, :items 10}}} 5}

           "if both `:limit` and `:constraints` are set, prefer the smaller of the two"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 5}
             :constraints {:max-results 10}} 5

            {:database    1
             :type        :query
             :query       {:source-table 1, :limit 15}
             :constraints {:max-results 10}} 10}

           "since this query doesn't have an aggregation we should be using `max-results-bare-rows`"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 10}
             :constraints {:max-results 15, :max-results-bare-rows 5}} 5}

           "add an aggregation, and `:max-results` is used instead; since `:limit` is lower, return that"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 10, :aggregation [[:count]]}
             :constraints {:max-results 15, :max-results-bare-rows 5}} 10}

           "if nothing is set return `nil`"
           {{:database 1
             :type     :query
             :query    {:source-table 1}} nil}}]
    (t/testing group
      (doseq [[query expected] query->expected]
        (t/testing (pr-str (list 'query->max-rows-limit query))
          (t/is (= expected
                   (mbql.u/query->max-rows-limit query))))))))

(t/deftest ^:parallel expression-with-name-test
  (t/is (= [:+ 1 1]
           (mbql.u/expression-with-name {:expressions  {"two" [:+ 1 1]}
                                         :source-table 1}
                                        "two"))))

(t/deftest ^:parallel expression-with-name-test-2
  (t/testing "Make sure `expression-with-name` knows how to reach into the parent query if need be"
    (t/is (= [:+ 1 1]
             (mbql.u/expression-with-name {:source-query {:expressions  {"two" [:+ 1 1]}
                                                          :source-table 1}}
                                          "two")))))

(t/deftest ^:parallel expression-with-name-test-3
  (t/testing "Should throw an Exception if expression does not exist"
    (t/is (thrown-with-msg?
           #?(:clj clojure.lang.ExceptionInfo :cljs :default)
           #"No expression named"
           (mbql.u/expression-with-name {} "wow")))))

(t/deftest ^:parallel update-field-options-test
  (t/is (= [:field 1 {:wow true}]
           (mbql.u/update-field-options [:field 1 nil] assoc :wow true)
           (mu/disable-enforcement
             (mbql.u/update-field-options [:field 1 {}] assoc :wow true))
           (mbql.u/update-field-options [:field 1 {:wow false}] assoc :wow true)))
  (t/is (= [:field 1 {:a 1, :b 2}]
           (mbql.u/update-field-options [:field 1 {:a 1}] assoc :b 2)))
  (t/testing "Should remove empty options"
    (t/is (= [:field 1 nil]
             (mbql.u/update-field-options [:field 1 {:a 1}] dissoc :a))))
  (t/testing "Should normalize the clause"
    (t/is (= [:field 1 nil]
             (mbql.u/update-field-options [:field 1 {:a {:b 1}}] assoc-in [:a :b] nil))))
  (t/testing "Should work with `:expression` and `:aggregation` references as well"
    (t/is (= [:expression "wow" {:a 1}]
             (mbql.u/update-field-options [:expression "wow"] assoc :a 1)))
    (t/is (= [:expression "wow" {:a 1, :b 2}]
             (mbql.u/update-field-options [:expression "wow" {:b 2}] assoc :a 1)))
    (t/is (= [:aggregation 0 {:a 1}]
             (mbql.u/update-field-options [:aggregation 0] assoc :a 1)))
    (t/is (= [:aggregation 0 {:a 1, :b 2}]
             (mbql.u/update-field-options [:aggregation 0 {:b 2}] assoc :a 1)))
    ;; in the future when we make the 3-arg version the normalized/"official" version we will probably want to stop
    ;; doing this.
    (t/testing "Remove empty options entirely from `:expression` and `:aggregation` (for now)"
      (t/is (= [:expression "wow"]
               (mbql.u/update-field-options [:expression "wow" {:b 2}] dissoc :b)))
      (t/is (= [:aggregation 0]
               (mbql.u/update-field-options [:aggregation 0 {:b 2}] dissoc :b))))))

(t/deftest ^:parallel with-temporal-unit-test
  (t/is (= [:field 1 {:temporal-unit :day}]
           (mbql.u/with-temporal-unit [:field 1 nil] :day)))
  (t/is (= [:field "t" {:base-type :type/Date, :temporal-unit :day}]
           (mbql.u/with-temporal-unit [:field "t" {:base-type :type/Date}] :day)))
  (t/testing "Ignore invalid temporal units if `:base-type` is specified (#16485)"
    ;; `:minute` doesn't make sense for a DATE
    (t/is (= [:field "t" {:base-type :type/Date}]
             (mbql.u/with-temporal-unit [:field "t" {:base-type :type/Date}] :minute)))))

(t/deftest ^:parallel normalize-token-handle-types-test
  (t/testing "If this gets called incorrectly with a base type keyword then handle it gracefully"
    (t/is (= :type/Text
             (mbql.u/normalize-token "type/Text")))))
