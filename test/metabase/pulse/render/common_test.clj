(ns metabase.pulse.render.common-test
  (:refer-clojure :exclude [format])
  (:require [clojure.test :refer :all]
            [metabase.pulse.render.common :as common]
            [metabase.shared.models.visualization-settings :as mb.viz]))

(defn format [value viz]
  (str ((common/number-formatter {:id 1}
                                 {::mb.viz/column-settings
                                  {{::mb.viz/field-id 1} viz}})
        value)))

(deftest number-formatting-test
  (let [value 12345.5432
        fmt (partial format value)]
    (testing "Regular Number formatting"
      (is (= "12,345.54" (fmt nil)))
      (is (= "12*345^54" (fmt {::mb.viz/number-separators "^*"})))
      (is (= "prefix12,345.54suffix" (fmt {::mb.viz/prefix "prefix"
                                           ::mb.viz/suffix "suffix"})))
      (is (= "12,345.5432000" (fmt {::mb.viz/decimals 7})))
      (is (= "12,346" (fmt {::mb.viz/decimals 0}))))
    (testing "Currency"
      (testing "defaults to USD and two decimal places and symbol"
        (is (= "$12,345.54" (fmt {::mb.viz/number-style "currency"}))))
      (testing "Defaults to currency when there is a currency style"
        (is (= "$12,345.54" (fmt {::mb.viz/currency-style "symbol"}))))
      (testing "Defaults to currency when there is a currency"
        (is (= "$12,345.54" (fmt {::mb.viz/currency "USD"}))))
      (testing "Other currencies"
        (is (= "AED12,345.54" (fmt {::mb.viz/currency "AED"})))
        (is (= "₡12,345.54" (fmt {::mb.viz/currency "CRC"})))
        (is (= "12,345.54 Cape Verdean escudos"
               (fmt {::mb.viz/currency "CVE"
                     ::mb.viz/currency-style "name"}))))
      (testing "Understands name, code, and symbol"
        (doseq [[style expected] [["name" "12,345.54 Czech Republic korunas"]
                                  ["symbol" "Kč12,345.54"]
                                  ["code" "CZK 12,345.54"]]]
          (is (= expected (fmt {::mb.viz/currency "CZK"
                                ::mb.viz/currency-style style}))
              style))))
    (testing "scientific notation"
      (is (= "1.23E4" (fmt {::mb.viz/number-style "scientific"})))
      (is (= "1.2346E4" (fmt {::mb.viz/number-style "scientific"
                              ::mb.viz/decimals 4})))
      (is (= "1E4" (fmt {::mb.viz/number-style "scientific"
                         ::mb.viz/decimals 0}))))
    (testing "Percentage"
      (is (= "1,234,554.32%" (fmt {::mb.viz/number-style "percent"})))
      (is (= "1.234.554,3200%"
             (fmt {::mb.viz/number-style "percent"
                   ::mb.viz/decimals 4
                   ::mb.viz/number-separators ",."}))))
    (testing "Column Settings"
      (letfn [(fmt-with-type [type value]
                (let [fmt-fn (common/number-formatter {:id 1 :effective_type type}
                                                      {::mb.viz/column-settings
                                                       {{::mb.viz/column-id 1}
                                                        {:effective_type type}}})]
                  (str (fmt-fn value))))]
        (is (= "3" (fmt-with-type :type/Integer 3)))
        (is (= "3.00" (fmt-with-type :type/Decimal 3)))
        (is (= "3.10" (fmt-with-type :type/Decimal 3.1)))))
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
