(ns metabase.timeline.event-update-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.db.fetch :as timeline.db.fetch]
   [metabase.timeline.event-update :as event-update]
   [metabase.util.validated :as validated]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
                  :failures    {::event-update/changes-match-schema
                                {:doc      "The update sets only the columns it may, with values of their types."
                                 :returned {:creator_id ["disallowed key"]
                                            :name       ["should be a string"]}
                                 :blocked  [::event-update/may-write-event ::event-update/acting-user-is-current-user]}}}
                 (select-keys (thrown-data #(validated/parse
                                             (event-update/->EventUpdate crowberto ev-id {:creator_id 1, :name 2} nil)))
                              [:status-code :failures]))))
        (testing "an update naming someone other than the current user, or no one, is a 403"
          (doseq [user-id [(mt/user->id :rasta) nil]]
            (is (= {::event-update/acting-user-is-current-user false}
                   (update-vals (:failures (thrown-data #(validated/parse
                                                          (event-update/->EventUpdate user-id ev-id {:name "forged"} nil))))
                                :returned)))))
        (testing "a TimelineWrite naming someone other than the current user is a 403, even when the current user may
                  write the timeline"
          (is (= {::event-update/acting-user-is-current-user false}
                 (update-vals (:failures (thrown-data #(validated/parse
                                                        (event-update/->TimelineWrite (mt/user->id :rasta) other-tl))))
                              :returned))))
        (testing "a parsed update is refused at the sink when written as someone else"
          (let [parsed (validated/parse (event-update/->EventUpdate crowberto ev-id {:name "kept"} nil))]
            (mt/with-current-user (mt/user->id :rasta)
              (is (= 500 (:status-code (thrown-data #(timeline.db/update-timeline-event! parsed))))))
            (is (= "before" (t2/select-one-fn :name :model/TimelineEvent :id ev-id)))))
        (testing "a parsed update writes"
          (timeline.db/update-timeline-event!
           (validated/parse (event-update/->EventUpdate crowberto ev-id {:name "after"} nil)))
          (is (= "after" (t2/select-one-fn :name :model/TimelineEvent :id ev-id))))
        (testing "a move writes the timeline_id of the validated TimelineWrite it holds"
          (timeline.db/update-timeline-event!
           (validated/parse
            (event-update/->EventUpdate crowberto ev-id {} (validated/parse (event-update/->TimelineWrite crowberto other-tl)))))
          (is (= other-tl (t2/select-one-fn :timeline_id :model/TimelineEvent :id ev-id))))))))

(deftest parse-all-fetches-events-in-one-query-test
  (mt/with-temp [:model/Timeline      {tl-id :id} {}
                 :model/TimelineEvent {ev-1 :id}  {:timeline_id tl-id}
                 :model/TimelineEvent {ev-2 :id}  {:timeline_id tl-id}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [crowberto (mt/user->id :crowberto)
            calls     (atom [])
            original  timeline.db.fetch/timeline-events-by-id]
        (mt/with-dynamic-fn-redefs [timeline.db.fetch/timeline-events-by-id (fn [ids] (swap! calls conj ids) (original ids))]
          (validated/parse-all [(event-update/->EventUpdate crowberto ev-1 {:name "a"} nil)
                                (event-update/->EventUpdate crowberto ev-2 {:name "b"} nil)
                                (event-update/->EventUpdate crowberto ev-1 {:name "c"} nil)]))
        (is (= [[ev-1 ev-2]] @calls))))))
