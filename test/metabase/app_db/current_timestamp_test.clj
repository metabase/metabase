(ns metabase.app-db.current-timestamp-test
  "Funny SQL's database-clock functions run on the app DB under test."
  (:require
   [clojure.test :refer :all]
   [toucan2.core :as t2])
  (:import
   (java.time.temporal ChronoField ChronoUnit Temporal TemporalAccessor)))

(set! *warn-on-reflection* true)

(deftest current-timestamp-keeps-sub-second-precision-test
  (testing "neither clock is truncated to whole seconds, which a bare `current_timestamp` is on MySQL and MariaDB"
    ;; One sample lands on a whole second once in a million; five in a row with gaps between them never will.
    (let [samples (repeatedly 5 #(do (Thread/sleep 3)
                                     (t2/query-one {:select [[[:current-timestamp 6] :now]
                                                             [[:current-timestamp-plus-ms 0] :plus_zero]]})))
          nanos   (fn [k] (map #(.get ^TemporalAccessor (get % k) ChronoField/NANO_OF_SECOND) samples))]
      (is (some pos? (nanos :now)))
      (is (some pos? (nanos :plus_zero))))))

(deftest current-timestamp-plus-ms-runs-on-the-app-db-test
  (testing "both timestamps read one statement's clock, so they differ by exactly the offset"
    ;; Offset both, so they come back as one type: on MariaDB `current_timestamp` reads as an OffsetDateTime and
    ;; `timestampadd` as a LocalDateTime.
    (let [{:keys [now later]} (t2/query-one {:select [[[:current-timestamp-plus-ms 0] :now]
                                                      [[:current-timestamp-plus-ms 60000] :later]]})]
      (is (= 60000 (.until ^Temporal now ^Temporal later ChronoUnit/MILLIS))))))
