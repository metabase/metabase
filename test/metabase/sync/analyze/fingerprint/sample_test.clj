(ns metabase.sync.analyze.fingerprint.sample-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.analyze.fingerprint.sample :refer :all]
            [metabase.test.data :as data]))

;; Actually the order the rows come back in isn't really guaranteed so this test is sort of testing a circumstantial
;; side-effect of the way H2 returns rows when order isn't specified
(expect
  [[1 "Red Medicine"]
   [2 "Stout Burgers & Beers"]
   [3 "The Apple Pan"]
   [4 "Wurstküche"]
   [5 "Brite Spot Family Restaurant"]]
  (take 5 (sample-fields
           (Table (data/id :venues))
           [(Field (data/id :venues :id))
            (Field (data/id :venues :name))])))
