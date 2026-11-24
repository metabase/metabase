(ns metabase.view-log.models-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.view-log.models.view-log :as view-log]))

(deftest create-view-logs-statement-count-does-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/ViewLog]
    (let [counted (fn [n]
                    (events.tu/statement-count!
                     #(view-log/create-view-logs! (mapv (fn [i] (cond-> {:user_id    (mt/user->id :rasta)
                                                                         :model      "table"
                                                                         :model_id   (mt/id :venues)
                                                                         :has_access true}
                                                                  (odd? i) (assoc :timestamp (t/offset-date-time 2001 2 3))))
                                                        (range n)))))]
      (counted 1)
      (is (= (counted 2) (counted 6))))))
