(ns metabase-enterprise.metabot-v3.agent.markdown-link-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.markdown-link-buffer :as buffer]))

(deftest nested-bracket-handling-test
  (testing "does not drop characters when nested brackets appear"
    (let [buf (buffer/create-buffer {} {})
          output (buffer/process buf "[foo[")
          flushed (buffer/flush-buffer buf)]
      (is (= "[foo" output))
      (is (= "[" flushed)))))

(deftest escape-handling-test
  (testing "preserves escaped characters outside links"
    (let [buf (buffer/create-buffer {} {})
          output (buffer/process buf "a\\[b\\*c")
          flushed (buffer/flush-buffer buf)]
      (is (= "a[b*c" output))
      (is (= "" flushed)))))
