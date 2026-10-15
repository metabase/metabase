(ns metabase.timeline.event-update-forgery-test
  "Ways application code might try to get an EventUpdate past [[timeline.db/update-timeline-event!]] without its checks
  passing for exactly what is written. Each test asserts the attempt is refused. Known residuals, which this mechanism
  does not stop, are listed at the bottom."
  (:require
   [clojure.edn :as edn]
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.event-update :as event-update]
   [metabase.util.validated :as validated]
   [toucan2.core :as t2]))

(defn- refused? [thunk]
  (try (thunk) false
       (catch clojure.lang.ExceptionInfo e
         (contains? #{400 403 500} (:status-code (ex-data e))))))

(defn- event-row [ev-id]
  (select-keys (t2/select-one :model/TimelineEvent :id ev-id) [:name :timeline_id :creator_id]))

(deftest forgery-attempts-are-refused-test
  ;; rasta may write `ev-id`, and may only read `locked-tl`
  (mt/with-temp [:model/Collection    {writable :id}  {}
                 :model/Collection    {read-only :id} {}
                 :model/Timeline      {tl-id :id}     {:collection_id writable}
                 :model/Timeline      {locked-tl :id} {:collection_id read-only}
                 :model/TimelineEvent {ev-id :id}     {:name "before" :timeline_id tl-id}]
    (perms/revoke-collection-permissions! (perms-group/all-users) read-only)
    (perms/grant-collection-read-permissions! (perms-group/all-users) read-only)
    (mt/with-current-user (mt/user->id :rasta)
      (let [rasta      (mt/user->id :rasta)
            crowberto  (mt/user->id :crowberto)
            before     (event-row ev-id)
            ok         (validated/validate (event-update/->EventUpdate rasta ev-id {:name "ok"} nil))
            ;; a real proof that crowberto, an admin, may write the locked timeline
            crowberto-may-write-locked (mt/with-current-user crowberto
                                         (validated/validate (event-update/->TimelineWrite crowberto locked-tl)))]
        (doseq [[label thunk]
                [["a timeline_id in the changes"
                  #(validated/validate (event-update/->EventUpdate rasta ev-id {:timeline_id locked-tl} nil))]
                 ["a move to a timeline rasta cannot write"
                  #(validated/validate (event-update/->TimelineWrite rasta locked-tl))]
                 ["a TimelineWrite never validated"
                  #(validated/validate (event-update/->EventUpdate rasta ev-id {} (event-update/->TimelineWrite rasta locked-tl)))]
                 ["a TimelineWrite validated for another user"
                  #(validated/validate (event-update/->EventUpdate rasta ev-id {} crowberto-may-write-locked))]
                 ["assoc a new destination onto a validated update"
                  #(timeline.db/update-timeline-event! (assoc ok :new-timeline crowberto-may-write-locked))]
                 ["assoc raw changes onto a validated update"
                  #(timeline.db/update-timeline-event! (assoc ok :changes {:timeline_id locked-tl}))]
                 ["merge a new destination onto a validated update"
                  #(timeline.db/update-timeline-event! (merge ok {:changes {:timeline_id locked-tl}}))]
                 ["map->EventUpdate, never validated"
                  #(timeline.db/update-timeline-event!
                    (event-update/map->EventUpdate {:user-id rasta, :event-id ev-id, :changes {:timeline_id locked-tl}}))]
                 ["a record equal to the validated one, built by hand"
                  #(timeline.db/update-timeline-event! (event-update/->EventUpdate rasta ev-id {:name "ok"} nil))]
                 ["the record reader tag"
                  #(timeline.db/update-timeline-event!
                    (read-string (format "#metabase.timeline.event_update.EventUpdate{:user-id %d :event-id %d :changes {:timeline_id %d} :new-timeline nil}"
                                         rasta ev-id locked-tl)))]
                 ["a pr-str / edn round trip of the validated update"
                  #(timeline.db/update-timeline-event!
                    (edn/read-string {:readers {'metabase.timeline.event_update.EventUpdate event-update/map->EventUpdate}}
                                     (pr-str ok)))]
                 ["validating as someone other than the current user"
                  #(validated/validate (event-update/->EventUpdate crowberto ev-id {:name "x"} crowberto-may-write-locked))]
                 ["changes as a mutable java.util.HashMap, to mutate after validating"
                  #(validated/validate (event-update/->EventUpdate rasta ev-id (java.util.HashMap. {:name "ok"}) nil))]
                 ["a column the update may not set"
                  #(validated/validate (event-update/->EventUpdate rasta ev-id {:creator_id crowberto} nil))]]]
          (testing label
            (is (refused? thunk))
            (is (= before (event-row ev-id)) "nothing was written")))))))

(deftest extend-type-cannot-replace-the-checks-test
  (testing "Clojure refuses to extend a record to a protocol it implements inline, so its checks cannot be emptied"
    (is (thrown-with-msg? IllegalArgumentException #"already directly implements"
                          (extend-type metabase.timeline.event_update.EventUpdate
                            validated/Validatable
                            (checks [_] [])
                            (external-checks [_] []))))))

;;; Known residuals, by design. None is reachable from an HTTP request; each needs code in the JVM.
;;;
;;; - `(.put @#'metabase.util.validated/issued forged true)`: a private var is reachable by var-quote. A lint that
;;;   flags `#'metabase.util.validated/` outside that namespace would make it visible in review.
;;; - `with-redefs` of `validated/validated` or `validated/validate`: test-only by convention.
;;; - Binding `api/*current-user-id*` before validating: ambient authority that every permission check in Metabase
;;;   already trusts. The record names the user, and `::acting-user-is-current-user` requires the two to agree.
;;; - Time of check vs time of use: permissions revoked between `validate` and the write are not seen. The record is
;;;   validated one call before the write, as the endpoint always checked.
;;; - A validated record does not expire, and the sink does not compare its user to the current one. Code that keeps a
;;;   validated record and writes it later, or as someone else, still writes. Validate where you write.
