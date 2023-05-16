(ns metabase.shared.formatting.numbers-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.shared.formatting.numbers :as numbers]))

(deftest ^:parallel basics-test
  (testing "format-number basics"
    (are [s n] (= s (numbers/format-number n {}))
         "0"   0
         "1"   1
         "-1" -1))
  (testing "large positive and negative integers"
    (are [s n] (= s (numbers/format-number n {}))
         "10"          10
         "99,999,999"  99999999
         "-10"         -10
         "-99,999,999" -99999999)

    (testing "with non-default number separators"
      (are [s n] (= s (numbers/format-number n {:number-separators ",."}))
           "10,1"          10.1
           "99.999.999,9"  99999999.9
           "-10,1"         -10.1
           "-99.999.999,9" -99999999.9)
      (are [s n] (= s (numbers/format-number n {:number-separators ". "}))
           "9 001"      9001
           "-9 001"     -9001
           "123 456.79" 123456.789)
      (are [s n] (= s (numbers/format-number n {:number-separators "."}))
           "9001"      9001
           "-9001"     -9001
           "123456.79" 123456.789)))

  (testing "defaults to two significant figures for |n| < 1"
    (are [s n] (= s (numbers/format-number n {}))
         "0.33"     (/ 1 3)
         "-0.33"    (- (/ 1 3))
         "0.000033" (/ 0.0001 3)
         "0.1"      0.1
         "0.11"     0.11
         "0.11"     0.111
         "0.01"     0.01
         "0.011"    0.011
         "0.011"    0.0111
         "1.1"      1.1
         "1.11"     1.11
         "1.11"     1.111
         "111.11"   111.11))

  (testing "defaults to two decimal places for |n| >= 1"
    (are [s n] (= s (numbers/format-number n {}))
         "1.01"     1.01
         "1.01"     1.011
         "1.01"     1.0111)))

(deftest ^:parallel negative-in-parentheses-test
  (are [s n] (= s (numbers/format-number n {:negative-in-parentheses true}))
       "7"   7
       "(4)" -4
       "0"   0))

