(ns metabase.flargs.release-flags-gate-test
  "Merge gate: the `.release-flags` file MUST be absent for a commit to be mergeable to master.

  The file is the configuration source of truth for which flargs are enabled for a build. During
  feature development on a PR branch, the file is committed so CI and PR Envs run with the flarg
  enabled. Before merge, the developer deletes the file and CI re-runs with all flargs off to
  prove the main tree is still clean.

  See FLARG.md § How `.release-flags` interacts with CI and FLARG-PROGRESS.md § Phase 4."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]))

(set! *warn-on-reflection* true)

(deftest ^:parallel no-release-flags-file-on-master-test
  (testing "The .release-flags file must be absent for a commit to be mergeable to master"
    (is (not (.exists (io/file ".release-flags")))
        (str "You committed .release-flags. Remove it before merging to master. "
             "See FLARG.md § How `.release-flags` interacts with CI."))))
