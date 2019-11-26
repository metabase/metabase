(ns metabase.sync.analyze.fingerprint.fingerprinters-test
  (:require [expectations :refer :all]
            [metabase.models.field :as field]
            [metabase.sync.analyze.fingerprint.fingerprinters :refer :all]))

(expect
  {:global {:distinct-count 3
            :nil%           0.0}
   :type {:type/DateTime {:earliest "2013-01-01T00:00:00Z"
                          :latest   "2018-01-01T00:00:00Z"}}}
  (transduce identity
             (fingerprinter (field/map->FieldInstance {:base_type :type/DateTime}))
             [#t "2013" #t "2018" #t "2015"]))

;; Correctly disambiguate multiple competing multimethods
(expect
  {:global {:distinct-count 3
            :nil%           0.0}
   :type {:type/DateTime {:earliest "2013-01-01T00:00:00Z"
                          :latest   "2018-01-01T00:00:00Z"}}}
  (transduce identity
             (fingerprinter (field/map->FieldInstance {:base_type    :type/DateTime
                                                       :special_type :type/FK}))
             [#t "2013" #t "2018" #t "2015"]))

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
