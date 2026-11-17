(ns metabase.driver.events.driver-notifications-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.events.driver-notifications]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest database-writes-notify-driver-test
  (mt/with-temp [:model/Database {id :id} {:engine :h2 :details {:db "mem:hooks-test"}}]
    (let [notified (atom [])]
      (with-redefs [driver/notify-database-updated (fn [engine database] (swap! notified conj [engine (:id database)]))]
        (testing "a write that changes the details notifies the driver once"
          (t2/update! :model/Database :id id {:details {:db "mem:hooks-test-2"}})
          (is (= [[:h2 id]] @notified)))
        (testing "a write that changes what the driver does not depend on does not"
          (reset! notified [])
          (t2/update! :model/Database :id id {:name "renamed"})
          (is (empty? @notified)))))))
