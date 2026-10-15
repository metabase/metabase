(ns metabase.timeline.event-update-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.event-update :as event-update]
   [metabase.util.validated :as validated]
   [toucan2.core :as t2]))

(defn- thrown-data [thunk]
  (try (thunk) nil
       (catch clojure.lang.ExceptionInfo e (ex-data e))))

(deftest update-timeline-event!-takes-only-a-validated-update-test
  (mt/with-temp [:model/Timeline      {tl-id :id}    {}
                 :model/Timeline      {other-tl :id} {}
                 :model/TimelineEvent {ev-id :id}    {:name "before" :timeline_id tl-id}]
    (let [crowberto (mt/user->id :crowberto)]
      (doseq [[label x] [["an id, the old signature" ev-id]
                         ["a plain map"              {:user-id crowberto, :event-id ev-id, :changes {:name "forged"}}]
                         ["an EventUpdate, never validated"
                          (event-update/->EventUpdate crowberto ev-id {:name "forged"} nil)]]]
        (testing label
          (is (= 500 (:status-code (thrown-data #(timeline.db/update-timeline-event! x)))))))
      (mt/with-current-user crowberto
        (testing "a column the update may not set, or a value of the wrong type, is a 400"
          (is (= {:status-code 400
                  :failures    {::event-update/changes-match-schema {:creator_id ["disallowed key"]
                                                                     :name       ["should be a string"]}}}
                 (select-keys (thrown-data #(validated/validate
                                             (event-update/->EventUpdate crowberto ev-id {:creator_id 1, :name 2} nil)))
                              [:status-code :failures]))))
        (testing "an update naming someone other than the current user, or no one, is a 403"
          (doseq [user-id [(mt/user->id :rasta) nil]]
            (is (= {::event-update/acting-user-is-current-user false}
                   (:failures (thrown-data #(validated/validate
                                             (event-update/->EventUpdate user-id ev-id {:name "forged"} nil))))))))
        (testing "a TimelineWrite naming someone other than the current user is a 403, even when the current user may
                  write the timeline"
          (is (= {::event-update/acting-user-is-current-user false}
                 (:failures (thrown-data #(validated/validate
                                           (event-update/->TimelineWrite (mt/user->id :rasta) other-tl)))))))
        (testing "a validated update writes"
          (timeline.db/update-timeline-event!
           (validated/validate (event-update/->EventUpdate crowberto ev-id {:name "after"} nil)))
          (is (= "after" (t2/select-one-fn :name :model/TimelineEvent :id ev-id))))
        (testing "a move writes the timeline_id of the validated TimelineWrite it holds"
          (timeline.db/update-timeline-event!
           (validated/validate
            (event-update/->EventUpdate crowberto ev-id {} (validated/validate (event-update/->TimelineWrite crowberto other-tl)))))
          (is (= other-tl (t2/select-one-fn :timeline_id :model/TimelineEvent :id ev-id))))))))
