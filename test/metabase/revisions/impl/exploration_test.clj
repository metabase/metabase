(ns metabase.revisions.impl.exploration-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.revisions.impl.exploration :as impl.exploration]
   [metabase.revisions.init]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment metabase.revisions.init/keep-me)

(deftest serialize-instance-strips-bookkeeping-columns-test
  (mt/with-temp [:model/Exploration {expl-id :id} {:name "expl" :creator_id (mt/user->id :crowberto)}]
    (let [instance   (t2/select-one :model/Exploration :id expl-id)
          serialized (revision/serialize-instance :model/Exploration expl-id instance)]
      (testing "bookkeeping/identity columns are excluded from the snapshot"
        (doseq [k @#'impl.exploration/excluded-columns-for-exploration-revision]
          (testing k
            (is (not (contains? serialized k))))))
      (testing "user-meaningful columns are preserved"
        (is (contains? serialized :name))
        (is (contains? serialized :description))
        (is (contains? serialized :archived))
        (is (contains? serialized :collection_id))
        (is (contains? serialized :collection_position))))))

(deftest create-event-records-creation-revision-test
  (mt/with-temp [:model/Exploration {expl-id :id} {:name "starter" :creator_id (mt/user->id :crowberto)}]
    (let [obj (t2/select-one :model/Exploration :id expl-id)]
      (events/publish-event! :event/exploration-create
                             {:object obj :user-id (mt/user->id :crowberto)})
      (let [revisions (t2/select :model/Revision :model "Exploration" :model_id expl-id)]
        (is (= 1 (count revisions)))
        (is (true? (-> revisions first :is_creation)))
        (is (true? (-> revisions first :most_recent)))
        (is (= (mt/user->id :crowberto) (-> revisions first :user_id)))))))

(deftest update-event-records-update-revision-and-flips-most-recent-test
  (mt/with-temp [:model/Exploration {expl-id :id} {:name "starter" :description "desc" :creator_id (mt/user->id :crowberto)}]
    (events/publish-event! :event/exploration-create
                           {:object  (t2/select-one :model/Exploration :id expl-id)
                            :user-id (mt/user->id :crowberto)})
    (t2/update! :model/Exploration expl-id {:name "renamed"})
    (events/publish-event! :event/exploration-update
                           {:object  (t2/select-one :model/Exploration :id expl-id)
                            :user-id (mt/user->id :rasta)})
    (let [revs (t2/select :model/Revision :model "Exploration" :model_id expl-id
                          {:order-by [[:id :asc]]})]
      (is (= 2 (count revs)))
      (testing "the original creation revision is no longer most-recent"
        (is (false? (-> revs first :most_recent))))
      (testing "the latest revision is not a creation and is most-recent"
        (is (false? (-> revs second :is_creation)))
        (is (true? (-> revs second :most_recent)))
        (is (= (mt/user->id :rasta) (-> revs second :user_id)))
        (is (= "renamed" (-> revs second :object :name)))))))

(deftest no-op-update-does-not-create-revision-test
  (testing "push-revision! short-circuits when the serialized snapshot matches the previous one"
    (mt/with-temp [:model/Exploration {expl-id :id} {:name "stable" :creator_id (mt/user->id :crowberto)}]
      (let [obj (t2/select-one :model/Exploration :id expl-id)]
        (events/publish-event! :event/exploration-create
                               {:object obj :user-id (mt/user->id :crowberto)})
        (events/publish-event! :event/exploration-update
                               {:object obj :user-id (mt/user->id :crowberto)})
        (is (= 1 (t2/count :model/Revision :model "Exploration" :model_id expl-id)))))))

(deftest revert-round-trip-test
  (mt/with-temp [:model/Exploration {expl-id :id} {:name "original" :description "first" :creator_id (mt/user->id :crowberto)}]
    (events/publish-event! :event/exploration-create
                           {:object  (t2/select-one :model/Exploration :id expl-id)
                            :user-id (mt/user->id :crowberto)})
    (let [first-rev-id (t2/select-one-pk :model/Revision
                                         :model "Exploration" :model_id expl-id
                                         {:order-by [[:id :asc]]})]
      (t2/update! :model/Exploration expl-id {:name "renamed" :description "later"})
      (events/publish-event! :event/exploration-update
                             {:object  (t2/select-one :model/Exploration :id expl-id)
                              :user-id (mt/user->id :crowberto)})
      (revision/revert! {:entity      :model/Exploration
                         :id          expl-id
                         :revision-id first-rev-id
                         :user-id     (mt/user->id :rasta)})
      (let [reverted (t2/select-one :model/Exploration :id expl-id)
            last-rev (t2/select-one :model/Revision
                                    :model "Exploration" :model_id expl-id
                                    {:order-by [[:id :desc]]})]
        (testing "exploration row reverted to first revision's snapshot"
          (is (= "original" (:name reverted)))
          (is (= "first"    (:description reverted))))
        (testing "reversion produces a new revision marked is_reversion"
          (is (true? (:is_reversion last-rev)))
          (is (= (mt/user->id :rasta) (:user_id last-rev))))))))
