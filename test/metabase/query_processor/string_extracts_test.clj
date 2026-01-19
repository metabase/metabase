(ns ^:mb/driver-tests metabase.query-processor.string-extracts-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- test-string-extract
  [expr & [filter]]
  (->> {:expressions {"test" expr}
        :fields      [[:expression "test"]]
        ;; filter clause is optional
        :filter      filter
        ;; To ensure stable ordering
        :order-by    [[:asc [:field (mt/id :venues :id) nil]]]
        :limit       1}
       (mt/run-mbql-query venues)
       mt/rows
       ffirst))

(deftest ^:parallel test-length
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 3 (int (test-string-extract [:length "foo"]))))))

(deftest ^:parallel test-trim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foo" (test-string-extract [:trim " foo "])))))

(deftest ^:parallel test-ltrim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foo " (test-string-extract [:ltrim " foo "])))))

(deftest ^:parallel test-rtrim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= " foo" (test-string-extract [:rtrim " foo "])))))

(deftest ^:parallel test-upper
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "RED MEDICINE" (test-string-extract [:upper [:field (mt/id :venues :name) nil]])))))

(deftest ^:parallel test-lower
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "red medicine" (test-string-extract [:lower [:field (mt/id :venues :name) nil]])))))

(deftest ^:parallel test-substring
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "Red" (test-string-extract [:substring [:field (mt/id :venues :name) nil] 1 3])))
    ;; 0 is normalized 1 to by the normalize/canonicalize processing
    (is (= "Red" (test-string-extract [:substring [:field (mt/id :venues :name) nil] 0 3])))
    (is (= "ed Medicine" (test-string-extract [:substring [:field (mt/id :venues :name) nil] 2])))
    (is (= "Red Medicin" (test-string-extract [:substring [:field (mt/id :venues :name) nil]
                                               1 [:- [:length [:field (mt/id :venues :name) nil]] 1]])))
    (is (= "ne" (test-string-extract [:substring [:field (mt/id :venues :name) nil]
                                      [:- [:length [:field (mt/id :venues :name) nil]] 1]])))))

(deftest ^:parallel test-replace
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "Red Baloon" (test-string-extract [:replace [:field (mt/id :venues :name) nil] "Medicine" "Baloon"])))
    (is (= "Rod Modicino" (test-string-extract [:replace [:field (mt/id :venues :name) nil] "e" "o"])))
    (is (= "Red" (test-string-extract [:replace [:field (mt/id :venues :name) nil] " Medicine" ""])))
    (is (= "Larry's The Prime Rib" (test-string-extract
                                    [:replace [:field (mt/id :venues :name) nil] "Lawry's" "Larry's"]
                                    [:= [:field (mt/id :venues :name) nil] "Lawry's The Prime Rib"])))))

(deftest ^:parallel test-coalesce
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "Red Medicine" (test-string-extract [:coalesce
                                                [:field (mt/id :venues :name) nil]
                                                "b"])))))

(deftest ^:parallel test-concat
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Does concat work with 2 strings"
      (is (= "foobar" (test-string-extract [:concat "foo" "bar"]))))
    (testing "Does concat work with >2 args"
      (is (= "foobar" (test-string-extract [:concat "f" "o" "o" "b" "a" "r"]))))
    (testing "Does concat work with nested concat expressions"
      (is (= "foobar" (test-string-extract [:concat [:concat "f" "o" "o"] [:concat "b" "a" "r"]]))))))

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
      (is (= "1234" (test-string-extract [:concat 123 [:+ 1 3]])))))
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions ::concat-non-string-args :temporal-extract)
    (testing "Does concat work with nested temporal-extraction expressions"
      (is (= "2024Q4" (test-string-extract [:concat [:get-year "2024-10-08"] "Q" [:get-quarter "2024-10-08"]]))))))

(deftest ^:parallel test-regex-match-first
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex)
    (is (= "Red" (test-string-extract [:regex-match-first [:field (mt/id :venues :name) nil] "(.ed+)"])))))

(deftest ^:parallel test-nesting
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "MED" (test-string-extract [:upper [:substring [:trim [:substring [:field (mt/id :venues :name) nil] 4]] 1 3]])))))

(deftest ^:parallel test-breakout
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= ["20th Century Cafefoo" 1]
           (->> {:expressions  {"test" [:concat [:field (mt/id :venues :name) nil] "foo"]}
                 :breakout     [[:expression "test"]]
                 :aggregation  [[:count]]
                 :limit        1}
                (mt/run-mbql-query venues)
                (mt/formatted-rows [identity int])
                first)))))

(deftest ^:parallel regex-match-first-escaping-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :expressions :regex)
    (is (= "Taylor's" (test-string-extract
                       [:regex-match-first [:field (mt/id :venues :name) nil] "^Taylor's"]
                       [:= [:field (mt/id :venues :name) nil] "Taylor's Prime Steak House"])))))

(deftest ^:parallel regex-extract-in-explict-join-test
  (testing "Should be able to use regex extra in an explict join (#17790)"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex :left-join)
      (mt/dataset test-data
        (let [query (mt/mbql-query orders
                      {:joins       [{:source-table $$products
                                      :alias        "Products"
                                      :condition    [:= $product_id &Products.products.id]
                                      :fields       :all}]
                       :expressions {:regex [:regex-match-first &Products.products.category ".*"]}
                       :order-by    [[:asc $id]]
                       :limit       2})]
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
