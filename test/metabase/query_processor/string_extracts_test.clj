(ns ^:mb/driver-tests metabase.query-processor.string-extracts-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.string-extracts-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]))

(defn- test-string-extract
  [expr & [filter]]
  (let [mp        (mt/metadata-provider)
        venues    (lib.metadata/table mp (mt/id :venues))
        venues-id (lib.metadata/field mp (mt/id :venues :id))
        query     (as-> (lib/query mp venues) q
                    (lib/expression q "test" expr)
                    (lib/with-fields q [(lib/expression-ref q "test")])
                    ;; filter clause is optional
                    (cond-> q filter (lib/filter filter))
                    ;; To ensure stable ordering
                    (lib/order-by q venues-id)
                    (lib/limit q 1))]
    (mt/with-native-query-testing-context query
      (->> query
           qp/process-query
           mt/rows
           ffirst))))

(deftest ^:parallel test-length
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 3 (int (test-string-extract (lib/length "foo")))))))

(deftest ^:parallel test-trim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foo" (test-string-extract (lib/trim " foo "))))))

(deftest ^:parallel test-ltrim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foo " (test-string-extract (lib/ltrim " foo "))))))

(deftest ^:parallel test-rtrim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= " foo" (test-string-extract (lib/rtrim " foo "))))))

(deftest ^:parallel test-upper
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (let [mp          (mt/metadata-provider)
          venues-name (lib.metadata/field mp (mt/id :venues :name))]
      (is (= "RED MEDICINE" (test-string-extract (lib/upper venues-name)))))))

(deftest ^:parallel test-lower
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (let [mp          (mt/metadata-provider)
          venues-name (lib.metadata/field mp (mt/id :venues :name))]
      (is (= "red medicine" (test-string-extract (lib/lower venues-name)))))))

(deftest ^:parallel test-substring
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (let [mp          (mt/metadata-provider)
          venues-name (lib.metadata/field mp (mt/id :venues :name))]
      (is (= "Red" (test-string-extract (lib/substring venues-name 1 3))))
      ;; 0 is normalized 1 to by the normalize/canonicalize processing
      ;; TODO(mbql5-migration): exercises legacy normalization of a non-positive :substring start (the 0 -> 1
      ;; :decode/normalize coercion in the legacy schema); the MBQL-5 schema has no such coercion, so keep this
      ;; site on the old macro.
      (is (= "Red" (->> {:expressions {"test" [:substring [:field (mt/id :venues :name) nil] 0 3]}
                         :fields      [[:expression "test"]]
                         :order-by    [[:asc [:field (mt/id :venues :id) nil]]]
                         :limit       1}
                        (mt/run-mbql-query venues)
                        mt/rows
                        ffirst)))
      (is (= "ed Medicine" (test-string-extract (lib/expression-clause :substring [venues-name 2] nil))))
      (is (= "Red Medicin" (test-string-extract (lib/substring venues-name
                                                               1
                                                               (lib/- (lib/length venues-name) 1)))))
      (is (= "ne" (test-string-extract (lib/expression-clause :substring
                                                              [venues-name (lib/- (lib/length venues-name) 1)]
                                                              nil)))))))

(deftest ^:parallel test-replace
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (let [mp          (mt/metadata-provider)
          venues-name (lib.metadata/field mp (mt/id :venues :name))]
      (is (= "Red Baloon" (test-string-extract (lib/replace venues-name "Medicine" "Baloon"))))
      (is (= "Rod Modicino" (test-string-extract (lib/replace venues-name "e" "o"))))
      (is (= "Red" (test-string-extract (lib/replace venues-name " Medicine" ""))))
      (is (= "Larry's The Prime Rib" (test-string-extract
                                      (lib/replace venues-name "Lawry's" "Larry's")
                                      (lib/= venues-name "Lawry's The Prime Rib")))))))

(deftest ^:parallel test-coalesce
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (let [mp          (mt/metadata-provider)
          venues-name (lib.metadata/field mp (mt/id :venues :name))]
      (is (= "Red Medicine" (test-string-extract (lib/coalesce venues-name "b")))))))

(deftest ^:parallel test-concat
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Does concat work with 2 strings"
      (is (= "foobar" (test-string-extract (lib/concat "foo" "bar")))))
    (testing "Does concat work with >2 args"
      (is (= "foobar" (test-string-extract (lib/concat "f" "o" "o" "b" "a" "r")))))
    (testing "Does concat work with nested concat expressions"
      (is (= "foobar" (test-string-extract (lib/concat (lib/concat "f" "o" "o") (lib/concat "b" "a" "r"))))))))

(defmethod driver/database-supports? [::driver/driver ::concat-non-string-args]
  [_driver _feature _database]
  true)

