(ns metabase.cmd.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [metabase.cmd.core :as cmd]
   [metabase.cmd.rotate-encryption-key :as rotate-encryption-key]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util.encryption :as encryption])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io StringWriter)))

(set! *warn-on-reflection* true)

(defn- do-with-captured-call-enterprise-calls! [thunk]
  (dynamic-redefs/with-dynamic-fn-redefs [cmd/call-enterprise list]
    (thunk)))

(deftest ^:parallel error-message-test
  ;; the command list comes from `ns-interns`, so its order is the map's, not the source's — assert that
  ;; commands are listed, not where they happen to fall
  (let [[message commands] (#'cmd/validate "a-command-that-does-not-exist" [])]
    (is (= "Unrecognized command: 'a-command-that-does-not-exist'" message))
    (is (re-find #"^Valid commands: " commands))
    (doseq [command ["version" "help" "import" "mcp-tools-documentation"]]
      (is (re-find (re-pattern (str "\\b" command "\\b")) commands)
          (str "no " command " in the command list"))))
  (is (= ["The 'rotate-encryption-key' command requires the following arguments: [new-key], but received: []."]
         (#'cmd/validate "rotate-encryption-key" [])))
  (is (nil? (#'cmd/validate "rotate-encryption-key" [:some-arg]))))

(defn- do-with-captured-output!
  "Run `thunk` with `system-exit!` throwing instead of exiting. Returns the exit code and what was printed."
  [thunk]
  (let [out (StringWriter.), err (StringWriter.)]
    (dynamic-redefs/with-dynamic-fn-redefs [cmd/system-exit! (fn [code] (throw (ex-info "exit" {::exit code})))]
      (binding [*out* out, *err* err]
        (let [exit (try
                     (thunk)
                     nil
                     (catch ExceptionInfo e
                       (or (::exit (ex-data e)) (throw e))))]
          {:exit exit, :out (str out), :err (str err)})))))

(deftest errors-go-to-stderr-test
  (testing "a command that cannot run says why on stderr, not through the log"
    (dynamic-redefs/with-dynamic-fn-redefs [encryption/default-encryption-enabled? (constantly false)]
      (doseq [command [cmd/enable-encryption cmd/remove-encryption]]
        (is (= {:exit 1, :out "", :err "MB_ENCRYPTION_SECRET_KEY environment variable has not been set\n"}
               (do-with-captured-output! command))))))
  (testing "a command that fails with an exception prints it on stderr"
    (dynamic-redefs/with-dynamic-fn-redefs [rotate-encryption-key/rotate-encryption-key!
                                            (fn [_] (throw (ex-info "no database" {})))]
      (is (=? {:exit 1, :out "", :err #"(?s).*no database.*ERROR ROTATING KEY\.\n"}
              (do-with-captured-output! #(cmd/rotate-encryption-key "a-new-key"))))))
  (testing "a usage error is printed on stderr"
    (is (=? {:exit 1, :out "", :err #"(?s)Usage:\nrotate-encryption-key.*requires the following arguments.*"}
            (do-with-captured-output! #(cmd/run-cmd "rotate-encryption-key" identity []))))))

(deftest results-go-to-stdout-test
  (dynamic-redefs/with-dynamic-fn-redefs [rotate-encryption-key/rotate-encryption-key! (constantly nil)
                                          cmd/print-exception! (fn [e _] (throw e))]
    (let [{:keys [out err]} (do-with-captured-output! #(cmd/rotate-encryption-key "a-new-key"))]
      (is (= "Encryption key rotation OK.\n" out))
      (is (= "" err)))))

(deftest import-command-test
  (do-with-captured-call-enterprise-calls!
   (fn []
     (testing "with no options"
       (is (= '(metabase-enterprise.serialization.cmd/v2-load! "/path/" {})
              (cmd/import "/path/"))))
     (testing "with options"
       (is (= '(metabase-enterprise.serialization.cmd/v2-load! "/path/" {:continue-on-error true})
              (cmd/import "/path/" "--continue-on-error"))))
     (testing "with options"
       (is (= '(metabase-enterprise.serialization.cmd/v2-load! "/path/" {:full-stacktrace true})
              (cmd/import "/path/" "--full-stacktrace")))))))

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
       {:continue-on-error true}

       ["--full-stacktrace"]
       {:full-stacktrace true}))))

(deftest ^:parallel all-documentation-test
  (testing "`all-documentation` runs every `*-documentation` command"
    (let [generators (set @#'cmd/doc-generators)]
      (is (empty? (for [[symb varr] (ns-interns 'metabase.cmd.core)
                        :when (and (:command (meta varr))
                                   (str/ends-with? (name symb) "-documentation")
                                   (not= symb 'all-documentation)
                                   (not (generators varr)))]
                    symb))))))
