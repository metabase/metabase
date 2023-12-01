(ns metabase.lib.expression-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

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
          (-> lib.tu/venues-query
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
                         [(lib/+ 1.1 2 int-field) :type/Number
                          (lib/- 1.1 2 int-field) :type/Number
                          (lib/* 1.1 2 int-field) :type/Number
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
                          (lib/regexextract string-field "abc") :type/Text
                          (lib/length string-field) :type/Integer
                          (lib/trim string-field) :type/Text
                          (lib/rtrim string-field) :type/Text
                          (lib/ltrim string-field) :type/Text
                          (lib/upper string-field) :type/Text
                          (lib/lower string-field) :type/Text])]
      (testing (str "expression: " (pr-str expr))
        (let [query (-> lib.tu/venues-query
                        (lib/expression "myexpr" expr))
              resolved (lib.expression/resolve-expression query 0 "myexpr")]
          (testing (pr-str resolved)
            (is (mc/validate ::lib.schema/query query))
            (is (= typ (lib.schema.expression/type-of resolved)))))))))

(deftest ^:parallel col-info-expression-ref-test
  (is (=? {:base-type    :type/Integer
           :name         "double-price"
           :display-name "double-price"
           :lib/source   :source/expressions}
          (lib/metadata
            (-> lib.tu/venues-query
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
           (lib/column-name lib.tu/venues-query -1 clause)))
    (is (= "Date - 1 day"
           (lib/display-name lib.tu/venues-query -1 clause)))))

(deftest ^:parallel expression-reference-names-test
  (let [query (-> lib.tu/venues-query
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
           (lib/column-name lib.tu/venues-query -1 clause)))
    (is (= "Name"
           (lib/display-name lib.tu/venues-query -1 clause)))))

(defn- infer-first
  [expr]
  (lib/metadata
    (-> lib.tu/venues-query
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
           (-> lib.tu/venues-query
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
            (-> lib.tu/venues-query
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
                   1.0 :type/Number)
                 (lib/type-of lib.tu/venues-query clause)))))
      (testing "/ should always return type/Float"
        (doseq [arg-2 [1 1.0]
                :let  [clause [:/ {:lib/uuid (str (random-uuid))} field arg-2]]]
          (testing (str \newline (pr-str clause))
            (is (= :type/Float
                   (lib.schema.expression/type-of clause)))
            (is (= :type/Float
                   (lib/type-of lib.tu/venues-query clause)))))))))

(deftest ^:parallel expressions-names-test
  (testing "expressions should include the original expression name"
    (is (=? [{:name         "expr"
              :display-name "expr"}]
            (-> lib.tu/venues-query
                (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                lib/expressions-metadata)))
    (is (=? [{:display-name "expr"
              :named? true}]
            (-> lib.tu/venues-query
                (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                lib/expressions
                (->> (map (fn [expr] (lib/display-info lib.tu/venues-query expr))))))))
  (testing "collisions with other column names are detected and rejected"
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
          (-> lib.tu/venues-query
              (lib/expression "expr" 100)
              (lib/expressions-metadata))))
  (is (=? [[:value {:lib/expression-name "expr" :effective-type :type/Integer} 100]]
          (-> lib.tu/venues-query
              (lib/expression "expr" 100)
              (lib/expressions))))
  (is (=? [[:value {:lib/expression-name "expr" :effective-type :type/Text} "value"]]
          (-> lib.tu/venues-query
              (lib/expression "expr" "value")
              (lib/expressions)))))

(deftest ^:parallel expressionable-columns-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
                  (lib/expression "a" 1)
                  (lib/expression "b" 2))
        expressionable-expressions-for-position (fn [pos]
                                                  (some->> (lib/expressionable-columns query pos)
                                                           (map :lib/desired-column-alias)))]
    (is (= ["ID" "NAME"] (expressionable-expressions-for-position 0)))
    (is (= ["ID" "NAME" "a"] (expressionable-expressions-for-position 1)))
    (is (= ["ID" "NAME" "a" "b"] (expressionable-expressions-for-position nil)))
    (is (= ["ID" "NAME" "a" "b"] (expressionable-expressions-for-position 2)))
    (is (= (lib/visible-columns query)
           (lib/expressionable-columns query nil)))))

(deftest ^:parallel infix-display-name-with-expressions-test
  (testing "#32063"
    (let [query (lib/query lib.tu/metadata-provider-with-mock-cards (:orders lib.tu/mock-cards))
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
                          lib.tu/venues-query
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
      ;; TODO: There should probably be a (lib/join-alias join) ;=> "Products" function.
      (is (=? [[:< {:lib/expression-name "bad_product"}
                [:field {:join-alias (:alias join)} (meta/id :products :rating)]
                3]]
              (lib/expressions query)))
      (is (= 1 (count (lib/joins query))))

      (let [dropped (lib/remove-join query join)]
        (is (empty? (lib/joins dropped)))
        (is (empty? (lib/expressions dropped)))))))

(deftest ^:parallel with-expression-name-test
  (let [query       (-> lib.tu/venues-query
                        (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                        (lib/aggregate (lib/count)))
        [orig-expr] (lib/expressions query)
        expr        (lib/with-expression-name orig-expr "newly-named-expression")
        [orig-agg]  (lib/aggregations query)
        agg         (lib/with-expression-name orig-agg "my count")]
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
                (lib.options/uuid agg))))))
