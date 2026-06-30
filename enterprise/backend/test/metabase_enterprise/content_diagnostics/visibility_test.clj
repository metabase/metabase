(ns metabase-enterprise.content-diagnostics.visibility-test
  "Serve-time, per-caller collection-visibility filtering + the `include-personal-collections` toggle.
  Findings are written user-less at scan time, so this **live** serve filter is the only thing scoping
  one caller's results from another. The filter lives in the shared `serve-findings` layer, so exercising
  it through `/stale` covers every per-finding-type endpoint."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- insert-stale-finding! [card-id]
  (t2/insert! :model/ContentDiagnosticsFinding
              {:scan_id "vis-test" :entity_type :card :entity_id card-id :finding_type :stale :details {}}))

(defn- served-card-ids
  "entity_ids returned by GET /stale for `user`, with any extra query params."
  [user & params]
  (set (map :entity_id (:data (apply mt/user-http-request user :get 200
                                     "ee/content-diagnostics/stale" params)))))

(deftest collection-visibility-and-personal-toggle-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [rasta-personal (:id (collection/user->personal-collection (mt/user->id :rasta)))
              crow-personal  (:id (collection/user->personal-collection (mt/user->id :crowberto)))]
          (mt/with-temp
            [:model/Collection {readable :id}   {}
             :model/Collection {unreadable :id} {}
             :model/Card {c-readable :id}   {:collection_id readable}
             :model/Card {c-unreadable :id} {:collection_id unreadable}
             :model/Card {c-rasta-pers :id} {:collection_id rasta-personal}
             :model/Card {c-crow-pers :id}  {:collection_id crow-personal}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
            (run! insert-stale-finding! [c-readable c-unreadable c-rasta-pers c-crow-pers])
            (testing "non-admin default: only readable, non-personal findings (others filtered out)"
              (let [ids (served-card-ids :rasta)]
                (is (contains? ids c-readable))
                (is (not (contains? ids c-unreadable)) "no read perm on its collection")
                (is (not (contains? ids c-rasta-pers)) "own personal excluded by default")
                (is (not (contains? ids c-crow-pers))  "another user's personal: unreadable")))
            (testing "total reflects the visibility-filtered set, not every finding (pagination-correct)"
              (is (= 1 (:total (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale")))))
            (testing "non-admin + include-personal-collections=true: own personal joins, others' still hidden"
              (let [ids (served-card-ids :rasta :include-personal-collections true)]
                (is (contains? ids c-readable))
                (is (contains? ids c-rasta-pers) "own personal now included")
                (is (not (contains? ids c-unreadable)))
                (is (not (contains? ids c-crow-pers)) "still cannot read another user's personal")))
            (testing "admin sees every finding (personal included via the toggle)"
              (let [ids (served-card-ids :crowberto :include-personal-collections true)]
                (is (every? ids [c-readable c-unreadable c-rasta-pers c-crow-pers]))))
            (testing "admin default still excludes personal collections (toggle off)"
              (let [ids (served-card-ids :crowberto)]
                (is (every? ids [c-readable c-unreadable]))
                (is (not (contains? ids c-rasta-pers)))
                (is (not (contains? ids c-crow-pers)))))))))))