(deftest ^:parallel compact-mode-test
  (testing "zero"
    (is (= "0" (numbers/format-number 0 {:compact true}))))

  (testing "small numbers are not truncated to 0"
    (are [s n] (= s (numbers/format-number n {:compact true}))
         "0.1"    0.1
         "-0.1"  -0.1
         "0.01"   0.01
         "-0.01" -0.01))

  (testing "should round up and down"
    (are [s n] (= s (numbers/format-number n {:compact true}))
         "0.12"    0.123
         "0.13"    0.127
         "-0.12"  -0.123
         "-0.13"  -0.127))

  (testing "large numbers get metric suffixes and exactly 1 decimal place"
    (are [s n] (= s (numbers/format-number n {:compact true}))
         "2.0k"  2000
         "2.1k"  2100
         "2.0k"  2049
         "2.1k"  2050
         "2.1k"  2051
         "2.1k"  2100
         "2.1k"  2149
         "2.2k"  2150
         "-2.6M" -2614519
         "19.2M" 19247821
         "-2.6B" -2614519000
         "19.2B" 19247821000
         "-2.6T" -2614519000000
         "19.2T" 19247821000000))

  (testing "percentages"
    (are [s n] (= s (numbers/format-number n {:compact true :number-style "percent"}))
         "86.7%"   0.867
         "123.45%" 1.2345
         "123.46%" 1.234567
         "0%"      0
         "0.1%"    0.001
         "0.01%"   0.0001
         "0.12%"   0.001234
         "10%"     0.1
         "12.34%"  0.1234
         "1.9%"    0.019
         "2.1%"    0.021
         "1.1k%"   11.11
         "-22%"    -0.22))

  (testing "scientific notation"
    (are [s n] (= s (numbers/format-number n {:compact true :number-style "scientific"}))
         "0.0e+0"  0
         "1.0e-4"  0.0001
         "1.0e-2"  0.01
         "5.0e-1"  0.5
         "1.2e+5"  123456.78
         "-1.2e+5" -123456.78)

    (testing "with specified decimal places"
      (are [s n mn mx] (= s (numbers/format-number n {:number-style "scientific"
                                                      :minimum-fraction-digits mn
                                                      :maximum-fraction-digits mx}))
           "0.0e+0"    0          1 1
           "1.00e-4"   0.0001     2 4
           "1e-2"      0.01       0 1
           "5.440e-1"  0.544      3 3 ; extra
           "5.44e-1"   0.544      2 2 ; exact
           "5.44e-1"   0.544      1 2 ; in range
           "5.4e-1"    0.544      1 1 ; short, rounds down
           "5.5e-1"    0.545      1 1 ; short, rounds up
           "-1.235e+5" -123456.78 0 3 ; halves are rounded "up", away from 0.
           "-1.2e+5"   -123456.78 0 1))

    (testing "with custom separators"
      (are [s n] (= s (numbers/format-number n {:compact true
                                                :number-style "scientific"
                                                :number-separators ",."}))
           "0,0e+0"  0
           "1,0e-4"  0.0001
           "1,0e-2"  0.01
           "5,0e-1"  0.5
           "1,2e+5"  123456.78
           "-1,2e+5" -123456.78)))

  (testing "currency values"
    (are [s n c] (= s (numbers/format-number n {:compact      true
                                                :number-style "currency"
                                                :currency     c
                                                :locale       "en"}))
         "$0.00"   0           "USD"
         "$0.00"   0.001       "USD"
         "$0.01"   0.007       "USD"
         "$7.24"   7.24        "USD"
         "$7.25"   7.249       "USD"
         "$724.90" 724.90      "USD"
         "$1.2k"   1234.56     "USD"
         "$1.2M"   1234567.89  "USD"
         "$-1.2M"  -1234567.89 "USD"
         "CN¥1.2M" 1234567.89  "CNY")))

(deftest ^:parallel currency-test
  (are [s n c] (= s (numbers/format-number n {:number-style "currency" :currency c :locale "en"}))
       "$1.23"           1.23        "USD"
       "-$1.23"          -1.23       "USD"
       "$0.00"           0           "USD"
       "$0.00"           0.001       "USD"
       "$0.01"           0.007       "USD"
       "$7.24"           7.24        "USD"
       "$7.25"           7.245       "USD"
       "$7.25"           7.249       "USD"
       "$7.26"           7.255       "USD"
       "$724.90"         724.90      "USD"
       "$1,234.56"       1234.56     "USD"
       "$1,234,567.89"   1234567.89  "USD"
       "-$1,234,567.89"  -1234567.89 "USD"
       "₿6.34527873"     6.345278729 "BTC" ;; BTC is not natively supported, but we fix the symbols. 8 decimal places!
       "¥1,234,568"      1234567.89  "JPY" ;; 0 decimal places for JPY.
       "CN¥1,234,567.89" 1234567.89  "CNY")

  (testing "by name"
    (let [labels {"USD" "US dollars"
                  ;; TODO Override this in the JS side? This is the only spot where the names from Intl.NumberFormat and
                  ;; metabase.shared.util.currency differ.
                  "BTC" #?(:clj "Bitcoins" :cljs "BTC")
                  "CNY" "Chinese yuan"
                  "JPY" "Japanese yen"}]
      (are [s n c] (= (str s " " (get labels c))
                      (numbers/format-number n {:number-style "currency" :currency c :currency-style "name"}))
           "1.23"           1.23        "USD"
           "-1.23"          -1.23       "USD"
           "0.00"           0           "USD"
           "0.00"           0.001       "USD"
           "0.01"           0.007       "USD"
           "7.24"           7.24        "USD"
           "7.25"           7.245       "USD"
           "7.25"           7.249       "USD"
           "7.26"           7.255       "USD"
           "724.90"         724.90      "USD"
           "1,234.56"       1234.56     "USD"
           "1,234,567.89"   1234567.89  "USD"
           "-1,234,567.89"  -1234567.89 "USD"
           "6.34527298"     6.345272982 "BTC"
           "1,234,567.89"   1234567.89  "CNY"
           "1,234,568"      1234567.89  "JPY")))

  (testing "by code"
    (are [s n c] (= s (numbers/format-number n {:number-style "currency" :currency c :currency-style "code"}))
         ;; NB After the currency symbol is a UTF-8 $00a0, a non-breaking space.
         "USD\u00a01.23"           1.23        "USD"
         "-USD\u00a01.23"          -1.23       "USD"
         "USD\u00a00.00"           0           "USD"
         "USD\u00a00.00"           0.001       "USD"
         "USD\u00a00.01"           0.007       "USD"
         "USD\u00a07.24"           7.24        "USD"
         "USD\u00a07.25"           7.245       "USD"
         "USD\u00a07.25"           7.249       "USD"
         "USD\u00a07.26"           7.255       "USD"
         "USD\u00a0724.90"         724.90      "USD"
         "USD\u00a01,234.56"       1234.56     "USD"
         "USD\u00a01,234,567.89"   1234567.89  "USD"
         "-USD\u00a01,234,567.89"  -1234567.89 "USD"
         "BTC\u00a06.34527192"     6.345271916 "BTC"
         "CNY\u00a01,234,567.89"   1234567.89  "CNY"
         "JPY\u00a01,234,568"      1234567.89  "JPY")))

