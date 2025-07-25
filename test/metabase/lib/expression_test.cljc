(ns metabase.lib.expression-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is are testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli.registry :as mr]
   [metabase.util.number :as u.number]))

(comment lib/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel expression-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages [{:lib/type :mbql.stage/mbql
                     :source-table (meta/id :venues)
                     :expressions [[:+ {:lib/uuid string? :lib/expression-name "myadd"}
                                    1
                                    [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]]]}]}
          (-> (lib.tu/venues-query)
              (lib/expression "myadd" (lib/+ 1 (meta/field-metadata :venues :category-id)))
              (dissoc :lib/metadata)))))

(deftest ^:parallel expression-validation-tests
  (let [int-field (meta/field-metadata :venues :category-id)
        string-field (meta/field-metadata :venues :name)
        float-field (meta/field-metadata :venues :latitude)
        dt-field (meta/field-metadata :users :last-login)
        #_#_boolean-field (lib/->= 1 (meta/field-metadata :venues :category-id))]
    (doseq [[expr typ] (partition-all
                        2
                        [(lib/+ 1.1 2 int-field) :type/Float
                         (lib/- 1.1 2 int-field) :type/Float
                         (lib/* 1.1 2 int-field) :type/Float
                         (lib// 1.1 2 int-field) :type/Float
                         #_#_(lib/case boolean-field int-field boolean-field int-field) :type/Integer
                         (lib/coalesce string-field "abc") :type/Text
                         (lib/abs int-field) :type/Integer
                         (lib/log int-field) :type/Float
                         (lib/exp int-field) :type/Float
                         (lib/sqrt int-field) :type/Float
                         (lib/ceil float-field) :type/Integer
                         (lib/floor float-field) :type/Integer
                         (lib/round float-field) :type/Integer
                         (lib/power int-field float-field) :type/Float
                         (lib/interval 1 :month) :type/Interval
                         #_#_(lib/relative-datetime "2020-01-01" :default) :type/DateTime
                         (lib/time "08:00:00" :hour) :type/Time
                         #_#_(lib/absolute-datetime "2020-01-01" :default) :type/DateTimeWithTZ
                         (lib/now) :type/DateTimeWithTZ
                         (lib/convert-timezone dt-field "US/Pacific" "US/Eastern") :type/DateTime
                         #_#_(lib/get-week dt-field :iso) :type/Integer
                         (lib/get-year dt-field) :type/Integer
                         (lib/get-month dt-field) :type/Integer
                         (lib/get-day dt-field) :type/Integer
                         (lib/get-hour dt-field) :type/Integer
                         (lib/get-minute dt-field) :type/Integer
                         (lib/get-second dt-field) :type/Integer
                         (lib/get-quarter dt-field) :type/Integer
                         (lib/datetime-add dt-field 1 :month) :type/DateTime
                         (lib/datetime-subtract dt-field 1 :month) :type/DateTime
                         #_#_(lib/concat string-field "abc") :type/Text
                         (lib/substring string-field 0 10) :type/Text
                         (lib/replace string-field "abc" "def") :type/Text
                         (lib/regex-match-first string-field "abc") :type/Text
                         (lib/length string-field) :type/Integer
                         (lib/trim string-field) :type/Text
                         (lib/rtrim string-field) :type/Text
                         (lib/ltrim string-field) :type/Text
                         (lib/upper string-field) :type/Text
                         (lib/lower string-field) :type/Text])]
      (testing (str "expression: " (pr-str expr))
        (let [query (-> (lib.tu/venues-query)
                        (lib/expression "myexpr" expr))
              resolved (lib.expression/resolve-expression query 0 "myexpr")]
          (testing (pr-str resolved)
            (is (mr/validate ::lib.schema/query query))
            (is (= typ (lib.schema.expression/type-of resolved)))))))))

(deftest ^:parallel col-info-expression-ref-test
  (is (=? {:base-type    :type/Integer
           :name         "double-price"
           :display-name "double-price"
           :lib/source   :source/expressions}
          (lib/metadata
           (-> (lib.tu/venues-query)
               (lib/expression "double-price"
                               (lib/* (lib.tu/field-clause :venues :price {:base-type :type/Integer}) 2)))
           -1
           [:expression {:lib/uuid (str (random-uuid))} "double-price"]))))

(deftest ^:parallel expression-references-in-fields-clause-test
  (let [query (lib.tu/venues-query-with-last-stage
               {:expressions [[:+
                               {:lib/uuid (str (random-uuid))
                                :lib/expression-name "prev_month"}
                               (lib.tu/field-clause :users :last-login)
                               [:interval {:lib/uuid (str (random-uuid))} -1 :month]]]
                :fields      [[:expression {:base-type :type/DateTime, :lib/uuid (str (random-uuid))} "prev_month"]]})]
    (is (=? [{:name         "prev_month"
              :display-name "prev_month"
              :base-type    :type/DateTime
              :lib/source   :source/expressions}]
            (lib/returned-columns query)))))

(deftest ^:parallel date-interval-names-test
  (let [clause [:datetime-add
                {}
                (lib.tu/field-clause :checkins :date {:base-type :type/Date})
                -1
                :day]]
    (is (= "DATE_minus_1_day"
           (lib/column-name (lib.tu/venues-query) -1 clause)))
    (is (= "Date - 1 day"
           (lib/display-name (lib.tu/venues-query) -1 clause)))))

(deftest ^:parallel expression-reference-names-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "double-price"
                                  (lib/*
                                   (lib.tu/field-clause :venues :price {:base-type :type/Integer})
                                   2)))
        expr  [:sum
               {:lib/uuid (str (random-uuid))}
               [:expression {:lib/uuid (str (random-uuid))} "double-price"]]]
    (is (= "Sum of double-price"
           (lib/display-name query -1 expr)))
    (is (= "sum"
           (lib/column-name query -1 expr)))))

(deftest ^:parallel coalesce-names-test
  (let [clause [:coalesce {} (lib.tu/field-clause :venues :name) "<Venue>"]]
    (is (= "NAME"
           (lib/column-name (lib.tu/venues-query) -1 clause)))
    (is (= "Name"
           (lib/display-name (lib.tu/venues-query) -1 clause)))))

(defn- infer-first
  [expr]
  (lib/metadata
   (-> (lib.tu/venues-query)
       (lib/expression "expr" expr))
   -1
   [:expression {:lib/uuid (str (random-uuid))} "expr"]))

(deftest ^:parallel infer-coalesce-test
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the field"
        (is (=? {:name         "expr"
                 :display-name "expr"
                 :base-type    :type/Text}
                (infer-first [:coalesce
                              {:lib/uuid (str (random-uuid))}
                              (lib.tu/field-clause :venues :name)
                              "bar"])))
        (testing "Does not contain a field id in its analysis (#18513)"
          (is (not (contains? (infer-first [:coalesce {:lib/uuid (str (random-uuid))} (lib.tu/field-clause :venues :name) "bar"])
                              :id)))))
      (testing "Gets the type information from the literal"
        (is (=? {:base-type    :type/Text
                 :name         "expr"
                 :display-name "expr"}
                (infer-first [:coalesce {:lib/uuid (str (random-uuid))} "bar" (lib.tu/field-clause :venues :name)])))))))

(deftest ^:parallel infer-case-test
  (testing "Case"
    (testing "Uses first available type information"
      (testing "From a field"
        (is (=? {:name         "expr"
                 :display-name "expr"
                 :base-type    :type/Text}
                (infer-first [:coalesce
                              {:lib/uuid (str (random-uuid))}
                              (lib.tu/field-clause :venues :name)
                              "bar"])))
        (testing "does not contain a field id in its analysis (#17512)"
          (is (false?
               (contains? (infer-first [:coalesce {:lib/uuid (str (random-uuid))} (lib.tu/field-clause :venues :name) "bar"])
                          :id))))))))

(deftest ^:parallel col-info-for-temporal-expression-test
  (is (=? {:base-type    :type/DateTime
           :name         "last-login-plus-2"
           :display-name "last-login-plus-2"
           :lib/source   :source/expressions}
          (lib/metadata
           (-> (lib.tu/venues-query)
               (lib/expression "last-login-plus-2"
                               [:datetime-add
                                {:lib/uuid (str (random-uuid))}
                                (lib.tu/field-clause :users :last-login {:base-type :type/DateTime})
                                2
                                :hour]))
           -1
           [:expression {:lib/uuid (str (random-uuid))} "last-login-plus-2"]))))

(deftest ^:parallel col-info-for-expression-error-message-test
  (testing "if there is no matching expression it should give a meaningful error message"
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"No expression named \"double-price\""
         (lib/metadata
          (-> (lib.tu/venues-query)
              (lib/expression "one-hundred" (lib/+ 100 0)))
          -1
          [:expression {:lib/uuid (str (random-uuid))} "double-price"])))))

(deftest ^:parallel arithmetic-expression-type-of-test
  (testing "Make sure we can calculate correct type information for arithmetic expression"
    (let [field [:field {:lib/uuid (str (random-uuid))} (meta/id :venues :id)]]
      (testing "+, -, and * should return common ancestor type of all args")
      (doseq [tag   [:+ :- :*]
              arg-2 [1 1.0]
              :let  [clause [tag {:lib/uuid (str (random-uuid))} field arg-2]]]
        (testing (str \newline (pr-str clause))
          (testing "assume :type/Number for refs with unknown types (#29946)"
            (is (= :type/Number
                   (lib.schema.expression/type-of clause))))
          (is (= (condp = arg-2
                   1   :type/Integer
                   1.0 :type/Float)
                 (lib/type-of (lib.tu/venues-query) clause)))))
      (testing "/ should always return type/Float"
        (doseq [arg-2 [1 1.0]
                :let  [clause [:/ {:lib/uuid (str (random-uuid))} field arg-2]]]
          (testing (str \newline (pr-str clause))
            (is (= :type/Float
                   (lib.schema.expression/type-of clause)))
            (is (= :type/Float
                   (lib/type-of (lib.tu/venues-query) clause)))))))))

(deftest ^:parallel expressions-names-test
  (testing "expressions should include the original expression name"
    (is (=? [{:name         "expr"
              :display-name "expr"}]
            (-> (lib.tu/venues-query)
                (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                lib/expressions-metadata)))
    (is (=? [{:display-name "expr"
              :named? true}]
            (-> (lib.tu/venues-query)
                (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                lib/expressions
                (->> (map (fn [expr] (lib/display-info (lib.tu/venues-query) expr))))))))
  ;; TODO: This logic was removed as part of fixing #39059. We might want to bring it back for collisions with other
  ;; expressions in the same stage; probably not with tables or earlier stages. De-duplicating names is supported by the
  ;; QP code, and it should be powered by MLv2 in due course.
  #_(testing "collisions with other column names are detected and rejected"
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :categories))
            ex    (try
                    (lib/expression query "ID" (meta/field-metadata :categories :name))
                    nil
                    (catch #?(:clj clojure.lang.ExceptionInfo :cljs js/Error) e
                      e))]
        (is (some? ex)
            "Expected adding a conflicting expression to throw")
        (is (= "Expression name conflicts with a column in the same query stage"
               (ex-message ex)))
        (is (= {:expression-name "ID"}
               (ex-data ex))))))

(deftest ^:parallel literal-expression-test
  (is (=? [{:lib/type :metadata/column,
            :base-type :type/Integer,
            :name "expr",
            :display-name "expr",
            :lib/source :source/expressions}]
          (-> (lib.tu/venues-query)
              (lib/expression "expr" 100)
              (lib/expressions-metadata))))
  (is (=? [[:value {:lib/expression-name "expr", :effective-type :type/Integer} 100]]
          (-> (lib.tu/venues-query)
              (lib/expression "expr" 100)
              (lib/expressions))))
  (is (=? [[:value {:lib/expression-name "expr", :effective-type :type/Text} "value"]]
          (-> (lib.tu/venues-query)
              (lib/expression "expr" "value")
              (lib/expressions))))
  (is (=? [[:value {:lib/expression-name "expr", :effective-type :type/Float} 1.23]]
          (-> (lib.tu/venues-query)
              (lib/expression "expr" 1.23)
              (lib/expressions))))
  (is (=? [[:value {:lib/expression-name "expr", :effective-type :type/Boolean} false]]
          (-> (lib.tu/venues-query)
              (lib/expression "expr" false)
              (lib/expressions)))))

(deftest ^:parallel expressionable-columns-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
                  (lib/expression "a" 1)
                  (lib/expression "b" 2))
        expressionable-expressions-for-position (fn [pos]
                                                  (some->> (lib/expressionable-columns query pos)
                                                           (map :lib/source-column-alias)))]
    ;; Because of (the second problem in) #44584, the expression-position argument is ignored,
    ;; so the first two calls behave the same as the last two.
    (is (= ["ID" "NAME" "b"] (expressionable-expressions-for-position 0)))
    (is (= ["ID" "NAME" "a"] (expressionable-expressions-for-position 1)))
    (is (= ["ID" "NAME" "a" "b"] (expressionable-expressions-for-position nil)))
    (is (= ["ID" "NAME" "a" "b"] (expressionable-expressions-for-position 2)))
    (is (= (lib/visible-columns query)
           (lib/expressionable-columns query nil)))))

(deftest ^:parallel expressions-cannot-contain-aggregation-functions
  (testing "expressions should not contain aggregation function calls (#41344)"
    (let [mp lib.tu/metadata-provider-with-metric
          query (lib/query mp (meta/table-metadata :checkins))
          user-id-col (meta/field-metadata :checkins :user-id)]
      (testing "Single arg functions"
        (are [f] #?(:clj (thrown-with-msg? clojure.lang.ExceptionInfo #"non-aggregation expression"
                                           (lib/expression query "expr" (f user-id-col)))
                    :cljs (false? (mr/validate ::lib.schema/query (lib/expression query "expr" (f user-id-col)))))
          lib/avg
          lib/distinct
          lib/max
          lib/median
          lib/min
          lib/stddev
          lib/sum
          lib/cum-sum
          lib/var))
      (testing "Special functions and nesting"
        (are [e] #?(:clj (thrown-with-msg? clojure.lang.ExceptionInfo #"non-aggregation expression"
                                           (lib/expression query "expr" e))
                    :cljs (false? (mr/validate ::lib.schema/query (lib/expression query "expr" e))))
          (lib/cum-count)
          (lib/count-where (lib/< user-id-col 2))
          (lib/distinct-where user-id-col (lib/< user-id-col 2))
          (lib/percentile user-id-col 0.75)
          (lib/share (lib/< user-id-col 2))
          (lib/sum-where user-id-col (lib/< user-id-col 2))
          (lib/* 2 (lib.metadata/metric mp 1))
          (lib/- (lib/* 100 (lib/count)) 42)
          (lib/* 100 (lib/offset user-id-col -1)))))))

(deftest ^:parallel infix-display-name-with-expressions-test
  (testing "#32063"
    (let [query (lib/query (lib.tu/metadata-provider-with-mock-cards) (:orders (lib.tu/mock-cards)))
          query (-> query
                    (lib/expression "Unit price" (lib//
                                                  (lib.tu/field-literal-ref query "SUBTOTAL")
                                                  (lib.tu/field-literal-ref query "QUANTITY"))))]
      (is (= ["ID" "Subtotal" "Total" "Tax" "Discount" "Quantity" "Created At" "Product ID" "User ID" "Unit price"]
             (map (partial lib/display-name query)
                  (lib/returned-columns query)))))))

(deftest ^:parallel mixed-type-concat-expression-test
  (testing "#34150"
    (testing "various pemutations on venues"
      (let [query (reduce (fn [query [label expr]]
                            (lib/expression query -1 label expr))
                          (lib.tu/venues-query)
                          [["name+price" (lib/concat (meta/field-metadata :venues :name)
                                                     (meta/field-metadata :venues :price))]
                           ["$price"     (lib/concat "$" (meta/field-metadata :venues :price))]
                           ["latXlong"   (lib/concat (meta/field-metadata :venues :latitude)
                                                     " X "
                                                     (meta/field-metadata :venues :longitude))]])]
        (is (=? [{:name "name+price"}
                 {:name "$price"}
                 {:name "latXlong"}]
                (->> (lib/visible-columns query)
                     (filter (comp #{:source/expressions} :lib/source)))))))
    (testing "dates"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/expression "description"
                                      (lib/concat (meta/field-metadata :orders :total)
                                                  " on "
                                                  (meta/field-metadata :orders :quantity)
                                                  " as of "
                                                  (meta/field-metadata :orders :created-at))))]
        (is (=? [{:name "description"}]
                (->> (lib/visible-columns query)
                     (filter (comp #{:source/expressions} :lib/source)))))))))

(deftest ^:parallel removing-join-removes-dependent-custom-columns
  (testing "#14775 a custom column dependent on a join is dropped when the join is dropped"
    (let [base  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/join (lib/join-clause (meta/table-metadata :products)
                                               [(lib/= (meta/field-metadata :products :id)
                                                       (meta/field-metadata :orders :product-id))])))
          cols   (lib/returned-columns base)
          ;; Fetching the rating like this rather than (meta/field-metadata ...) so it has the join alias correctly.
          rating (m/find-first #(= (:id %) (meta/id :products :rating)) cols)
          query  (lib/expression base "bad_product" (lib/< rating 3))
          join   (first (lib/joins query))]
      ;; TODO: There should probably be a (lib/join-alias join) ;=> "Products" function. (#39368)
      (is (=? [[:< {:lib/expression-name "bad_product"}
                [:field {:join-alias (:alias join)} (meta/id :products :rating)]
                3]]
              (lib/expressions query)))
      (is (= 1 (count (lib/joins query))))

      (let [dropped (lib/remove-join query join)]
        (is (empty? (lib/joins dropped)))
        (is (empty? (lib/expressions dropped)))))))

(deftest ^:parallel with-expression-name-test
  (let [query         (-> (lib.tu/venues-query)
                          (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                          (lib/aggregate (lib/count))
                          (lib/filter (lib/< (meta/field-metadata :venues :price) 4)))
        [orig-expr]   (lib/expressions query)
        expr          (lib/with-expression-name orig-expr "newly-named-expression")
        [orig-agg]    (lib/aggregations query)
        agg           (lib/with-expression-name orig-agg "my count")
        [orig-filter] (lib/filters query)
        new-filter    (lib/with-expression-name orig-filter "my filter")]
    (testing "expressions should include the original expression name"
      (is (=? [{:name         "expr"
                :display-name "expr"}]
              (lib/expressions-metadata query))))
    (testing "expressions from the expressions query clause can be renamed"
      (is (= "newly-named-expression"
             (lib/display-name query expr)))
      (is (nil? (:display-name (lib.options/options expr))))
      (is (=? {:display-name "expr"
               :named? true}
              (lib/display-info query orig-expr)))
      (is (= "expr"
             (lib/display-name query orig-expr)))
      (is (=? {:display-name "newly-named-expression"
               :named? true}
              (lib/display-info query expr)))
      (is (= "newly-named-expression"
             (lib/display-name query expr)))
      (is (not= (lib.options/uuid orig-expr)
                (lib.options/uuid expr))))
    (testing "aggregation expressions can be renamed"
      (is (= "my count"
             (lib/display-name query agg)))
      (is (nil? (:lib/expression-name (lib.options/options agg))))
      (is (=? {:display-name "Count"
               :named? (symbol "nil #_\"key is not present.\"")}
              (lib/display-info query orig-agg)))
      (is (= "Count"
             (lib/display-name query orig-agg)))
      (is (=? {:display-name "my count"
               :named? true}
              (lib/display-info query agg)))
      (is (= "my count"
             (lib/display-name query agg)))
      (is (not= (lib.options/uuid orig-agg)
                (lib.options/uuid agg))))
    (testing "filter expressions can be renamed"
      (is (= "my filter"
             (lib/display-name query new-filter)))
      (is (nil? (:lib/expression-name (lib.options/options new-filter))))
      (is (=? {:display-name "Price is less than 4"
               :named? (symbol "nil #_\"key is not present.\"")}
              (lib/display-info query orig-filter)))
      (is (= "Price is less than 4"
             (lib/display-name query orig-filter)))
      (is (=? {:display-name "my filter"
               :named? true}
              (lib/display-info query new-filter)))
      (is (= "my filter"
             (lib/display-name query new-filter)))
      (is (not= (lib.options/uuid orig-filter)
                (lib.options/uuid new-filter))))))

(deftest ^:parallel simple-value-with-expression-name-test
  (testing "simple values can be named (#36459)"
    (let [expr (lib/with-expression-name 0 "zero")]
      (is (=? [:value {:name "zero", :display-name "zero", :effective-type :type/Integer} 0]
              expr))
      (is (= "zero" (lib/display-name (lib.tu/venues-query) expr))))))

(deftest ^:parallel diagnose-expression-test
  (testing "correct expression are accepted silently"
    (are [mode expr] (nil? (lib.expression/diagnose-expression
                            (lib.tu/venues-query) 0 mode
                            (lib.convert/->pMBQL expr)
                            #?(:clj nil :cljs js/undefined)))
      :expression  [:/ [:field 1 nil] 100]
      :aggregation [:sum [:field 1 {:base-type :type/Integer}]]
      :filter      [:= [:field 1 {:base-type :type/Integer}] 3])))

(deftest ^:parallel diagnose-expression-test-2
  (testing "type errors are reported"
    (are [mode expr] (=? {:message  "Types are incompatible."
                          :friendly true}
                         (lib.expression/diagnose-expression
                          (lib.tu/venues-query) 0 mode
                          (lib.convert/->pMBQL expr)
                          #?(:clj nil :cljs js/undefined)))
      :expression  [:/ [:field 1 {:base-type :type/Address}] 100]
        ;; To make this test case work, the aggregation schema has to be
        ;; tighter and not allow anything. That's a bigger piece of work,
        ;; because it makes expressions and aggregations mutually recursive
        ;; or requires a large amount of duplication.
      #_#_:aggregation [:sum [:is-empty [:field 1 {:base-type :type/Boolean}]]]
      :filter      [:sum [:field 1 {:base-type :type/Integer}]]
      :filter      [:value "not a boolean" {:base_type :type/Text}])))

(deftest ^:parallel diagnose-expression-test-3
  (testing "correct expression are accepted silently"
    (testing "editing expressions"
      (let [exprs (update-vals {"a" 1
                                "c" [:+ 0 1]
                                "b" [:+ [:expression "a"] [:expression "c"]]
                                "x" [:+ [:expression "b"] 1]
                                "s" [:+ [:expression "a"] [:expression "b"] [:expression "c"]]
                                "circular-c" [:+ [:expression "x"] 1]
                                "non-circular-c" [:+ [:expression "a"] 1]}
                               lib.convert/->pMBQL)
            query (reduce-kv (fn [query expr-name expr]
                               (lib/expression query 0 expr-name expr))
                             (lib.tu/venues-query)
                             exprs)
            expressions (lib/expressions query)
            c-pos (some (fn [[i e]]
                          (when (= (-> e lib.options/options :lib/expression-name) "c")
                            i))
                        (m/indexed expressions))]
        (is (= (count exprs) (count expressions)))
        (is (some? c-pos))
        (testing "no circularity problem"
          (are [mode expr]
               (nil? (lib.expression/diagnose-expression query 0 mode expr c-pos))
            :expression  (get exprs "non-circular-c")
            :aggregation (-> (get exprs "circular-c")
                             (assoc 3 (lib/count)))
            :filter      (assoc (get exprs "circular-c") 0 :=)))
        (testing "circular definition"
          (is (=? {:message "Cycle detected: c → x → b → c"}
                  (lib.expression/diagnose-expression query 0 :expression
                                                      (get exprs "circular-c")
                                                      c-pos))))))))

(deftest ^:parallel diagnose-expression-test-4-offset-not-allowed-in-expressions
  (testing "adding/editing an expression using offset is not allowed"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))]
      (is (=? {:message "OFFSET is not supported in custom columns"}
              (lib.expression/diagnose-expression query 0 :expression
                                                  (lib/offset (meta/field-metadata :orders :subtotal) -1)
                                                  nil))))))

(deftest ^:parallel diagnose-expression-test-5-offset-not-allowed-in-filters
  (testing "adding/editing a filter using offset is not allowed"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))]
      (is (=? {:message  "OFFSET is not supported in custom filters"
               :friendly true}
              (lib.expression/diagnose-expression query 0 :filter
                                                  (lib/< (lib/offset (meta/field-metadata :orders :subtotal) -1)
                                                         100)
                                                  nil))))))

(deftest ^:parallel diagnose-expression-literals-without-feature-support-test
  (testing "top-level literals are not allowed if the :expression-literals feature is not supported"
    (let [restricted-provider (meta/updated-metadata-provider update :features disj :expression-literals)
          query (lib/query restricted-provider (meta/table-metadata :orders))
          expr  (lib.expression/value true)]
      (doseq [mode [:expression :filter]]
        (is (=? {:message  "Standalone constants are not supported."
                 :friendly true}
                (lib.expression/diagnose-expression query 0 mode expr nil)))))))

(deftest ^:parallel diagnose-expression-literal-values-test
  (let [query     (lib/query meta/metadata-provider (meta/table-metadata :orders))
        int-expr  [:value 1 nil]
        str-expr  [:value "foo" nil]
        bool-expr [:value true nil]
        diagnose-expr (fn [mode expr]
                        (lib.expression/diagnose-expression query 0 mode (lib.convert/->pMBQL expr) nil))]
    (testing "valid literal expressions are accepted"
      (are [mode expr] (nil? (diagnose-expr mode expr))
        :expression  int-expr
        :expression  str-expr
        :expression  bool-expr
        :filter      bool-expr))
    (testing "invalid literal expressions are rejected when not suppressing type checks"
      (are [mode expr] (=? {:message "Types are incompatible."} (diagnose-expr mode expr))
        :filter str-expr
        :filter int-expr))))

(deftest ^:parallel diagnose-expression-nested-aggregation-test
  (let [query     (lib/query meta/metadata-provider (meta/table-metadata :orders))
        diagnose-expr (fn [expr]
                        (lib.expression/diagnose-expression query 0 :aggregation (lib.convert/->pMBQL expr) nil))]
    (testing "valid aggregation expressions are accepted"
      (are [expr] (nil? (diagnose-expr expr))
        [:avg [:field 1]]
        [:offset {:lib/uuid (str (random-uuid))} [:sum [:field 42]] 1]))
    (testing "invalid aggregation expressions are rejected"
      (are [expr culprit] (= (str "Embedding " culprit " in aggregation functions is not supported")
                             (:message (diagnose-expr expr)))
        [:sum [:avg [:field 1]]]                                                  "Average"
        [:min [:offset {:lib/uuid (str (random-uuid))} [:field 42] 1]]            "Offset"
        [:offset {:lib/uuid (str (random-uuid))} [:sum [:cum-sum [:field 42]]] 1] "CumulativeSum"))))

(deftest ^:parallel diagnose-expression-cyclic-aggregation-tests
  (testing "self loop"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/sum (meta/field-metadata :orders :total))))
          sum (->> (lib/aggregable-columns query nil)
                   (m/find-first (comp #{"sum"} :name)))
          expr-name "2*sum"
          query2 (lib/aggregate query (lib/with-expression-name (lib/* 2 sum) expr-name))
          expr (->> (lib/aggregable-columns query2 nil)
                    (m/find-first (comp #{expr-name} :name))
                    (lib/* 2))]
      (is (=? {:message (str "Cycle detected: " expr-name " → " expr-name)}
              (lib.expression/diagnose-expression query2 0 :aggregation expr 1))))))

(deftest ^:parallel date-and-time-string-literals-test-1-dates
  (are [types input] (= types (lib.schema.expression/type-of input))
    #{:type/Date :type/Text} "2024-07-02"))

(deftest ^:parallel date-and-time-string-literals-test-2-times
  (are [types input] (= types (lib.schema.expression/type-of input))
    ;; Times without time zones
    #{:type/Time :type/Text} "12:34:56.789"
    #{:type/Time :type/Text} "12:34:56"
    #{:type/Time :type/Text} "12:34"
    ;; Times in Zulu
    #{:type/Time :type/Text} "12:34:56.789Z"
    #{:type/Time :type/Text} "12:34:56Z"
    #{:type/Time :type/Text} "12:34Z"
    ;; Times with offsets
    #{:type/Time :type/Text} "12:34:56.789+07:00"
    #{:type/Time :type/Text} "12:34:56-03:00"
    #{:type/Time :type/Text} "12:34+02:03"))

(deftest ^:parallel date-and-time-string-literals-test-3-datetimes-with-T
  (are [types input] (= types (lib.schema.expression/type-of input))
    ;; DateTimes without time zones
    #{:type/DateTime :type/Text} "2024-07-02T12:34:56.789"
    #{:type/DateTime :type/Text} "2024-07-02T12:34:56"
    #{:type/DateTime :type/Text} "2024-07-02T12:34"
    ;; DateTimes in Zulu time
    #{:type/DateTime :type/Text} "2024-07-02T12:34:56.789Z"
    #{:type/DateTime :type/Text} "2024-07-02T12:34:56Z"
    #{:type/DateTime :type/Text} "2024-07-02T12:34Z"
    ;; DateTimes with offsets
    #{:type/DateTime :type/Text} "2024-07-02T12:34:56.789+07:00"
    #{:type/DateTime :type/Text} "2024-07-02T12:34:56-03:00"
    #{:type/DateTime :type/Text} "2024-07-02T12:34+02:03"))

(deftest ^:parallel date-and-time-string-literals-test-4-datetimes-without-T
  (are [types input] (= types (lib.schema.expression/type-of input))
    ;; DateTimes without time zones and no T
    #{:type/DateTime :type/Text} "2024-07-02 12:34:56.789"
    #{:type/DateTime :type/Text} "2024-07-02 12:34:56"
    #{:type/DateTime :type/Text} "2024-07-02 12:34"
    ;; DateTimes in Zulu time and no T
    #{:type/DateTime :type/Text} "2024-07-02 12:34:56.789Z"
    #{:type/DateTime :type/Text} "2024-07-02 12:34:56Z"
    #{:type/DateTime :type/Text} "2024-07-02 12:34Z"
    ;; DateTimes with offsets and no T
    #{:type/DateTime :type/Text} "2024-07-02 12:34:56.789+07:00"
    #{:type/DateTime :type/Text} "2024-07-02 12:34:56-03:00"
    #{:type/DateTime :type/Text} "2024-07-02 12:34+02:03"))

(deftest ^:parallel value-test
  (are [expected value] (=? expected (lib.expression/value value))
    [:value {:base-type :type/Text} "abc"]       "abc"
    [:value {:base-type :type/Integer} 123]      123
    [:value {:base-type :type/Boolean} false]    false
    [:value {:base-type :type/BigInteger} "123"] (u.number/bigint "123")))

(deftest ^:parallel coalese-type-test
  (testing "Should be able to calculate type info for :coalese with field refs without type info (#30397, QUE-147)"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))
          price (-> (lib/ref (meta/field-metadata :venues :price))
                    (lib.options/update-options dissoc :base-type :effective-type))]
      (are [expr expected-type] (= expected-type
                                   (lib.metadata.calculation/type-of query expr))
        (lib/coalesce price 1)
        :type/Integer

        ;; so apparently `:type/Float` is the common ancestor of `:type/Integer` and `:type/Float` as of #36558... I'm
        ;; certain this is wrong but I can't fix every single querying bug all at once. See Slack thread for more
        ;; discussion https://metaboat.slack.com/archives/C0645JP1W81/p1749169799757029
        (lib/coalesce price 1.01)
        :type/Float

        ;; this is still Integer on JS because Integers are stored as floats and thus 1.0 === 1
        (lib/coalesce price 1.0)
        #?(:clj  :type/Float
           :cljs :type/Integer)

        ;; 'pretend' that this returns `:type/DateTime` when it actually returns `:type/HasDate` --
        ;; see [[metabase.lib.schema.expression.conditional/case-coalesce-return-type]]
        (lib/coalesce (meta/field-metadata :people :created-at)  ; :type/DateTimeWithLocalTZ
                      (meta/field-metadata :people :birth-date)) ; :type/Date
        :type/DateTime))))

(deftest ^:parallel case-type-test
  (testing "Should be able to calculate type info for :case with field refs without type info (#30397, QUE-147)"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))
          price (-> (lib/ref (meta/field-metadata :venues :price))
                    (lib.options/update-options dissoc :base-type :effective-type))]
      (are [expr expected-type] (= expected-type
                                   (lib.metadata.calculation/type-of query expr))
        (lib/case
         [[(lib/= (meta/field-metadata :venues :name) "BBQ") price]
          [(lib/= (meta/field-metadata :venues :name) "Fusion") 500]]
          600)
        :type/Integer

        ;; see explanation in test above
        (lib/case
         [[(lib/= (meta/field-metadata :venues :name) "BBQ") price]
          [(lib/= (meta/field-metadata :venues :name) "Fusion") 500.01]]
          600)
        :type/Float

        ;; [:if ...] is allegedly an alias of [:case ...]
        (let [[_case & args] (lib/case
                              [[(lib/= (meta/field-metadata :venues :name) "BBQ") price]
                               [(lib/= (meta/field-metadata :venues :name) "Fusion") 500.0]]
                               "600")]
          (into [:if] args))
        :type/*

        ;; 'pretend' that this returns `:type/DateTime` when it actually returns `:type/HasDate` --
        ;; see [[metabase.lib.schema.expression.conditional/case-coalesce-return-type]]
        (lib/case
         [[(lib/= (meta/field-metadata :people :name) "A")
           (meta/field-metadata :people :created-at)]  ; :type/DateTimeWithLocalTZ
          [(lib/= (meta/field-metadata :people :name) "B")
           (meta/field-metadata :people :birth-date)]]) ; :type/Date
        :type/DateTime))))

(deftest ^:parallel case-type-of-test-47887
  (testing "Case expression with type/Date default value and type/DateTime case value has Date filter popover enabled (#47887)"
    (let [clause (lib/case
                  [[(lib/= (meta/field-metadata :people :name) "A")
                    (meta/field-metadata :people :created-at)]
                   [(lib/= (meta/field-metadata :people :name) "B")
                    (meta/field-metadata :people :birth-date)]])
          query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                    (lib/expression "expr" clause))]
      ;; 'pretend' that this returns `:type/DateTime` when it actually returns `:type/HasDate` --
      ;; see [[metabase.lib.schema.expression.conditional/case-coalesce-return-type]]
      (is (= :type/DateTime
             (lib/type-of query clause)))
      (let [col (m/find-first #(= (:name %) "expr")
                              (lib/filterable-columns query))]
        (assert (some? col))
        (is (lib.types.isa/date-or-datetime? col))))))
