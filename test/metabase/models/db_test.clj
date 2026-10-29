(ns metabase.models.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.db :as models.db]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/primary-keys ::named-pk [_model]
  [:name])

(deftest delete-entity-binds-string-id-test
  (let [ordinary (t2/compile (models.db/delete-entity! :widgets "blackbird"))
        payload  "SELECT 42 AS answer"
        hostile  (t2/compile (models.db/delete-entity! :widgets payload))]
    (is (= (first ordinary) (first hostile)))
    (is (re-find #"(?i)DELETE FROM.*WHERE.*id.*= \?" (first hostile)))
    (is (= [payload] (vec (rest hostile))))))

(deftest delete-entity-uses-model-primary-key-test
  (let [payload "SELECT 42 AS answer"
        query   (t2/compile (models.db/delete-entity! ::named-pk payload))]
    (is (re-find #"(?i)WHERE.*name.*= \?" (first query)))
    (is (= [payload] (vec (rest query))))))

(deftest update-entity-uses-model-primary-key-test
  (let [payload "SELECT 42 AS answer"
        query   (t2/compile (models.db/update-entity! payload {:model ::named-pk
                                                            :row   {:description "blackbird"}}))]
    (is (re-find #"(?i)UPDATE.*SET.*description.*= \?.*WHERE.*name.*= \?" (first query)))
    (is (= ["blackbird" payload] (vec (rest query))))))
