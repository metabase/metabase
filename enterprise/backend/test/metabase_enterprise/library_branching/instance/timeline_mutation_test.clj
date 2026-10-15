(ns metabase-enterprise.library-branching.instance.timeline-mutation-test
  "Mutations of the rules of the app DB side of timelines. Each mutation removes or weakens one rule, and a test that it
  names must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance.kinds.timeline :as kinds.timeline]
   [metabase-enterprise.library-branching.instance.lock-test :as lock-test]
   [metabase-enterprise.library-branching.instance.timeline-test :as timeline-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users) features.tu/with-features)

(def mutations
  "Each mutation removes or weakens one rule of the timeline kind store."
  [{:name   :no-lock
    :doc    "current reads a timeline with no row lock, so a save of the timeline by another connection does not wait."
    :target `library-branching.db/lock-timeline
    :edits  [[:remove :for] [:remove '[:update]]]
    :tests  [#'lock-test/current-locks-the-row-test]}
   {:name   :no-event-lock
    :doc    "current does not lock the events of the timeline, so a save of an event by another connection does not
            wait."
    :target `kinds.timeline/current-timeline
    :edits  [[:remove '(library-branching.db/lock-timeline-events (:id row))]]
    :tests  [#'lock-test/current-locks-the-row-test]}
   {:name   :archived-events-read
    :doc    "A read gives the events in the trash as content, so a trash of an event is no local change."
    :target `library-branching.db/live-events-by-timeline-id
    :edits  [[:remove :archived] [:remove false]]
    :tests  [#'timeline-test/timeline-content-test #'timeline-test/local-changes-test]}
   {:name   :events-not-written
    :doc    "A write leaves the events as they are, so a pull of a new event shows as a conflict."
    :target `kinds.timeline/write-timeline!
    :edits  [[:remove '(write-events! id tl-id (content/attr-value format.timeline/spec attrs :events))]]
    :tests  [#'timeline-test/write-test #'timeline-test/timeline-laws-test]}
   {:name   :removed-event-kept
    :doc    "A write keeps an event that the content does not hold, so a pull that removes an event leaves it."
    :target `kinds.timeline/write-events!
    :edits  [[:replace '(contains? wanted eid) true]]
    :tests  [#'timeline-test/write-test #'timeline-test/timeline-laws-test]}
   {:name   :trashed-event-not-restored
    :doc    "A write of an event in the trash leaves it in the trash, so a later commit cannot bring it back."
    :target `kinds.timeline/write-events!
    :edits  [[:replace '(:archived row) false {:nth 0}]]
    :tests  [#'timeline-test/write-test #'timeline-test/trash-test]}
   {:name   :event-not-moved
    :doc    "A write leaves an event of another timeline in its timeline, so a pull of a moved event is lost."
    :target `kinds.timeline/write-events!
    :edits  [[:replace '(assoc :timeline_id timeline-id) '(identity)]]
    :tests  [#'timeline-test/write-test]}
   {:name   :outside-event-taken
    :doc    "A write takes an event of a timeline outside the Library, which changes content outside the Library."
    :target `kinds.timeline/write-events!
    :edits  [[:remove '(check-event-in-tree! id row)]]
    :tests  [#'timeline-test/refused-writes-write-nothing-test]}
   {:name   :any-collection
    :doc    "A write puts a timeline in any collection of the Library, which Metabase refuses to hold one."
    :target `kinds.timeline/place-collection
    :edits  [[:replace '(= library-dashboards-type (:type parent)) true]]
    :tests  [#'timeline-test/refused-writes-write-nothing-test]}
   {:name   :outside-timeline-taken
    :doc    "A write takes over a timeline outside the Library."
    :target `kinds.timeline/write-timeline!
    :edits  [[:replace '(tree/collection-id-in-tree? (:collection_id row)) true]]
    :tests  [#'timeline-test/refused-writes-write-nothing-test]}
   {:name   :trash-keeps-events
    :doc    "trash! leaves the events out of the trash, unlike the Trash of Metabase."
    :target `kinds.timeline/trash-timeline!
    :edits  [[:remove '(archive-events! (map :id (remove :archived (library-branching.db/lock-timeline-events (:id row)))))]]
    :tests  [#'timeline-test/trash-test]}
   {:name   :no-trash
    :doc    "trash! does nothing, so a pull that removes a timeline leaves it on the instance."
    :target `kinds.timeline/trash-timeline!
    :edits  [[:remove '(library-branching.db/update-timeline! (:id row) {:archived true})]]
    :tests  [#'timeline-test/trash-test]}
   {:name   :every-column-written
    :doc    "A write sends every event column, also those that did not change, so a write of the current content
            changes the time stamp of each event (GetPut fails)."
    :target `kinds.timeline/event-columns
    :edits  [[:replace '(or (nil? old) (not= v (event-value old k))) true]]
    :tests  [#'timeline-test/write-of-current-content-changes-no-row-test]}
   {:name   :content-unchecked
    :doc    "A write takes content that is not a timeline, for example an event at a time that is not canonical."
    :target `kinds.timeline/write-timeline!
    :edits  [[:remove '(content/check-item! :timeline id item)]]
    :tests  [#'timeline-test/refused-writes-write-nothing-test]}])

(deftest timeline-mutations-test
  (mut/check mutations {}))
