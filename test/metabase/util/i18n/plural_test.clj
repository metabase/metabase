(ns ^:mb/once metabase.util.i18n.plural-test
  (:require
   [clojure.test :refer :all]
   [instaparse.core :as insta]
   [metabase.util.i18n.plural :as i18n.plural]))

(defn- compute
  ([formula]
   (compute formula 0))
  ([formula n]
   (i18n.plural/index (str "plural=" formula) n)))

(deftest basic-arithmetic-test
  (testing "basic arithmetic"
    (are [formula expected] (= expected (compute formula))
      "0"                         0
      "1"                         1
      "123;"                      123

      "1 + 2"                     3
      "1+2"                       3
      " 1 + 2 ; "                 3
      "2 - 1"                     1
      "1 - 2"                     -1
      "1 - 1"                     0
      "1 + 2 + 3"                 6
      "3 + 2 - 1"                 4

      "2 * 3"                     6
      "4 / 2"                     2
      "1 * 5 / 1"                 5
      "100/10*2"                  20

      "1 + 2 * 3"                 7
      "2 * 3 + 1"                 7
      "(1 + 2) * 3"               9
      "3 * (1 + 2)"               9

      "3 > 5"                     0
      "5 > 3"                     1
      "3 < 5"                     1
      "5 < 3"                     0

      "5 > 5"                     0
      "5 >= 5"                    1
      "5 < 5"                     0
      "5 <= 5"                    1

      "3 > 5 > 3"                 0
      "5 > 3 > 0"                 1
      "1 < 2 > 3"                 0
      "1 < 2 > 0"                 1

      "1 == 1"                    1
      "0 == 1"                    0
      "1 == 0"                    0

      "1 != 1"                    0
      "0 != 1"                    1
      "1 != 0"                    1

      "1 || 0"                    1
      "1 || 1"                    1
      "6 || 7"                    1
      "0 || 0"                    0

      "0 && 0"                    0
      "1 && 0"                    0
      "0 && 1"                    0
      "1 && 1"                    1
      "6 && 7"                    1

      "1 < 2 ? 0 : 1"             0
      "1 > 2 ? 0 : 1"             1
      "1 < 2 ? 1 || 0 : 0"        1
      "1 > 2 ? 1 : 1 && 0"        0
      "1 > 2 ? 0 : 1 < 1 ? 1 : 2" 2
      "1 < 2 ? 1 < 3 ? 1 : 2 : 3" 1))

  (testing "Error cases"
    (are [formula] (insta/failure? (compute formula))
      ;; Empty formulas
      ""
      " "
      "()"
      ";"
      ;; Malformed/unsupported expressions
      "1 +"
      "* 2"
      "(1 + 2"
      "+ 1 2"
      "3 >> 4"
      "n = 3"
      "n == 1 ? 0 1"
      ;; Only `n` allowed as a variable
      "x"
      "y + 3"
      ;; Non-integer numbers
      "1.23"
      "0.3"
      ".9")))

(deftest locale-pluralization-test
  ;; This test uses selected example Plural-Forms from https://www.gnu.org/software/gettext/manual/html_node/Plural-forms.html
  ;; These do not necessarily correspond to languages available in Metabase.
  (testing "English, German, Dutch, Spanish, Portuguese, etc"
    (are [n expected] (= expected (compute "n != 1" n))
      0 1
      1 0
      2 1))

  (testing "French"
    (are [n expected] (= expected (compute "n > 1" n))
      0 0
      1 0
      2 1))

  (testing "Latvian"
    (are [n expected] (= expected (compute "n%10==1 && n%100!=11 ? 0 : n != 0 ? 1 : 2" n))
      0   2
      1   0
      11  1
      21  0
      111 1))

  (testing "Irish"
    (are [n expected] (= expected (compute "n==1 ? 0 : n==2 ? 1 : 2" n))
      1 0
      2 1
      3 2))

  (testing "Romanian"
    (are [n expected] (= expected (compute "n==1 ? 0 : (n==0 || (n%100 > 0 && n%100 < 20)) ? 1 : 2" n))
      0   1
      1   0
      2   1
      19  1
      20  2
      100 2
      101 1))

  (testing "Russian, Ukrainian, Serbian"
    (are [n expected] (= expected (compute (str "n%10==1 && n%100!=11 ? 0 :"
                                                "n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2")
                                           n))
      0   2
      1   0
      11  2
      21  0
      101 0
      102 1
      109 2
      110 2))

  (testing "Czech, Slovak"
    (are [n expected] (= expected (compute "(n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2" n))
      0 2
      1 0
      2 1
      3 1
      4 1
      5 2))

  (testing "Polish"
    (are [n expected] (= expected (compute (str "n==1 ? 0 :"
                                                "n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2")
                                           n))
      0 2
      1 0
      12 2
      104 1
      105 2
      121 2
      122 1)))
