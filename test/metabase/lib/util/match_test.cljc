(ns metabase.lib.util.match-test
  (:require
   [clojure.test :as t]
   [metabase.lib.util.match :as lib.util.match]))

(t/deftest ^:parallel basic-match-test
  (t/testing "can we use `match` to find the instances of a clause?"
    (t/is (= [[:field 10 nil]
              [:field 20 nil]]
             (lib.util.match/match {:query {:filter [:=
                                                     [:field 10 nil]
                                                     [:field 20 nil]]}}
               [:field & _])))))

(t/deftest ^:parallel match-keywords-test
  (t/testing "is `match` nice enought to automatically wrap raw keywords in appropriate patterns for us?"
    (t/is (= [[:field 1 nil]]
             (lib.util.match/match {:fields [[:field 1 nil] [:expression "wow"]]}
               :field)))))

(t/deftest ^:parallel match-set-of-keywords-tes
  (t/testing "if we pass a set of keywords, will that generate an appropriate pattern to match multiple clauses as well?"
    (t/is (= [[:field 1 nil]
              [:field 3 {:source-field 2}]
              [:expression "wow"]]
             (lib.util.match/match {:fields [[:field 1 nil]
                                             [:something-else "ok"]
                                             [:field 3 {:source-field 2}]
                                             [:expression "wow"]]}
               #{:field :expression})))))

(t/deftest ^:parallel match-dont-include-subclauses-test
  (t/testing "`match` shouldn't include subclauses of matches"
    (t/is (= [[:field 1 nil]
              [:field 3 {:source-field 2}]]
             (lib.util.match/match [[:field 1 nil] [:field 3 {:source-field 2}]]
               [(:or :field) & _])))

    (t/is (= [[:field 10 nil]
              [:field 20 nil]]
             (lib.util.match/match {:query {:filter [:=
                                                     [:field 10 nil]
                                                     [:field 20 nil]]}}
               [(:or :field :+ :-) & _])))))

;; can we use some of the cool features of pattern matching?
(def ^:private a-query
  {:breakout [[:field 10 nil]
              [:field 20 nil]
              [:field "Wow" {:base-type :type/*}]]
   :fields   [[:field 40 {:source-field 30}]]})

(t/deftest ^:parallel match-result-paramater-test
  (t/testing "can we use the optional `result` parameter to find return something other than the whole clause?"
    (t/is (= [41]
             ;; return just the dest IDs of Fields in a fk-> clause
             (lib.util.match/match a-query
               [:field dest-id {:source-field (_ :guard integer?)}] (inc dest-id))))

    (t/is (= [10 20]
             (lib.util.match/match (:breakout a-query) [:field id nil] id)))))

(t/deftest ^:parallel match-return-nil-for-empty-sequences-test
  (t/testing "match should return `nil` if there are no matches so you don't need to call `seq`"
    (t/is (= nil
             (lib.util.match/match {} [:field _ _] :minute)))))

(t/deftest ^:parallel match-guard-test
  (t/testing "can we `:guard` a pattern?"
    (t/is (= [[:field 2 nil]]
             (let [a-field-id 2]
               (lib.util.match/match {:fields [[:field 1 nil] [:field 2 nil]]}
                 [:field (id :guard (partial = a-field-id)) _])))))

  (t/testing "ok, if for some reason we can't use `:guard` in the pattern will `match` filter out nil results?"
    (t/is (= [2]
             (lib.util.match/match {:fields [[:field 1 nil] [:field 2 nil]]}
               [:field id _]
               (when (= id 2)
                 id))))))

(def ^:private another-query
  {:fields [[:field 1 nil]
            [:field 2 {:temporal-unit :day}]
            [:field 4 {:source-field 3, :temporal-unit :month}]]})

(t/deftest ^:parallel match-&match-test
  (t/testing (str "Ok, if we want to use predicates but still return the whole match, can we use the anaphoric `&match` "
                  "symbol to return the whole thing?")
    (t/is (= [[:field 1 nil]
              [:field 2 {:temporal-unit :day}]
              [:field 4 {:source-field 3, :temporal-unit :month}]]
             (let [some-pred? (constantly true)]
               (lib.util.match/match another-query
                 :field
                 (when some-pred?
                   &match)))))))

(t/deftest ^:parallel match-&parents-test
  (t/testing "can we use the anaphoric `&parents` symbol to examine the parents of the collection?"
    (t/is (= [[:field 1 nil]]
             (lib.util.match/match {:filter [[:time-interval [:field 1 nil] :current :month]
                                             [:= [:field 2 nil] "wow"]]}
               :field
               (when (contains? (set &parents) :time-interval)
                 &match))))))

#?(:clj
   (t/deftest ^:parallel match-by-class-test
     (t/testing "can we match using a CLASS?"
       (t/is (= [#inst "2018-10-08T00:00:00.000-00:00"]
                (lib.util.match/match [[:field 1 nil]
                                       [:field 2 nil]
                                       #inst "2018-10-08"
                                       4000]
                  java.util.Date))))))

(t/deftest ^:parallel match-by-predicate-test
  (t/testing "can we match using a PREDICATE?"
    (t/is (= [4000 5000]
             ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses
             (lib.util.match/match {:filter [:and
                                             [:= [:field 1 nil] 4000]
                                             [:= [:field 2 nil] 5000]]}
               integer?
               (when (= := (last &parents))
                 &match)))))

  (t/testing "how can we use predicates not named by a symbol?"
    (t/is (= [1 4000 2 5000]
             (lib.util.match/match {:filter [:and
                                             [:= [:field 1 nil] 4000]
                                             [:= [:field 2 nil] 5000]]}
               (&match :guard integer?)))))

  (t/testing "can we use a predicate and bind the match at the same time?"
    (t/is (= [2 4001 3 5001]
             (lib.util.match/match {:filter [:and
                                             [:= [:field 1 nil] 4000]
                                             [:= [:field 2 nil] 5000]]}
               (i :guard integer?)
               (inc i))))))

(t/deftest ^:parallel match-map-test
  (t/testing "can we match against a map?"
    (t/is (= ["card__1847"]
             (let [x {:source-table "card__1847"}]
               (lib.util.match/match x
                 (m :guard (every-pred map? (comp string? :source-table)))
                 (:source-table m)))))))

(t/deftest ^:parallel match-sequence-of-maps-test
  (t/testing "how about a sequence of maps?"
    (t/is (= ["card__1847"]
             (let [x [{:source-table "card__1847"}]]
               (lib.util.match/match x
                 (m :guard (every-pred map? (comp string? :source-table)))
                 (:source-table m)))))))

(t/deftest ^:parallel match-recur-inside-pattern-test
  (t/testing "can we use `recur` inside a pattern?"
    (t/is (= [[0 :month]]
             (lib.util.match/match {:filter [:time-interval [:field 1 nil] :current :month]}
               [:time-interval field :current unit] (recur [:time-interval field 0 unit])
               [:time-interval _     n        unit] [n unit])))))

(t/deftest ^:parallel match-short-circut-test
  (t/testing "can we short-circut a match to prevent recursive matching?"
    (t/is (= [10]
             (lib.util.match/match [[:field 10 nil]
                                    [:field 20 {:temporal-unit :day}]]
               [:field id nil] id
               [_ [:field-id & _] & _] nil)))))

(t/deftest ^:parallel match-list-with-guard-clause-test
  (t/testing "can we use a list with a :guard clause?"
    (t/is (= [10 20]
             (lib.util.match/match {:query {:filter [:=
                                                     [:field 10 nil]
                                                     [:field 20 nil]]}}
               (id :guard int?) id)))))

(t/deftest ^:parallel basic-replace-test
  (t/testing "can we use `replace` to replace a specific clause?"
    (t/is (= {:breakout [[:field 10 {:temporal-unit :day}]
                         [:field 20 {:temporal-unit :day}]
                         [:field "Wow" {:base-type :type/*}]]
              :fields   [[:field 40 {:source-field 30}]]}
             (lib.util.match/replace a-query
               [:field id nil]
               [:field id {:temporal-unit :day}])))))

(t/deftest ^:parallel basic-replace-in-test
  (t/testing "can we wrap the pattern in a map to restrict what gets replaced?"
    (t/is (= {:breakout [[:field 10 {:temporal-unit :day}]
                         [:field 20 {:temporal-unit :day}]
                         [:field "Wow" {:base-type :type/*}]]
              :fields   [[:field 40 {:source-field 30}]]}
             (lib.util.match/replace-in a-query [:breakout]
                                        [:field (id :guard integer?) nil]
                                        [:field id {:temporal-unit :day}])))))

(t/deftest ^:parallel replace-multiple-patterns-test
  (t/testing "can we use multiple patterns at the same time?!"
    (t/is (= {:breakout [[:field 10 {:temporal-unit :day}]
                         [:field 20 {:temporal-unit :day}]
                         [:field "Wow" {:base-type :type/*, :temporal-unit :month}]]
              :fields   [[:field 40 {:source-field 30}]]}
             (lib.util.match/replace-in a-query [:breakout]
                                        [:field (id :guard integer?) nil]
                                        [:field id {:temporal-unit :day}]

                                        [:field (id :guard string?) opts]
                                        [:field id (assoc opts :temporal-unit :month)])))))

(t/deftest ^:parallel replace-field-ids-test
  (t/testing "can we use `replace` to replace the ID of the Field in :field clauses?"
    (t/is (= {:breakout [[:field 10 nil]
                         [:field 20 nil]
                         [:field "Wow" {:base-type :type/*}]]
              :fields   [[:field 100 {:source-field 30}]]}
             (lib.util.match/replace a-query
               [:field 40 opts]
               [:field 100 opts])))))

(t/deftest ^:parallel replace-fix-bad-mbql-test
  (t/testing "can we use `replace` to fix (legacy) `fk->` clauses where both args are unwrapped IDs?"
    (t/is (= {:query {:fields [[:fk-> [:field 1 nil] [:field 2 nil]]
                               [:fk-> [:field 3 nil] [:field 4 nil]]]}}
             (lib.util.match/replace-in
              {:query {:fields [[:fk-> 1 2]
                                [:fk-> [:field 3 nil] [:field 4 nil]]]}}
              [:query :fields]
              [:fk-> (source :guard integer?) (dest :guard integer?)]
              [:fk-> [:field source nil] [:field dest nil]])))))

(t/deftest ^:parallel replace-raw-keyword-patterns-test
  (t/testing "does `replace` accept a raw keyword as the pattern the way `match` does?"
    (t/is (= {:fields ["WOW" "WOW" "WOW"]}
             (lib.util.match/replace another-query :field "WOW")))))

(t/deftest ^:parallel replace-set-of-keywords-test
  (t/testing "does `replace` accept a set of keywords the way `match` does?"
    (t/is (= {:fields ["WOW" "WOW" "WOW"]}
             (lib.util.match/replace another-query #{:field :field-id} "WOW")))))

(t/deftest ^:parallel replace-&match-test
  (t/testing "can we use the anaphor `&match` to look at the entire match?"
    (t/is (= {:fields [[:field 1 nil]
                       [:magical-field [:field 2 {:temporal-unit :day}]]
                       [:magical-field [:field 4 {:source-field 3, :temporal-unit :month}]]]}
             (lib.util.match/replace another-query [:field _ (_ :guard :temporal-unit)] [:magical-field &match])))))

(t/deftest ^:parallel replace-&parents-test
  (t/testing "can we use the anaphor `&parents` to look at the parents of the match?"
    (t/is (= {:fields [[:a "WOW"]
                       [:b 200]]}
             ;; replace field ID clauses that are inside a datetime-field clause
             (lib.util.match/replace {:fields [[:a [:b 100]]
                                               [:b 200]]}
               :b
               (if (contains? (set &parents) :a)
                 "WOW"
                 &match))))))

#?(:clj
   (t/deftest ^:parallel replace-by-class-test
     (t/testing "can we replace using a CLASS?"
       (t/is (= [[:field 1 nil]
                 [:field 2 nil]
                 [:timestamp #inst "2018-10-08T00:00:00.000-00:00"]
                 4000]
                (lib.util.match/replace [[:field 1 nil]
                                         [:field 2 nil]
                                         #inst "2018-10-08"
                                         4000]
                  java.util.Date
                  [:timestamp &match]))))))

(t/deftest ^:parallel replace-by-predicate-test
  (t/testing "can we replace using a PREDICATE?"
    (t/is (= {:filter [:and
                       [:= [:field nil nil] 4000.0]
                       [:= [:field nil nil] 5000.0]]}
             ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses and make them FLOATS
             (lib.util.match/replace {:filter [:and
                                               [:= [:field 1 nil] 4000]
                                               [:= [:field 2 nil] 5000]]}
               integer?
               (when (= := (last &parents))
                 (float &match)))))))

(t/deftest ^:parallel complex-replace-test
  (t/testing "can we do fancy stuff like remove all the filters that use datetime fields from a query?"
    (t/is (= [:and nil [:= [:field 100 nil] 20]]
             (lib.util.match/replace [:and
                                      [:=
                                       [:field 1 {:temporal-unit :day}]
                                       [:absolute-datetime #inst "2016-11-08T00:00:00.000-00:00" :day]]
                                      [:= [:field 100 nil] 20]]
               [_ [:field _ (_ :guard :temporal-unit)] & _] nil)))))

(t/deftest ^:parallel replace-short-circut-test
  (t/testing (str "can we use short-circuting patterns to do something tricky like only replace `:field-id` clauses that "
                  "aren't wrapped by other clauses?")
    (t/is (= [[:field 10 {:temporal-unit :day}]
              [:field 20 {:temporal-unit :month}]
              [:field 30 nil]]
             (let [id-is-datetime-field? #{10}]
               (lib.util.match/replace [[:field 10 nil]
                                        [:field 20 {:temporal-unit :month}]
                                        [:field 30 nil]]
                 ;; don't replace anything that's already wrapping a `field-id`
                 [_ [:field-id & _] & _]
                 &match

                 [:field (id :guard id-is-datetime-field?) opts]
                 [:field id (assoc opts :temporal-unit :day)]))))))
