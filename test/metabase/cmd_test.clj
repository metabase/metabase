(ns metabase.cmd-test
  (:require
   [clojure.test :as t :refer [deftest is are testing use-fixtures]]
   [metabase.cmd :as cmd]))

(use-fixtures :each
  (fn [t]
    (with-redefs [cmd/call-enterprise list]
      (t))))

(deftest ^:parallel error-message-test
  (is (= ["No command given."] (#'cmd/validate nil [])))
  (is (= ["Unrecognized command: 'a-command-that-does-not-exist'"] (#'cmd/validate "a-command-that-does-not-exist" [])))
  (is (= ["The 'rotate-encryption-key' command requires the following arguments: [new-key], but received: []."]
         (#'cmd/validate "rotate-encryption-key" [])))
  (let [[error? the-fxn] (#'cmd/validate "rotate-encryption-key" [:some-arg])]
    (is (nil? error?))
    (is (fn? the-fxn))))

(deftest load-command-test
  (testing "with no options"
    (is (= '(metabase-enterprise.serialization.cmd/v1-load "/path/" {:mode :skip, :on-error :continue})
           (cmd/load "/path/"))))
  (testing "with options"
    (is (= '(metabase-enterprise.serialization.cmd/v1-load "/path/" {:mode :skip, :on-error :abort})
           (cmd/load "/path/" "--on-error" "abort")))))

(deftest import-command-test
  (testing "with no options"
    (is (= '(metabase-enterprise.serialization.cmd/v2-load "/path/" {})
           (cmd/import "/path/"))))
  (testing "with options"
    (is (= '(metabase-enterprise.serialization.cmd/v2-load "/path/" {:abort-on-error true})
           (cmd/import "/path/" "--abort-on-error")))))

(deftest dump-command-test
  (testing "with no options"
    (is (= '(metabase-enterprise.serialization.cmd/v1-dump "/path/" {:state :all})
           (cmd/dump "/path/"))))
  (testing "with options"
    (is (= '(metabase-enterprise.serialization.cmd/v1-dump "/path/" {:state :active})
           (cmd/dump "/path/" "--state" "active")))))

(deftest export-command-test
  (are [cmd-args v2-dump-args] (= '(metabase-enterprise.serialization.cmd/v2-dump "/path/" v2-dump-args)
                                  (apply cmd/export "/path/" cmd-args))
    nil
    {}

    ["--collection" "123"]
    {:collections [123]}

    ["-c" "123" "-c" "456"]
    {:collections [123 456]}

    ["--include-field-values"]
    {:include-field-values true}

    ["--no-collections"]
    {:collections []}

    ["--no-data-model"]
    {:no-data-model true}))
