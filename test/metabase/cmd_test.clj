(ns metabase.cmd-test
  (:require
   [clojure.test :as t :refer [are deftest is testing]]
   [metabase.cmd :as cmd]))

(defn- do-with-captured-call-enterprise-calls! [thunk]
  (with-redefs [cmd/call-enterprise list]
    (thunk)))

(deftest ^:parallel error-message-test
  (is (= ["Unrecognized command: 'a-command-that-does-not-exist'"
          "Valid commands: version, help, drop-entity-ids, import, dump, profile, api-documentation, load, seed-entity-ids, dump-to-h2, environment-variables-documentation, migrate, driver-methods, load-from-h2, export, rotate-encryption-key, reset-password"]
         (#'cmd/validate "a-command-that-does-not-exist" [])))
  (is (= ["The 'rotate-encryption-key' command requires the following arguments: [new-key], but received: []."]
         (#'cmd/validate "rotate-encryption-key" [])))
  (is (nil? (#'cmd/validate "rotate-encryption-key" [:some-arg]))))

(deftest load-command-test
  (do-with-captured-call-enterprise-calls!
   (fn []
     (testing "with no options"
       (is (= '(metabase-enterprise.serialization.cmd/v1-load! "/path/" {:mode :skip, :on-error :continue})
              (cmd/load "/path/"))))
     (testing "with options"
       (is (= '(metabase-enterprise.serialization.cmd/v1-load! "/path/" {:mode :skip, :on-error :abort})
              (cmd/load "/path/" "--on-error" "abort")))))))

(deftest import-command-test
  (do-with-captured-call-enterprise-calls!
   (fn []
     (testing "with no options"
       (is (= '(metabase-enterprise.serialization.cmd/v2-load! "/path/" {})
              (cmd/import "/path/"))))
     (testing "with options"
       (is (= '(metabase-enterprise.serialization.cmd/v2-load! "/path/" {:continue-on-error true})
              (cmd/import "/path/" "--continue-on-error")))))))

(deftest dump-command-test
  (do-with-captured-call-enterprise-calls!
   (fn []
     (testing "with no options"
       (is (= '(metabase-enterprise.serialization.cmd/v1-dump! "/path/" {:state :all})
              (cmd/dump "/path/"))))
     (testing "with options"
       (is (= '(metabase-enterprise.serialization.cmd/v1-dump! "/path/" {:state :active})
              (cmd/dump "/path/" "--state" "active")))))))

(deftest export-command-arg-parsing-test
  (do-with-captured-call-enterprise-calls!
   (fn []
     (are [cmd-args v2-dump-args] (= '(metabase-enterprise.serialization.cmd/v2-dump! "/path/" v2-dump-args)
                                     (apply cmd/export "/path/" cmd-args))
       nil
       {}

       ["--collection" "123"]
       {:collection-ids [123]}

       ["-c" "123, 456, eid:qj0jT7SXwEUezz1wSjTAZ, nicht"]
       {:collection-ids [123 456 "eid:qj0jT7SXwEUezz1wSjTAZ" nil]}

       ["-c" "123,456,789"]
       {:collection-ids [123 456 789]}

       ["--include-field-values"]
       {:include-field-values true}

       ["--no-collections"]
       {:no-collections true}

       ["--no-settings"]
       {:no-settings true}

       ["--no-data-model"]
       {:no-data-model true}

       ["--continue-on-error"]
       {:continue-on-error true}

       ["-e"]
       {:continue-on-error true}))))
