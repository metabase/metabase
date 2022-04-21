(ns metabase.cmd-test
  (:require [metabase.cmd :as cmd]
            [clojure.test :as t :refer [deftest is]]))

(deftest error-message-test
  (is (= ["no command given."] (#'cmd/cmd->fn nil [])))
  (is (= ["'a-command-that-does-not-exist' is not a command."] (#'cmd/cmd->fn "a-command-that-does-not-exist" [])))
  (is (= ["the 'rotate-encryption-key' command requires one of the following set of arguments: [new-key], however was given: []."]
         (#'cmd/cmd->fn "rotate-encryption-key" [])))
  (let [[error? the-fxn] (#'cmd/cmd->fn "rotate-encryption-key" [:some-arg])]
    (is (nil? error?))
    (is (fn? the-fxn))))
