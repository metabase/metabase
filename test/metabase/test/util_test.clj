(ns metabase.test.util-test
  "Tests for the test utils!"
  (:require [expectations :refer [expect]]
            [metabase.models
             [field :refer [Field]]
             [setting :as setting]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util :as u]
            [toucan.db :as db]))

;; let's make sure this acutally works right!
(expect
  [-1 0]
  (let [position #(db/select-one-field :position Field :id (data/id :venues :price))]
    [(tu/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
       (position))
     (position)]))

(expect
  0
  (do
    (u/ignore-exceptions
      (tu/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
        (throw (Exception.))))
    (db/select-one-field :position Field :id (data/id :venues :price))))


(setting/defsetting test-util-test-setting
  "Another internal test setting"
  :internal? true
  :default "A,B,C"
  :type :csv)

;; `with-temporary-setting-values` should do its thing
(expect
  ["D" "E" "F"]
  (tu/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
    (test-util-test-setting)))

;; `with-temporary-setting-values` shouldn't stomp over default values
(expect
  ["A" "B" "C"]
  (do
    (tu/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (test-util-test-setting))
    (test-util-test-setting)))
