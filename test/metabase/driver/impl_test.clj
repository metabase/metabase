(ns metabase.driver.impl-test
  (:require [clojure.core.async :as a]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.impl :as driver.impl]
            [metabase.test.util.async :as tu.async]))

(deftest driver->expected-namespace-test
  (testing "expected namespace for a non-namespaced driver should be `metabase.driver.<driver>`"
    (is (= 'metabase.driver.sql-jdbc
           (#'driver.impl/driver->expected-namespace :sql-jdbc))))
  (testing "for a namespaced driver it should be the namespace of the keyword"
    (is (= 'metabase.driver.impl-test
           (#'driver.impl/driver->expected-namespace ::toucans)))))

(deftest load-driver-namespace-race-condition-test
  (testing "Make sure we don't report a driver as being registered if its namespace is in the process of being loaded (#13114)"
    (alter-var-root #'driver.impl/hierarchy underive ::race-condition-test :metabase.driver/driver)
    ;; basic idea for this test is simulate loading a driver namespace on a different thread and have it register
    ;; itself immediately. Then on another thread we should call `the-initialized-driver`, but it shouldn't return
    ;; until the namespace has completed loading.
    (tu.async/with-open-channels [started-loading-chan (a/promise-chan)]
      (let [finished-loading (atom false)]
        (with-redefs [driver.impl/require-driver-ns (fn [_]
                                                      (driver/register! ::race-condition-test)
                                                      (a/>!! started-loading-chan :start)
                                                      (Thread/sleep 100)
                                                      (reset! finished-loading true))]
          ;; fire off a separate thread that will start loading the driver
          (future (driver/the-initialized-driver ::race-condition-test))
          (tu.async/wait-for-result started-loading-chan 500)
          (is (= ::race-condition-test
                 (driver/the-initialized-driver ::race-condition-test)))
          (is (= true
                 @finished-loading)))))))

(deftest truncate-string-to-byte-count-test
  (letfn [(truncate-string-to-byte-count [s byte-length]
            (let [^String truncated (#'driver.impl/truncate-string-to-byte-count s byte-length)]
              (is (<= (count (.getBytes truncated "UTF-8")) byte-length))
              (is (str/starts-with? s truncated))
              truncated))]
    (doseq [[s max-length->expected] {"12345"
                                      {0  ""
                                       1  "1"
                                       2  "12"
                                       3  "123"
                                       4  "1234"
                                       5  "12345"
                                       6  "12345"
                                       10 "12345"}

                                      "가나다라"
                                      {0  ""
                                       1  ""
                                       2  ""
                                       3  "가"
                                       4  "가"
                                       5  "가"
                                       6  "가나"
                                       7  "가나"
                                       8  "가나"
                                       9  "가나다"
                                       10 "가나다"
                                       11 "가나다"
                                       12 "가나다라"
                                       13 "가나다라"
                                       15 "가나다라"
                                       20 "가나다라"}}
            [max-length expected] max-length->expected]
      (testing (pr-str (list `driver.impl/truncate-string-to-byte-count s max-length))
        (is (= expected
               (truncate-string-to-byte-count s max-length)))))))

(deftest truncate-alias-test
  (letfn [(truncate-alias [s max-bytes]
            (let [truncated (driver.impl/truncate-alias s max-bytes)]
              (is (<= (count (.getBytes truncated "UTF-8")) max-bytes))
              truncated))]
    (doseq [[s max-bytes->expected] { ;; 20-character plain ASCII string
                                     "01234567890123456789"
                                     {12 "012_fc89bad5"
                                      15 "012345_fc89bad5"
                                      20 "01234567890123456789"}

                                     ;; two strings that only differ after the point they get truncated
                                     "0123456789abcde" {12 "012_1629bb92"}
                                     "0123456789abcdE" {12 "012_2d479b5a" }

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
      (testing (pr-str (list `driver.impl/truncate-alias s max-bytes))
        (is (= expected
               (truncate-alias s max-bytes)))))))
