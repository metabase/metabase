(ns metabase.cmd-test
  (:require [clojure.test :as t :refer [deftest is]]
            [metabase.cmd :as cmd]))

(deftest error-message-test
  (is (= ["No command given."] (#'cmd/cmd->fn nil [])))
  (is (= ["Unrecognized command: 'a-command-that-does-not-exist'"] (#'cmd/cmd->fn "a-command-that-does-not-exist" [])))
  (is (= ["The 'rotate-encryption-key' command requires the following arguments: [new-key], but received: []."]
         (#'cmd/cmd->fn "rotate-encryption-key" [])))
  (let [[error? the-fxn] (#'cmd/cmd->fn "rotate-encryption-key" [:some-arg])]
    (is (nil? error?))
    (is (fn? the-fxn))))
