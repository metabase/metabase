(ns metabase-enterprise.content-diagnostics.events-test
  "Archiving or deleting a flagged entity invalidates its active findings through the events of its model, so it
  drops out of the served set without waiting for a rescan. Archiving a collection invalidates its subtree's
  collections and whatever currently lives in them; transforms are not archived with their collection and are left
  alone."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.db :as cd.db]
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- mk-finding!
  ([entity-type entity-id]
   (mk-finding! entity-type entity-id nil))
  ([entity-type entity-id scope-collection-id]
   (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                    {:scan_id             (str (random-uuid))
                                     :entity_type         entity-type
                                     :entity_id           entity-id
                                     :finding_type        :stale
                                     :scope_collection_id scope-collection-id
                                     :details             {}}))))

(defn- invalidated? [finding-id]
  (some? (t2/select-one-fn :invalidated_at :model/ContentDiagnosticsFinding :id finding-id)))

(deftest invalidate-for-entities-test
  (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
    (let [target (mk-finding! :card 700001)
          other  (mk-finding! :card 700002)]
      (finding/invalidate-for! {:card #{700001}} #{})
      (is (invalidated? target) "the entity's finding is invalidated")
      (is (not (invalidated? other)) "a different entity's finding is untouched"))))

(deftest invalidate-for-collection-subtree-test
  (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
    (mt/with-temp [:model/Collection {coll-id :id}       {}
                   :model/Collection {other-coll-id :id} {}
                   :model/Card       {inside-id :id}     {:collection_id coll-id}
                   :model/Card       {outside-id :id}    {:collection_id other-coll-id}]
      (let [coll-self (mk-finding! :collection coll-id)
            inside    (mk-finding! :card inside-id coll-id)
            ;; scanned inside the subtree but since moved out: live membership decides, not scan-time scope
            moved-out (mk-finding! :card outside-id coll-id)]
        (finding/invalidate-for! {} #{coll-id})
        (is (invalidated? coll-self) "the archived collection's own finding")
        (is (invalidated? inside) "a finding for a card currently inside the subtree")
        (is (not (invalidated? moved-out)) "a finding for a card that has left the subtree is untouched")))))

(deftest invalidate-for-collection-subtree-leaves-transforms-test
  (testing "a transform is not archived with its collection, so its finding stays active"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (mt/with-temp [:model/Collection {tcoll-id :id} {:namespace "transforms"}
                     :model/Transform  {xform-id :id} {:collection_id tcoll-id}]
        (let [coll-self (mk-finding! :collection tcoll-id)
              xform     (mk-finding! :transform xform-id tcoll-id)]
          (finding/invalidate-for! {} #{tcoll-id})
          (is (invalidated? coll-self) "the archived collection's own finding")
          (is (not (invalidated? xform)) "the transform inside it is untouched"))))))

(deftest archive-invalidates-findings-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (testing "card archive invalidates; a non-archive update does not"
        (mt/with-temp [:model/Card card {}]
          (let [f (mk-finding! :card (:id card))]
            (t2/update! :model/Card :id (:id card) {:name "renamed"})
            (is (not (invalidated? f)) "still active after a non-archive update")
            (t2/update! :model/Card :id (:id card) {:archived true})
            (is (invalidated? f) "invalidated once archived"))))
      (testing "dashboard archive invalidates"
        (mt/with-temp [:model/Dashboard {id :id} {}]
          (let [f (mk-finding! :dashboard id)]
            (t2/update! :model/Dashboard :id id {:archived true})
            (is (invalidated? f)))))
      (testing "document archive invalidates"
        (mt/with-temp [:model/Document {id :id} {}]
          (let [f (mk-finding! :document id)]
            (t2/update! :model/Document :id id {:archived true})
            (is (invalidated? f)))))
      (testing "transform hard delete invalidates"
        (mt/with-temp [:model/Transform {id :id} {}]
          (let [f (mk-finding! :transform id)]
            (t2/delete! :model/Transform :id id)
            (is (invalidated? f))))))))

(deftest collection-archive-invalidates-subtree-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (mt/with-temp [:model/Collection parent {}
                     :model/Collection child {:location (format "/%d/" (:id parent))}
                     :model/Collection {other-coll-id :id} {}
                     :model/Card       {child-card-id :id} {:collection_id (:id child)}
                     :model/Card       {other-card-id :id} {:collection_id other-coll-id}]
        (let [self-finding  (mk-finding! :collection (:id parent))
              child-finding (mk-finding! :card child-card-id (:id child))
              outside       (mk-finding! :card other-card-id)]
          (t2/update! :model/Collection :id (:id parent) {:archived true})
          (is (invalidated? self-finding) "the archived collection's own finding")
          (is (invalidated? child-finding) "a finding for a card in a descendant collection")
          (is (not (invalidated? outside)) "an unrelated finding is untouched"))))))

(deftest collection-archive-invalidates-in-one-statement-test
  (testing "the findings of every item a collection archive takes down are invalidated by one statement"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (doseq [n [2 6]]
          (mt/with-temp [:model/Collection {coll-id :id} {}]
            (let [card-ids (vec (for [_ (range n)]
                                  (t2/insert-returning-pk! :model/Card (assoc (t2.with-temp/with-temp-defaults :model/Card)
                                                                              :collection_id coll-id))))
                  findings (mapv #(mk-finding! :card %) card-ids)
                  updates  (atom 0)]
              (mt/with-dynamic-fn-redefs [cd.db/invalidate-findings-where! (let [f (mt/original-fn #'cd.db/invalidate-findings-where!)]
                                                                             (fn [where] (swap! updates inc) (f where)))]
                (t2/update! :model/Collection :id coll-id {:archived true}))
              (is (every? invalidated? findings))
              (is (= 1 @updates)))))))))

(deftest archive-is-noop-without-feature-test
  (mt/with-premium-features #{}
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (mt/with-temp [:model/Dashboard {id :id} {}]
        (let [f (mk-finding! :dashboard id)]
          (t2/update! :model/Dashboard :id id {:archived true})
          (is (not (invalidated? f)) "no invalidation when :content-diagnostics is not enabled"))))))
