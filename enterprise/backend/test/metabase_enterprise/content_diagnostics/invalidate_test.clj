(ns ^:synchronized metabase-enterprise.content-diagnostics.invalidate-test
  "`POST /invalidate` dismisses the findings a caller can see and reports every other requested id as
  skipped."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.test-util :as cd.tu]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each cd.tu/with-authorized-reader!)

(defn- invalidate!
  [ids]
  (mt/user-http-request :rasta :post 200 "ee/content-diagnostics/invalidate" {:ids ids}))

(defn- active?
  [finding-id]
  (t2/exists? :model/ContentDiagnosticsFinding :id finding-id :invalidated_at nil))

(defn- stamped?
  [finding-id]
  (t2/exists? :model/ContentDiagnosticsFinding :id finding-id :invalidated_at [:not= nil]))

(defn- stale-ids
  []
  (set (map :id (:data (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale")))))

(defn- nonexistent-id
  []
  (inc (or (t2/select-one-fn :id :model/ContentDiagnosticsFinding {:order-by [[:id :desc]]}) 0)))

(defn- with-cards!
  "Call `f` with the ids of two cards in a collection `:rasta` can read, and one in a collection it cannot."
  [f]
  (mt/with-premium-features #{:content-diagnostics :advanced-permissions}
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {visible-coll :id} {}
                       :model/Collection {hidden-coll :id}  {}
                       :model/Card {visible-card :id} {:collection_id visible-coll}
                       :model/Card {other-card :id}   {:collection_id visible-coll}
                       :model/Card {hidden-card :id}  {:collection_id hidden-coll}]
          (perms/grant-collection-read-permissions! (perms/all-users-group) visible-coll)
          (f visible-card other-card hidden-card))))))

(deftest invalidate-happy-path-test
  (testing "active visible findings are invalidated and stamped"
    (with-cards!
      (fn [card other-card _]
        (let [a (cd.tu/insert-finding! "scan" card nil)
              b (cd.tu/insert-finding! "scan" other-card nil)]
          (is (= {:invalidated [a b], :skipped []}
                 (invalidate! [a b])))
          (is (true? (stamped? a)))
          (is (true? (stamped? b))))))))

(deftest invalidate-mixed-test
  (testing "nonexistent and already-invalidated ids are skipped"
    (with-cards!
      (fn [card other-card _]
        (let [active  (cd.tu/insert-finding! "scan" card nil)
              stamped (cd.tu/insert-finding! "scan" other-card (t/offset-date-time))
              missing (nonexistent-id)]
          (is (= {:invalidated [active], :skipped [missing stamped]}
                 (invalidate! [active missing stamped]))))))))

(deftest invalidate-not-visible-test
  (testing "a finding whose entity the caller cannot read is skipped and left active"
    (with-cards!
      (fn [visible _ hidden]
        (let [ok     (cd.tu/insert-finding! "scan" visible nil)
              unseen (cd.tu/insert-finding! "scan" hidden nil)]
          (is (= {:invalidated [ok], :skipped [unseen]}
                 (invalidate! [ok unseen])))
          (is (true? (active? unseen))))))))

(deftest invalidate-skips-superseded-finding-test
  (testing "an older active finding behind a newer one for the same entity is skipped, and the newer one stays listed"
    (with-cards!
      (fn [card _ _]
        (let [older (cd.tu/insert-finding! "scan-old" card nil)
              newer (cd.tu/insert-finding! "scan-new" card nil)]
          (is (= {:invalidated [], :skipped [older]}
                 (invalidate! [older])))
          (is (true? (active? older)))
          (is (contains? (stale-ids) newer))
          (testing "dismissing the newer one hides the entity, even though the older row is still active"
            (is (= {:invalidated [newer], :skipped []}
                   (invalidate! [newer])))
            (is (not-any? #{older newer} (stale-ids)))))))))

(deftest invalidate-is-idempotent-test
  (testing "a repeat call skips everything"
    (with-cards!
      (fn [card other-card _]
        (let [ids [(cd.tu/insert-finding! "scan" card nil)
                   (cd.tu/insert-finding! "scan" other-card nil)]]
          (is (= {:invalidated ids, :skipped []} (invalidate! ids)))
          (is (= {:invalidated [], :skipped ids} (invalidate! ids))))))))

(deftest invalidate-drops-finding-from-list-test
  (testing "the dismissed finding no longer appears under GET /stale"
    (with-cards!
      (fn [card _ _]
        (let [id (cd.tu/insert-finding! "scan" card nil)]
          (is (contains? (stale-ids) id))
          (invalidate! [id])
          (is (not (contains? (stale-ids) id))))))))

(deftest invalidate-dedupes-ids-test
  (testing "duplicate ids appear once in the response, in first-occurrence order"
    (with-cards!
      (fn [card _ _]
        (let [a       (cd.tu/insert-finding! "scan" card nil)
              missing (nonexistent-id)]
          (is (= {:invalidated [a], :skipped [missing]}
                 (invalidate! [missing a missing a]))))))))

(deftest invalidate-rejects-empty-ids-test
  (testing "an empty `ids` is a 400"
    (mt/with-premium-features #{:content-diagnostics :advanced-permissions}
      (mt/user-http-request :rasta :post 400 "ee/content-diagnostics/invalidate" {:ids []}))))
