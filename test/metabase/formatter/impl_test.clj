(ns metabase.formatter.impl-test
  (:refer-clojure :exclude [format])
  (:require
   [clojure.test :refer :all]
   [metabase.formatter.impl :as formatter]
   [metabase.models.visualization-settings :as mb.viz]))

(defn- format-with-field-id
  [value viz]
  (str ((formatter/number-formatter {:id 1 :field_ref [:field 1 nil]}
                                    {::mb.viz/column-settings
                                     {{::mb.viz/field-id 1} viz}})
        value)))

(defn- format-with-colname-key
  "Include both field-id and column-name keys in column settings #55066"
  [value viz]
  (str ((formatter/number-formatter {:id 1 :name "FOO"}
                                    {::mb.viz/column-settings
                                     {{::mb.viz/column-name "FOO"} viz}})
        value)))

(defn- format-with-field-id-and-colname-keys
  "Include both field-id and column-name keys in column settings #55066"
  [value viz]
  (str ((formatter/number-formatter {:id 1 :name "FOO"}
                                    {::mb.viz/column-settings
                                     {{::mb.viz/field-id 1} {::mb.viz/view-as nil}
                                      {::mb.viz/column-name "FOO"} viz}})
        value)))

(def ^:private formatters
  [{:name " field-id only"
    :fmt-fn format-with-field-id}
   {:name " column-name only"
    :fmt-fn format-with-colname-key}
   {:name " both field-id and column-name"
    :fmt-fn format-with-field-id-and-colname-keys}])

(deftest regular-number-formatting
  (doseq [{:keys [name fmt-fn]} formatters]
    (let [value    12345.5432
          fmt-part (partial fmt-fn value)]
      (testing (str "Regular Number formatting" name)
        (is (= "12,345.54" (fmt-part nil)))
        (is (= "12*345^54" (fmt-part {::mb.viz/number-separators "^*"})))
        (is (= "prefix12,345.54suffix" (fmt-part {::mb.viz/prefix "prefix"
                                                  ::mb.viz/suffix "suffix"})))
        (is (= "12,345.54" (fmt-part {::mb.viz/decimals 2})))
        (is (= "12,345.5432000" (fmt-part {::mb.viz/decimals 7})))
        (is (= "12,346" (fmt-part {::mb.viz/decimals 0})))
        (is (= "2" (fmt-fn 2 nil)))))))

(deftest scientific-notation-formatting-test
  (doseq [{:keys [name fmt-fn]} formatters]
    (let [value    12345.5432
          fmt-part (partial fmt-fn value)]
      (testing (str "Scientific notation formatting" name)
        (is (= "1.23E4" (fmt-part {::mb.viz/number-style "scientific"})))
        (is (= "1.23E4" (fmt-part {::mb.viz/number-style "scientific"
                                   ::mb.viz/decimals     2})))
        (is (= "1.2346E4" (fmt-part {::mb.viz/number-style "scientific"
                                     ::mb.viz/decimals     4})))
        (is (= "1E0" (fmt-fn 1 {::mb.viz/number-style "scientific"})))
        (is (= "1.2E1" (fmt-fn 12 {::mb.viz/number-style "scientific"})))
        (is (= "1.23E2" (fmt-fn 123 {::mb.viz/number-style "scientific"})))
        (is (= "1.23E3" (fmt-fn 1234 {::mb.viz/number-style "scientific"})))
        (is (= "1.23E4" (fmt-fn 12345 {::mb.viz/number-style "scientific"})))
        (is (= "-1E0" (fmt-fn -1 {::mb.viz/number-style "scientific"})))
        (is (= "-1.2E1" (fmt-fn -12 {::mb.viz/number-style "scientific"})))
        (is (= "-1.23E2" (fmt-fn -123 {::mb.viz/number-style "scientific"})))
        (is (= "-1.23E3" (fmt-fn -1234 {::mb.viz/number-style "scientific"})))
        (is (= "-1.23E4" (fmt-fn -12345 {::mb.viz/number-style "scientific"})))))))

