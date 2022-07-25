(ns metabase.models.emitter-test
  (:require [clojure.test :refer :all]
            [metabase.actions.test-util :as actions.test-util]
            [metabase.models :refer [Card Dashboard]]
            [metabase.test :as mt]
            [toucan.hydrate :refer [hydrate]]))

(deftest test-hydration
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-query-action [context]
        (actions.test-util/with-card-emitter [{:keys [emitter-id emitter-parent-id]} context]
            (let [card (Card emitter-parent-id)
                  hydrated-card (hydrate card :emitters)]
              (is (partial=
                    [{:id emitter-id}]
                    (:emitters hydrated-card)))))))))

(deftest dashboard-emitter-hydration-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-query-action [context]
        (actions.test-util/with-dashboard-emitter [{:keys [emitter-id emitter-parent-id]} context]
          (let [dashboard (Dashboard emitter-parent-id)
                hydrated-card (hydrate dashboard [:emitters :action])]
            (is (partial=
                  [{:id emitter-id}]
                  (:emitters hydrated-card)))))))))
