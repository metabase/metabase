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

(t/deftest ^:parallel update-field-options-test
  ;; the options exercised here (`:display-name`, `:name`, `:binning`) are real declared ref options. Ref options are
  ;; a closed schema in MBQL 4 as well as MBQL 5, so a stand-in key like `:wow` would be rejected as this function's
  ;; input before it did any of the updating this test is about.
  (t/is (= [:field 1 {:display-name "Wow"}]
           (mbql.u/update-field-options [:field 1 nil] #(assoc % :display-name "Wow"))
           (mu/disable-enforcement
             (mbql.u/update-field-options [:field 1 {}] #(assoc % :display-name "Wow")))
           (mbql.u/update-field-options [:field 1 {:display-name "Meh"}] #(assoc % :display-name "Wow"))))
  (t/is (= [:field 1 {:name "a", :display-name "b"}]
           (mbql.u/update-field-options [:field 1 {:name "a"}] #(assoc % :display-name "b"))))
  (t/testing "Should pass extra args to `f`, like `clojure.core/update`"
    (t/is (= [:field 1 {:name "a", :display-name "b"}]
             (mbql.u/update-field-options [:field 1 {:name "a"}] assoc :display-name "b")))
    (t/is (= [:field 1 {:binning {:strategy :num-bins, :num-bins 10}}]
             (mbql.u/update-field-options [:field 1 nil] assoc-in [:binning] {:strategy :num-bins, :num-bins 10})))
    (t/is (= [:field 1 {:binning {:strategy :num-bins, :num-bins 20}}]
             (mbql.u/update-field-options [:field 1 {:binning {:strategy :num-bins, :num-bins 10}}] update-in [:binning :num-bins] * 2)))
    (t/is (= [:expression "wow"]
             (mbql.u/update-field-options [:expression "wow" {:display-name "b", :name "a"}] dissoc :display-name :name))))
  (t/testing "Should remove empty options"
    (t/is (= [:field 1 nil]
             (mbql.u/update-field-options [:field 1 {:name "a"}] #(dissoc % :name)))))
  (t/testing "Should normalize the clause"
    (t/is (= [:field 1 nil]
             (mbql.u/update-field-options [:field 1 {:binning {:strategy :default}}]
                                          #(assoc-in % [:binning :strategy] nil)))))
  (t/testing "Should work with `:expression` and `:aggregation` references as well"
    (t/is (= [:expression "wow" {:name "a"}]
             (mbql.u/update-field-options [:expression "wow"] #(assoc % :name "a"))))
    (t/is (= [:expression "wow" {:name "a", :display-name "b"}]
             (mbql.u/update-field-options [:expression "wow" {:display-name "b"}] #(assoc % :name "a"))))
    (t/is (= [:aggregation 0 {:name "a"}]
             (mbql.u/update-field-options [:aggregation 0] #(assoc % :name "a"))))
    (t/is (= [:aggregation 0 {:name "a", :display-name "b"}]
             (mbql.u/update-field-options [:aggregation 0 {:display-name "b"}] #(assoc % :name "a"))))
    ;; in the future when we make the 3-arg version the normalized/"official" version we will probably want to stop
    ;; doing this.
    (t/testing "Remove empty options entirely from `:expression` and `:aggregation` (for now)"
      (t/is (= [:expression "wow"]
               (mbql.u/update-field-options [:expression "wow" {:display-name "b"}] #(dissoc % :display-name))))
      (t/is (= [:aggregation 0]
               (mbql.u/update-field-options [:aggregation 0 {:display-name "b"}] #(dissoc % :display-name)))))))