(deftest percentage-formatting-test
  (doseq [{:keys [name fmt-fn]} formatters]
    (let [value    12345.5432
          fmt-part (partial fmt-fn value)]
      (testing (str "Percentage formatting" name)
        (is (= "1,234,554.32%" (fmt-part {::mb.viz/number-style "percent"})))
        (is (= "1.234.554,3200%" (fmt-part {::mb.viz/number-style      "percent"
                                            ::mb.viz/decimals          4
                                            ::mb.viz/number-separators ",."})))
        (is (= "10%" (fmt-fn 0.1 {::mb.viz/number-style "percent"})))
        (is (= "1%" (fmt-fn 0.01 {::mb.viz/number-style "percent"})))
        (is (= "0%" (fmt-fn 0.000000 {::mb.viz/number-style "percent"})))
        ;; With default formatting (2 digits) and zero trimming, we get 0%
        (is (= "0%" (fmt-fn 0.0000001 {::mb.viz/number-style "percent"})))
        ;; Requiring 2 digits adds zeros
        (is (= "0.00%" (fmt-fn 0.0000001 {::mb.viz/number-style "percent"
                                          ::mb.viz/decimals     2})))
        ;; You need at least 5 digits (not the scale by 100 for percents) to show the low value
        (is (= "0.00001%" (fmt-fn 0.0000001 {::mb.viz/number-style "percent"
                                             ::mb.viz/decimals     5})))))))

(deftest natural-formatting-test
  (doseq [{:keys [name fmt-fn]} formatters]
    (testing (str "Natural formatting" name)
      ;; basically, for numbers greater than 1, round to 2 decimal places,
      ;; and do not display decimals if they end up as zeroes
      ;; for numbers less than 1, round to 2 significant-figures,
      ;; and show as many decimals as necessary to display these 2 sig-figs
      (is (= ["2"    "0"]       [(fmt-fn 2 nil)       (fmt-fn 0 nil)]))
      (is (= ["2.1"  "0.1"]     [(fmt-fn 2.1 nil)     (fmt-fn 0.1 nil)]))
      (is (= ["0.57" "-0.57"]   [(fmt-fn 0.57 nil)    (fmt-fn -0.57 nil)]))
      (is (= ["2.57" "-2.57"]   [(fmt-fn 2.57 nil)    (fmt-fn -2.57 nil)]))
      (is (= ["-0.22" "-1.34"]  [(fmt-fn -0.2222 nil) (fmt-fn -1.345 nil)]))
      (is (= ["2.01" "0.01"]    [(fmt-fn 2.01 nil)    (fmt-fn 0.01 nil)]))
      (is (= ["2"    "0.001"]   [(fmt-fn 2.001 nil)   (fmt-fn 0.001 nil)]))
      (is (= ["2.01" "0.006"]   [(fmt-fn 2.006 nil)   (fmt-fn 0.006 nil)]))
      (is (= ["2"    "0.0049"]  [(fmt-fn 2.0049 nil)  (fmt-fn 0.0049 nil)]))
      (is (= ["2"    "0.005"]   [(fmt-fn 2.00499 nil) (fmt-fn 0.00499 nil)]))
      ;; Test small numbers with many decimal places
      (is (= ["2"    "0.0014"]  [(fmt-fn 2.0013593702702702702M nil)
                                 (fmt-fn 0.0013593702702702702M nil)]))
      (is (= ["2"    "0.000012"] [(fmt-fn 2.0000123456789M nil)
                                  (fmt-fn 0.0000123456789M nil)])))))

(deftest currency-formatting-test
  (doseq [{:keys [name fmt-fn]} formatters]
    (let [value  12345.5432
          fmt-part (partial fmt-fn value)]
      (testing (str "Currency formatting" name)
        (testing "defaults to USD and two decimal places and symbol"
          (is (= "$12,345.54" (fmt-part {::mb.viz/number-style       "currency"
                                         ::mb.viz/currency-in-header false}))))
        (testing "Defaults to currency when there is a currency style"
          (is (= "$12,345.54" (fmt-part {::mb.viz/currency-style     "symbol"
                                         ::mb.viz/currency-in-header false}))))
        (testing "Defaults to currency when there is a currency"
          (is (= "$12,345.54" (fmt-part {::mb.viz/currency           "USD"
                                         ::mb.viz/currency-in-header false}))))
        (testing "respects the number of decimal places when specified"
          (is (= "$12,345.54320" (fmt-part {::mb.viz/currency           "USD"
                                            ::mb.viz/decimals           5
                                            ::mb.viz/currency-in-header false}))))
        (testing "Other currencies"
          (is (= "AED12,345.54" (fmt-part {::mb.viz/currency           "AED"
                                           ::mb.viz/currency-in-header false})))
          (is (= "12,345.54 Cape Verdean escudos"
                 (fmt-part {::mb.viz/currency           "CVE"
                            ::mb.viz/currency-style     "name"
                            ::mb.viz/currency-in-header false})))
          (testing "which have no 'cents' and thus no decimal places"
            (is (= "Af12,346" (fmt-part {::mb.viz/currency           "AFN"
                                         ::mb.viz/currency-in-header false})))
            (is (= "₡12,346" (fmt-part {::mb.viz/currency           "CRC"
                                        ::mb.viz/currency-in-header false})))
            (is (= "ZK12,346" (fmt-part {::mb.viz/currency           "ZMK"
                                         ::mb.viz/currency-in-header false})))))
        (testing "Understands name, code, and symbol"
          (doseq [[style expected] [["name" "12,345.54 Czech Republic korunas"]
                                    ["symbol" "Kč12,345.54"]
                                    ["code" "CZK 12,345.54"]]]
            (is (= expected (fmt-part {::mb.viz/currency           "CZK"
                                       ::mb.viz/currency-style     style
                                       ::mb.viz/currency-in-header false}))
                style)))))))

