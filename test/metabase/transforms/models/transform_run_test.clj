(ns metabase.transforms.models.transform-run-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.events.test-util :as events.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.models.transform-run :as transform-run]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest reaping-statement-counts-do-not-grow-with-runs-test
  (mt/with-temp [:model/Transform {t1 :id} {}
                 :model/Transform {t2 :id} {}
                 :model/Transform {t3 :id} {}
                 :model/Transform {t4 :id} {}
                 :model/Transform {t5 :id} {}
                 :model/Transform {t6 :id} {}]
    (mt/with-model-cleanup [:model/TransformRun]
      (let [transform-ids [t1 t2 t3 t4 t5 t6]
            start!        (fn [n]
                            (let [runs (mapv #(transform-run/start-run! % {:run_method :manual}) (take n transform-ids))]
                              (doseq [transform-id (take n transform-ids)]
                                (transform-run/set-run-times! transform-id (t/minus (t/instant) (t/hours 5))))
                              (mapv :id runs)))]
        (testing "timing out old runs"
          (let [counted (fn [n]
                          (start! n)
                          (events.tu/statement-count! #(transform-run/timeout-old-runs! 1 :hour)))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))
        (testing "heartbeating runs"
          (let [counted (fn [n]
                          (let [ids   (start! n)
                                count (events.tu/statement-count! #(transform-run/heartbeat-runs! ids))]
                            (run! transform-run/succeed-started-run! ids)
                            count))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))))))

(defn- per-row-can-read?
  "The answer the per-row `:can_read` hydration of a TransformRun gave: its Transform loaded alone and asked."
  [run]
  (boolean (or api/*is-superuser?*
               (when-let [transform-id (:transform_id run)]
                 (some-> (t2/select-one :model/Transform :id transform-id) (t2/hydrate :can_read) mi/can-read?)))))

(deftest can-read-statements-do-not-grow-with-runs-test
  (mt/when-ee-evailable
   (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                  :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                  :model/Transform {transform-id :id}
                  {:name   "MBQL Transform"
                   :source {:type  :query
                            :query (lib/query (mt/metadata-provider)
                                              (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
     (mt/with-data-analyst-role! (mt/user->id :rasta)
       (mt/with-restored-data-perms!
         (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
         (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder-and-native)
         (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
         (mt/with-premium-features #{:transforms-basic :hosting :advanced-permissions}
           (mt/with-current-user (mt/user->id :rasta)
             (let [runs    (mapv #(t2/instance :model/TransformRun {:id % :transform_id (when (even? %) transform-id)})
                                 (range 6))
                   hydrate (fn [n]
                             (t2/with-call-count [call-count]
                               (let [hydrated (doall (t2/hydrate (vec (take n runs)) :can_read))]
                                 {:statements (call-count)
                                  :values     (mapv mi/can-read? hydrated)})))]
               (hydrate 1)
               (is (= (:statements (hydrate 2)) (:statements (hydrate 6))))
               (is (= [true false true false true false] (:values (hydrate 6))))
               (is (= (mapv per-row-can-read? runs) (:values (hydrate 6))))))))))))
