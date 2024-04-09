(ns metabase.models.json-migration-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.json-migration :as jm]))

(jm/def-json-migration migrate-birds)

(defmethod migrate-birds [1 2] [bird-facts _]
  (assoc bird-facts :favorite :toucan))

(deftest ^:parallel basic-usage-test
  (testing "No-ops with no version change"
    (is (= {:favorite :pigeon, :version 1}
           (migrate-birds {:favorite :pigeon, :version 1} 1))))
  (testing "No-ops with no version change and no explicit version"
    (is (= {:favorite :pigeon}
           (migrate-birds {:favorite :pigeon} 1))))
  (testing "Runs a user-defined migration for higher versions"
    (is (= {:favorite :toucan, :version 1} ;; version is handled separately :(
           (migrate-birds {:favorite :pigeon, :version 1} 2)))))

(deftest ^:parallel version-updating-test
  (testing "It updates the :version key"
    (is (= {:favorite :toucan, :version 2}
           (jm/update-version {:favorite :toucan, :version 1} 2)))))
