(ns metabase.sync.analyze.fingerprint.fingerprinters-test
  (:require [clojure.test :refer :all]
            [metabase.models.field :as field]
            [metabase.sync.analyze.fingerprint.fingerprinters :refer :all]))

(deftest fingerprint-temporal-values-test
  (is (= {:global {:distinct-count 4
                   :nil%           0.5}
          :type   {:type/DateTime {:earliest "2013-01-01"
                                   :latest   "2018-01-01"}}}
         (transduce identity
                    (fingerprinter (field/map->FieldInstance {:base_type :type/DateTime}))
                    [#t "2013" nil #t "2018" nil nil #t "2015"])))
  (testing "handle ChronoLocalDateTime"
    (is (= {:global {:distinct-count 2
                     :nil%           0.0}
            :type   {:type/DateTime {:earliest "2013-01-01T20:04:00Z"
                                     :latest   "2018-01-01T04:04:00Z"}}}
           (transduce identity
                      (fingerprinter (field/map->FieldInstance {:base_type :type/Temporal}))
                      [(java.time.LocalDateTime/of 2013 01 01 20 04 0 0)
                       (java.time.LocalDateTime/of 2018 01 01 04 04 0 0)]))))
  (testing "handle comparing explicit Instant with ChronoLocalDateTime"
    (is (= {:global {:distinct-count 2
                     :nil%           0.0}
            :type   {:type/DateTime {:earliest "2007-12-03T10:15:30Z"
                                     :latest   "2018-01-01T04:04:00Z"}}}
           (transduce identity
                      (fingerprinter (field/map->FieldInstance {:base_type :type/Temporal}))
                      [(java.time.Instant/parse "2007-12-03T10:15:30.00Z")
                       (java.time.LocalDateTime/of 2018 01 01 04 04 0 0)]))))
  (testing "mixing numbers and strings"
    (is (= {:global {:distinct-count 2
                     :nil%           0.0}
            :type   {:type/DateTime {:earliest "1970-01-01T00:00:01.234Z"
                                     :latest   "2007-12-03T10:15:30Z"}}}
           (transduce identity
                      (fingerprinter (field/map->FieldInstance {:base_type :type/Temporal}))
                      ["2007-12-03T10:15:30.00Z" 1234]))))
  (testing "nil temporal values"
    (is (= {:global {:distinct-count 1
                     :nil%           1.0}
            :type   {:type/DateTime {:earliest nil
                                     :latest   nil}}}
           (transduce identity
                      (fingerprinter (field/map->FieldInstance {:base_type :type/DateTime}))
                      (repeat 10 nil))))))

(deftest disambiguate-test
  (testing "We should correctly disambiguate multiple competing multimethods (DateTime and FK in this case)"
    (is (= {:global {:distinct-count 3
                     :nil%           0.0}
            :type   {:type/DateTime {:earliest "2013-01-01"
                                     :latest   "2018-01-01"}}}
           (transduce identity
                      (fingerprinter (field/map->FieldInstance {:base_type    :type/DateTime
                                                                :special_type :type/FK}))
                      [#t "2013" #t "2018" #t "2015"])))))

(deftest fingerprint-numeric-values-test
  (is (= {:global {:distinct-count 3
                   :nil%           0.0}
          :type   {:type/Number {:avg 2.0
                                 :min 1.0
                                 :max 3.0
                                 :q1  1.25
                                 :q3  2.75
                                 :sd  1.0}}}
         (transduce identity
                    (fingerprinter (field/map->FieldInstance {:base_type :type/Number}))
                    [1.0 2.0 3.0])))
  (testing "We should robustly survive weird values such as NaN, Infinity, and nil"
    (is (= {:global {:distinct-count 7
                     :nil%           0.25}
            :type   {:type/Number {:avg 2.0
                                   :min 1.0
                                   :max 3.0
                                   :q1  1.25
                                   :q3  2.75
                                   :sd  1.0}}}
           (transduce identity
                      (fingerprinter (field/map->FieldInstance {:base_type :type/Number}))
                      [1.0 2.0 3.0 Double/NaN Double/POSITIVE_INFINITY Double/NEGATIVE_INFINITY nil nil])))))

(deftest fingerprint-string-values-test
  (is (= {:global {:distinct-count 5
                   :nil%           0.0}
          :type   {:type/Text {:percent-json   0.2
                               :percent-url    0.0
                               :percent-email  0.0
                               :average-length 6.4}}}
         (transduce identity
                    (fingerprinter (field/map->FieldInstance {:base_type :type/Text}))
                    ["metabase" "more" "like" "metabae" "[1, 2, 3]"]))))
