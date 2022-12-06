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
  (with-redefs [cmd/resolve-enterprise-command (constantly
                                                (fn [& args]
                                                  (cons 'f args)))]
    (testing "load (v1)"
      (testing "with no options"
        (is (= '(f "/path/" {:mode :skip, :on-error :continue})
               (cmd/load "/path/"))))
      (testing "with options"
        (is (= '(f "/path/" {:num-cans :2})
               (cmd/load "/path/" "--num-cans" "2")))
        (testing "People can still set --v2 true"
          (is (= '(f "/path/" {:v2 :true})
                 (cmd/load "/path/" "--v2" "true"))))))
    (testing "import (v2)"
      (testing "with no options"
        (is (= '(f "/path/" {:mode :skip, :on-error :continue, :v2 :true})
               (cmd/import "/path/"))))
      (testing "with options"
        (is (= '(f "/path/" {:num-cans :2, :v2 :true})
               (cmd/import "/path/" "--num-cans" "2")))
        (testing "Don't let people override --v2 true"
          (is (= '(f "/path/" {:v2 :true})
                 (cmd/import "/path/" "--v2" "false"))))))))

(deftest export-test
  (with-redefs [cmd/resolve-enterprise-command (constantly
                                                (fn [& args]
                                                  (cons 'f args)))]
    (testing "dump (v1)"
      (testing "with no options"
        (is (= '(f "/path/" {:state :active})
               (cmd/dump "/path/"))))
      (testing "with options"
        (is (= '(f "/path/" {:num-cans "2"})
               (cmd/dump "/path/" "--num-cans" "2")))
        (testing "People can still set --v2 true"
          (is (= '(f "/path/" {:v2 "true"})
                 (cmd/dump "/path/" "--v2" "true"))))))
    (testing "export (v2)"
      (testing "with no options"
        (is (= '(f "/path/" {:state :active, :v2 true})
               (cmd/export "/path/"))))
      (testing "with options"
        (is (= '(f "/path/" {:num-cans "2", :v2 true})
               (cmd/export "/path/" "--num-cans" "2")))
        (testing "Don't let people override --v2 true"
          (is (= '(f "/path/" {:v2 true})
                 (cmd/export "/path/" "--v2" "false"))))))))
