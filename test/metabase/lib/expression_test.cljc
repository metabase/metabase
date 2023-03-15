(ns metabase.lib.expression-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.expression]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(comment lib/keep-me
         metabase.lib.expression/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel col-info-expression-ref-test
  (is (=? {:base_type    :type/Integer
           :name         "double-price"
           :display_name "double-price"
           :field_ref    [:expression {:lib/uuid string?} "double-price"]}
          (lib.metadata.calculation/metadata
           (lib.tu/venues-query-with-last-stage
            {:expressions {"double-price" [:*
                                           {:lib/uuid (str (random-uuid))}
                                           (lib.tu/field-clause :venues :price {:base-type :type/Integer})
                                           2]}})
           -1
           [:expression {:lib/uuid (str (random-uuid))} "double-price"]))))

(deftest ^:parallel expression-references-in-fields-clause-test
  (let [query (lib.tu/venues-query-with-last-stage
               {:expressions {"prev_month" [:+
                                            {:lib/uuid (str (random-uuid))}
                                            (lib.tu/field-clause :users :last-login)
                                            [:interval {:lib/uuid (str (random-uuid))} -1 :month]]}
                :fields      [[:expression {:base-type :type/DateTime, :lib/uuid (str (random-uuid))} "prev_month"]]})]
    (is (=? [{:name         "prev_month"
              :display_name "prev_month"
              :base_type    :type/DateTime
              :source       :fields
              :field_ref    [:expression {:lib/uuid string?} "prev_month"]}]
            (lib.metadata.calculation/metadata query -1 query)))))

(deftest ^:parallel date-interval-names-test
  (let [clause [:datetime-add
                {}
                (lib.tu/field-clause :checkins :date {:base-type :type/Date})
                -1
                :day]]
    (is (= "date_minus_1_day"
           (lib.metadata.calculation/column-name lib.tu/venues-query -1 clause)))
    (is (= "Date - 1 day"
           (lib.metadata.calculation/display-name lib.tu/venues-query -1 clause)))))

(deftest ^:parallel expression-reference-names-test
  (let [query (assoc-in lib.tu/venues-query
                        [:stages 0 :expressions "double-price"]
                        [:*
                         {:lib/uuid (str (random-uuid))}
                         (lib.tu/field-clause :venues :price {:base-type :type/Integer})
                         2])
        expr  [:sum
               {:lib/uuid (str (random-uuid))}
               [:expression {:lib/uuid (str (random-uuid))} "double-price"]]]
    (is (= "Sum of double-price"
           (lib.metadata.calculation/display-name query -1 expr)))
    (is (= "sum_double-price"
           (lib.metadata.calculation/column-name query -1 expr)))))

(deftest ^:parallel coalesce-names-test
  (let [clause [:coalesce {} (lib.tu/field-clause :venues :name) "<Venue>"]]
    (is (= "name"
           (lib.metadata.calculation/column-name lib.tu/venues-query -1 clause)))
    (is (= "Name"
           (lib.metadata.calculation/display-name lib.tu/venues-query -1 clause)))))

(defn- infer-first
  ([expr]
   (infer-first expr nil))

  ([expr last-stage]
   (lib.metadata.calculation/metadata
    (lib.tu/venues-query-with-last-stage
     (merge
      {:expressions {"expr" expr}}
      last-stage))
    -1
    [:expression {:lib/uuid (str (random-uuid))} "expr"])))

(deftest ^:parallel infer-coalesce-test
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the field"
        (is (=? {:name         "expr"
                 :field_ref    [:expression {} "expr"]
                 :display_name "expr"
                 :base_type    :type/Text}
                (infer-first [:coalesce
                              {:lib/uuid (str (random-uuid))}
                              (lib.tu/field-clause :venues :name)
                              "bar"])))
        (testing "Does not contain a field id in its analysis (#18513)"
          (is (not (contains? (infer-first [:coalesce {:lib/uuid (str (random-uuid))} (lib.tu/field-clause :venues :name) "bar"])
                              :id)))))
      (testing "Gets the type information from the literal"
        (is (=? {:base_type    :type/Text
                 :name         "expr"
                 :display_name "expr"
                 :field_ref    [:expression {} "expr"]}
                (infer-first [:coalesce {:lib/uuid (str (random-uuid))} "bar" (lib.tu/field-clause :venues :name)])))))))

(deftest ^:parallel infer-case-test
  (testing "Case"
    (testing "Uses first available type information"
      (testing "From a field"
        (is (=? {:name         "expr"
                 :field_ref    [:expression {} "expr"]
                 :display_name "expr"
                 :base_type    :type/Text}
                (infer-first [:coalesce
                              {:lib/uuid (str (random-uuid))}
                              (lib.tu/field-clause :venues :name)
                              "bar"])))
        (testing "does not contain a field id in its analysis (#17512)"
          (is (false?
               (contains? (infer-first [:coalesce {:lib/uuid (str (random-uuid))} (lib.tu/field-clause :venues :name) "bar"])
                          :id))))))))

(deftest ^:parallel col-info-for-temporal-expression-test
  (is (=? {:base_type    :type/DateTime
           :name         "last-login-plus-2"
           :display_name "last-login-plus-2"
           :field_ref    [:expression {} "last-login-plus-2"]}
          (lib.metadata.calculation/metadata
           (lib.tu/venues-query-with-last-stage
            {:expressions {"last-login-plus-2" [:datetime-add
                                                {:lib/uuid (str (random-uuid))}
                                                (lib.tu/field-clause :users :last-login {:base-type :type/DateTime})
                                                2
                                                :hour]}})
           -1
           [:expression {:lib/uuid (str (random-uuid))} "last-login-plus-2"]))))

(deftest ^:parallel col-info-for-expression-error-message-test
  (testing "if there is no matching expression it should give a meaningful error message"
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"No expression named \"double-price\""
         (lib.metadata.calculation/metadata
          (lib.tu/venues-query-with-last-stage
           {:expressions {"one-hundred" 100}})
          -1
          [:expression {:lib/uuid (str (random-uuid))} "double-price"])))))
