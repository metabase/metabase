(ns metabase.models.emitter-test
  (:require [clojure.test :refer :all]
            [metabase.actions.test-util :as actions.test-util]
            [metabase.models :refer [Action Card Dashboard]]
            [metabase.test :as mt]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(deftest test-hydration
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [context {}]
        (actions.test-util/with-card-emitter [{:keys [emitter-id emitter-parent-id]} context]
          (let [card (db/select-one Card :id emitter-parent-id)
                hydrated-card (hydrate card :emitters)]
            (is (partial=
                 [{:id emitter-id}]
                 (:emitters hydrated-card)))))))))

(deftest dashboard-emitter-hydration-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [context {}]
        (actions.test-util/with-dashboard-emitter [{:keys [emitter-id emitter-parent-id]} context]
          (let [dashboard (db/select-one Dashboard :id emitter-parent-id)
                hydrated-card (hydrate dashboard [:emitters :action])]
            (is (partial=
                  [{:id emitter-id}]
                  (:emitters hydrated-card)))))))))

(deftest action-emitter-usages-hydration-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [{:keys [action-id] :as context} {}]
        (actions.test-util/with-card-emitter [{card-id :emitter-parent-id} context]
          (actions.test-util/with-dashboard-emitter [{dashboard-id :emitter-parent-id} context]
            (is (= #{{:id card-id :type "card" :name (str "Card " action-id)}
                     {:id dashboard-id :type "dashboard" :name (str "Dashboard " action-id)}}
                   (set (:emitter-usages (hydrate (db/select-one Action :id action-id) :action/emitter-usages)))))))))))

(deftest card-emitter-usages-hydration-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [{:keys [action-id query-action-card-id] :as context} {}]
        (actions.test-util/with-card-emitter [{card-id :emitter-parent-id} context]
          (actions.test-util/with-dashboard-emitter [{dashboard-id :emitter-parent-id} context]
            (is (= #{{:id card-id :type "card" :name (str "Card " action-id)}
                     {:id dashboard-id :type "dashboard" :name (str "Dashboard " action-id)}}
                   (set (:emitter-usages (hydrate (db/select-one Card :id query-action-card-id) :card/emitter-usages)))))))))))
