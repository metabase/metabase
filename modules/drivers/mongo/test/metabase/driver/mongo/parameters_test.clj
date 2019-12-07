(ns metabase.driver.mongo.parameters-test
  (:require [clojure.test :refer :all]
            [metabase.driver.common.parameters :as common.params]
            [metabase.driver.mongo.parameters :as params]))

(deftest substitute-test
  (letfn [(substitute [param->value xs]
            (#'params/substitute param->value xs))
          (param [k]
            (common.params/->Param k))
          (optional [& xs]
            (common.params/->Optional xs))]
    (testing "non-parameterized strings should not be substituted"
      (is (= "wow"
             (substitute nil ["wow"]))))
    (testing "non-optional-params"
      (testing "single param with no string before or after"
        (is (= "100"
               (substitute {:x 100} [(param :x)]))
            "\"{{x}}\" with x = 100 should be replaced with \"100\""))
      (testing "if a param is missing, an Exception should be thrown"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"missing required parameters: #\{:x\}"
                              (substitute nil [(param :x)]))))
      (testing "params preceeded or followed by strings should get combined into a single string"
        (is (= "2100"
               (substitute {:x 100} ["2" (param :x)]))
            "\"2{{x}}\" with x = 100 should be replaced with string \"2100\""))
      (testing "temporal params"
        (is (= "2019-12-06T17:01:00-08:00"
               (substitute {:written-at #t "2019-12-06T17:01:00-08:00[America/Los_Angeles]"} [(param :written-at)]))))
      (testing "multiple params in one string"
        (is (= "2019-12-06"
               (substitute {:year 2019, :month 12, :day "06"} [(param :year) "-" (param :month) "-" (param :day)]))
            "\"{{year}}-{{month}}-{{day}}\" should be replaced with \"2019-12-06\"")
        (testing "some params missing"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"missing required parameters: #\{:day\}"
                                (substitute {:year 2019, :month 12} [(param :year) "-" (param :month) "-" (param :day)]))))))
    (testing "optional params"
      (testing "single optional param"
        (is (= nil
               (substitute nil [(optional (param :x))]))
            "\"[[{{x}}]]\" with no value for x should be replaced with `nil`"))
      (testing "{{year}}[[-{{month}}[[-{{day}}]]]]"
        (let [params [(param :year) (optional "-" (param :month) (optional "-" (param :day)))]]
          (testing "with all params present"
            (is (= "2019-12-06"
                   (substitute {:year 2019, :month 12, :day "06"} params))))
          (testing "with :year & :month present but not :day"
            (is (= "2019-12"
                   (substitute {:year 2019, :month 12} params))))
          (testing "with :year present but not :month or :day"
            (is (= "2019"
                   (substitute {:year 2019} params))))
          (testing "with no params present"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"missing required parameters"
                                  (substitute nil params)))))))))
