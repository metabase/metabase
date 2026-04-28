(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.test :as mt]))

(deftest has-remappings-enabled-defaults-false-on-main-test
  (testing "has-remappings-enabled is false on a main (parent) instance"
    (mt/with-temporary-setting-values [ws.settings/workspace-mode :main]
      (is (false? (ws.settings/has-remappings-enabled))))))

(deftest has-remappings-enabled-true-on-development-test
  (testing "has-remappings-enabled is true on a development (child) instance"
    (mt/with-temporary-setting-values [ws.settings/workspace-mode :development]
      (is (true? (ws.settings/has-remappings-enabled))))))
