(ns metabase.util.match-test
  (:require
   [clojure.test :as t]
   [metabase.util.match :as match]))

(t/deftest ^:parallel basic-match-test
  (t/testing "can we use `match-many` to find the instances of a clause?"
    (t/is (= [[:field 10 nil]
              [:field 20 nil]]
             (match/match-many {:query {:filter [:=
                                                 [:field 10 nil]
                                                 [:field 20 nil]]}}
               [:field & _] &match)))))

(t/deftest ^:parallel match-dont-include-subclauses-test
  (t/testing "`match-many` shouldn't include subclauses of matches"
    (t/is (= [[:field 1 nil]
              [:field 3 {:source-field 2}]]
             (match/match-many [[:field 1 nil] [:field 3 {:source-field 2}]]
               [(:or :field) & _] &match)))

    (t/is (= [[:field 10 nil]
              [:field 20 nil]]
             (match/match-many {:query {:filter [:=
                                                 [:field 10 nil]
                                                 [:field 20 nil]]}}
               [(:or :field :+ :-) & _] &match)))))

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
             (match/match-many a-query
               [:field dest-id {:source-field (_ :guard integer?)}] (inc dest-id))))

    (t/is (= [10 20]
             (match/match-many (:breakout a-query) [:field id nil] id)))))

(t/deftest ^:parallel match-return-nil-for-empty-sequences-test
  (t/testing "match should return `nil` if there are no matches so you don't need to call `seq`"
    (t/is (= nil
             (match/match-many {} [:field _ _] :minute)))))

(t/deftest ^:parallel match-guard-test
  (t/testing "can we `:guard` a pattern?"
    (t/is (= [[:field 2 nil]]
             (let [a-field-id 2]
               (match/match-many {:fields [[:field 1 nil] [:field 2 nil]]}
                 [:field (id :guard (= id a-field-id)) _] &match)))))

  (t/testing "ok, if for some reason we can't use `:guard` in the pattern will `match-many` filter out nil results?"
    (t/is (= [2]
             (match/match-many {:fields [[:field 1 nil] [:field 2 nil]]}
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
               (match/match-many another-query
                 [:field & _]
                 (when (some-pred? &match)
                   &match)))))))

(t/deftest ^:parallel match-&parents-test
  (t/testing "can we use the anaphoric `&parents` symbol to examine the parents of the collection?"
    (t/is (= [[:field 1 nil]]
             (match/match-many {:filter [[:time-interval [:field 1 nil] :current :month]
                                         [:= [:field 2 nil] "wow"]]}
               [:field & _]
               (when (contains? (set &parents) :time-interval)
                 &match))))))

(t/deftest ^:parallel match-by-predicate-test
  (t/testing "how can we use predicates not named by a symbol?"
    (t/is (= [1 4000 2 5000]
             (match/match-many {:filter [:and
                                         [:= [:field 1 nil] 4000]
                                         [:= [:field 2 nil] 5000]]}
               (&match :guard integer?)
               &match))))

  (t/testing "can we use a predicate and bind the match at the same time?"
    (t/is (= [2 4001 3 5001]
             (match/match-many {:filter [:and
                                         [:= [:field 1 nil] 4000]
                                         [:= [:field 2 nil] 5000]]}
               (i :guard integer?)
               (inc i))))))

(t/deftest ^:parallel match-map-test
  (t/testing "can we match against a map?"
    (t/is (= ["card__1847"]
             (let [x {:source-table "card__1847"}]
               (match/match-many x
                 (m :guard (and (map? m) (string? (:source-table m))))
                 (:source-table m)))))

    (t/is (= ["card__1847"]
             (let [x {:source-table "card__1847"}]
               (match/match-many x
                 {:source-table (s :guard string?)}
                 s))))))

(t/deftest ^:parallel match-sequence-of-maps-test
  (t/testing "how about a sequence of maps?"
    (t/is (= ["card__1847"]
             (let [x [{:source-table "card__1847"}]]
               (match/match-many x
                 (m :guard (and (map? m) (string? (:source-table m))))
                 (:source-table m)))))

    (t/is (= ["card__1847"]
             (let [x [{:source-table "card__1847"}]]
               (match/match-many x
                 {:source-table (s :guard string?)}
                 s))))))

