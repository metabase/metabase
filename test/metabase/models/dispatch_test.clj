(ns metabase.models.dispatch-test
  (:require
   [clojure.test :refer :all]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.models.user :refer [User]]
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
                    (models.dispatch/model (a-user))))))

(deftest dispatch-by-clause-name-or-class-test
  (testing (str `mbql.u/dispatch-by-clause-name-or-class " should use " `models.dispatch/dispatch-value)
    (testing "model"
      (is (identical? User
                      (mbql.u/dispatch-by-clause-name-or-class User))))
    (testing "instance"
      (is (identical? User
                      (mbql.u/dispatch-by-clause-name-or-class (a-user)))))))