;; These drivers do not support concat with non-string args
(doseq [driver [:athena :mongo :presto-jdbc :vertica :starburst]]
  (defmethod driver/database-supports? [driver ::concat-non-string-args]
    [_driver _feature _database]
    false))

(deftest ^:parallel test-concat-non-string-args
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions ::concat-non-string-args)
    (testing "Does concat work with non-string args"
      (is (= "1234" (test-string-extract (lib/concat 123 (lib/+ 1 3)))))))
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions ::concat-non-string-args :temporal-extract)
    (testing "Does concat work with nested temporal-extraction expressions"
      (is (= "2024Q4" (test-string-extract (lib/concat (lib/get-year "2024-10-08")
                                                       "Q"
                                                       (lib/get-quarter "2024-10-08"))))))))

(deftest ^:parallel test-regex-match-first
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex)
    (let [mp          (mt/metadata-provider)
          venues-name (lib.metadata/field mp (mt/id :venues :name))]
      (is (= "Red" (test-string-extract (lib/regex-match-first venues-name "(.ed+)")))))))

(deftest ^:parallel test-nesting
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (let [mp          (mt/metadata-provider)
          venues-name (lib.metadata/field mp (mt/id :venues :name))]
      (is (= "MED" (test-string-extract
                    (lib/upper (lib/substring (lib/trim (lib/expression-clause :substring [venues-name 4] nil))
                                              1
                                              3))))))))

(deftest ^:parallel test-breakout
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (let [mp          (mt/metadata-provider)
          venues      (lib.metadata/table mp (mt/id :venues))
          venues-name (lib.metadata/field mp (mt/id :venues :name))
          query       (as-> (lib/query mp venues) q
                        (lib/expression q "test" (lib/concat venues-name "foo"))
                        (lib/breakout q (lib/expression-ref q "test"))
                        (lib/aggregate q (lib/count))
                        (lib/limit q 1))]
      (mt/with-native-query-testing-context query
        (is (= ["20th Century Cafefoo" 1]
               (->> query
                    qp/process-query
                    (mt/formatted-rows [identity int])
                    first)))))))

(deftest ^:parallel regex-match-first-escaping-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :expressions :regex)
    (let [mp          (mt/metadata-provider)
          venues-name (lib.metadata/field mp (mt/id :venues :name))]
      (is (= "Taylor's" (test-string-extract
                         (lib/regex-match-first venues-name "^Taylor's")
                         (lib/= venues-name "Taylor's Prime Steak House")))))))

(deftest ^:parallel regex-extract-in-explict-join-test
  (testing "Should be able to use regex extra in an explict join (#17790)"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex :left-join)
      (mt/dataset test-data
        (let [mp                (mt/metadata-provider)
              orders            (lib.metadata/table mp (mt/id :orders))
              orders-id         (lib.metadata/field mp (mt/id :orders :id))
              orders-product-id (lib.metadata/field mp (mt/id :orders :product_id))
              products          (lib.metadata/table mp (mt/id :products))
              products-category (-> (lib.metadata/field mp (mt/id :products :category))
                                    (lib/with-join-alias "Products"))
              query             (-> (lib/query mp orders)
                                    (lib/join (-> (lib/join-clause products)
                                                  (lib/with-join-alias "Products")
                                                  (lib/with-join-conditions
                                                   [(lib/= orders-product-id
                                                           (-> (lib.metadata/field mp (mt/id :products :id))
                                                               (lib/with-join-alias "Products")))])
                                                  (lib/with-join-fields :all)))
                                    (lib/expression "regex" (lib/regex-match-first products-category ".*"))
                                    (lib/order-by orders-id)
                                    (lib/limit 2))]
          (mt/with-native-query-testing-context query
            (is (= [[1 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2
                     "Widget"
                     14 "8833419218504" "Awesome Concrete Shoes" "Widget" "McClure-Lockman" 25.1 4.0 "2017-12-31T14:41:56.87Z"]
                    [2 1 123 110.93 6.1 117.03 nil "2018-05-15T08:04:04.58Z" 3
                     "Gizmo"
                     123 "3621077291879" "Mediocre Wooden Bench" "Gizmo" "Flatley-Kunde" 73.95 2.0 "2017-11-16T13:53:14.232Z"]]
                   (mt/formatted-rows
                    [int int int 2.0 2.0 2.0 int str int
                     str
                     int str str str str 2.0 2.0 str]
                    (qp/process-query query))))))))))