(deftest column-settings-formatting-test
  (letfn [(fmt-with-type
            ([type value] (fmt-with-type type value nil))
            ([type value decimals]
             (let [fmt-fn (formatter/number-formatter {:id 1
                                                       :field_ref [:field 1 nil]
                                                       :effective_type type}
                                                      {::mb.viz/column-settings
                                                       {{::mb.viz/field-id 1}
                                                        (merge
                                                         {:effective_type type}
                                                         (when decimals {::mb.viz/decimals decimals}))}})]
               (str (fmt-fn value)))))]
    (testing "Integer formatting"
      (is (= "3" (fmt-with-type :type/Integer 3)))
      (is (= "3" (fmt-with-type :type/Integer 3.0)))
      (is (= "3.0" (fmt-with-type :type/Integer 3 1))))
    (testing "Decimal formatting"
      (is (= "3" (fmt-with-type :type/Decimal 3)))
      (is (= "3" (fmt-with-type :type/Decimal 3.0)))
      (is (= "3.1" (fmt-with-type :type/Decimal 3.1)))
      (is (= "3.01" (fmt-with-type :type/Decimal 3.010)))
      (is (= "0.25" (fmt-with-type :type/Decimal 0.254))))))

(deftest relation-types-formatting-test
  (letfn [(fmt-with-type
            ([type value] (fmt-with-type type value nil))
            ([type value decimals]
             (let [fmt-fn (formatter/number-formatter {:id 1 :semantic_type type}
                                                      {::mb.viz/column-settings
                                                       {{::mb.viz/field-id 1}
                                                        (merge
                                                         {:effective_type type}
                                                         (when decimals {::mb.viz/decimals decimals}))}})]
               (str (fmt-fn value)))))]
    (testing "Primary and foreign keys do not do special formatting"
      (is (= "1000" (fmt-with-type :type/PK 1000)))
      (is (= "1000" (fmt-with-type :type/FK 1000))))))

(deftest edge-case-formatting-test
  (testing "Does not throw on nils"
    (is (nil?
         ((formatter/number-formatter {:id 1}
                                      {::mb.viz/column-settings
                                       {{::mb.viz/column-id 1}
                                        {::mb.viz/number-style "percent"}}})
          nil))))
  (testing "Does not throw on non-numeric types"
    (is (= "bob"
           ((formatter/number-formatter {:id 1}
                                        {::mb.viz/column-settings
                                         {{::mb.viz/column-id 1}
                                          {::mb.viz/number-style "percent"}}})
            "bob")))))

(deftest coords-formatting-test
  (testing "Test the correctness of formatting longitude and latitude values"
    (is (= "12.34560000° E"
           (formatter/format-geographic-coordinates :type/Longitude 12.3456)))
    (is (= "12.34560000° W"
           (formatter/format-geographic-coordinates :type/Longitude -12.3456)))
    (is (= "12.34560000° N"
           (formatter/format-geographic-coordinates :type/Latitude 12.3456)))
    (is (= "12.34560000° S"
           (formatter/format-geographic-coordinates :type/Latitude -12.3456)))
    (testing "0 corresponds to the non-negative direction"
      (is (= "0.00000000° E"
             (formatter/format-geographic-coordinates :type/Longitude 0)))
      (is (= "0.00000000° N"
             (formatter/format-geographic-coordinates :type/Latitude 0))))
    (testing "A non-coordinate type just stringifies the value"
      (is (= "0.0"
             (formatter/format-geographic-coordinates :type/Froobitude 0))))
    (testing "We handle missing values"
      (is (= ""
             (formatter/format-geographic-coordinates :type/Longitude nil))))))

(deftest ambiguous-column-types-test
  (testing "Ambiguous column types (eg. `:type/SnowflakeVariant` pass through the formatter without error (#46981)"
    (let [format (fn [value viz]
                   (str ((formatter/number-formatter {:id 1
                                                      :base_type :type/SnowflakeVariant}
                                                     {::mb.viz/column-settings
                                                      {{::mb.viz/field-id 1} viz}})
                         value)))]
      (is (= "variant works"
             (format "variant works" {}))))))
