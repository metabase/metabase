(ns metabase.query-processor-test.time-field-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(defn- time-query [filter-type & filter-args]
  (mt/formatted-rows [int identity identity]
    (mt/dataset test-data-with-time
      (mt/run-mbql-query users
        {:fields   [$id $name $last_login_time]
         :order-by [[:asc $id]]
         :filter   (into [filter-type $last_login_time] filter-args)}))))

(defn- normal-drivers-that-support-time-type []
  (filter mt/supports-time-type? (mt/normal-drivers)))

(deftest ^:parallel basic-test
  (mt/test-drivers (normal-drivers-that-support-time-type)
    (doseq [[message [start end]] {"Basic between query on a time field"
                                   ["08:00:00" "09:00:00"]

                                   "Basic between query on a time field with milliseconds in literal"
                                   ["08:00:00" "09:00:00"]}]
      (testing message
        (is (= (if (= :sqlite driver/*driver*)
                 [[1 "Plato Yeshua" "08:30:00"]
                  [4 "Simcha Yan"   "08:30:00"]]

                 [[1 "Plato Yeshua" "08:30:00Z"]
                  [4 "Simcha Yan"   "08:30:00Z"]])
               (time-query :between start end)))))))

(deftest ^:parallel greater-than-test
  (mt/test-drivers (normal-drivers-that-support-time-type)
    (is (= (if (= :sqlite driver/*driver*)
             [[3 "Kaneonuskatew Eiran" "16:15:00"]
              [5 "Quentin Sören" "17:30:00"]
              [10 "Frans Hevel" "19:30:00"]]

             [[3 "Kaneonuskatew Eiran" "16:15:00Z"]
              [5 "Quentin Sören" "17:30:00Z"]
              [10 "Frans Hevel" "19:30:00Z"]])
           (time-query :> "16:00:00Z")))))

(deftest ^:parallel equals-test
  (mt/test-drivers (normal-drivers-that-support-time-type)
    (is (= (if (= :sqlite driver/*driver*)
             [[3 "Kaneonuskatew Eiran" "16:15:00"]]
             [[3 "Kaneonuskatew Eiran" "16:15:00Z"]])
           (time-query := "16:15:00Z")))))

(deftest report-timezone-test
  (mt/test-drivers (normal-drivers-that-support-time-type)
    (mt/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (is (= (cond
               (= :sqlite driver/*driver*)
               [[1 "Plato Yeshua" "08:30:00"]
                [4 "Simcha Yan" "08:30:00"]]

               ;; Databases like PostgreSQL ignore timezone information when
               ;; using a time field, the result below is what happens when the
               ;; 08:00 time is interpreted as UTC, then not adjusted to Pacific
               ;; time by the DB
               (qp.test-util/supports-report-timezone? driver/*driver*)
               [[1 "Plato Yeshua" "08:30:00-08:00"]
                [4 "Simcha Yan" "08:30:00-08:00"]]

               :else
               [[1 "Plato Yeshua" "08:30:00Z"]
                [4 "Simcha Yan" "08:30:00Z"]])
             (apply time-query :between (if (qp.test-util/supports-report-timezone? driver/*driver*)
                                          ["08:00:00"       "09:00:00"]
                                          ["08:00:00-00:00" "09:00:00-00:00"])))))))

;;; FIXME: `:second` and `:millisecond` are theoretically allowed in MBQL but don't seem to be implemented for most if
;;; not all of our drivers.

(defn- test-time-bucketing [time-column unit f]
  (testing "#21269"
    (mt/test-drivers (normal-drivers-that-support-time-type)
      (mt/dataset attempted-murders
        (qp.store/with-metadata-provider (mt/id)
          (testing (format "\ntime column = %s unit = %s" time-column unit)
            (let [attempts (lib.metadata/table (qp.store/metadata-provider) (mt/id :attempts))
                  time     (lib.metadata/field (qp.store/metadata-provider) (mt/id :attempts time-column))
                  query    (-> (lib/query (qp.store/metadata-provider) attempts)
                               (lib/aggregate (lib/count))
                               (lib/breakout (lib/with-temporal-bucket time unit))
                               (lib/limit 4))]
              (mt/with-native-query-testing-context query
                (f (mt/formatted-rows [str long]
                     (qp/process-query query)))))))))))

(deftest ^:parallel bucket-time-column-hour-test
  (test-time-bucketing
   :time :hour
   (fn [results]
     (is (= [["00:00:00Z" 3]
             ["01:00:00Z" 1]
             ["02:00:00Z" 1]
             ["04:00:00Z" 1]]
            results)))))

(deftest ^:parallel bucket-time-column-minute-test
  (test-time-bucketing
   :time :minute
   (fn [results]
     (is (= [["00:14:00Z" 1]
             ["00:23:00Z" 1]
             ["00:35:00Z" 1]
             ["01:04:00Z" 1]]
            results)))))

(deftest ^:parallel bucket-time-with-time-zone-hour-test
  (test-time-bucketing
   :time_tz :hour
   (fn [results]
     (is (= [["00:00:00Z" 1]
             ["02:00:00Z" 1]
             ["03:00:00Z" 1]
             ["04:00:00Z" 2]]
            results)))))

(deftest ^:parallel bucket-time-with-time-zone-minute-test
  (test-time-bucketing
   :time_tz :minute
   (fn [results]
     (is (= [["00:07:00Z" 1]
             ["02:51:00Z" 1]
             ["03:51:00Z" 1]
             ["04:09:00Z" 1]]
            results)))))

(deftest ^:parallel bucket-time-with-local-time-zone-hour-test
  (test-time-bucketing
   :time_ltz :hour
   (fn [results]
     (is (= [["00:00:00Z" 1]
             ["02:00:00Z" 1]
             ["03:00:00Z" 1]
             ["04:00:00Z" 2]]
            results)))))

(deftest ^:parallel bucket-time-with-local-time-zone-minute-test
  (test-time-bucketing
   :time_ltz :minute
   (fn [results]
     (is (= [["00:07:00Z" 1]
             ["02:51:00Z" 1]
             ["03:51:00Z" 1]
             ["04:09:00Z" 1]]
            results)))))
