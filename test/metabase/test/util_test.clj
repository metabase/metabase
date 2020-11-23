(ns metabase.test.util-test
  "Tests for the test utils!"
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.models
             [field :refer [Field]]
             [setting :as setting]]
            [metabase.test.data :as data]
            [toucan.db :as db]))

(deftest with-temp-vals-in-db-test
  (testing "let's make sure this acutally works right!"
    (let [position #(db/select-one-field :position Field :id (data/id :venues :price))]
      (mt/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
        (is (= -1
               (position))))
      (is (= 5
             (position)))))

  (testing "if an Exception is thrown, original value should be restored"
    (u/ignore-exceptions
     (mt/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
       (throw (Exception.))))
    (is (= 5
           (db/select-one-field :position Field :id (data/id :venues :price))))))

(setting/defsetting test-util-test-setting
  "Another internal test setting"
  :visibility :internal
  :default "A,B,C"
  :type :csv)

(deftest with-temporary-setting-values-test
  (testing "`with-temporary-setting-values` should do its thing"
    (mt/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (is (= ["D" "E" "F"]
             (test-util-test-setting)))))

  (testing "`with-temporary-setting-values` shouldn't stomp over default values"
    (mt/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (test-util-test-setting))
    (is (= ["A" "B" "C"]
           (test-util-test-setting)))))
