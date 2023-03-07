(ns metabase.lib.metadata.calculate.type-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.metadata.calculate.type :as calculate.type]
   [metabase.lib.test-metadata :as meta]))

(def ^:private venues-query
  {:lib/type     :mbql/query
   :lib/metadata meta/metadata-provider
   :type         :pipeline
   :database     (meta/id)
   :stages       [{:lib/type     :mbql.stage/mbql
                   :lib/options  {:lib/uuid (str (random-uuid))}
                   :source-table (meta/id :venues)}]})

(defn- field-clause
  ([table field]
   (field-clause table field nil))
  ([table field options]
   [:field (merge {:lib/uuid (str (random-uuid))} options) (meta/id table field)]))

(defn- base-type [expr]
  (calculate.type/base-type venues-query -1 expr))

(deftest ^:parallel aggregation-test
  (are [ag expected] (= expected
                        (base-type ag))
    [:/ {} [:count {}] 2]
    :type/Float

    [:sum {} [:+ {} (field-clause :venues :price) 1]]
    :type/Integer

    [:sum {} (field-clause :venues :price)]
    :type/Integer

    ;; `:base-type` in options
    [:sum {:base-type :type/BigInteger} (field-clause :venues :price)]
    :type/BigInteger))

(deftest ^:parallel expression-reference-test
  (let [query (assoc-in venues-query
                        [:stages 0 :expressions "double-price"]
                        [:*
                         {:lib/uuid (str (random-uuid))}
                         (field-clause :venues :price {:base-type :type/Integer})
                         2])
        expr  [:sum
               {:lib/uuid (str (random-uuid))}
               [:expression {:lib/uuid (str (random-uuid))} "double-price"]]]
    (is (= :type/Integer
           (calculate.type/base-type query -1 expr)))))

(deftest ^:parallel coalesce-test
  (is (= :type/Text
         (base-type [:coalesce {} (field-clause :venues :name) "bar"]))))

(deftest ^:parallel case-test
  (are [expr expected] (= expected
                          (base-type expr))
    [:case
     {}
     [[[:> {} (field-clause :venues :price) 2]
       "big"]]]
    :type/Text

    [:case {} [[[:> {} (field-clause :venues :price) 2]
                [:+ {} (field-clause :venues :price) 1]]]]
    :type/Integer

    ;; Make sure we skip nils when infering case return type
    [:case {} [[[:<
                 {}
                 (field-clause :venues :price)
                 10]
                nil]
               [[:> {} (field-clause :venues :price) 2] 10]]]
    :type/Integer

    [:case {} [[[:>
                 {}
                 (field-clause :venues :price)
                 2]
                [:+
                 {}
                 (field-clause :venues :price)
                 1]]]]
    :type/Integer))

(deftest ^:parallel temporal-extract-test
  (are [clause expected] (= expected
                   (base-type clause))
    [:datetime-add {} (field-clause :checkins :date) 2 :month]    :type/Date
    [:datetime-add {} (field-clause :checkins :date) 2 :hour]     :type/Date
    [:datetime-add {} (field-clause :users :last-login) 2 :month] :type/DateTime))

(deftest ^:parallel test-string-extracts
  (are [clause expected] (= expected
                            (base-type clause))
    [:trim {} "foo"]                                  :type/Text
    [:ltrim {} "foo"]                                 :type/Text
    [:rtrim {} "foo"]                                 :type/Text
    [:length {} "foo"]                                :type/Integer
    [:upper {} "foo"]                                 :type/Text
    [:lower {} "foo"]                                 :type/Text
    [:substring {} "foo" 2]                           :type/Text
    [:replace {} "foo" "f" "b"]                       :type/Text
    [:regex-match-first {} "foo" "f"]                 :type/Text
    [:concat {} "foo" "bar"]                          :type/Text
    [:coalesce {} "foo" "bar"]                        :type/Text
    [:coalesce {} (field-clause :venues :name) "bar"] :type/Text))

(deftest ^:parallel temporal-arithmetic-test
  (are [operator] (= :type/DateTime
                     (base-type [operator
                                 {}
                                 (field-clause :users :last-login)
                                 [:interval {} -1 :month]]))
    :+
    :-)
  (testing "expression references"
    (let [query (assoc-in venues-query [:stages 0 :expressions "expr"] [:+
                                                                        {}
                                                                        (field-clause :users :last-login)
                                                                        [:interval {} -1 :month]])]
      (is (= :type/DateTime
             (calculate.type/base-type query -1 [:expression {} "expr"]))))))
