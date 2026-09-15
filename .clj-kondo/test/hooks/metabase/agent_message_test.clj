(ns hooks.metabase.agent-message-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.edn :as edn]
   [clojure.test :refer :all]
   [hooks.metabase.agent-message :as agent-message]))

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
  [[agent-message/lint-msg '(msg lines x)]
   [agent-message/lint-teaching-exit '(throw-teaching-error "x")]
   [agent-message/lint-jsonrpc-error '(jsonrpc-error id -32602 "x")]
   [agent-message/lint-success-content '(success-content "x")]
   [agent-message/lint-ex-info "(ex-info \"x\" {:status-code 404})"]
   [agent-message/lint-op-error '(op-error! idx "add_link" "x")]
   [agent-message/lint-ellipsize '(ellipsize "x" 300)]
   [agent-message/lint-list-content '(list-content data total {:empty-hint "x"})]])

(defn- linter-enabled-in-ns?
  "Whether `config` enables `linter` in namespace `ns-name` through an ns-group's `:config-in-ns` entry."
  [config linter ns-name]
  (boolean
   (some (fn [{:keys [pattern name]}]
           (and (string? pattern)
                (re-find (re-pattern pattern) ns-name)
                (not= :off (get-in config [:config-in-ns name :linters linter :level] :off))))
         (:ns-groups config))))

(deftest ^:parallel config-scope-test
  (let [config (edn/read-string (slurp ".clj-kondo/config.edn"))]
    (testing "GHY-4544: `msg` lines are checked in every MCP source namespace and no test namespace"
      (doseq [[ns-name enabled?] {"metabase.mcp.ui-resource"          true
                                  "metabase.mcp.transport"            true
                                  "metabase.mcp.v2.tools.browse"      true
                                  "metabase.mcp.ui-resource-test"     false
                                  "metabase.mcp.v2.tools.browse-test" false
                                  "metabase.mcp.test-util"            false
                                  "metabase.queries.models.card"      false}]
        (testing ns-name
          (is (= enabled? (linter-enabled-in-ns? config :metabase/agent-message-lines ns-name))))))
    (testing "GHY-4544: exits are checked in MCP transport and v2 source namespaces, whose 4xx errors reach the agent"
      (doseq [[ns-name enabled?] {"metabase.mcp.transport"            true
                                  "metabase.mcp.v2.common"            true
                                  "metabase.mcp.v2.tools.browse"      true
                                  "metabase.mcp.settings"             false
                                  "metabase.mcp.validation"           false
                                  "metabase.mcp.transport-test"       false
                                  "metabase.mcp.v2.tools.browse-test" false
                                  "metabase.queries.models.card"      false}]
        (testing ns-name
          (is (= enabled? (linter-enabled-in-ns? config :metabase/agent-message-exit ns-name))))))
    (testing "GHY-4544: `:empty-hint` is checked on `list-content` and on wrappers passing their options map to it"
      (doseq [fn-sym '[metabase.mcp.v2.common/list-content
                       metabase.mcp.v2.tools.browse/paged-list-content]]
        (testing fn-sym
          (is (= 'hooks.metabase.agent-message/lint-list-content
                 (get-in config [:hooks :analyze-call fn-sym]))))))
    (testing (str "GHY-4544: `check-execute-sql-enabled!` isn't checked, since it interpolates its subject into "
                  "its own `msg` and a plain string is the intended way to name the tool")
      (is (nil? (get-in config [:hooks
                                :analyze-call
                                (symbol "metabase.mcp.v2.queries" "check-execute-sql-enabled!")]))))))

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
    (is (empty? (findings agent-message/lint-msg
                          '(msg ["Table %s: %d of %d fields." "Continue with `offset: %d`."] t n total next)))))
  (testing "specifiers that consume no argument aren't counted, and an explicit index can repeat an argument"
    (is (empty? (findings agent-message/lint-msg '(msg ["100%% done."]))))
    (is (empty? (findings agent-message/lint-msg '(msg ["%1$s, then %1$s again, then %<s"] x)))))
  (testing "the lines must be a literal vector"
    (is (=? [#".*vector.*"]
            (findings agent-message/lint-msg '(msg lines x))))
    (is (=? [#".*vector.*"]
            (findings agent-message/lint-msg '(msg "one line" x)))))
  (testing "a line may be split across a `str` of string literals"
    (is (empty? (findings agent-message/lint-msg '(msg [(str "Table %s has " "%d fields.")] t n))))
    (is (=? [#".*1 argument.*2.*"]
            (findings agent-message/lint-msg '(msg [(str "only " "%s")] a b)))))
  (testing "each line must be a string literal or a `str` of string literals"
    (is (=? [#".*string literal or a `str` of string literals.*"]
            (findings agent-message/lint-msg '(msg ["ok" line]))))
    (is (=? [#".*string literal or a `str` of string literals.*"]
            (findings agent-message/lint-msg '(msg [(str "split " x)])))))
  (testing "a line can't contain a line break or other control character; each line is its own string"
    (is (=? [#".*own string.*"]
            (findings agent-message/lint-msg '(msg ["first\nsecond"]))))
    (is (=? [#".*own string.*"]
            (findings agent-message/lint-msg '(msg [(str "first\n" "second")]))))
    (is (=? [#".*own string.*"]
            (findings agent-message/lint-msg (list 'msg [(str "first" (char 0x2028) "second")]))))
    (is (=? [#".*own string.*"]
            (findings agent-message/lint-msg '(msg ["tab\tseparated"]))))
    (is (=? [#".*own string.*"]
            (findings agent-message/lint-msg '(msg ["done.%n"])))))
  (testing "GHY-4544: `%s` can't take a width, precision, or flags, and `%S` isn't allowed"
    (doseq [line ["%.20s" "%10s" "%-5s" "%#s" "%S" "%1$.3s" "%-10S"]]
      (testing line
        (is (=? [#"`%s` in a `msg` line can't take a width, precision, flags, or `%S`.*"]
                (findings agent-message/lint-msg (list 'msg [(str "Name: " line)] 'x)))))))
  (testing "other conversions keep their flags, width, and precision"
    (is (empty? (findings agent-message/lint-msg '(msg ["%,d rows, %.1f%%, %05d, %-8d"] a b c d)))))
  (testing "GHY-4544: a `%` that doesn't begin a valid format specifier is flagged, since `String/format` rejects it"
    (doseq [line ["Braces %}" "Dot %." "Trailing %" "Space % " "Unknown %q" "Bad date %tq" "%" "%1$"]]
      (testing (pr-str line)
        (is (=? [#"A `%` in a `msg` line must begin a format specifier.*`%%`.*"]
                (findings agent-message/lint-msg (list 'msg [line])))))))
  (testing "valid specifiers, including an escaped percent sign, aren't flagged as malformed"
    (doseq [form ['(msg ["100%% done"])
                  '(msg ["%,d rows"] n)
                  '(msg ["%1$s, then %<s"] x)
                  '(msg ["%tY"] d)
                  '(msg [(str "50%" "% of %s")] x)]]
      (testing (pr-str form)
        (is (empty? (findings agent-message/lint-msg form))))))
  (testing "the argument count must match the specifiers across all lines"
    (is (=? [#".*2 arguments.*1.*"]
            (findings agent-message/lint-msg '(msg ["%s and" "%s"] a))))
    (is (=? [#".*1 argument.*2.*"]
            (findings agent-message/lint-msg '(msg ["only %s"] a b))))))

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
   '(let [s (pr-str x)] (str "Bad value " s))
   '(cond (:a x) (msg ["a"]) :else "b")
   '(condp = x :a (str "a" y) (msg ["b"]))
   '(condp = x :a (msg ["a"]) "b")
   '(case x :a (msg ["a"]) "b")
   '(case x :a "a" :b (msg ["b"]))
   '(->> bad (map name) (str/join ", "))
   '(-> x (str " suffix"))
   '(-> x name str)
   '(some-> e ex-message)
   '(some->> xs (map name) (clojure.string/join ", "))
   '(cond->> xs x (map name) y (str/join ", "))
   '(cond-> "x" y (subs 1))
   '(as-> x v (assoc v :a 1) (json/encode v))
   '(doto (str "a" b) println)
   '(let [s x] (-> s (format y)))])

(def ^:private message-texts
  "Message arguments that aren't syntactically text."
  ['(msg ["Table %s not found."] t)
   'message
   '(if x (msg ["a"]) (msg ["b"]))
   '(render-error e)
   '(cond (str x) (msg ["a"]) :else (msg ["b"]))
   '(condp = x "a" (msg ["a"]) (msg ["b"]))
   '(condp get x "a" :>> render-error (msg ["b"]))
   '(case x "a" (msg ["a"]) ("b" "c") (msg ["b"]))
   '(-> "x" count)
   '(->> "x" (map str) set)
   '(some-> (str "x") render-error)
   '(-> x)
   '(-> e :message)
   '(cond-> {:a 1} x (assoc :b "c"))
   '(as-> "x" v (count v))
   '(doto x (println "a"))])

(deftest ^:parallel teaching-exit-test
  (doseq [fn-name ["throw-teaching-error" "error-content"]]
    (testing (str "GHY-4544: text passed to `" fn-name "` is flagged")
      (doseq [text stringy-texts]
        (testing (pr-str text)
          (is (=? [(re-pattern (str ".*passes text to `" fn-name "`.*`msg`.*"))]
                  (findings agent-message/lint-teaching-exit (list (symbol "common" fn-name) text)))))))
    (testing (str "`" fn-name "` accepts a `msg`, a symbol, and other calls")
      (doseq [text message-texts]
        (testing (pr-str text)
          (is (empty? (findings agent-message/lint-teaching-exit
                                (list (symbol fn-name) text {:status-code 404}))))))))
  (testing "only the message argument is checked"
    (is (empty? (findings agent-message/lint-teaching-exit '(error-content (msg ["x"]) (str "code"))))))
  (testing "nothing is reported when the linter is off"
    (is (empty? (findings agent-message/lint-teaching-exit '(throw-teaching-error "x") :off)))))

(def ^:private helper-cases
  "`[hook fn-name form-fn]`: a message-taking helper's hook, the name its finding cites, and a function of a message
  returning a call that passes it to the helper."
  [[agent-message/lint-op-error "op-error!" #(list 'dashboard-ops/op-error! 'idx "add_link" %)]
   [agent-message/lint-ellipsize "ellipsize" #(list 'common/ellipsize % 300)]
   [agent-message/lint-list-content "list-content" #(list 'common/list-content 'rows 0 {:offset 0 :empty-hint %})]
   [agent-message/lint-list-content "paged-list-content"
    #(list 'paged-list-content 'args 'rows {:empty-hint %} 'identity)]])

(deftest ^:parallel message-helper-test
  (doseq [[hook fn-name form-fn] helper-cases]
    (testing (str "GHY-4544: text passed as `" fn-name "`'s message is flagged")
      (doseq [text stringy-texts]
        (testing (pr-str text)
          (is (=? [(re-pattern (str ".*passes text to `" fn-name "`.*`msg`.*"))]
                  (findings hook (form-fn text)))))))
    (testing (str "`" fn-name "` accepts a `msg`, a symbol, and other calls as its message")
      (doseq [text message-texts]
        (testing (pr-str text)
          (is (empty? (findings hook (form-fn text))))))))
  (testing "only the message argument is checked"
    (is (empty? (findings agent-message/lint-op-error '(op-error! (str "0") (str "op") (msg ["x"])))))
    (is (empty? (findings agent-message/lint-ellipsize '(ellipsize (msg ["x"]) (str "300")))))
    (is (empty? (findings agent-message/lint-list-content '(list-content (str "data") 0 {:param (str "x")}))))
    (is (empty? (findings agent-message/lint-list-content '(list-content data 0 opts))))
    (is (empty? (findings agent-message/lint-list-content '(list-content data 0))))))

(deftest ^:parallel jsonrpc-error-test
  (testing "GHY-4544: text passed as the JSON-RPC error message is flagged"
    (doseq [text stringy-texts]
      (testing (pr-str text)
        (is (=? [#".*passes text to `jsonrpc-error`.*`msg`.*"]
                (findings agent-message/lint-jsonrpc-error (list 'transport/jsonrpc-error 'id -32602 text)))))))
  (testing "a `msg`, symbol, or other call as the message is accepted"
    (doseq [text message-texts]
      (testing (pr-str text)
        (is (empty? (findings agent-message/lint-jsonrpc-error (list 'jsonrpc-error 'id -32602 text)))))))
  (testing "only the third argument is the message"
    (is (empty? (findings agent-message/lint-jsonrpc-error '(jsonrpc-error "id" (str "code") (msg ["x"])))))))

(deftest ^:parallel success-content-test
  (testing "GHY-4544: text passed to `success-content` is flagged"
    (doseq [text stringy-texts]
      (testing (pr-str text)
        (is (=? [#"`success-content` takes data to JSON-encode or a `msg`.*"]
                (findings agent-message/lint-success-content (list 'common/success-content text)))))))
  (testing "a payload, a `msg`, or a symbol is accepted"
    (doseq [text (conj message-texts '{:data rows} '[a b])]
      (testing (pr-str text)
        (is (empty? (findings agent-message/lint-success-content (list 'success-content text))))))
    (is (empty? (findings agent-message/lint-success-content
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
                (findings agent-message/lint-ex-info form))))))
  (testing "other ex-info calls aren't flagged"
    (doseq [form ["(ex-info \"boom\" {:status-code 500})"
                  "(ex-info \"boom\" {:status-code code})"
                  "(ex-info \"boom\" {:foo 1})"
                  "(ex-info \"boom\" data)"
                  "(ex-info \"boom\" (merge {:status-code 400} data))"
                  "(ex-info \"boom\")"]]
      (testing form
        (is (empty? (findings agent-message/lint-ex-info form))))))
  (testing "nothing is reported when the linter is off"
    (is (empty? (findings agent-message/lint-ex-info "(ex-info \"x\" {:status-code 404})" :off)))))
