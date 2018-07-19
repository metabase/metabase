(ns metabase.sync.analyze.fingerprint.fingerprinters-test
  (:require [expectations :refer :all]
            [metabase.models.field :as field]
            [metabase.sync.analyze.fingerprint.fingerprinters :refer :all]
            [metabase.util.date :as du]))

(expect
  {:global {:distinct-count 3}
   :type {:type/DateTime {:earliest (str (du/str->date-time "2013"))
                          :latest   (str (du/str->date-time "2018"))}}}
  (transduce identity
             (fingerprinter (field/map->FieldInstance {:base_type :type/DateTime}))
             ["2013" "2018" "2015"]))

(expect
  {:global {:distinct-count 3}
   :type {:type/Number {:avg 2.0
                        :min 1.0
                        :max 3.0}}}
  (transduce identity
             (fingerprinter (field/map->FieldInstance {:base_type :type/Number}))
             [1.0 2.0 3.0]))