(deftest ^:parallel scientific-test
  (testing "defaults to 0-2 decimal places if not specified"
    (are [s n] (= s (numbers/format-number n {:number-style "scientific"}))
         "0e+0"     0
         "1e-4"     0.0001
         "1e-2"     0.01
         "5e-1"     0.5
         "5.4e-1"   0.54
         "5.5e-1"   0.55
         "1.23e+5"  123456.78
         "-1.23e+5" -123456.78))

  (testing "with specified decimal places"
    (are [s n mn mx] (= s (numbers/format-number n {:number-style "scientific"
                                                    :minimum-fraction-digits mn
                                                    :maximum-fraction-digits mx}))
         "0.0e+0"    0          1 1
         "1.00e-4"   0.0001     2 4
         "1e-2"      0.01       0 1
         "5.440e-1"  0.544      3 3 ; extra
         "5.44e-1"   0.544      2 2 ; exact
         "5.44e-1"   0.544      1 2 ; in range
         "5.4e-1"    0.544      1 1 ; short, rounds down
         "5.5e-1"    0.545      1 1 ; short, rounds up
         "-1.235e+5" -123456.78 0 3 ; halves are rounded "up", away from 0.
         "-1.2e+5"   -123456.78 0 1))

  (testing "with custom separators"
    (are [s n mn mx] (= s (numbers/format-number n {:number-style "scientific"
                                                    :number-separators       ",."
                                                    :minimum-fraction-digits mn
                                                    :maximum-fraction-digits mx}))
         "0,0e+0"    0          1 1
         "1,00e-4"   0.0001     2 4
         "1e-2"      0.01       0 1
         "5,440e-1"  0.544      3 3 ; extra
         "5,44e-1"   0.544      2 2 ; exact
         "5,44e-1"   0.544      1 2 ; in range
         "5,4e-1"    0.544      1 1 ; short, rounds down
         "5,5e-1"    0.545      1 1 ; short, rounds up
         "-1,235e+5" -123456.78 0 3 ; halves are rounded "up", away from 0.
         "-1,2e+5"   -123456.78 0 1)))

;; TODO(braden) Compact currency shows negatives as $-xM; regular currency as -$12.34. Do we care?
;; TODO(braden) Rounding is set to half-up, not half-even. Do we care? Hopefully not, since JavaScript's
;; Intl.NumberFormat has a roundingMode option but it's only lately proposed and not supported anywhere.
;; JS defaults to half-up/half-expand, so we force Java to do the same.
