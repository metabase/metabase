(ns metabase.pulse.render.common-test
  (:refer-clojure :exclude [format])
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.render.common :as common]
   [metabase.shared.models.visualization-settings :as mb.viz]))

(defn format [value viz]
  (str ((common/number-formatter {:id 1}
                                 {::mb.viz/column-settings
                                  {{::mb.viz/field-id 1} viz}})
        value)))

(deftest number-formatting-test
  (let [value 12345.5432
        fmt   (partial format value)]
    (testing "Regular Number formatting"
      (is (= "12,345.54" (fmt nil)))
      (is (= "12*345^54" (fmt {::mb.viz/number-separators "^*"})))
      (is (= "prefix12,345.54suffix" (fmt {::mb.viz/prefix "prefix"
                                           ::mb.viz/suffix "suffix"})))
      (is (= "12,345.54" (fmt {::mb.viz/decimals 2})))
      (is (= "12,345.5432000" (fmt {::mb.viz/decimals 7})))
      (is (= "12,346" (fmt {::mb.viz/decimals 0})))
      (is (= "2" (format 2 nil))))
    (testing "Currency"
      (testing "defaults to USD and two decimal places and symbol"
        (is (= "$12,345.54" (fmt {::mb.viz/number-style "currency"}))))
      (testing "Defaults to currency when there is a currency style"
        (is (= "$12,345.54" (fmt {::mb.viz/currency-style "symbol"}))))
      (testing "Defaults to currency when there is a currency"
        (is (= "$12,345.54" (fmt {::mb.viz/currency "USD"}))))
      (testing "respects the number of decimal places when specified"
        (is (= "$12,345.54320" (fmt {::mb.viz/currency "USD"
                                     ::mb.viz/decimals 5}))))
      (testing "Other currencies"
        (is (= "AED12,345.54" (fmt {::mb.viz/currency "AED"})))
        (is (= "12,345.54 Cape Verdean escudos"
               (fmt {::mb.viz/currency       "CVE"
                     ::mb.viz/currency-style "name"})))
        (testing "which have no 'cents' and thus no decimal places"
          (is (= "Af12,346" (fmt {::mb.viz/currency "AFN"})))
          (is (= "₡12,346" (fmt {::mb.viz/currency "CRC"})))
          (is (= "ZK12,346" (fmt {::mb.viz/currency "ZMK"})))))
      (testing "Understands name, code, and symbol"
        (doseq [[style expected] [["name" "12,345.54 Czech Republic korunas"]
                                  ["symbol" "Kč12,345.54"]
                                  ["code" "CZK 12,345.54"]]]
          (is (= expected (fmt {::mb.viz/currency       "CZK"
                                ::mb.viz/currency-style style}))
              style))))
    (testing "scientific notation"
      (is (= "1.23E4" (fmt {::mb.viz/number-style "scientific"})))
      (is (= "1.23E4" (fmt {::mb.viz/number-style "scientific"
                            ::mb.viz/decimals     2})))
      (is (= "1.2346E4" (fmt {::mb.viz/number-style "scientific"
                              ::mb.viz/decimals     4})))
      (is (= "-1.23E4" (format  -12345 {::mb.viz/number-style "scientific"}))))
    (testing "Percentage"
      (is (= "1,234,554.32%" (fmt {::mb.viz/number-style "percent"})))
      (is (= "1.234.554,3200%"
             (fmt {::mb.viz/number-style      "percent"
                   ::mb.viz/decimals          4
                   ::mb.viz/number-separators ",."})))
      (is (= "10%" (format 0.1 {::mb.viz/number-style "percent"})))
      (is (= "1%" (format 0.01 {::mb.viz/number-style "percent"})))
      (is (= "0%" (format 0.000000 {::mb.viz/number-style "percent"})))
      ;; This is not zero, so should show decimal places
      (is (= "0.00%" (format 0.0000001 {::mb.viz/number-style "percent"})))
      (is (= "0.00001%" (format 0.0000001 {::mb.viz/number-style "percent"
                                           ::mb.viz/decimals          5}))))
    (testing "Match UI 'natural formatting' behavior for decimal values with no column formatting present"
      ;; basically, for numbers greater than 1, round to 2 decimal places,
      ;; and do not display decimals if they end up as zeroes
      ;; for numbers less than 1, round to 2 significant-figures,
      ;; and show as many decimals as necessary to display these 2 sig-figs
      (is (= ["2"    "0"]      [(format 2 nil)       (format 0 nil)]))
      (is (= ["2.1"  "0.1"]    [(format 2.1 nil)     (format 0.1 nil)]))
      (is (= ["2.01" "0.01"]   [(format 2.01 nil)    (format 0.01 nil)]))
      (is (= ["2"    "0.001"]  [(format 2.001 nil)   (format 0.001 nil)]))
      (is (= ["2.01" "0.006"]  [(format 2.006 nil)   (format 0.006 nil)]))
      (is (= ["2"    "0.0049"] [(format 2.0049 nil)  (format 0.0049 nil)]))
      (is (= ["2"    "0.005"]  [(format 2.00499 nil) (format 0.00499 nil)])))
    (testing "Column Settings"
      (letfn [(fmt-with-type
                ([type value] (fmt-with-type type value nil))
                ([type value decimals]
                 (let [fmt-fn (common/number-formatter {:id 1 :effective_type type}
                                                       {::mb.viz/column-settings
                                                        {{::mb.viz/field-id 1}
                                                         (merge
                                                          {:effective_type type}
                                                          (when decimals {::mb.viz/decimals decimals}))}})]
                   (str (fmt-fn value)))))]
        (is (= "3" (fmt-with-type :type/Integer 3)))
        (is (= "3" (fmt-with-type :type/Integer 3.0)))
        (is (= "3.0" (fmt-with-type :type/Integer 3 1)))
        (is (= "3" (fmt-with-type :type/Decimal 3)))
        (is (= "3" (fmt-with-type :type/Decimal 3.0)))
        (is (= "3.1" (fmt-with-type :type/Decimal 3.1)))
        (is (= "3.01" (fmt-with-type :type/Decimal 3.010)))
        (is (= "0.25" (fmt-with-type :type/Decimal 0.254)))))
    (testing "Does not throw on nils"
        (is (nil?
             ((common/number-formatter {:id 1}
                                       {::mb.viz/column-settings
                                        {{::mb.viz/column-id 1}
                                         {::mb.viz/number-style "percent"}}})
              nil))))
    (testing "Does not throw on non-numeric types"
        (is (= "bob"
               ((common/number-formatter {:id 1}
                                         {::mb.viz/column-settings
                                          {{::mb.viz/column-id 1}
                                           {::mb.viz/number-style "percent"}}})
                "bob"))))))
