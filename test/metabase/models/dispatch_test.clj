(ns metabase.models.dispatch-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.models.interface :as mi]
   [metabase.models.user :as user :refer [User]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- a-user []
  (t2/select-one User :id (mt/user->id :rasta)))

(deftest toucan-instance?-test
  (is (models.dispatch/toucan-instance? (a-user)))
  (is (not (models.dispatch/toucan-instance? User))))

(deftest instance-test
  (is (= (mi/instance User {:a 1})
         (models.dispatch/instance User {:a 1})))
  (is (identical? (class (mi/instance User {:a 1}))
                  (class (models.dispatch/instance User {:a 1})))))
