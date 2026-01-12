(ns metabase.cmd.command-dox-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.cmd.command-dox :as sut]))

(deftest ^:parallel format-arglist-test
  (testing "format-arglist handles various arglist patterns"
    (testing "command with no args"
      (is (= "test-command" (#'sut/format-arglist "test-command" []))))
    (testing "command with single arg"
      (is (= "test-command arg1" (#'sut/format-arglist "test-command" '[arg1]))))
    (testing "command with multiple args"
      (is (= "test-command arg1 arg2" (#'sut/format-arglist "test-command" '[arg1 arg2]))))
    (testing "command with varargs removes & symbol"
      (is (= "test-command arg1 options" (#'sut/format-arglist "test-command" '[arg1 & options]))))))

(deftest ^:parallel format-arglists-test
  (testing "format-arglists joins multiple arglists with |"
    (testing "single arglist"
      (is (= "command arg" (#'sut/format-arglists "command" '([arg])))))
    (testing "multiple arglists"
      (is (= "command | command arg" (#'sut/format-arglists "command" '([] [arg])))))
    (testing "multiple arglists with various args"
      (is (= "command arg1 | command arg1 arg2"
             (#'sut/format-arglists "command" '([arg1] [arg1 arg2])))))))

(deftest ^:parallel format-option-test
  (testing "format-option handles option specs correctly"
    (testing "short and long option"
      (is (= "- `-k, --keep-existing` - Do not delete target file"
             (#'sut/format-option ["-k" "--keep-existing" "Do not delete target file"]))))
    (testing "long option only"
      (is (= "- `--full-stacktrace` - Output full stacktraces"
             (#'sut/format-option [nil "--full-stacktrace" "Output full stacktraces"]))))
    (testing "short option only"
      (is (= "- `-e` - Continue on error"
             (#'sut/format-option ["-e" nil "Continue on error"]))))
    (testing "option with additional metadata is ignored"
      (is (= "- `-c, --collection` - Export only specified IDs"
             (#'sut/format-option ["-c" "--collection" "Export only specified IDs" :id :collection-ids]))))
    (testing "empty string for short option should be ignored"
      (is (= "- `--full-stacktrace` - Output full stacktraces"
             (#'sut/format-option ["" "--full-stacktrace" "Output full stacktraces"]))))
    (testing "empty string for long option should be ignored"
      (is (= "- `-e` - Continue on error"
             (#'sut/format-option ["-e" "" "Continue on error"]))))
    (testing "both options as empty strings should handle gracefully"
      (is (= "- `` - Some description"
             (#'sut/format-option ["" "" "Some description"]))))))

(deftest ^:parallel format-options-test
  (testing "format-options handles option specs"
    (testing "empty options returns nil"
      (is (nil? (#'sut/format-options []))))
    (testing "single option"
      (let [result (#'sut/format-options [["-k" "--keep-existing" "Do not delete"]])]
        (is (str/includes? result "Options:"))
        (is (str/includes? result "- `-k, --keep-existing` - Do not delete"))))
    (testing "multiple options"
      (let [result (#'sut/format-options [["-k" "--keep-existing" "Do not delete"]
                                          ["-p" "--dump-plaintext" "Do not encrypt"]])]
        (is (str/includes? result "Options:"))
        (is (str/includes? result "- `-k, --keep-existing` - Do not delete"))
        (is (str/includes? result "- `-p, --dump-plaintext` - Do not encrypt"))))))

(deftest ^:parallel normalize-whitespace-test
  (testing "normalize-whitespace handles various whitespace patterns"
    (testing "collapses multiple spaces to single space"
      (is (= "foo bar baz" (#'sut/normalize-whitespace "foo  bar   baz"))))
    (testing "collapses newlines to single space"
      (is (= "foo bar baz" (#'sut/normalize-whitespace "foo\nbar\nbaz"))))
    (testing "collapses mixed whitespace to single space"
      (is (= "foo bar baz" (#'sut/normalize-whitespace "foo\n  bar\n\n  baz"))))
    (testing "trims leading and trailing whitespace"
      (is (= "foo bar" (#'sut/normalize-whitespace "  foo bar  "))))
    (testing "handles tabs"
      (is (= "foo bar" (#'sut/normalize-whitespace "foo\tbar"))))))

(deftest ^:parallel format-command-test
  (testing "format-command generates markdown for a command"
    (testing "command with no args or options"
      (let [command-var (with-meta
                         (fn [] nil)
                         {:arglists '([])
                          :doc "Print version information"})
            result (#'sut/format-command ['version command-var])]
        (is (str/starts-with? result "## `version`"))
        (is (str/includes? result "Print version information"))
        (is (not (str/includes? result "Options:")))))
    (testing "command with args but no options"
      (let [command-var (with-meta
                         (fn [_] nil)
                         {:arglists '([direction])
                          :doc "Run database migrations"})
            result (#'sut/format-command ['migrate command-var])]
        (is (str/starts-with? result "## `migrate direction`"))
        (is (str/includes? result "Run database migrations"))
        (is (not (str/includes? result "Options:")))))
    (testing "command with multiple arglists"
      (let [command-var (with-meta
                         (fn
                           ([] nil)
                           ([_] nil))
                         {:arglists '([] [h2-connection-string])
                          :doc "Transfer data from H2"})
            result (#'sut/format-command ['load-from-h2 command-var])]
        (is (str/starts-with? result "## `load-from-h2 | load-from-h2 h2-connection-string`"))
        (is (str/includes? result "Transfer data from H2"))))
    (testing "command with options"
      (let [command-var (with-meta
                         (fn [_ & _] nil)
                         {:arglists '([h2-filename & opts])
                          :doc "Transfer data to H2"
                          :arg-spec [["-k" "--keep-existing" "Do not delete target file"]]})
            result (#'sut/format-command ['dump-to-h2 command-var])]
        (is (str/starts-with? result "## `dump-to-h2 h2-filename opts`"))
        (is (str/includes? result "Transfer data to H2"))
        (is (str/includes? result "Options:"))
        (is (str/includes? result "- `-k, --keep-existing` - Do not delete target file"))))
    (testing "command with multiline docstring normalizes whitespace"
      (let [command-var (with-meta
                         (fn [] nil)
                         {:arglists '([])
                          :doc "This is a command\n  with multiple lines\n  and extra spacing"})
            result (#'sut/format-command ['test-cmd command-var])]
        (is (str/starts-with? result "## `test-cmd`"))
        (is (str/includes? result "This is a command with multiple lines and extra spacing"))
        (is (not (str/includes? result "\n  with")))))))

(deftest ^:parallel command-vars-test
  (testing "command-vars returns commands from metabase.cmd.core"
    (let [commands (#'sut/command-vars)]
      (testing "returns a sequence of [symbol var] pairs"
        (is (sequential? commands))
        (is (every? (fn [[symb varr]]
                      (and (symbol? symb)
                           (var? varr)))
                    commands)))
      (testing "all returned vars have :command metadata"
        (is (every? (fn [[_symb varr]]
                      (:command (meta varr)))
                    commands)))
      (testing "includes expected commands"
        (let [command-names (set (map (comp name first) commands))]
          (is (contains? command-names "version"))
          (is (contains? command-names "help"))
          (is (contains? command-names "migrate"))
          (is (contains? command-names "command-documentation"))))
      (testing "commands are sorted by name"
        (let [command-names (map (comp name first) commands)]
          (is (= command-names (sort command-names))))))))

(deftest generate-documentation-test
  (testing "generate-documentation produces complete markdown document"
    (let [doc (with-redefs [sut/header-section (constantly "# Test Header")
                            sut/footer-section (constantly "# Test Footer")]
                (#'sut/generate-documentation))]
      (testing "includes header"
        (is (str/starts-with? doc "# Test Header")))
      (testing "includes footer"
        (is (str/ends-with? (str/trim doc) "# Test Footer")))
      (testing "includes command documentation"
        (is (str/includes? doc "## `version`"))
        (is (str/includes? doc "## `help")))
      (testing "has proper spacing between sections"
        (is (str/includes? doc "# Test Header\n\n##"))
        (is (str/includes? doc ".\n\n# Test Footer"))))))
