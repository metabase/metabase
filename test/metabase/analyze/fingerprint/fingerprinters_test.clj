(ns ^:mb/driver-tests metabase.analyze.fingerprint.fingerprinters-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.driver :as driver]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.types.core-test :as mty]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest fingerprint-temporal-values-test
  ;; we want to test h2 and postgres, because h2 doesn't
  ;; support overriding the timezone for a session / report
  (mt/test-drivers #{:h2 :postgres}
    (doseq [tz ["UTC" nil]]
      (mt/with-temporary-setting-values [report-timezone tz]
        (mt/with-database-timezone-id "UTC"
          (mt/with-metadata-provider (mt/id)
            (is (= {:global {:distinct-count 4
                             :nil%           0.5}
                    :type   {:type/DateTime {:earliest "2013-01-01"
                                             :latest   "2018-01-01"}}}
                   (transduce identity
                              (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/DateTime}))
                              [#t "2013" nil #t "2018" nil nil #t "2015"])))
            (testing "handle ChronoLocalDateTime"
              (is (= {:global {:distinct-count 2
                               :nil%           0.0}
                      :type   {:type/DateTime {:earliest "2013-01-01T20:04:00Z"
                                               :latest   "2018-01-01T04:04:00Z"}}}
                     (transduce identity
                                (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Temporal}))
                                [(java.time.LocalDateTime/of 2013 01 01 20 04 0 0)
                                 (java.time.LocalDateTime/of 2018 01 01 04 04 0 0)]))))
            (testing "handle comparing explicit Instant with ChronoLocalDateTime"
              (is (= {:global {:distinct-count 2
                               :nil%           0.0}
                      :type   {:type/DateTime {:earliest "2007-12-03T10:15:30Z"
                                               :latest   "2018-01-01T04:04:00Z"}}}
                     (transduce identity
                                (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Temporal}))
                                [(java.time.Instant/parse "2007-12-03T10:15:30.00Z")
                                 (java.time.LocalDateTime/of 2018 01 01 04 04 0 0)]))))
            (testing "mixing numbers and strings"
              (is (= {:global {:distinct-count 2
                               :nil%           0.0}
                      :type   {:type/DateTime {:earliest "1970-01-01T00:00:01.234Z"
                                               :latest   "2007-12-03T10:15:30Z"}}}
                     (transduce identity
                                (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Temporal}))
                                ["2007-12-03T10:15:30.00Z" 1234]))))
            (testing "nil temporal values"
              (is (= {:global {:distinct-count 1
                               :nil%           1.0}
                      :type   {:type/DateTime {:earliest nil
                                               :latest   nil}}}
                     (transduce identity
                                (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/DateTime}))
                                (repeat 10 nil)))))
            (testing "handle all supported types"
              (is (= {:global {:distinct-count 5
                               :nil%           0.0}
                      :type   {:type/DateTime {:earliest "1970-01-01T00:00:01.234Z"
                                               :latest   "2020-07-06T20:25:33.36Z"}}}
                     (transduce identity
                                (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Temporal}))
                                [(java.time.LocalDateTime/of 2013 01 01 20 04 0 0) ; LocalDateTime
                                 1234                                              ; int
                                 1594067133360                                     ; long
                                 "2007-12-03T10:15:30.00Z"                         ; string
                                 (java.time.ZonedDateTime/of 2016 01 01 20 04 0 0 java.time.ZoneOffset/UTC)]))))
            (testing "we respect effective_type"
              (is (= {:global {:distinct-count 2
                               :nil%           0.0}
                      :type   {:type/DateTime {:earliest "1970-01-01T00:00:01.234Z"
                                               :latest   "2007-12-03T10:15:30Z"}}}
                     (transduce identity
                                (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Text :effective_type :type/Temporal}))
                                ["2007-12-03T10:15:30.00Z" "1970-01-01T00:00:01.234Z"]))))))))))

