(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.instance :as ws.instance]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [thunk]
                      (try
                        (thunk)
                        (finally
                          (ws.instance/clear-instance-workspace!)))))

(deftest workspace-mode?-false-when-setting-empty-test
  (testing "workspace-mode? is false when no :workspace section has been loaded"
    (ws.instance/clear-instance-workspace!)
    (is (false? (ws.instance/workspace-mode?)))))

(deftest workspace-mode?-true-when-setting-populated-test
  (testing "workspace-mode? flips to true once a workspace config has been set"
    (ws.instance/clear-instance-workspace!)
    (is (false? (ws.instance/workspace-mode?)))
    (ws.instance/set-instance-workspace! {:name "Acme" :databases {}})
    (is (true? (ws.instance/workspace-mode?)))))

(deftest workspace-mode?-flips-back-to-false-on-clear-test
  (testing "workspace-mode? returns to false after clear-instance-workspace!"
    (ws.instance/set-instance-workspace! {:name "Acme" :databases {}})
    (is (true? (ws.instance/workspace-mode?)))
    (ws.instance/clear-instance-workspace!)
    (is (false? (ws.instance/workspace-mode?)))))
