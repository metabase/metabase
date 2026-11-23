(ns metabase.transforms.models.transform-run-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.models.transform-run :as transform-run]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest reaping-statement-counts-do-not-grow-with-runs-test
  (mt/with-temp [:model/Transform {t1 :id} {}
                 :model/Transform {t2 :id} {}
                 :model/Transform {t3 :id} {}
                 :model/Transform {t4 :id} {}
                 :model/Transform {t5 :id} {}
                 :model/Transform {t6 :id} {}]
    (mt/with-model-cleanup [:model/TransformRun]
      (let [transform-ids [t1 t2 t3 t4 t5 t6]
            start!        (fn [n]
                            (let [runs (mapv #(transform-run/start-run! % {:run_method :manual}) (take n transform-ids))]
                              (doseq [transform-id (take n transform-ids)]
                                (transform-run/set-run-times! transform-id (t/minus (t/instant) (t/hours 5))))
                              (mapv :id runs)))]
        (testing "timing out old runs"
          (let [counted (fn [n]
                          (start! n)
                          (events.tu/statement-count! #(transform-run/timeout-old-runs! 1 :hour)))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))
        (testing "heartbeating runs"
          (let [counted (fn [n]
                          (let [ids   (start! n)
                                count (events.tu/statement-count! #(transform-run/heartbeat-runs! ids))]
                            (run! transform-run/succeed-started-run! ids)
                            count))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))))))