(deftest ^:parallel disambiguate-test
  (testing "We should correctly disambiguate multiple competing multimethods (DateTime and FK in this case)"
    (let [field {:base_type     :type/DateTime
                 :semantic_type :type/FK}]
      (is (= [:type/DateTime :Semantic/* :type/FK]
             ((.dispatchFn ^clojure.lang.MultiFn fingerprinters/fingerprinter) field)))
      (is (= {:global {:distinct-count 3
                       :nil%           0.0}
              :type   {:type/DateTime {:earliest "2013-01-01"
                                       :latest   "2018-01-01"}}}
             (transduce identity
                        (fingerprinters/fingerprinter field)
                        [#t "2013" #t "2018" #t "2015"]))))))

(deftest ^:parallel fingerprint-numeric-values-test
  (is (= {:global {:distinct-count 99
                   :nil%           0.0}
          :type   {:type/Number {:avg 49.0
                                 :min 0.0
                                 :max 98.0
                                 :q1  24.0
                                 :q3  74.0
                                 :sd  28.722813232690143}}}
         (transduce identity
                    (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Number}))
                    (map double (range 99)))))
  (testing "we respect effective_type"
    (is (= {:global {:distinct-count 4, :nil% 0.0},
            :type   {:type/Number {:min 1.0, :q1 1.0, :q3 2.0, :max 2.3, :sd 0.6027713773341707, :avg 1.65}}}
           (transduce identity
                      (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Text :effective_type :type/Number}))
                      ["1" "2" "1.3" "2.3"]))))
  (testing "We should robustly survive weird values such as NaN, Infinity, and nil"
    (is (= {:global {:distinct-count 7
                     :nil%           0.25}
            :type   {:type/Number {:avg 2.0
                                   :min 1.0
                                   :max 3.0
                                   :q1  1.0
                                   :q3  3.0
                                   :sd  1.0}}}
           (transduce identity
                      (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Number}))
                      [1.0 2.0 3.0 Double/NaN Double/POSITIVE_INFINITY Double/NEGATIVE_INFINITY nil nil])))))

(deftest ^:parallel fingerprint-string-values-test
  (is (= {:global {:distinct-count 5
                   :nil%           0.0}
          :type   {:type/Text {:percent-json   0.2
                               :percent-url    0.0
                               :percent-email  0.0
                               :percent-state  0.0
                               :average-length 6.4}}}
         (transduce identity
                    (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Text}))
                    ["metabase" "more" "like" "metabae" "[1, 2, 3]"])))
  (let [truncated-json (subs (json/encode (vec (range 50))) 0 30)]
    (is (= {:global {:distinct-count 5
                     :nil%           0.0}
            :type   {:type/Text {:percent-json   0.2
                                 :percent-url    0.0
                                 :percent-email  0.0
                                 :percent-state  0.0
                                 :average-length 10.6}}}
           (transduce identity
                      (fingerprinters/fingerprinter (mi/instance :model/Field {:base_type :type/Text}))
                      ["metabase" "more" "like" "metabae" truncated-json])))))

(deftest ^:parallel fingerprints-in-db-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Fingerprints should actually get saved with the correct values"
      (testing "Text fingerprints"
        (is (=? {:global {:distinct-count 100
                          :nil%           0.0}
                 :type   {:type/Text {:percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :percent-state  0.0
                                      :average-length #(< 15 % 16)}}}
                (t2/select-one-fn :fingerprint :model/Field :id (mt/id :venues :name))))))))

(deftest ^:parallel fingerprints-in-db-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "Fingerprints should actually get saved with the correct values"
      (testing "date fingerprints"
        (is (=? {:global {:distinct-count #(if (= driver/*driver* :mongo)
                                             (= % 383) ; mongo samples the last 500 rows only
                                             (<= 610 % 630)) ; cardinality estimation fluctuates a bit depending on db
                          :nil%           0.0}
                 :type   {:type/DateTime {:earliest #(str/starts-with? % "2013-01-03")
                                          :latest   #(str/starts-with? % "2015-12-29")}}}
                (t2/select-one-fn :fingerprint :model/Field :id (mt/id :checkins :date))))))))

(deftest ^:parallel fingerprints-in-db-test-3
  (mt/test-drivers (mt/normal-drivers)
    (testing "Fingerprints should actually get saved with the correct values"
      (testing "number fingerprints"
        (is (=? {:global {:distinct-count 4
                          :nil%           0.0}
                 :type   {:type/Number {:min 1.0
                                        :q1  2.0
                                        :q3  2.0
                                        :max 4.0
                                        :sd  #(< 0.76 % 0.78)
                                        :avg #(< 2.02 % 2.04)}}}
                (t2/select-one-fn :fingerprint :model/Field :id (mt/id :venues :price))))))))

(deftest ^:parallel valid-serialized-json?-test
  (testing "recognizes substrings of json"
    (letfn [(partial-json [x]
              (let [json (json/encode x)]
                (subs json 0 (/ (count json) 2))))]
      (are [x] (#'fingerprinters/valid-serialized-json? (partial-json x))
        [1 2 3]
        {:a 1 :b 2}
        [{:a 2}]
        [true true])
      (are [x] (not (#'fingerprinters/valid-serialized-json? x))
        "bob"
        "[bob]"))))

(deftest ^:parallel fingerprinters-support-all-coercions-test
  (testing "fingerprinters support all defined coercions"
    (is
     (every? (fn [c] (some #(isa? c %) @#'fingerprinters/supported-coercions))
             (disj (descendants :Coercion/*)
                   ::mty/Coerce-BigInteger-To-Instant ::mty/Coerce-Int-To-Str)))))
