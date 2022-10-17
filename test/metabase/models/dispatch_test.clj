(ns metabase.models.dispatch-test
  (:require
   [clojure.test :refer :all]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.models.interface :as mi]
   [metabase.models.user :as user :refer [User]]
   [metabase.test :as mt]
   [toucan.db :as db]))

(defn- a-user []
  (db/select-one User :id (mt/user->id :rasta)))

(deftest toucan-instance?-test
  (is (models.dispatch/toucan-instance? (a-user)))
  (is (not (models.dispatch/toucan-instance? User))))

(deftest model-test
  (testing "model"
    (is (identical? User
                    (models.dispatch/model User))))
  (testing "instance"
    (is (identical? User
                    (models.dispatch/model (a-user)))))
  (testing ".newInstance"
    (is (identical? User
                    (models.dispatch/model (.newInstance
                                            #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]}
                                            (class User)))))))

(deftest dispatch-by-clause-name-or-class-test
  (testing (str `mbql.u/dispatch-by-clause-name-or-class " should use " `models.dispatch/dispatch-value)
    (testing "model"
      (is (identical? User
                      (mbql.u/dispatch-by-clause-name-or-class User))))
    (testing "instance"
      (is (identical? User
                      (mbql.u/dispatch-by-clause-name-or-class (a-user)))))))

(deftest instance-test
  (is (= (mi/instance User {:a 1})
         (models.dispatch/instance User {:a 1})))
  (is (identical? (class (mi/instance User {:a 1}))
                  (class (models.dispatch/instance User {:a 1})))))