(t/deftest ^:parallel match-recur-inside-pattern-test
  (t/testing "can we use `recur` inside a pattern?"
    (t/is (= [[0 :month]]
             (match/match-many {:filter [:time-interval [:field 1 nil] :current :month]}
               [:time-interval field :current unit] (&recur [:time-interval field 0 unit])
               [:time-interval _     n        unit] [n unit])))))

(t/deftest ^:parallel match-short-circut-test
  (t/testing "can we short-circut a match to prevent recursive matching?"
    (t/is (= [10]
             (match/match-many [[:field 10 nil]
                                [:field 20 {:temporal-unit :day}]]
               [:field id nil] id
               [_ [:field-id & _] & _] nil)))))

(t/deftest ^:parallel match-list-with-guard-clause-test
  (t/testing "can we use a list with a :guard clause?"
    (t/is (= [10 20]
             (match/match-many {:query {:filter [:=
                                                 [:field 10 nil]
                                                 [:field 20 nil]]}}
               (id :guard int?) id)))))

(t/deftest ^:parallel basic-replace-test
  (t/testing "can we use `replace` to replace a specific clause?"
    (t/is (= {:breakout [[:field 10 {:temporal-unit :day}]
                         [:field 20 {:temporal-unit :day}]
                         [:field "Wow" {:base-type :type/*}]]
              :fields   [[:field 40 {:source-field 30}]]}
             (match/replace a-query
               [:field id nil]
               [:field id {:temporal-unit :day}])))))

(t/deftest ^:parallel basic-replace-in-test
  (t/testing "can we wrap the pattern in a map to restrict what gets replaced?"
    (t/is (= {:breakout [[:field 10 {:temporal-unit :day}]
                         [:field 20 {:temporal-unit :day}]
                         [:field "Wow" {:base-type :type/*}]]
              :fields   [[:field 40 {:source-field 30}]]}
             (match/replace-in a-query [:breakout]
               [:field (id :guard integer?) nil]
               [:field id {:temporal-unit :day}])))))

(t/deftest ^:parallel replace-multiple-patterns-test
  (t/testing "can we use multiple patterns at the same time?!"
    (t/is (= {:breakout [[:field 10 {:temporal-unit :day}]
                         [:field 20 {:temporal-unit :day}]
                         [:field "Wow" {:base-type :type/*, :temporal-unit :month}]]
              :fields   [[:field 40 {:source-field 30}]]}
             (match/replace-in a-query [:breakout]
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
             (match/replace a-query
               [:field 40 opts]
               [:field 100 opts])))))

(t/deftest ^:parallel replace-fix-bad-mbql-test
  (t/testing "can we use `replace` to fix (legacy) `fk->` clauses where both args are unwrapped IDs?"
    (t/is (= {:query {:fields [[:fk-> [:field 1 nil] [:field 2 nil]]
                               [:fk-> [:field 3 nil] [:field 4 nil]]]}}
             (match/replace-in
               {:query {:fields [[:fk-> 1 2]
                                 [:fk-> [:field 3 nil] [:field 4 nil]]]}}
               [:query :fields]
               [:fk-> (source :guard integer?) (dest :guard integer?)]
               [:fk-> [:field source nil] [:field dest nil]])))))

(t/deftest ^:parallel replace-&match-test
  (t/testing "can we use the anaphor `&match` to look at the entire match?"
    (t/is (= {:fields [[:field 1 nil]
                       [:magical-field [:field 2 {:temporal-unit :day}]]
                       [:magical-field [:field 4 {:source-field 3, :temporal-unit :month}]]]}
             (match/replace another-query [:field _ (_ :guard :temporal-unit)] [:magical-field &match])))))

(t/deftest ^:parallel replace-&parents-test
  (t/testing "can we use the anaphor `&parents` to look at the parents of the match?"
    (t/is (= {:fields [[:a "WOW"]
                       [:b 200]]}
             ;; replace field ID clauses that are inside a datetime-field clause
             (match/replace {:fields [[:a [:b 100]]
                                      [:b 200]]}
               [:b & _]
               (if (contains? (set &parents) :a)
                 "WOW"
                 &match))))))

(t/deftest ^:parallel replace-by-predicate-test
  (t/testing "can we replace using a PREDICATE?"
    (t/is (= {:filter [:and
                       [:= [:field nil nil] 4000.0]
                       [:= [:field nil nil] 5000.0]]}
             ;; find the integer args to `:=` clauses that are not inside `:field-id` clauses and make them FLOATS
             (match/replace {:filter [:and
                                      [:= [:field 1 nil] 4000]
                                      [:= [:field 2 nil] 5000]]}
               (_ :guard integer?)
               (when (= := (last &parents))
                 (float &match)))))))

(t/deftest ^:parallel complex-replace-test
  (t/testing "can we do fancy stuff like remove all the filters that use datetime fields from a query?"
    (t/is (= [:and nil [:= [:field 100 nil] 20]]
             (match/replace [:and
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
               (match/replace [[:field 10 nil]
                               [:field 20 {:temporal-unit :month}]
                               [:field 30 nil]]
                 ;; don't replace anything that's already wrapping a `field-id`
                 [_ [:field-id & _] & _]
                 &match

                 [:field (id :guard id-is-datetime-field?) opts]
                 [:field id (assoc opts :temporal-unit :day)]))))))

(t/deftest ^:parallel match-one-test
  (t/is (= 6 (match/match-one [1 2 3]
               [a b c] (+ a b c))))
  (t/is (= 5 (match/match-one [1 :value1 4]
               [var1 :value1 var2] (+ var1 var2))))
  (t/is (= [1 2 [3 4 5]] (match/match-one [1 2 3 4 5]
                           [a b & rest] [a b rest])))
  (t/is (= 48 (match/match-one [2 4 6]
                [a (b :guard even?) c] (* a b c))))
  (t/is (= "matched odd"
           (match/match-one [1 3 5]
             [a (b :guard even?) c] "matched even"
             [a b c] "matched odd")))
  (t/is (= "fallback: not a vector"
           (match/match-one "not a vector"
             x (str "fallback: " x))))
  ;; Rest with guard
  (t/is (= "a=1 b=2 rest=[3 4 5]"
           (match/match-one [1 2 3 4 5]
             [a b & (rst :guard (> (count rst) 2))] (str "a=" a " b=" b " rest=" rst))))

  (t/testing "Edge cases"
    (t/testing "Empty collections"
      (t/is (= :empty-vec (match/match-one []
                            [] :empty-vec)))
      (t/is (= :empty-map (match/match-one {}
                            {} :empty-map))))
    (t/testing "Nil values"
      (t/is (= :nil-value (match/match-one nil
                            nil :nil-value
                            _ :not-nil))))
    (t/testing "Boolean values"
      (t/is (= :true-value (match/match-one true
                             true :true-value
                             false :false-value)))
      (t/is (= :false-value (match/match-one false
                              true :true-value
                              false :false-value))))))

(t/deftest ^:parallel match-one-or-syntax
  (t/is (= 10 (match/match-one [1 2 3]
                (:or [a] [a b] [a b c]) (* a 10))))
  (t/is (= nil (match/match-one [1 2 3]
                 (:or [(a :guard even?) b] [a (b :guard odd?)]) (* a b))))
  (t/testing ":or can mix with other patterns"
    (t/is (= 20 (match/match-one [1 2 3]
                  [a b c d] 10
                  (:or [a b] [a b c]) 20
                  _ 30))))
  (t/testing "doesn't break if same symbols are used for different bindings"
    (t/is (= 1 (match/match-one [1 2]
                 (:or [(a :guard even?) b]
                      [b a])
                 b)))))

(t/deftest ^:parallel match-one-and-syntax
  (t/is (= 10 (match/match-one [1 2 3]
                (:and [a b c] (_ :guard vector?)) (* a 10))))
  (t/is (= nil (match/match-one [1 2 3]
                 (:and [a b c] (_ :guard map?)) (* a 10))))
  (t/is (= nil (match/match-one [1 2 3]
                 (:and [a b] (_ :guard vector?)) (* a 10))))
  (t/is (= 6 (match/match-one [1 2 3]
               (:and [a b c] (v :guard vector?)) (reduce * 1 v))))
  (t/testing "later patterns can refer to earlier bindings"
    (t/is (= 20 (match/match-one [1 2 3]
                  (:and [a b c]
                        (_ :guard (and (odd? a) (even? b))))
                  (* a b 10))))))

(t/deftest ^:parallel match-one-map-syntax
  (t/is (= 200 (match/match-one {:a 10, :b 20}
                 {:a a, :b b} (* a b))))
  (t/is (= nil (match/match-one {:a 10}
                 {:a a, :b b} (* a b))))
  (t/testing "&truthy"
    (t/is (= 123 (match/match-one {:a 10}
                   {:a &truthy} 123)))
    (t/is (= nil (match/match-one {:b 20}
                   {:a &truthy} 123)))
    (t/is (= 123 (match/match-one {:a true}
                   {:a &truthy} 123)))
    (t/is (= nil (match/match-one {:a false}
                   {:a &truthy} 123)))
    (t/is (= nil (match/match-one {:a nil}
                   {:a &truthy} 123))))
  (t/testing "_"
    (t/is (= 123 (match/match-one {:a 10}
                   {:a _} 123)))
    (t/is (= nil (match/match-one {:b 20}
                   {:a _} 123)))
    (t/is (= 123 (match/match-one {:a true}
                   {:a _} 123)))
    (t/is (= 123 (match/match-one {:a false}
                   {:a _} 123)))))

(t/deftest ^:parallel same-result-with-different-bindings-test
  (t/testing "result here should not be treated as a common because it refers to different bindings in branches"
    (t/is (= 1 (match/match-one [1 2]
                 [(a :guard (odd? a)) (b :guard (even? b))] (- b a)
                 [(b :guard (even? b)) (a :guard (odd? a))] (- b a))))))

(t/deftest ^:parallel guard-predicate-test
  (t/is (= -2 (match/match-one [2]
                [(a :guard odd?)] a
                [(b :guard even?)] (- b))))
  (t/is (= -2 (match/match-one [2]
                [(a :guard (odd? a))] a
                [(b :guard (even? b))] (- b))))
  (t/is (= -2 (match/match-one [2]
                [(_ :guard odd?)] 1
                [(_ :guard even?)] -2)))
  (t/is (= 2 (match/match-one [{:b 2}]
               [(_ :guard :a)] 1
               [(_ :guard :b)] 2)))
  (t/is (= :ok (match/match-one [3]
                 [(_ :guard #{1 2 3})] :ok)))

  #?(:clj (t/is (thrown? clojure.lang.Compiler$CompilerException
                         (eval '(match/match-one [1]
                                  [(a :guard #(odd? %))] a)))))
  #?(:clj (t/is (thrown? clojure.lang.Compiler$CompilerException
                         (eval '(match/match-one [1]
                                  [(a :guard (fn [x] (odd? x)))] a))))))

(t/deftest ^:parallel return-nil-matches-test
  (t/testing "a clause can return nil and that is still considered a match"
    (t/is (= nil (match/match-one [:a nil]
                   [:a x] x
                   _ :default)))))

(t/deftest ^:parallel recur-test
  (t/testing "clause can choose to &recur the match with a different value"
    (t/is (= :inside (match/match-one [[[[[[:inside]]]]]]
                       [in] (&recur in)
                       _ &match)))))

(t/deftest ^:parallel match-many-test
  (t/is (= [6 15] (match/match-many [[1 2 3] [4 5 6]]
                    [a b c] (+ a b c))))
  (t/is (= [1 2 3 4 5 6] (match/match-many [[1 2 3] [4 5 6]]
                           (_ :guard number?) &match)))
  (t/is (= [100] (match/match-many [[1 2 3] [4 5 6]]
                   (_ :guard keyword?) &match
                   _ 100)))

  (t/testing "absent of matches returns nil"
    (t/is (= nil (match/match-many [[1 2 3] [4 5 6]]
                   (_ :guard keyword?) &match))))

  (t/testing "nils aren't recorded into the result"
    (t/is (= [15] (match/match-many [[1 2 3] [4 5 6]]
                    [a b c] (when (> a 1)
                              (+ a b c)))))))

(t/deftest ^:parallel parents-tests
  (t/is (= [:foo :bar :baz :qux]
           (match/match-one [:foo [:bar [:baz {:qux 42}]]]
             42 &parents)))
  (t/is (= [[:foo :bar :baz :qux]
            [:foo :bar :baz :corge]]
           (match/match-many [:foo [:bar [:baz {:qux 42 :corge 42}]]]
             42 &parents))))
