(ns mage.ci-run-skipped-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.ci-run-skipped :as ci-run-skipped]))

(set! *warn-on-reflection* true)

(deftest parse-verdict-test
  (testing "reads the printed verdict, not the echo command above it"
    (is (= "force-skip"
           (ci-run-skipped/parse-verdict
            (str "2026-10-02T12:25:52.1Z [36;1mecho \"verdict=$VERDICT\" | tee -a \"$GITHUB_OUTPUT\"[0m\n"
                 "2026-10-02T12:25:52.2Z verdict=force-skip\n")))))
  (testing "nil without a verdict line"
    (is (nil? (ci-run-skipped/parse-verdict "2026-10-02T12:25:52.1Z Decide\n")))
    (is (nil? (ci-run-skipped/parse-verdict nil)))))

(deftest stack-base-test
  (testing "a stacked PR compares against the branch its stack targets"
    (is (= "release-x.60.x"
           (ci-run-skipped/stack-base {:baseRefName "parent-branch"
                                       :stack       {:baseRefName "release-x.60.x"}}))))
  (testing "an unstacked PR compares against its own base"
    (is (= "master"
           (ci-run-skipped/stack-base {:baseRefName "master"
                                       :stack       nil})))))

(deftest dispatch-args-test
  (testing "master is the workflow's default, so it is not passed"
    (is (= ["workflow" "run" "run-tests.yml" "-R" "metabase/metabase" "--ref" "my-branch"]
           (ci-run-skipped/dispatch-args "my-branch" "master"))))
  (testing "any other base is passed as the `base` input"
    (is (= ["workflow" "run" "run-tests.yml" "-R" "metabase/metabase" "--ref" "my-branch" "-f" "base=release-x.60.x"]
           (ci-run-skipped/dispatch-args "my-branch" "release-x.60.x")))))
