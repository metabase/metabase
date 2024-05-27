(ns metabase.query-processor.middleware.validate-temporal-bucketing-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Field]]
   [metabase.query-processor.middleware.validate-temporal-bucketing
    :as validate-temporal-bucketing]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- validate [query]
  (validate-temporal-bucketing/validate-temporal-bucketing query))

(deftest validate-temporal-bucketing-test
  (mt/dataset attempted-murders
    (mt/with-metadata-provider (mt/id)
      (doseq [field-clause-type [:id :name]]
        (testing (format "With %s clauses" field-clause-type)
          (letfn [(query [field unit]
                    (mt/mbql-query attempts
                      {:filter [:=
                                [:field
                                 (case field-clause-type
                                   :id   (mt/id :attempts field)
                                   :name (t2/select-one-fn :name Field :id (mt/id :attempts field)))
                                 (merge
                                  {:temporal-unit unit}
                                  (when (= field-clause-type :name)
                                    {:base-type (t2/select-one-fn :base_type Field :id (mt/id :attempts field))}))]
                                [:relative-datetime -1 unit]]}))]
            ;; I don't think we need to test every possible combination in the world here -- that will get tested by
            ;; other stuff
            (doseq [[field unit valid?] [[:date        :day     true]
                                         [:date        :default true]
                                         [:time        :day     false]
                                         [:datetime    :day     true]
                                         [:datetime_tz :month   true]
                                         [:date        :minute  false]
                                         [:time_tz     :minute  true]
                                         [:datetime_tz :minute  true]]]
              (if valid?
                (testing (format "Valid combinations (%s × %s) should return query as-is" field unit)
                  (is (= (query field unit)
                         (validate (query field unit)))))
                (testing (format "We should throw an Exception if you try to do something that makes no sense (bucketing %s by %s)"
                                 field unit)
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"Unsupported temporal bucketing: You can't bucket"
                       (validate (query field unit)))))))))))))

(deftest unix-timestamp-test
  (testing "UNIX Timestamps should be bucketable by anything"
    (mt/dataset sad-toucan-incidents
      (mt/with-metadata-provider (mt/id)
        (doseq [unit [:default :hour :day]]
          (testing (format "Unit = %s" unit)
            (is (some? (validate (mt/mbql-query incidents
                                   {:filter [:= [:field %timestamp {:temporal-unit unit}]]}))))))))))

(deftest e2e-test
  (testing "We should throw an Exception if you try to do something that makes no sense, e.g. bucketing a DATE by MINUTE"
    (mt/dataset attempted-murders
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Unsupported temporal bucketing: You can't bucket a :type/Date Field by :minute|Invalid output:.*should be a.*got"
           (mt/run-mbql-query attempts
             {:aggregation [[:count]]
              :filter      [:time-interval $date :last :minute]}))))))
