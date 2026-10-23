(ns mage.new-migration-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [lint-migrations-file]
   [mage.new-migration :as new-migration])
  (:import
   (java.time ZoneOffset ZonedDateTime)))

(set! *warn-on-reflection* true)

(def ^:private now (ZonedDateTime/of 2026 10 12 9 0 0 0 ZoneOffset/UTC))

(defn- migration-file [opts]
  (new-migration/migration-file (merge {:author "alice" :now now :existing-ids #{}} opts)))

(deftest version-less-migration-test
  (testing "the file goes in the current year's directory, named by the description, with a random version-less id"
    (let [{:keys [path id content]} (migration-file {:description "add_user_table"})]
      (is (= "resources/migrations/2026/20261012_add_user_table.yaml" path))
      (is (re-matches #"[a-uw-z][a-z0-9]{5}" id))
      (is (lint-migrations-file/valid-version-less-id? id))
      (is (str/includes? content (str "      id: " id "\n")))
      (is (str/includes? content "      author: alice\n"))))
  (testing "ids differ between files"
    (is (< 1 (count (into #{} (map (fn [_] (:id (migration-file {:description "x"})))) (range 20))))))
  (testing "an id already used in the repository is never generated"
    (let [taken (into #{} (map (fn [_] (:id (migration-file {:description "x"})))) (range 50))]
      (is (not (taken (:id (migration-file {:description "x" :existing-ids taken})))))))
  (testing "the description must be a lowercase snake_case name"
    (doseq [description ["Add-Table" "has space" ""]]
      (is (thrown? clojure.lang.ExceptionInfo (migration-file {:description description}))
          description))))

(deftest no-versioned-layout-test
  (testing "there is no versioned mode: every supported major takes version-less changesets"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"version-less"
                          (new-migration/new-migration {:arguments [65 "something"]})))))
