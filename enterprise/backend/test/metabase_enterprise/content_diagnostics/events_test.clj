(ns metabase-enterprise.content-diagnostics.events-test
  "Archiving/deleting a flagged entity invalidates its active findings via event subscriptions, so it drops
  out of the served set without waiting for a rescan. Collection archival cascades to the subtree with no
  per-descendant events, so its handler invalidates the subtree by `scope_collection_id`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- mk-finding!
  [entity-type entity-id scope-collection-id]
  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                   {:scan_id             (str (random-uuid))
                                    :entity_type         entity-type
                                    :entity_id           entity-id
                                    :finding_type        :stale
                                    :scope_collection_id scope-collection-id
                                    :details             {}})))

(defn- invalidated? [finding-id]
  (some? (t2/select-one-fn :invalidated_at :model/ContentDiagnosticsFinding :id finding-id)))

(deftest invalidate-for-entity!-test
  (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
    (let [target (mk-finding! :card 700001 nil)
          other  (mk-finding! :card 700002 nil)]
      (finding/invalidate-for-entity! :card 700001)
      (is (invalidated? target) "the entity's finding is invalidated")
      (is (not (invalidated? other)) "a different entity's finding is untouched"))))

(deftest invalidate-for-collection-subtree!-test
  (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
    (let [coll-self (mk-finding! :collection 800001 nil)
          inside    (mk-finding! :card 800002 800001)
          outside   (mk-finding! :card 800003 800099)]
      (finding/invalidate-for-collection-subtree! [800001])
      (is (invalidated? coll-self) "the archived collection's own finding")
      (is (invalidated? inside) "a finding for an entity scanned inside the subtree")
      (is (not (invalidated? outside)) "a finding outside the subtree is untouched"))))

(deftest archive-events-invalidate-findings-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (let [actor (mt/user->id :crowberto)]
        (testing "card archive invalidates; a non-archive update does not"
          (mt/with-temp [:model/Card card {}]
            (let [f (mk-finding! :card (:id card) nil)]
              (events/publish-event! :event/card-update
                                     {:object (assoc card :archived false) :previous-object card :user-id actor})
              (is (not (invalidated? f)) "still active after a non-archive update")
              (events/publish-event! :event/card-update
                                     {:object (assoc card :archived true) :previous-object card :user-id actor})
              (is (invalidated? f) "invalidated once archived"))))
        (testing "dashboard archive invalidates"
          (let [f (mk-finding! :dashboard 810001 nil)]
            (events/publish-event! :event/dashboard-update
                                   {:object (t2/instance :model/Dashboard {:id 810001 :archived true}) :user-id actor})
            (is (invalidated? f))))
        (testing "document delete (archive publishes :event/document-delete) invalidates"
          (let [f (mk-finding! :document 820001 nil)]
            (events/publish-event! :event/document-delete
                                   {:object (t2/instance :model/Document {:id 820001}) :user-id actor})
            (is (invalidated? f))))
        (testing "transform hard delete invalidates"
          (let [f (mk-finding! :transform 830001 nil)]
            (events/publish-event! :event/transform-delete
                                   {:object (t2/instance :model/Transform {:id 830001}) :user-id actor})
            (is (invalidated? f))))))))

(deftest collection-archive-event-invalidates-subtree-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (mt/with-temp [:model/Collection parent {}
                     :model/Collection child {:location (format "/%d/" (:id parent))}]
        (let [self-finding  (mk-finding! :collection (:id parent) nil)
              child-finding (mk-finding! :card 840001 (:id child))
              outside       (mk-finding! :card 840002 nil)]
          (events/publish-event! :event/collection-update
                                 {:object (assoc parent :archived true) :user-id (mt/user->id :crowberto)})
          (is (invalidated? self-finding) "the archived collection's own finding")
          (is (invalidated? child-finding) "a finding for an entity in a descendant collection")
          (is (not (invalidated? outside)) "an unrelated finding is untouched"))))))

(deftest archive-event-is-a-noop-without-the-feature-test
  (mt/with-premium-features #{}
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (let [f (mk-finding! :dashboard 850001 nil)]
        (events/publish-event! :event/dashboard-update
                               {:object (t2/instance :model/Dashboard {:id 850001 :archived true})
                                :user-id (mt/user->id :crowberto)})
        (is (not (invalidated? f)) "no invalidation when :content-diagnostics is not enabled")))))
