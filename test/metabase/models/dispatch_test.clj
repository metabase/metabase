(ns metabase.models.dispatch-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- a-user []
  (t2/select-one :model/User :id (mt/user->id :rasta)))

(deftest ^:parallel toucan-instance?-test
  (is (models.dispatch/toucan-instance? (a-user)))
  (is (not (models.dispatch/toucan-instance? :model/User))))

(deftest ^:parallel instance-test
  (is (= (mi/instance :model/User {:a 1})
         (models.dispatch/instance :model/User {:a 1})))
  (is (identical? (class (mi/instance :model/User {:a 1}))
                  (class (models.dispatch/instance :model/User {:a 1})))))
