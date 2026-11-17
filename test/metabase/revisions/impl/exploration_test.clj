(ns metabase.revisions.impl.exploration-test
  (:require
   [clojure.test :refer :all]
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
        ;; Hardcoded on purpose (rather than derefing the impl's own exclusion set) so that an
        ;; accidental change to `excluded-columns-for-exploration-revision` fails this test.
        (doseq [k [:id :entity_id :creator_id :created_at :updated_at :archived_directly]]
          (testing k
            (is (not (contains? serialized k))))))
      (testing "user-meaningful columns are preserved"
        (is (contains? serialized :name))
        (is (contains? serialized :description))
        (is (contains? serialized :archived))
        (is (contains? serialized :collection_id))
        (is (contains? serialized :collection_position))))))

(defn- create-exploration!
  "Create an Exploration as `crowberto`, which records its creation revision."
  [attrs]
  (mt/with-current-user (mt/user->id :crowberto)
    (t2/insert-returning-pk! :model/Exploration (assoc attrs :creator_id (mt/user->id :crowberto)))))

(defmacro ^:private with-exploration
  [[id-sym attrs] & body]
  `(let [~id-sym (create-exploration! ~attrs)]
     (try
       ~@body
       (finally
         (t2/delete! :model/Revision :model "Exploration" :model_id ~id-sym)
         (t2/delete! :model/Exploration :id ~id-sym)))))

(deftest create-event-records-creation-revision-test
  (with-exploration [expl-id {:name "starter"}]
    (let [revisions (t2/select :model/Revision :model "Exploration" :model_id expl-id)]
      (is (= 1 (count revisions)))
      (is (true? (-> revisions first :is_creation)))
      (is (true? (-> revisions first :most_recent)))
      (is (= (mt/user->id :crowberto) (-> revisions first :user_id))))))

(deftest update-event-records-update-revision-and-flips-most-recent-test
  (with-exploration [expl-id {:name "starter" :description "desc"}]
    (mt/with-current-user (mt/user->id :rasta)
      (t2/update! :model/Exploration :id expl-id {:name "renamed"}))
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
  (testing "an update that changes nothing records no revision"
    (with-exploration [expl-id {:name "stable"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (t2/update! :model/Exploration :id expl-id {:name "stable"}))
      (is (= 1 (t2/count :model/Revision :model "Exploration" :model_id expl-id))))))

(deftest revert-round-trip-test
  (with-exploration [expl-id {:name "original" :description "first"}]
    (let [first-rev-id (t2/select-one-pk :model/Revision
                                         :model "Exploration" :model_id expl-id
                                         {:order-by [[:id :asc]]})]
      (mt/with-current-user (mt/user->id :crowberto)
        (t2/update! :model/Exploration :id expl-id {:name "renamed" :description "later"}))
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
