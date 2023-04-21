(ns metabase.cmd-test
  (:require
   [clojure.test :as t :refer [deftest is testing]]
   [metabase.cmd :as cmd]))

(deftest ^:parallel error-message-test
  (is (= ["No command given."] (#'cmd/cmd->fn nil [])))
  (is (= ["Unrecognized command: 'a-command-that-does-not-exist'"] (#'cmd/cmd->fn "a-command-that-does-not-exist" [])))
  (is (= ["The 'rotate-encryption-key' command requires the following arguments: [new-key], but received: []."]
         (#'cmd/cmd->fn "rotate-encryption-key" [])))
  (let [[error? the-fxn] (#'cmd/cmd->fn "rotate-encryption-key" [:some-arg])]
    (is (nil? error?))
    (is (fn? the-fxn))))

(deftest import-test
  (with-redefs [cmd/call-enterprise list]
    (testing "load (v1)"
      (testing "with no options"
        (is (= '(metabase-enterprise.serialization.cmd/v1-load "/path/" {:mode :skip, :on-error :continue})
               (cmd/load "/path/"))))
      (testing "with options"
        (is (= '(metabase-enterprise.serialization.cmd/v1-load "/path/" {:mode :skip, :on-error :continue :num-cans :2})
               (cmd/load "/path/" "--num-cans" "2")))))
    (testing "import (v2)"
      (testing "with no options"
        (is (= '(metabase-enterprise.serialization.cmd/v2-load "/path/" {:abort-on-error false})
               (cmd/import "/path/")))))))

(deftest export-test
  (with-redefs [cmd/call-enterprise list]
    (testing "dump (v1)"
      (testing "with no options"
        (is (= '(metabase-enterprise.serialization.cmd/v1-dump "/path/" {:mode :skip, :on-error :continue})
               (cmd/dump "/path/"))))
      (testing "with options"
        (is (= '(metabase-enterprise.serialization.cmd/v1-dump "/path/" {:mode :skip, :on-error :continue, :num-cans "2"})
               (cmd/dump "/path/" "--num-cans" "2")))))
    (testing "export (v2)"
      (testing "with no options"
        (is (= '(metabase-enterprise.serialization.cmd/v2-dump "/path/" {:collections nil})
               (cmd/export "/path/"))))
      (testing "with --collections list"
        (is (= '(metabase-enterprise.serialization.cmd/v2-dump "/path/" {:collections [1 2 3] :include-field-values true})
               (cmd/export "/path/" "--collections" "1,2,3" "--include-field-values")))))))
