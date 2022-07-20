(ns metabase.models.emitter-test
 (:require [clojure.test :refer :all]
           [metabase.actions.test-util :as actions.test-util]
           [metabase.models :refer [Emitter]]
           [metabase.test :as mt]
           [toucan.hydrate :refer [hydrate]]))

(deftest test-hydration
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-query-action [action]
        (actions.test-util/with-emitter [{:keys [emitter-id emitter-parent-id]} action]
          (let [card (hydrate (Card emitter-parent-id) :emitter)]
            (is (=)))
          )))))
