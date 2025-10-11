(ns metabase.lib.util.unique-name-generator-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]
   [metabase.util :as u]))

(deftest ^:parallel crc32-checksum-test
  (are [s checksum] (= checksum
                       (#'lib.util.unique-name-generator/crc32-checksum s))
    "YMRZFRTHUBOUZHPTZGPD" "2694651f"
    "MEBRXTJEPWOJJXVZIPDA" "048132cb"
    "UIOJOTPGUIROVRJYAFPO" "0085cacb"
    "UCVEWTGNBDANGMZPGNQC" "000e32a0"
    "ZAFVKSVXQKJNGANBQZMX" "0000d5b8"
    "NCTFDMQNUEQLJUMAGSYG" "000000ea"
    "YHQJXDIXGGQTSARGOQZZ" "000000c1"
    "0601246074"           "00000001"
    "2915035893"           "00000000"))

(deftest ^:parallel truncate-alias-test
  (letfn [(truncate-alias [s max-bytes]
            (let [truncated (lib.util.unique-name-generator/truncate-alias s max-bytes)]
              (is (<= (u/string-byte-count truncated) max-bytes))
              truncated))]
    (doseq [[s max-bytes->expected] {;; 20-character plain ASCII string
                                     "01234567890123456789"
                                     {12 "012_fc89bad5"
                                      15 "012345_fc89bad5"
                                      20 "01234567890123456789"}

                                     ;; two strings that only differ after the point they get truncated
                                     "0123456789abcde" {12 "012_1629bb92"}
                                     "0123456789abcdE" {12 "012_2d479b5a"}

                                     ;; Unicode string: 14 characters, 42 bytes
                                     "가나다라마바사아자차카타파하"
                                     {12 "가_b9c95392"
                                      13 "가_b9c95392"
                                      14 "가_b9c95392"
                                      15 "가나_b9c95392"
                                      20 "가나다_b9c95392"
                                      30 "가나다라마바사_b9c95392"
                                      40 "가나다라마바사아자차_b9c95392"
                                      50 "가나다라마바사아자차카타파하"}

                                     ;; Mixed string: 17 characters, 33 bytes
                                     "a가b나c다d라e마f바g사h아i"
                                     {12 "a_99a0fe0c"
                                      13 "a가_99a0fe0c"
                                      14 "a가b_99a0fe0c"
                                      15 "a가b_99a0fe0c"
                                      20 "a가b나c_99a0fe0c"
                                      30 "a가b나c다d라e마f_99a0fe0c"
                                      40 "a가b나c다d라e마f바g사h아i"}}
            [max-bytes expected] max-bytes->expected]
      (testing (pr-str (list `lib.util.unique-name-generator/truncate-alias s max-bytes))
        (is (= expected
               (truncate-alias s max-bytes)))))))

(deftest ^:parallel unique-name-generator-test
  (let [unique-name-fn (lib.util.unique-name-generator/unique-name-generator)]
    (is (= "wow"
           (unique-name-fn "wow")))
    (is (= "wow_2"
           (unique-name-fn "wow")))
    (testing "should be case-insensitive distinct"
      (is (= "WOW_3"
             (unique-name-fn "WOW"))))
    (testing "should truncate long names"
      (is (= "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_2dc86ef1"
             (unique-name-fn "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")))
      (is (= "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_fc11882d"
             (unique-name-fn "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))))))

(deftest ^:parallel unique-name-generator-idempotence-test
  (testing "idempotence (2-arity calls to generated function)"
    (let [unique-name (lib.util.unique-name-generator/unique-name-generator)]
      (is (= ["A" "B" "A" "A_2" "A_2"]
             [(unique-name :x "A")
              (unique-name :x "B")
              (unique-name :x "A")
              (unique-name :y "A")
              (unique-name :y "A")])))))

(deftest ^:parallel unique-name-generator-zero-arity-test
  (let [f (lib.util.unique-name-generator/unique-name-generator)]
    (is (= ["A" "B" "A" "A_2" "A_2"]
           [(f :x "A")
            (f :x "B")
            (f :x "A")
            (f :y "A")
            (f :y "A")]))
    (let [f' (f)]
      (is (= ["A" "B" "A" "A_2" "A_2"]
             [(f' :x "A")
              (f' :x "B")
              (f' :x "A")
              (f' :y "A")
              (f' :y "A")]))
      (let [f'' (f')]
        (is (= ["A" "B" "A" "A_2" "A_2"]
               [(f'' :x "A")
                (f'' :x "B")
                (f'' :x "A")
                (f'' :y "A")
                (f'' :y "A")]))))))

(deftest ^:parallel non-truncating-unique-name-generator-test
  (let [f (lib.util.unique-name-generator/non-truncating-unique-name-generator)]
    (is (= "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
           (f "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count")))))

(deftest ^:parallel unique-name-generator-with-options-test
  (testing "Can we get a simple unique name generator"
    (is (= ["count" "sum" "count_2" "count_2_2"]
           (map (lib.util.unique-name-generator/unique-name-generator-with-options) ["count" "sum" "count" "count_2"])))))

(deftest ^:parallel unique-name-generator-with-options-test-2
  (testing "Can we get an idempotent unique name generator"
    (is (= ["count" "sum" "count" "count_2"]
           (map (lib.util.unique-name-generator/unique-name-generator-with-options) [:x :y :x :z] ["count" "sum" "count" "count_2"])))))

(deftest ^:parallel unique-name-generator-with-options-test-3
  (testing "Can the same object have multiple aliases"
    (is (= ["count" "sum" "count" "count_2"]
           (map (lib.util.unique-name-generator/unique-name-generator-with-options) [:x :y :x :x] ["count" "sum" "count" "count_2"])))))

(deftest ^:parallel unique-name-generator-with-options-idempotence-test
  (testing "idempotence (2-arity calls to generated function) (#40994)"
    (let [unique-name (lib.util.unique-name-generator/unique-name-generator-with-options)]
      (is (= ["A" "B" "A" "A_2" "A_2"]
             [(unique-name :x "A")
              (unique-name :x "B")
              (unique-name :x "A")
              (unique-name :y "A")
              (unique-name :y "A")])))))

(deftest ^:parallel unique-name-generator-options-test
  (testing "options"
    (testing :name-key-fn
      (let [f (lib.util.unique-name-generator/unique-name-generator-with-options :name-key-fn #_{:clj-kondo/ignore [:discouraged-var]} str/lower-case)]
        (is (= ["x" "X_2" "X_3"]
               (map f ["x" "X" "X"])))))))

(deftest ^:parallel unique-name-generator-options-test-2
  (testing "options"
    (testing :unique-alias-fn
      (let [f (lib.util.unique-name-generator/unique-name-generator-with-options :unique-alias-fn (fn [x y] (str y "~~" x)))]
        (is (= ["x" "2~~x"]
               (map f ["x" "x"])))))))
