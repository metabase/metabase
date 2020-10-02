(ns metabase.sync.analyze.fingerprint.fingerprinters-test
  (:require [clojure.test :refer :all]
            [metabase.models.field :as field :refer [Field]]
            [metabase.sync.analyze.fingerprint.fingerprinters :refer :all]
            [metabase.test :as mt]
            [schema.core :as s]
            [toucan.db :as db]))

(deftest fingerprint-temporal-values-test
  ;; we want to test h2 and postgres, because h2 doesn't
  ;; support overriding the timezone for a session / report
  (mt/test-drivers #{:h2 :postgres}
    (doseq [tz ["UTC" nil]]
      (mt/with-temporary-setting-values [report-timezone tz]
        (mt/with-database-timezone-id "UTC"
          (mt/with-everything-store
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
                               (repeat 10 nil)))))
            (testing "handle all supported types"
              (is (= {:global {:distinct-count 5
                               :nil%           0.0}
                      :type   {:type/DateTime {:earliest "1970-01-01T00:00:01.234Z"
                                               :latest   "2020-07-06T20:25:33.36Z"}}}
                     (transduce identity
                                (fingerprinter (field/map->FieldInstance {:base_type :type/Temporal}))
                                [(java.time.LocalDateTime/of 2013 01 01 20 04 0 0) ; LocalDateTime
                                 1234 ; int
                                 1594067133360 ; long
                                 "2007-12-03T10:15:30.00Z" ; string
                                 (java.time.ZonedDateTime/of 2016 01 01 20 04 0 0 (java.time.ZoneOffset/UTC))]))))))))))

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

(deftest fingerprints-in-db-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Fingerprints should actually get saved with the correct values"
      (testing "Text fingerprints"
        (is (schema= {:global {:distinct-count (s/eq 100)
                               :nil%           (s/eq 0.0)}
                      :type   {:type/Text {:percent-json   (s/eq 0.0)
                                           :percent-url    (s/eq 0.0)
                                           :percent-email  (s/eq 0.0)
                                           :average-length (s/pred #(< 15 % 16) "between 15 and 16")}}}
                     (db/select-one-field :fingerprint Field :id (mt/id :venues :name)))))
      (testing "date fingerprints"
        (is (schema= {:global {:distinct-count (s/eq 618)
                               :nil%           (s/eq 0.0)}
                      :type   {:type/DateTime {:earliest (s/pred #(.startsWith % "2013-01-03"))
                                               :latest   (s/pred #(.startsWith % "2015-12-29"))}}}
                     (db/select-one-field :fingerprint Field :id (mt/id :checkins :date)))))
      (testing "number fingerprints"
        (is (schema= {:global {:distinct-count (s/eq 4)
                               :nil%           (s/eq 0.0)}
                      :type   {:type/Number {:min (s/eq 1.0)
                                             :q1  (s/pred #(< 1.44 % 1.46) "approx 1.4591129021415095")
                                             :q3  (s/pred #(< 2.4 % 2.5) "approx 2.493086095768049")
                                             :max (s/eq 4.0)
                                             :sd  (s/pred #(< 0.76 % 0.78) "between 0.76 and 0.78")
                                             :avg (s/eq 2.03)}}}
                     (db/select-one-field :fingerprint Field :id (mt/id :venues :price))))))))
