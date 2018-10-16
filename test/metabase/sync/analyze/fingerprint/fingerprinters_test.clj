(ns metabase.sync.analyze.fingerprint.fingerprinters-test
  (:require [expectations :refer :all]
            [metabase.models.field :as field]
            [metabase.sync.analyze.fingerprint.fingerprinters :refer :all]
            [metabase.util.date :as du]))

(expect
  {:global {:distinct-count 3
            :nil%           0.0}
   :type {:type/DateTime {:earliest (du/date->iso-8601 #inst "2013")
                          :latest   (du/date->iso-8601 #inst "2018")}}}
  (transduce identity
             (fingerprinter (field/map->FieldInstance {:base_type :type/DateTime}))
             [#inst "2013" #inst "2018" #inst "2015"]))

(expect
  {:global {:distinct-count 1
            :nil%           1.0}
   :type {:type/DateTime {:earliest nil
                          :latest   nil}}}
  (transduce identity
             (fingerprinter (field/map->FieldInstance {:base_type :type/DateTime}))
             (repeat 10 nil)))

(expect
  {:global {:distinct-count 3
            :nil%           0.0}
   :type {:type/Number {:avg 2.0
                        :min 1.0
                        :max 3.0
                        :q1 1.25
                        :q3 2.75
                        :sd 1.0}}}
  (transduce identity
             (fingerprinter (field/map->FieldInstance {:base_type :type/Number}))
             [1.0 2.0 3.0]))

(expect
  {:global {:distinct-count 5
            :nil%           0.0}
   :type   {:type/Text {:percent-json 0.2,
                        :percent-url 0.0,
                        :percent-email 0.0,
                        :average-length 6.4}}}
  (transduce identity
             (fingerprinter (field/map->FieldInstance {:base_type :type/Text}))
             ["metabase" "more" "like" "metabae" "[1, 2, 3]"]))