(deftest ^:parallel email-extractions-test
  (testing "`:domain` and `:host` extractions from emails should work correctly"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex/lookaheads-and-lookbehinds)
      (let [mp           (mt/metadata-provider)
            people       (lib.metadata/table mp (mt/id :people))
            people-id    (lib.metadata/field mp (mt/id :people :id))
            people-email (lib.metadata/field mp (mt/id :people :email))
            query        (-> (lib/query mp people)
                             (lib/order-by people-id)
                             (lib/limit 2)
                             (lib/with-fields [people-id people-email]))
            extractions  (lib/column-extractions query people-email)
            _            (is (= #{:domain :host}
                                (into #{} (map :tag) extractions)))
            query        (reduce (fn [query extraction]
                                   (lib/extract query -1 extraction))
                                 query
                                 extractions)]
        (is (= [[1 "borer-hudson@yahoo.com"        "yahoo" "yahoo.com"]
                [2 "williamson-domenica@yahoo.com" "yahoo" "yahoo.com"]]
               (mt/formatted-rows [int str str str] (qp/process-query query))))))))

(deftest ^:parallel filter-on-string-expression-result-test
  (testing "#13751 filter `=` on the result of a regex-match-first expression"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex)
      (mt/dataset test-data
        (let [mp       (mt/metadata-provider)
              people   (lib.metadata/table mp (mt/id :people))
              state    (lib.metadata/field mp (mt/id :people :state))
              co-count (->> (-> (lib/query mp people)
                                (lib/filter (lib/= state "CO"))
                                (lib/aggregate (lib/count)))
                            qp/process-query mt/rows ffirst long)
              expr-q   (-> (lib/query mp people)
                           (lib/expression "C" (lib/regex-match-first state "^C[A-Z]")))
              expr-q   (-> expr-q
                           (lib/filter (lib/= (lib/expression-ref expr-q "C") "CO"))
                           (lib/aggregate (lib/count)))]
          (is (pos? co-count))
          (is (= co-count
                 (->> expr-q qp/process-query mt/rows ffirst long)))))))
  (testing "#14843 filter `!=` on the result of a length expression"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
      (mt/dataset test-data
        (let [mp     (mt/metadata-provider)
              people (lib.metadata/table mp (mt/id :people))
              city   (lib.metadata/field mp (mt/id :people :city))
              query  (as-> (lib/query mp people) q
                       (lib/expression q "L" (lib/length city))
                       (lib/filter q (lib/!= (lib/expression-ref q "L") 3))
                       (lib/with-fields q [city])
                       (lib/limit q 200))
              rows   (mt/rows (qp/process-query query))]
          (is (seq rows))
          (is (not-any? #(= 3 (count (first %))) rows)))))))

(deftest ^:parallel string-function-escape-literals-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex)
    (mt/dataset test-data
      (let [mp          (mt/metadata-provider)
            venues      (lib.metadata/table mp (mt/id :venues))
            venues-id   (lib.metadata/field mp (mt/id :venues :id))
            venues-name (lib.metadata/field mp (mt/id :venues :name))
            extract     (fn [expr]
                          (let [q (as-> (lib/query mp venues) q
                                    (lib/expression q "test" expr)
                                    (lib/with-fields q [(lib/expression-ref q "test")])
                                    (lib/order-by q venues-id :asc)
                                    (lib/limit q 1))]
                            (ffirst (mt/rows (qp/process-query q)))))]
        (testing "#53527 a double-quote replacement literal strips the quote"
          (is (= "ab" (extract (lib/replace "a\"b" "\"" "")))))
        (testing "#56596 a `\\s` whitespace class keeps its backslash and captures a leading space"
          (is (= " Medicine" (extract (lib/regex-match-first venues-name "\\s.*")))))))))

(deftest ^:parallel url-extractions-test
  (testing "`:domain`, `:subdomain`, `:host`, and `:path` extractions from URLs should work correctly"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex/lookaheads-and-lookbehinds)
      (let [mp          (mt/metadata-provider)
            people      (lib.metadata/table mp (mt/id :people))
            people-id   (lib.metadata/field mp (mt/id :people :id))
            query       (-> (lib/query mp people)
                            (lib/order-by people-id)
                            (lib/limit 1)
                            (lib/with-fields [people-id])
                            (lib/expression "Domain"    [:domain    {:lib/uuid (str (random-uuid))} "https://x.bbc.co.uk/some/path?search=foo"])
                            (lib/expression "Subdomain" [:subdomain {:lib/uuid (str (random-uuid))} "https://x.bbc.co.uk/some/path?search=foo"])
                            (lib/expression "Host"      [:host      {:lib/uuid (str (random-uuid))} "https://x.bbc.co.uk/some/path?search=foo"])
                            (lib/expression "Path"      [:path      {:lib/uuid (str (random-uuid))} "https://x.bbc.co.uk/some/path?search=foo"]))]
        (is (= [[1 "bbc" "x" "bbc.co.uk" "/some/path"]]
               (mt/formatted-rows [int str str str str] (qp/process-query query))))))))
