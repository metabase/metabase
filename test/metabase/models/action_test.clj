(ns metabase.models.action-test
  (:require [clojure.test :refer :all]
            [metabase.actions.test-util :as actions.test-util]
            [metabase.models :refer [Emitter]]
            [metabase.test :as mt]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(deftest hydrate-query-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [{:keys [query-action-card-id action-id] :as context} {}]
        (actions.test-util/with-card-emitter [{:keys [emitter-id]} context]
          (let [emitter (db/select-one Emitter :id emitter-id)
                hydrated-emitter (hydrate emitter :action)]
            (is (partial=
                  {:id action-id
                   :name "Query Example"
                   :card {:id query-action-card-id}
                   :parameters [{:id "id" :type :number}]}
                  (:action hydrated-emitter)))))))))

(deftest hydrate-http-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [{:keys [action-id] :as context} {:type :http}]
        (actions.test-util/with-card-emitter [{:keys [emitter-id]} context]
          (let [emitter (db/select-one Emitter :id emitter-id)
                hydrated-emitter (hydrate emitter :action)]
            (is (partial=
                  {:id action-id
                   :name "Echo Example"
                   :parameters [{:id "id" :type :number}
                                {:id "fail" :type :text}]}
                  (:action hydrated-emitter)))))))))
