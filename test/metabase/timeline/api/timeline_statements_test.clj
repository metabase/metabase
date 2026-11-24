(ns metabase.timeline.api.timeline-statements-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(defn- statements
  "The number of app DB statements `thunk` runs."
  [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(defn- timelines-with-events! [n]
  (let [timeline-ids (t2/insert-returning-pks! :model/Timeline
                                               (mapv (fn [i]
                                                       (merge (t2.with-temp/with-temp-defaults :model/Timeline)
                                                              {:name (str "timeline " i) :creator_id (mt/user->id :crowberto)}))
                                                     (range n)))]
    (t2/insert! :model/TimelineEvent
                (mapv (fn [id]
                        (merge (t2.with-temp/with-temp-defaults :model/TimelineEvent)
                               {:timeline_id id :creator_id (mt/user->id :crowberto)}))
                      timeline-ids))))

(deftest timeline-list-statements-do-not-grow-with-timelines-test
  (mt/with-model-cleanup [:model/Timeline :model/TimelineEvent]
    (timelines-with-events! 1)
    (doseq [user [:crowberto :rasta]
            path ["timeline" "timeline?include=events" "timeline/collection/root" "timeline/collection/root?include=events"]]
      (let [request #(mt/user-http-request user :get 200 path)
            _       (request)
            _       (timelines-with-events! 4)
            small   (statements request)
            _       (timelines-with-events! 10)
            large   (statements request)]
        (is (= small large) (str "as " user " on " path))))))
