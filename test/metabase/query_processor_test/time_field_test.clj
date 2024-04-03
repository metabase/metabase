(ns metabase.query-processor-test.time-field-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(defn- time-query [filter-type & filter-args]
  (mt/formatted-rows [int identity identity]
    (mt/dataset time-test-data
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

(deftest ^:parallel attempted-murders-test
  (mt/test-drivers (normal-drivers-that-support-time-type)
    (testing "Sanity check: make sure time columns for attempted-murders test dataset (used in tests below) is loaded correctly"
      (mt/dataset attempted-murders
        (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
              attempts (lib.metadata/table metadata-provider (mt/id :attempts))
              id       (lib.metadata/field metadata-provider (mt/id :attempts :id))
              time     (lib.metadata/field metadata-provider (mt/id :attempts :time))
              time-tz  (lib.metadata/field metadata-provider (mt/id :attempts :time_tz))
              time-ltz (lib.metadata/field metadata-provider (mt/id :attempts :time_ltz))
              query    (-> (lib/query metadata-provider attempts)
                           (lib/with-fields [time time-tz time-ltz])
                           (lib/order-by id)
                           (lib/limit 2))]
          (mt/with-native-query-testing-context query
            ;;       [Local] TIME             W/ LOCAL TIME ZONE      W/ ZONE OFFSET
            (is (=? [[#"00:23:18(?:\.331)?Z?" #"07:23:18(?:\.331)?Z?" #"07:23:18(?:\.331)?Z?"]
                     [#"00:14:14(?:\.246)?Z?" #"07:14:14(?:\.246)?Z?" #"07:14:14(?:\.246)?Z?"]]
                    (mt/formatted-rows [str str str]
                      (qp/process-query query))))))))))

(defn- test-time-bucketing [time-column unit f]
  (testing "#21269"
    (mt/test-drivers (normal-drivers-that-support-time-type)
      (mt/dataset attempted-murders
        (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
              attempts (lib.metadata/table metadata-provider (mt/id :attempts))
              id       (lib.metadata/field metadata-provider (mt/id :attempts :id))
              time     (lib.metadata/field metadata-provider (mt/id :attempts time-column))
              query    (-> (lib/query metadata-provider attempts)
                           (lib/with-fields [id (lib/with-temporal-bucket time unit)])
                           (lib/order-by id)
                           (lib/limit 2))]
          (mt/with-native-query-testing-context query
            (f (mt/formatted-rows [int str]
                 (qp/process-query query)))))))))

(deftest ^:parallel bucket-time-column-hour-test
  (test-time-bucketing
   :time :hour
   (fn [results]
     (is (=? [[1 #"00:00:00Z?"]
              [2 #"00:00:00Z?"]]
             results)))))

(deftest ^:parallel bucket-time-column-minute-test
  (test-time-bucketing
   :time :minute
   (fn [results]
     (is (=? [[1 #"00:23:00Z?"]
              [2 #"00:14:00Z?"]]
             results)))))

(deftest ^:parallel bucket-time-with-time-zone-hour-test
  (doseq [time-column [:time_tz :time_ltz]]
    (testing time-column
      (test-time-bucketing
       time-column :hour
       (fn [results]
         (is (=? [[1 #"07:00:00Z?"]
                  [2 #"07:00:00Z?"]]
                 results)))))))

(deftest ^:parallel bucket-time-with-time-zone-minute-test
  (doseq [time-column [:time_tz :time_ltz]]
    (testing time-column
      (test-time-bucketing
       time-column :minute
       (fn [results]
         (is (=? [[1 #"07:23:00Z?"]
                  [2 #"07:14:00Z?"]]
                 results)))))))
