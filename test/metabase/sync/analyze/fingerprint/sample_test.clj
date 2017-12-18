(ns metabase.sync.analyze.fingerprint.sample-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.analyze.fingerprint.sample :as sample]
            [metabase.test.data :as data]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             TESTS FOR BASIC-SAMPLE                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Actually the order the rows come back in isn't really guaranteed so this test is sort of testing a circumstantial
;; side-effect of the way H2 returns rows when order isn't specified
(expect
  [[1 "Red Medicine"]
   [2 "Stout Burgers & Beers"]
   [3 "The Apple Pan"]
   [4 "Wurstküche"]
   [5 "Brite Spot Family Restaurant"]]
  (take 5 (#'sample/basic-sample
           (Table (data/id :venues))
           [(Field (data/id :venues :id))
            (Field (data/id :venues :name))])))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      TESTS FOR TABLE-SAMPLE->FIELD-SAMPLE                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private table-sample
  [[100 "ABC" nil]
   [200 "DEF" nil]
   [300 nil   nil]
   [400 "GHI" nil]
   [500 "JKL" nil]])

(expect
  [100 200 300 400 500]
  (#'sample/table-sample->field-sample table-sample 0))

;; should skip any `nil` values
(expect
  ["ABC" "DEF" "GHI" "JKL"]
  (#'sample/table-sample->field-sample table-sample 1))

;; should return `nil` if all values are `nil` (instead of empty sequence)
(expect
  nil
  (#'sample/table-sample->field-sample table-sample 2))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            TESTS FOR SAMPLE-FIELDS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  [["ID"   [1 2 3 4 5]]
   ["NAME" ["Red Medicine" "Stout Burgers & Beers" "The Apple Pan" "Wurstküche" "Brite Spot Family Restaurant"]]]
  (for [[field sample] (sample/sample-fields
                        (Table (data/id :venues))
                        [(Field (data/id :venues :id))
                         (Field (data/id :venues :name))])]
    [(:name field) (take 5 sample)]))
