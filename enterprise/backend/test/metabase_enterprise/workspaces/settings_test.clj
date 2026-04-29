(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]))

(use-fixtures :each (fn [thunk]
                      (try
                        (thunk)
                        (finally
                          (ws/clear-instance-workspace!)))))

(deftest has-active-workspace-false-when-atom-empty-test
  (testing "has-active-workspace is false when no :workspace section has been loaded"
    (ws/clear-instance-workspace!)
    (is (false? (ws.settings/has-active-workspace)))))

(deftest has-active-workspace-true-when-atom-populated-test
  (testing "has-active-workspace flips to true once the loader populates the in-process atom"
    (ws/clear-instance-workspace!)
    (is (false? (ws.settings/has-active-workspace)))
    (ws/set-instance-workspace! {:name "Acme" :databases {}})
    (is (true? (ws.settings/has-active-workspace)))))

(deftest has-active-workspace-flips-back-to-false-on-clear-test
  (testing "has-active-workspace returns to false after clear-instance-workspace!"
    (ws/set-instance-workspace! {:name "Acme" :databases {}})
    (is (true? (ws.settings/has-active-workspace)))
    (ws/clear-instance-workspace!)
    (is (false? (ws.settings/has-active-workspace)))))
