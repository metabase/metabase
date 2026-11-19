(ns metabase.revisions.specs.exploration-test
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
          serialized (revision/snapshot :model/Exploration instance)]
      (testing "bookkeeping/identity columns are excluded from the snapshot"
        ;; Hardcoded on purpose (rather than reading the spec) so that an accidental change to the columns that the
        ;; spec skips fails this test.
        (doseq [k [:id :entity_id :creator_id :created_at :updated_at :archived_directly]]
          (testing k
            (is (not (contains? serialized k))))))
      (testing "user-meaningful columns are preserved"
        (is (contains? serialized :name))
        (is (contains? serialized :description))
        (is (contains? serialized :archived))
        (is (contains? serialized :collection_id)))
      (testing "the pinned position is not"
        (is (not (contains? serialized :collection_position)))))))

(defn- create-exploration!
  "Create an Exploration as `crowberto`, which records its creation revision."
  [attrs]
  (mt/with-current-user (mt/user->id :crowberto)
    (t2/insert-returning-pk! :model/Exploration (assoc attrs :creator_id (mt/user->id :crowberto)))))

(defn- do-with-exploration!
  "Call `f` with the id of a new Exploration with `attrs`, deleting it and its revisions afterwards."
  [attrs f]
  (let [id (create-exploration! attrs)]
    (try
      (f id)
      (finally
        (t2/delete! :model/Revision :model "Exploration" :model_id id)
        (t2/delete! :model/Exploration :id id)))))

(deftest create-event-records-creation-revision-test
  (do-with-exploration!
   {:name "starter"}
   (fn [expl-id]
     (let [revisions (t2/select :model/Revision :model "Exploration" :model_id expl-id)]
       (is (= 1 (count revisions)))
       (is (true? (-> revisions first :is_creation)))
       (is (true? (-> revisions first :most_recent)))
       (is (= (mt/user->id :crowberto) (-> revisions first :user_id)))))))

(deftest update-event-records-update-revision-and-flips-most-recent-test
  (do-with-exploration!
   {:name "starter" :description "desc"}
   (fn [expl-id]
     (mt/with-current-user (mt/user->id :rasta)
       (t2/update! :model/Exploration :id expl-id {:name "renamed"}))
     (revision/settle-revisions! [["Exploration" expl-id]])
     (let [revs (t2/select :model/Revision :model "Exploration" :model_id expl-id
                           {:order-by [[:id :asc]]})]
       (is (= 2 (count revs)))
       (testing "the original creation revision is no longer most-recent"
         (is (false? (-> revs first :most_recent))))
       (testing "the latest revision is not a creation and is most-recent"
         (is (false? (-> revs second :is_creation)))
         (is (true? (-> revs second :most_recent)))
         (is (= (mt/user->id :rasta) (-> revs second :user_id)))
         (is (= "renamed" (-> revs second :object :name))))))))

(deftest no-op-update-does-not-create-revision-test
  (testing "an update that changes nothing records no revision"
    (do-with-exploration!
     {:name "stable"}
     (fn [expl-id]
       (mt/with-current-user (mt/user->id :crowberto)
         (t2/update! :model/Exploration :id expl-id {:name "stable"}))
       (is (= 1 (t2/count :model/Revision :model "Exploration" :model_id expl-id)))))))

(deftest revert-round-trip-test
  (do-with-exploration!
   {:name "original" :description "first"}
   (fn [expl-id]
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
           (is (= (mt/user->id :rasta) (:user_id last-rev)))))))))
