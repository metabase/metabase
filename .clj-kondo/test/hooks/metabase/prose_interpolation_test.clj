(ns hooks.metabase.prose-interpolation-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.prose-interpolation :as prose-interpolation]))

(defn- findings
  "Run `hook-fn` over `form`, a form or its source string, with the linters at `level` (unconfigured when nil) in
  namespace `ns` of file `filename`; return the findings' messages."
  ([hook-fn form]
   (findings hook-fn form :warning))
  ([hook-fn form level]
   (findings hook-fn form level 'metabase.mcp.v2.tools.browse "src/metabase/mcp/v2/tools/browse.clj"))
  ([hook-fn form level ns filename]
   (let [config (if level
                  {:linters {:metabase/agent-message-lines {:level level}
                             :metabase/agent-message-exit  {:level level}}}
                  {})]
     (binding [clj-kondo.impl.utils/*ctx* {:config     config
                                           :ignores    (atom nil)
                                           :findings   (atom [])
                                           :namespaces (atom {})}]
       (let [input  {:node     (hooks/parse-string (if (string? form) form (pr-str form)))
                     :ns       ns
                     :filename filename
                     :config   config}
             output (hook-fn input)]
         (is (identical? (:node input) (:node output))
             "the hook must return the node unchanged so Kondo's normal analysis still runs")
         (mapv :message @(:findings clj-kondo.impl.utils/*ctx*)))))))

(def ^:private hook-cases
  "`[hook form]` pairs that each report one finding when their linter is enabled."
  [[prose-interpolation/lint-msg '(msg lines x)]
   [prose-interpolation/lint-teaching-exit '(throw-teaching-error "x")]
   [prose-interpolation/lint-jsonrpc-error '(jsonrpc-error id -32602 "x")]
   [prose-interpolation/lint-success-content '(success-content "x")]
   [prose-interpolation/lint-ex-info "(ex-info \"x\" {:status-code 404})"]])

(deftest ^:parallel scope-test
  (testing "GHY-4544: the hooks leave scoping to config, reporting in any namespace where their linter is enabled"
    (doseq [[hook form] hook-cases
            [ns filename]  [['metabase.mcp.v2.tools.browse "src/metabase/mcp/v2/tools/browse.clj"]
                            ['metabase.queries.models.card "src/metabase/queries/models/card.clj"]
                            ['metabase.mcp.v2.tools.browse-test "test/metabase/mcp/v2/tools/browse_test.clj"]]]
      (testing (str ns " " (pr-str form))
        (is (= 1 (count (findings hook form :warning ns filename)))))))
  (testing "nothing is reported when the linter is off or unconfigured"
    (doseq [[hook form] hook-cases
            level       [:off nil]]
      (testing (str level " " (pr-str form))
        (is (empty? (findings hook form level)))))))

(deftest ^:parallel msg-test
  (testing "GHY-4544: a vector of single-line string literals with matching arguments is accepted"
    (is (empty? (findings prose-interpolation/lint-msg
                          '(msg ["Table %s: %d of %d fields." "Continue with `offset: %d`."] t n total next)))))
  (testing "specifiers that consume no argument aren't counted, and an explicit index can repeat an argument"
    (is (empty? (findings prose-interpolation/lint-msg '(msg ["100%% done."]))))
    (is (empty? (findings prose-interpolation/lint-msg '(msg ["%1$s, then %1$s again, then %<s"] x)))))
  (testing "the lines must be a literal vector"
    (is (=? [#".*vector.*"]
            (findings prose-interpolation/lint-msg '(msg lines x))))
    (is (=? [#".*vector.*"]
            (findings prose-interpolation/lint-msg '(msg "one line" x)))))
  (testing "a line may be split across a `str` of string literals"
    (is (empty? (findings prose-interpolation/lint-msg '(msg [(str "Table %s has " "%d fields.")] t n))))
    (is (=? [#".*1 argument.*2.*"]
            (findings prose-interpolation/lint-msg '(msg [(str "only " "%s")] a b)))))
  (testing "each line must be a string literal or a `str` of string literals"
    (is (=? [#".*string literal or a `str` of string literals.*"]
            (findings prose-interpolation/lint-msg '(msg ["ok" line]))))
    (is (=? [#".*string literal or a `str` of string literals.*"]
            (findings prose-interpolation/lint-msg '(msg [(str "split " x)])))))
  (testing "a line can't contain a line break or other control character; each line is its own string"
    (is (=? [#".*own string.*"]
            (findings prose-interpolation/lint-msg '(msg ["first\nsecond"]))))
    (is (=? [#".*own string.*"]
            (findings prose-interpolation/lint-msg '(msg [(str "first\n" "second")]))))
    (is (=? [#".*own string.*"]
            (findings prose-interpolation/lint-msg (list 'msg [(str "first" (char 0x2028) "second")]))))
    (is (=? [#".*own string.*"]
            (findings prose-interpolation/lint-msg '(msg ["tab\tseparated"]))))
    (is (=? [#".*own string.*"]
            (findings prose-interpolation/lint-msg '(msg ["done.%n"])))))
  (testing "GHY-4544: `%s` can't take a width, precision, or flags, and `%S` isn't allowed"
    (doseq [line ["%.20s" "%10s" "%-5s" "%#s" "%S" "%1$.3s" "%-10S"]]
      (testing line
        (is (=? [#"`%s` in a `msg` line can't take a width, precision, flags, or `%S`.*"]
                (findings prose-interpolation/lint-msg (list 'msg [(str "Name: " line)] 'x)))))))
  (testing "other conversions keep their flags, width, and precision"
    (is (empty? (findings prose-interpolation/lint-msg '(msg ["%,d rows, %.1f%%, %05d, %-8d"] a b c d)))))
  (testing "the argument count must match the specifiers across all lines"
    (is (=? [#".*2 arguments.*1.*"]
            (findings prose-interpolation/lint-msg '(msg ["%s and" "%s"] a))))
    (is (=? [#".*1 argument.*2.*"]
            (findings prose-interpolation/lint-msg '(msg ["only %s"] a b))))))

(def ^:private stringy-texts
  "Message arguments built as text rather than with `msg`."
  ['"Query failed."
   '(str "Query failed: " err)
   '(format "Table %s not found" (pr-str t))
   '(cond-> (json/encode body) message (str "\n" message))
   '(if x "a" (str "b" y))
   '(if x (msg ["a"]) (str "b" y))
   '(when-let [e (:error r)] (str/join ", " e))
   '(or (:message r) (tru "Unknown error"))
   '(let [s (pr-str x)] (str "Bad value " s))])

(def ^:private message-texts
  "Message arguments that aren't syntactically text."
  ['(msg ["Table %s not found."] t)
   'message
   '(if x (msg ["a"]) (msg ["b"]))
   '(render-error e)])

(deftest ^:parallel teaching-exit-test
  (doseq [fn-name ["throw-teaching-error" "error-content"]]
    (testing (str "GHY-4544: text passed to `" fn-name "` is flagged")
      (doseq [text stringy-texts]
        (testing (pr-str text)
          (is (=? [(re-pattern (str ".*passes text to `" fn-name "`.*`msg`.*"))]
                  (findings prose-interpolation/lint-teaching-exit (list (symbol "common" fn-name) text)))))))
    (testing (str "`" fn-name "` accepts a `msg`, a symbol, and other calls")
      (doseq [text message-texts]
        (testing (pr-str text)
          (is (empty? (findings prose-interpolation/lint-teaching-exit
                                (list (symbol fn-name) text {:status-code 404}))))))))
  (testing "only the message argument is checked"
    (is (empty? (findings prose-interpolation/lint-teaching-exit '(error-content (msg ["x"]) (str "code"))))))
  (testing "nothing is reported when the linter is off"
    (is (empty? (findings prose-interpolation/lint-teaching-exit '(throw-teaching-error "x") :off)))))

(deftest ^:parallel jsonrpc-error-test
  (testing "GHY-4544: text passed as the JSON-RPC error message is flagged"
    (doseq [text stringy-texts]
      (testing (pr-str text)
        (is (=? [#".*passes text to `jsonrpc-error`.*`msg`.*"]
                (findings prose-interpolation/lint-jsonrpc-error (list 'transport/jsonrpc-error 'id -32602 text)))))))
  (testing "a `msg`, symbol, or other call as the message is accepted"
    (doseq [text message-texts]
      (testing (pr-str text)
        (is (empty? (findings prose-interpolation/lint-jsonrpc-error (list 'jsonrpc-error 'id -32602 text)))))))
  (testing "only the third argument is the message"
    (is (empty? (findings prose-interpolation/lint-jsonrpc-error '(jsonrpc-error "id" (str "code") (msg ["x"])))))))

(deftest ^:parallel success-content-test
  (testing "GHY-4544: text passed to `success-content` is flagged"
    (doseq [text stringy-texts]
      (testing (pr-str text)
        (is (=? [#"`success-content` takes data to JSON-encode or a `msg`.*"]
                (findings prose-interpolation/lint-success-content (list 'common/success-content text)))))))
  (testing "a payload, a `msg`, or a symbol is accepted"
    (doseq [text (conj message-texts '{:data rows} '[a b])]
      (testing (pr-str text)
        (is (empty? (findings prose-interpolation/lint-success-content (list 'success-content text))))))
    (is (empty? (findings prose-interpolation/lint-success-content
                          '(success-content {:data rows} (str "structured")))))))

(deftest ^:parallel ex-info-test
  (testing "GHY-4544: an ex-info carrying a 4xx status code or an error code is flagged"
    (doseq [form ["(ex-info \"Card not found\" {:status-code 404})"
                  "(ex-info (str \"Bad \" x) {:status-code 400 :field f})"
                  "(ex-info \"Nope\" {::common/error-code c})"
                  "(ex-info \"Nope\" {:error-code c})"
                  "(ex-info (msg [\"Nope\"]) {:error-code c})"]]
      (testing form
        (is (=? [#".*`throw-teaching-error` and a `msg`.*"]
                (findings prose-interpolation/lint-ex-info form))))))
  (testing "other ex-info calls aren't flagged"
    (doseq [form ["(ex-info \"boom\" {:status-code 500})"
                  "(ex-info \"boom\" {:status-code code})"
                  "(ex-info \"boom\" {:foo 1})"
                  "(ex-info \"boom\" data)"
                  "(ex-info \"boom\" (merge {:status-code 400} data))"
                  "(ex-info \"boom\")"]]
      (testing form
        (is (empty? (findings prose-interpolation/lint-ex-info form))))))
  (testing "nothing is reported when the linter is off"
    (is (empty? (findings prose-interpolation/lint-ex-info "(ex-info \"x\" {:status-code 404})" :off)))))
