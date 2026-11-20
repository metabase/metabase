(ns metabase-enterprise.data-testing.write
  "The write functions of the saved tests, `:model/TransformTest`, `:model/CardTest` and `:model/SegmentTest`, through
  which every writer creates, updates and deletes them."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `saved-test`."
  [saved-test changes]
  (into {} (remove (fn [[k v]] (= v (get saved-test k)))) changes))

(defn- update-saved-test!
  "Apply `changes` to `test-or-id`, a saved test of `model` the caller already loaded or the id of one, which
  `select-test` loads and `update-test!` writes, and publish its update event, returning the number of tests updated."
  [model select-test update-test! test-or-id changes opts]
  (let [saved-test (if (map? test-or-id) test-or-id (select-test test-or-id))
        changes    (when saved-test (changed saved-test changes))]
    (if (empty? changes)
      0
      (let [written (cond-> changes
                      (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
        (events/with-event-context (select-keys opts [:revision-message])
          (events/with-batched-events
            (u/prog1 (update-test! (:id saved-test) written)
              (events/updated! model (merge saved-test written) saved-test))))))))

(defn- delete-saved-tests!
  "Delete the saved tests of `model` and `test-type` with `ids`, which `select-tests` loads and `delete-tests!` deletes,
  after setting the test id of their runs to nil, and publish their delete events, returning the number deleted."
  [model test-type select-tests delete-tests! ids]
  (let [saved-tests (when (seq ids) (select-tests ids))]
    (if (empty? saved-tests)
      0
      (events/with-batched-events
        (events/deleting! model saved-tests
                          (fn []
                            (run! #(data-testing.db/clear-test-id-of-runs! test-type (:id %)) saved-tests)
                            (delete-tests! (mapv :id saved-tests))))))))

;;; ------------------------------------------------- Transform tests -------------------------------------------------

(mu/defn create-transform-test! :- ::data-testing.schema/transform-test
  "Insert the TransformTest `transform-test` returning the inserted test."
  [transform-test :- [:merge
                      ::data-testing.schema/transform-test.create
                      [:map {:closed true}
                       [:creator_id ::lib.schema.id/user]]]]
  (data-testing.db/insert-transform-test! transform-test))

(mu/defn update-transform-test! :- :int
  "Apply `changes` to `test-or-id`, a TransformTest the caller already loaded or the id of one, and publish its update
  event, returning the number of tests updated; for the REST API, revision revert and the SerDes import."
  [test-or-id :- [:or ms/PositiveInt :map]
   changes    :- ::data-testing.schema/transform-test.changes
   opts       :- ::data-testing.schema/write-opts]
  (update-saved-test! :model/TransformTest data-testing.db/transform-test data-testing.db/update-transform-test!
                      test-or-id changes opts))

(mu/defn delete-transform-tests! :- :int
  "Delete the TransformTests with `ids` and publish their delete events, returning the number deleted; for remote sync
  and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::data-testing.schema/write-opts]
  (delete-saved-tests! :model/TransformTest :transform data-testing.db/transform-tests-by-ids
                       data-testing.db/delete-transform-tests! ids))

(mu/defn delete-transform-test! :- :int
  "Delete the TransformTest with `id`, for the REST API, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::data-testing.schema/write-opts]
  (delete-transform-tests! [id] opts))

(mu/defn delete-tests-of-transform! :- :int
  "Delete the TransformTests of the Transform `transform-id`, whatever the token says, for the delete of a Transform."
  [transform-id :- ::lib.schema.id/transform]
  (delete-transform-tests! (data-testing.db/transform-test-ids-of-transform transform-id) {}))

(defmethod mi/write-fns :model/TransformTest
  [_model]
  {:update! update-transform-test!
   :delete! delete-transform-tests!})

;;; --------------------------------------------------- Card tests ---------------------------------------------------

(mu/defn create-card-test! :- ::data-testing.schema/card-test
  "Insert the CardTest `card-test` returning the inserted test."
  [card-test :- [:merge
                 ::data-testing.schema/card-test.create
                 [:map {:closed true}
                  [:creator_id ::lib.schema.id/user]]]]
  (data-testing.db/insert-card-test! card-test))

(mu/defn update-card-test! :- :int
  "Apply `changes` to `test-or-id`, a CardTest the caller already loaded or the id of one, and publish its update
  event, returning the number of tests updated; for the REST API, revision revert and the SerDes import."
  [test-or-id :- [:or ms/PositiveInt :map]
   changes    :- ::data-testing.schema/card-test.changes
   opts       :- ::data-testing.schema/write-opts]
  (update-saved-test! :model/CardTest data-testing.db/card-test data-testing.db/update-card-test!
                      test-or-id changes opts))

(mu/defn delete-card-tests! :- :int
  "Delete the CardTests with `ids` and publish their delete events, returning the number deleted; for remote sync and
  the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::data-testing.schema/write-opts]
  (delete-saved-tests! :model/CardTest :card data-testing.db/card-tests-by-ids data-testing.db/delete-card-tests! ids))

(mu/defn delete-card-test! :- :int
  "Delete the CardTest with `id`, for the REST API, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::data-testing.schema/write-opts]
  (delete-card-tests! [id] opts))

(mu/defn delete-tests-of-card! :- :int
  "Delete the CardTests of the Card `card-id`, whatever the token says, for the delete of a Card."
  [card-id :- ::lib.schema.id/card]
  (delete-card-tests! (data-testing.db/card-test-ids-of-card card-id) {}))

(defmethod mi/write-fns :model/CardTest
  [_model]
  {:update! update-card-test!
   :delete! delete-card-tests!})

;;; -------------------------------------------------- Segment tests -------------------------------------------------

(mu/defn create-segment-test! :- ::data-testing.schema/segment-test
  "Insert the SegmentTest `segment-test` returning the inserted test."
  [segment-test :- [:merge
                    ::data-testing.schema/segment-test.create
                    [:map {:closed true}
                     [:creator_id ::lib.schema.id/user]]]]
  (data-testing.db/insert-segment-test! segment-test))

(mu/defn update-segment-test! :- :int
  "Apply `changes` to `test-or-id`, a SegmentTest the caller already loaded or the id of one, and publish its update
  event, returning the number of tests updated; for the REST API, revision revert and the SerDes import."
  [test-or-id :- [:or ms/PositiveInt :map]
   changes    :- ::data-testing.schema/segment-test.changes
   opts       :- ::data-testing.schema/write-opts]
  (update-saved-test! :model/SegmentTest data-testing.db/segment-test data-testing.db/update-segment-test!
                      test-or-id changes opts))

(mu/defn delete-segment-tests! :- :int
  "Delete the SegmentTests with `ids` and publish their delete events, returning the number deleted; for remote sync
  and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::data-testing.schema/write-opts]
  (delete-saved-tests! :model/SegmentTest :segment data-testing.db/segment-tests-by-ids
                       data-testing.db/delete-segment-tests! ids))

(mu/defn delete-segment-test! :- :int
  "Delete the SegmentTest with `id`, for the REST API, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::data-testing.schema/write-opts]
  (delete-segment-tests! [id] opts))

(mu/defn delete-tests-of-segment! :- :int
  "Delete the SegmentTests of the Segment `segment-id`, whatever the token says, for the delete of a Segment."
  [segment-id :- ::lib.schema.id/segment]
  (delete-segment-tests! (data-testing.db/segment-test-ids-of-segment segment-id) {}))

(defmethod mi/write-fns :model/SegmentTest
  [_model]
  {:update! update-segment-test!
   :delete! delete-segment-tests!})
