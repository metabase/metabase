(ns metabase.util.magic-map.db-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [User]]
             [test :as mt]]
            [metabase.util.magic-map :as magic-map]
            metabase.util.magic-map.test-hacks
            [toucan.db :as db]))

(comment metabase.util.magic-map.test-hacks/keep-me)

(deftest db-test
  (let [orig db/honeysql->sql]
    (doseq [[description k] {"lisp-case" :first-name
                             "snake_case" :first_name}]
      (testing (format "Should be able to use %s" description)
        (let [user-id (mt/user->id :rasta)
              user    (magic-map/magic-map (db/select-one User :id user-id, :first_name "Rasta"))]
          (testing "in Toucan select functions"
            (testing "select-one"
              (is (= user
                     (db/select-one User :id user-id, k "Rasta"))))
            (testing "select-one-field"
              (is (= "Rasta"
                     (db/select-one-field k User :id user-id)))))
          (testing "with maps returned by Toucan functions"
            (is (= "Rasta"
                   (k user))))
          (testing "with Toucan DML functions"
            (mt/with-temp User [temp-user {k "Cam"}]
              (db/update! User (:id temp-user) k "Cam 2")
              (is (= "Cam 2"
                     (k (User (:id temp-user))))))))))))
