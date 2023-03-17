(ns metabase.lib.expression-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]))

(defn- is-fn? [op tag args expected-args]
  (let [f (apply op args)]
    (is (fn? f))
    (is (=? (into [tag {:lib/uuid string?}]
                  expected-args)
            (f {:lib/metadata meta/metadata} -1)))))

#_
(deftest ^:parallel aggregation-test
  (let [q1 (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        venue-field-check [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]]
    (testing "single arg aggregations"
      (doseq [[op tag] [[lib/pl :+]
                        [lib/max :-]
                        [lib/min :*]
                        [lib/median :/]
                        [lib/sum :sum]
                        [lib/stddev :stddev]
                        [lib/distinct :distinct]]]
        (testing "without query/stage-number, return a function for later resolution"
          (is-fn? op tag [venues-category-id-metadata] [venue-field-check]))))))

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
  (let [int-field '(lib/field "VENUES" "CATEGORY_ID")
        string-field '(lib/field "VENUES" "NAME")
        float-field '(lib/field "VENUES" "LATITUDE")
        dt-field '(lib/field "USERS" "LAST_LOGIN")
        #_#_boolean-field '(lib/->= 1 (lib/field "VENUES" "CATEGORY_ID"))]
    (doseq [[expr typ] (partition-all
                         2
                         `[(lib/+ 1.0 2 ~int-field) :type/Number
                           (lib/- 1.0 2 ~int-field) :type/Number
                           (lib/* 1.0 2 ~int-field) :type/Number
                           (lib// 1.0 2 ~int-field) :type/Float
                           #_#_(lib/case ~boolean-field ~int-field ~boolean-field ~int-field) :type/Integer
                           (lib/coalesce ~string-field "abc") :type/Text
                           (lib/abs ~int-field) :type/Integer
                           (lib/log ~int-field) :type/Float
                           (lib/exp ~int-field) :type/Float
                           (lib/sqrt ~int-field) :type/Float
                           (lib/ceil ~float-field) :type/Integer
                           (lib/floor ~float-field) :type/Integer
                           (lib/round ~float-field) :type/Integer
                           (lib/power ~int-field ~float-field) :type/Number
                           (lib/interval 1 :month) :type/Integer ;; Need an interval type
                           #_#_(lib/relative-datetime "2020-01-01" :default) :type/DateTime
                           (lib/time "08:00:00" :month) :type/TimeWithTZ
                           #_#_(lib/absolute-datetime "2020-01-01" :default) :type/DateTimeWithTZ
                           (lib/now) :type/DateTimeWithTZ
                           (lib/convert-timezone ~dt-field "US/Pacific" "US/Eastern") :type/DateTime
                           #_#_(lib/get-week ~dt-field :iso) :type/Integer
                           (lib/get-year ~dt-field) :type/Integer
                           (lib/get-month ~dt-field) :type/Integer
                           (lib/get-day ~dt-field) :type/Integer
                           (lib/get-hour ~dt-field) :type/Integer
                           (lib/get-minute ~dt-field) :type/Integer
                           (lib/get-second ~dt-field) :type/Integer
                           (lib/get-quarter ~dt-field) :type/Integer
                           (lib/datetime-add ~dt-field 1 :month) :type/DateTime
                           (lib/datetime-subtract ~dt-field 1 :month) :type/DateTime
                           #_#_(lib/concat ~string-field "abc") :type/Text
                           (lib/substring ~string-field 0 10) :type/Text
                           (lib/replace ~string-field "abc" "def") :type/Text
                           (lib/regexextract ~string-field "abc") :type/Text
                           (lib/length ~string-field) :type/Integer
                           (lib/trim ~string-field) :type/Text
                           (lib/rtrim ~string-field) :type/Text
                           (lib/ltrim ~string-field) :type/Text
                           (lib/upper ~string-field) :type/Text
                           (lib/lower ~string-field) :type/Text])]
      (testing (str "expression: " (pr-str expr))
        (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                        (lib/expression "myexpr" (eval expr)))]
          (is (mc/validate ::lib.schema/query query))
          (is (= typ (expression/type-of (get-in (lib.util/query-stage query 0) [:expressions "myexpr"])))))))))
