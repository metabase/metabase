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
        (is (= '(metabase-enterprise.serialization.cmd/v1-load "/path/" {:mode :skip, :on-error :abort})
               (cmd/load "/path/" "--on-error" "abort")))))
    (testing "import (v2)"
      (testing "with no options"
        (is (= '(metabase-enterprise.serialization.cmd/v2-load "/path/" {})
               (cmd/import "/path/"))))
      (testing "with options"
        (is (= '(metabase-enterprise.serialization.cmd/v2-load "/path/" {:abort-on-error true})
               (cmd/import "/path/" "--abort-on-error")))))))

(deftest export-test
  (with-redefs [cmd/call-enterprise list]
    (testing "dump (v1)"
      (testing "with no options"
        (is (= '(metabase-enterprise.serialization.cmd/v1-dump "/path/" {:mode :skip, :on-error :continue})
               (cmd/dump "/path/"))))
      (testing "with options"
        (is (= '(metabase-enterprise.serialization.cmd/v1-dump "/path/" {:mode :skip, :on-error :abort})
               (cmd/dump "/path/" "--on-error" "abort")))))
    (testing "export (v2)"
      (testing "with no options"
        (is (= '(metabase-enterprise.serialization.cmd/v2-dump "/path/" {})
               (cmd/export "/path/"))))
      (testing "with --collections list"
        (is (= '(metabase-enterprise.serialization.cmd/v2-dump "/path/" {:collections [1 2 3]})
               (cmd/export "/path/" "--collections" "1,2,3"))))
      (testing "with collections and error handling override"
        (is (= '(metabase-enterprise.serialization.cmd/v2-dump "/path/" {:collections [1 2 3] :abort-on-error true})
               (cmd/export "/path/" "--abort-on-error" "--collections" "1,2,3")))))))
