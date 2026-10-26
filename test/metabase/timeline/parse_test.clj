(ns metabase.timeline.parse-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.parse :as timeline.parse]
   [parsed-types.core :as pt]
   [toucan2.core :as t2])
  (:import
   (metabase.timeline.parse TimelineEventUpdate)))

(set! *warn-on-reflection* true)

(deftest update-timeline-event!-accepts-only-a-parsed-update-test
  (mt/with-temp [:model/Timeline      {tl-id :id} {}
                 :model/TimelineEvent {ev-id :id} {:name "Event" :timeline_id tl-id}]
    (testing "a plain map is refused and writes nothing"
      (is (=? {:type ::pt/not-parsed}
              (try (timeline.db/update-timeline-event! {:event-id        ev-id
                                                        :new-timeline-id nil
                                                        :changes         {:name "plain"}})
                   (catch clojure.lang.ExceptionInfo e (ex-data e)))))
      (is (= "Event" (t2/select-one-fn :name :model/TimelineEvent :id ev-id))))
    (testing "a hand-built value without the proof is refused and writes nothing"
      (is (=? {:type ::pt/not-parsed}
              ;; the last constructor argument is the library's hidden proof field, which only pt/parse fills
              (try (timeline.db/update-timeline-event! (TimelineEventUpdate. ev-id nil {:name "forged"} nil))
                   (catch clojure.lang.ExceptionInfo e (ex-data e)))))
      (is (= "Event" (t2/select-one-fn :name :model/TimelineEvent :id ev-id))))))

(deftest parse-timeline-event-update-test
  (mt/with-temp [:model/Collection    {writable :id}  {}
                 :model/Collection    {read-only :id} {}
                 :model/Timeline      {tl-a :id}      {:collection_id writable}
                 :model/Timeline      {tl-b :id}      {:collection_id read-only}
                 :model/TimelineEvent {ev-id :id}     {:name "Event" :timeline_id tl-a}]
    (perms/revoke-collection-permissions! (perms-group/all-users) read-only)
    (perms/grant-collection-read-permissions! (perms-group/all-users) read-only)
    (letfn [(parse-as
              ([user new-timeline-id changes] (parse-as user ev-id new-timeline-id changes))
              ([user event-id new-timeline-id changes]
               (mt/with-current-user (mt/user->id user)
                 (pt/parse TimelineEventUpdate {:event-id        event-id
                                                :new-timeline-id new-timeline-id
                                                :changes         changes}))))
            (failed-check [& args]
              (try (apply parse-as args)
                   nil
                   (catch clojure.lang.ExceptionInfo e (:check (ex-data e)))))]
      (testing "a permitted user gets a value, and the write accepts it"
        (let [update (parse-as :rasta nil {:name "renamed"})]
          (is (pt/parsed? TimelineEventUpdate update))
          (is (= 1 (timeline.db/update-timeline-event! update)))
          (is (= "renamed" (t2/select-one-fn :name :model/TimelineEvent :id ev-id)))))
      (testing "moving to a timeline the user may write issues a value, and the write moves the event"
        (let [update (parse-as :crowberto tl-b {})]
          (is (= 1 (timeline.db/update-timeline-event! update)))
          (is (= tl-b (t2/select-one-fn :timeline_id :model/TimelineEvent :id ev-id)))))
      (testing "each check refuses"
        (t2/update! :model/TimelineEvent ev-id {:timeline_id tl-a})
        (is (= ::timeline.parse/may-write-new-timeline (failed-check :rasta tl-b {})))
        (is (= ::timeline.parse/new-timeline-exists (failed-check :rasta Integer/MAX_VALUE {})))
        (is (= ::timeline.parse/changes-match-schema (failed-check :rasta nil {:bogus 1})))
        (is (= ::timeline.parse/event-exists (failed-check :rasta Integer/MAX_VALUE nil {:name "x"})))
        (perms/revoke-collection-permissions! (perms-group/all-users) writable)
        (perms/grant-collection-read-permissions! (perms-group/all-users) writable)
        (is (= ::timeline.parse/may-write-event (failed-check :rasta nil {:name "x"})))
        (is (= "renamed" (t2/select-one-fn :name :model/TimelineEvent :id ev-id)) "no failed parse wrote anything")))))
