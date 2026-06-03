(ns mage.bot.prompt-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.bot.prompt]))

(set! *warn-on-reflection* true)

(def ^:private parse-set-args #'mage.bot.prompt/parse-set-args)

(deftest parse-set-args-test
  (testing "basic key=value"
    (is (= {"KEY" "value"} (parse-set-args ["KEY=value"]))))
  (testing "multiple args"
    (is (= {"A" "1" "B" "2"} (parse-set-args ["A=1" "B=2"]))))
  (testing "value containing ="
    (is (= {"FOO" "bar=baz"} (parse-set-args ["FOO=bar=baz"]))))
  (testing "empty list"
    (is (= {} (parse-set-args []))))
  (testing "nil list"
    (is (= {} (parse-set-args nil)))))
