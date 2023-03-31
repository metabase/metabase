(ns metabase.lib.expression-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.core :as lib]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as schema.common]
   [metabase.lib.schema.expression :as schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(comment lib/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel expression-test
  (is (=? {:lib/type :mbql/query,
           :database (meta/id) ,
           :type :pipeline,
           :stages [{:lib/type :mbql.stage/mbql,
                     :source-table (meta/id :venues) ,
                     :lib/options {:lib/uuid string?},
                     :expressions {"myadd" [:+ {:lib/uuid string?}
                                            1
                                            [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]]}}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/expression "myadd" (lib/+ 1 (lib/field "VENUES" "CATEGORY_ID")))
              (dissoc :lib/metadata)))))

(deftest ^:parallel expression-validation-tests
  (let [int-field (lib/field "VENUES" "CATEGORY_ID")
        string-field (lib/field "VENUES" "NAME")
        float-field (lib/field "VENUES" "LATITUDE")
        dt-field (lib/field "USERS" "LAST_LOGIN")
        #_#_boolean-field (lib/->= 1 (lib/field "VENUES" "CATEGORY_ID"))]
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
                          (lib/power int-field float-field) :type/Number
                          (lib/interval 1 :month) :type/Integer ;; Need an interval type
                          #_#_(lib/relative-datetime "2020-01-01" :default) :type/DateTime
                          (lib/time "08:00:00" :hour) :type/TimeWithTZ
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
        (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                        (lib/expression "myexpr" expr))
              resolved (lib.expression/resolve-expression query 0 "myexpr")]
          (is (mc/validate ::lib.schema/query query))
          (is (mc/validate ::schema.common/external-op resolved))
          (is (= typ (schema.expression/type-of resolved))))))))

(deftest ^:parallel col-info-expression-ref-test
  (is (=? {:base_type    :type/Integer
           :name         "double-price"
           :display_name "double-price"
           :lib/source   :source/expressions}
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
              :lib/source   :source/expressions}]
            (lib.metadata.calculation/metadata query)))))

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
                 :display_name "expr"}
                (infer-first [:coalesce {:lib/uuid (str (random-uuid))} "bar" (lib.tu/field-clause :venues :name)])))))))

(deftest ^:parallel infer-case-test
  (testing "Case"
    (testing "Uses first available type information"
      (testing "From a field"
        (is (=? {:name         "expr"
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
           :lib/source   :source/expressions}
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

(deftest ^:parallel expressions-names-test
  (testing "expressions should include the original expression name"
    (is (=? [{:name         "expr"
              :display_name "expr"}]
            (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                lib/expressions)))))
