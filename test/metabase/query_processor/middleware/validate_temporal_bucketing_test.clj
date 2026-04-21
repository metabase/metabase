(ns metabase.query-processor.middleware.validate-temporal-bucketing-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.test-util.attempted-murders-metadata-provider :as lib.tu.attempted-murders-metadata-provider]
   [metabase.lib.test-util.sad-toucan-incidents-metadata-provider :as lib.tu.sad-toucan-incidents-metadata-provider]
   [metabase.query-processor.middleware.validate-temporal-bucketing :as validate-temporal-bucketing]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]))

(defn- validate [query]
  (validate-temporal-bucketing/validate-temporal-bucketing query))

(deftest ^:parallel validate-temporal-bucketing-test
  (let [mp lib.tu.attempted-murders-metadata-provider/metadata-provider]
    ;; you aren't even allowed to create these at a schema level these days so disable Malli enforcement
    (mu/disable-enforcement
      (doseq [field-clause-type [:id :name]]
        (testing (format "With %s clauses" field-clause-type)
          (letfn [(query [field unit]
                    (-> (lib/query mp (lib.metadata/table mp (lib.tu.attempted-murders-metadata-provider/id :attempts)))
                        (lib/filter (lib/=
                                     [:field
                                      (merge
                                       {:lib/uuid      (str (random-uuid))
                                        :temporal-unit unit}
                                       (select-keys (lib.metadata/field mp (lib.tu.attempted-murders-metadata-provider/id :attempts field))
                                                    [:base-type :effective-type]))
                                      (case field-clause-type
                                        :id   (lib.tu.attempted-murders-metadata-provider/id :attempts field)
                                        :name (:name (lib.metadata/field mp (lib.tu.attempted-murders-metadata-provider/id :attempts field))))]
                                     (lib/relative-datetime -1 unit)))))]
            ;; I don't think we need to test every possible combination in the world here -- that will get tested by
            ;; other stuff
            (doseq [[field unit valid?] [[:date        :day     true]
                                         [:date        :default true]
                                         [:time        :day     false]
                                         [:datetime    :day     true]
                                         [:datetime-tz :month   true]
                                         [:date        :minute  false]
                                         [:time-tz     :minute  true]
                                         [:datetime-tz :minute  true]]]
              (if valid?
                (testing (format "Valid combinations (%s × %s) should return query as-is" field unit)
                  (is (=? (lib.schema.util/remove-lib-uuids (query field unit))
                          (validate (query field unit)))))
                (testing (format "We should throw an Exception if you try to do something that makes no sense (bucketing %s by %s)"
                                 field unit)
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"Unsupported temporal bucketing: You can't bucket"
                       (validate (query field unit)))))))))))))

(deftest ^:parallel unix-timestamp-test
  (testing "UNIX Timestamps should be bucketable by anything"
    (let [mp lib.tu.sad-toucan-incidents-metadata-provider/metadata-provider]
      (doseq [unit [:default :hour :day]]
        (testing (format "Unit = %s" unit)
          (is (some? (validate
                      (-> (lib/query mp (lib.metadata/table mp (lib.tu.sad-toucan-incidents-metadata-provider/id :incidents)))
                          (lib/filter (lib/= (-> (lib.metadata/field mp (lib.tu.sad-toucan-incidents-metadata-provider/id :incidents :timestamp))
                                                 (lib/with-temporal-bucket unit))
                                             #t "2025-08-22T16:26:00")))))))))))

(deftest ^:parallel e2e-test
  (testing "We should throw an Exception if you try to do something that makes no sense, e.g. bucketing a DATE by MINUTE"
    ;; these days the Malli schema enforces this, so turn it off and see if the query still fails
    (mu/disable-enforcement
      (mt/dataset attempted-murders
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unsupported temporal bucketing: You can't bucket a :type/Date Field by :minute"
             (mt/run-mbql-query attempts
               {:aggregation [[:count]]
                :filter      [:time-interval $date :last :minute]})))))))
