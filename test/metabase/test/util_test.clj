(ns metabase.test.util-test
  "Tests for the test utils!"
  (:require
   [clojure.test :refer :all]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest with-temp-vals-in-db-test
  (testing "let's make sure this actually works right!"
    (let [position #(t2/select-one-fn :position :model/Field :id (data/id :venues :price))]
      (mt/with-temp-vals-in-db :model/Field (data/id :venues :price) {:position -1}
        (is (= -1
               (position))))
      (is (= 5
             (position)))))
  (testing "if an Exception is thrown, original value should be restored"
    (u/ignore-exceptions
      (mt/with-temp-vals-in-db :model/Field (data/id :venues :price) {:position -1}
        (throw (Exception.))))
    (is (= 5
           (t2/select-one-fn :position :model/Field :id (data/id :venues :price))))))

(setting/defsetting test-util-test-setting
  "Another internal test setting"
  :visibility :internal
  :default    ["A" "B" "C"]
  :type       :csv
  :encryption :no)

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

(deftest ^:parallel ordered-subset?-test
  (is (mt/ordered-subset? [1 2 3] [1 2 3]))
  (is (mt/ordered-subset? [1 2 3] [1 2 1 3 4 5]))
  (is (mt/ordered-subset? [1 2 3] [1 2 3 4]))
  (is (mt/ordered-subset? [1 2 3] [0 1 2 3]))
  (is (mt/ordered-subset? [1 2 3] [0 1 2 3 4 5]))
  (is (not (mt/ordered-subset? [1 2 3] [1 2])))
  (is (mt/ordered-subset? [] []))
  (is (mt/ordered-subset? [] [1]))
  (is (not (mt/ordered-subset? [1] [])))
  (is (mt/ordered-subset? ["foo"   "bar"              "baz"]
                          ["elephants" "foxes" "badgers" "zebras" "beavers" "platypi"]
                          (fn [x y] (= (first x) (first y))))))
