(ns hooks.metabase.prose-interpolation
  "Lint agent-facing prose: interpolated values are quoted, and the exits to the agent receive `msg`-built text.

  Agent-facing prose (teaching errors, paging hints, steering lines) reads to an LLM as the server speaking. A value
  interpolated into it unquoted -- a warehouse table name, a driver error, a card name -- can carry newlines and text
  that pose as server-authored instructions. `pr-str` quotes the value and escapes the newlines and quotes inside it,
  so it stays visibly delimited as data.

  Checks `format` `%s` arguments, `tru`-family `{n}` arguments, and the non-literal arguments of a `str` call that
  contains a prose literal. An argument counts as quoted when it is a literal, a `(pr-str ...)` call, or a
  `str/join` over `(map pr-str ...)`. Reports `:metabase/unquoted-prose-interpolation`, which is `:off` except in the
  namespaces `config.edn` enables it for.

  Also checks `metabase.mcp.v2.message/msg` calls, reporting `:metabase/agent-message-lines`: the lines must be a
  literal vector of string literals, one line of the message each, with no line breaks, `%n`, or control characters,
  and the arguments must match the lines' format specifiers.

  Also checks the exits that carry text to the agent, reporting `:metabase/agent-message-exit`, which is `:off` except
  in the namespaces `config.edn` enables it for. The message argument of `throw-teaching-error`, `error-content`,
  `jsonrpc-error`, and `success-content` must not be syntactically text -- a string literal, a string-building call,
  or a threading, branching, or body form that yields one -- so that it is built with `msg`. An `ex-info` whose data
  literal carries a 4xx `:status-code` or an `error-code` key must be a `throw-teaching-error` instead. The check is
  syntactic; text that reaches an exit another way is cleaned at runtime.

  Every hook returns its input unchanged."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]))

(def ^:private linter :metabase/unquoted-prose-interpolation)

(defn- enabled?
  [config]
  (not= :off (get-in config [:linters linter :level] :off)))

(defn- call-name
  "The symbol at the head of list `node`, or nil."
  [node]
  (when (hooks/list-node? node)
    (let [head (first (:children node))]
      (when (hooks/token-node? head)
        (let [v (hooks/sexpr head)]
          (when (symbol? v) v))))))

(defn- calls?
  "Whether `node` is a call to a var named `var-name` in one of `ns-names` (nil for an unqualified call)."
  [node ns-names var-name]
  (when-let [sym (call-name node)]
    (and (= var-name (name sym))
         (contains? ns-names (namespace sym)))))

(def ^:private core-ns #{nil "clojure.core"})
(def ^:private string-ns #{"str" "string" "clojure.string"})

(defn- pr-str-call? [node]
  (calls? node core-ns "pr-str"))

(defn- map-pr-str-call?
  "`(map pr-str coll)` or `(mapv pr-str coll)`."
  [node]
  (and (or (calls? node core-ns "map") (calls? node core-ns "mapv"))
       (let [f (second (:children node))]
         (and (hooks/token-node? f)
              (contains? '#{pr-str clojure.core/pr-str} (hooks/sexpr f))))))

(defn- quoted-join?
  "`(str/join sep (map pr-str coll))` or `(->> coll (map pr-str) (str/join sep))`."
  [node]
  (or (and (calls? node string-ns "join")
           (map-pr-str-call? (last (:children node))))
      (and (calls? node core-ns "->>")
           (let [steps (drop 2 (:children node))]
             (and (= 2 (count steps))
                  (map-pr-str-call? (first steps))
                  (calls? (second steps) string-ns "join"))))))

(defn- literal?
  [node]
  (or (hooks/string-node? node)
      (hooks/keyword-node? node)
      (and (hooks/token-node? node)
           (let [v (hooks/sexpr node)]
             (or (nil? v) (number? v) (boolean? v) (char? v))))))

(defn- quoted?
  [node]
  (or (literal? node) (pr-str-call? node) (quoted-join? node)))

(defn- literal-string
  "The string value of `node` when it is a string literal or a `str` call over string literals, else nil."
  [node]
  (cond
    (hooks/string-node? node)
    (hooks/sexpr node)

    (and (calls? node core-ns "str")
         (every? hooks/string-node? (rest (:children node))))
    (apply str (map hooks/sexpr (rest (:children node))))))

(defn- reg-unquoted!
  [arg-node]
  (hooks/reg-finding!
   (assoc (meta arg-node)
          :message (format "`%s` is interpolated into prose unquoted; build agent-facing text with `msg`, which cleans interpolated values."
                           (pr-str (hooks/sexpr arg-node)))
          :type    linter)))

(defn- digits->long
  "The value of a string of decimal digits."
  [s]
  ;; Kondo's hook interpreter has no `parse-long`.
  (reduce (fn [n c] (+ (* 10 n) (- (int c) (int \0)))) 0 s))

(def ^:private format-specifier
  "A `java.util.Formatter` specifier: optional explicit index, flags, width, precision, and conversion."
  #"%(?:(\d+)\$)?([-#+ 0,(<]*)(?:\d+)?(?:\.\d+)?([tT]?[a-zA-Z%])")

(defn- consumed-args
  "`[index conversion]` for each argument-consuming specifier in `fmt`, with zero-based argument indexes."
  [fmt]
  (loop [[[_ explicit flags conversion] & more] (re-seq format-specifier fmt)
         next-index                             0
         last-index                             nil
         acc                                    []]
    (if-not conversion
      acc
      (let [consumes? (not (contains? #{"%" "n"} conversion))
            index     (cond
                        (not consumes?)             nil
                        explicit                    (dec (digits->long explicit))
                        (str/includes? flags "<")   last-index
                        :else                       next-index)
            implicit? (and consumes? (not explicit) (not (str/includes? flags "<")))]
        (recur more
               (cond-> next-index implicit? inc)
               (or index last-index)
               (cond-> acc
                 index (conj [index conversion])))))))

(defn- string-arg-indexes
  "Zero-based indexes of the arguments that `%s`/`%S` specifiers in `fmt` consume."
  [fmt]
  (keep (fn [[index conversion]] (when (contains? #{"s" "S"} conversion) index))
        (consumed-args fmt)))

(defn lint-format
  "Flag `format` `%s` arguments that aren't quoted, and format strings that aren't literals."
  [{:keys [node config] :as input}]
  (when (enabled? config)
    (let [[_ fmt-node & args] (:children node)]
      (if-let [fmt (literal-string fmt-node)]
        (doseq [index (distinct (string-arg-indexes fmt))
                :let  [arg (nth args index nil)]
                :when (and arg (not (quoted? arg)))]
          (reg-unquoted! arg))
        (when fmt-node
          (hooks/reg-finding!
           (assoc (meta fmt-node)
                  :message "The format string must be a literal so its interpolated arguments can be checked; build agent-facing text with `msg`."
                  :type    linter))))))
  input)

(defn- prose-literal?
  "Whether `node` is a string literal that reads as prose: it has both a letter and whitespace."
  [node]
  (and (hooks/string-node? node)
       (let [s (hooks/sexpr node)]
         (boolean (and (re-find #"[A-Za-z]" s) (re-find #"\s" s))))))

(defn lint-str
  "Flag unquoted arguments of a `str` call that concatenates them onto a prose literal."
  [{:keys [node config] :as input}]
  (when (enabled? config)
    (let [args (rest (:children node))]
      (when (some prose-literal? args)
        (doseq [arg args
                :when (not (quoted? arg))]
          (reg-unquoted! arg)))))
  input)

(defn lint-i18n
  "Flag `tru`-family `{n}` arguments that aren't quoted."
  [{:keys [node config] :as input}]
  (when (enabled? config)
    (let [[_ fmt-node & args] (:children node)]
      (when-let [fmt (literal-string fmt-node)]
        (doseq [index (distinct (map (comp digits->long second) (re-seq #"\{(\d+)\}" fmt)))
                :let  [arg (nth args index nil)]
                :when (and arg (not (quoted? arg)))]
          (reg-unquoted! arg)))))
  input)

(def ^:private msg-linter :metabase/agent-message-lines)

(defn- reg-msg-finding!
  [node message]
  (hooks/reg-finding! (assoc (meta node) :message message :type msg-linter)))

(defn- line-break?
  "Whether format string `line` contains a line-breaking or control character, or a `%n` specifier."
  [line]
  (boolean (or (re-find #"[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]" line)
               (some #(= "n" (nth % 3)) (re-seq format-specifier line)))))

(defn- plural
  [n word]
  (str n " " word (when-not (= 1 n) "s")))

(defn lint-msg
  "Flag `msg` calls whose lines aren't a literal vector of single-line string literals, or whose arguments don't match
  the lines' format specifiers."
  [{:keys [node config] :as input}]
  (when (not= :off (get-in config [:linters msg-linter :level] :off))
    (let [[fn-node lines-node & args] (:children node)]
      (if-not (and lines-node (hooks/vector-node? lines-node))
        (reg-msg-finding! (or lines-node fn-node)
                          "`msg` takes a literal vector of line strings, one string per line of the message.")
        (let [line-nodes (:children lines-node)]
          (doseq [line line-nodes]
            (cond
              (not (hooks/string-node? line))
              (reg-msg-finding! line "Each line of a `msg` must be a string literal; pass values as arguments after the vector.")

              (line-break? (hooks/sexpr line))
              (reg-msg-finding! line "A `msg` line can't contain a line break, `%n`, or control character; put each line in its own string.")))
          (when (every? hooks/string-node? line-nodes)
            (let [indexes  (map first (consumed-args (str/join "\n" (map hooks/sexpr line-nodes))))
                  expected (if (seq indexes) (inc (apply max indexes)) 0)
                  given    (count args)]
              (when (not= expected given)
                (reg-msg-finding! node (format "The `msg` lines take %s but %d %s given."
                                               (plural expected "argument") given (if (= 1 given) "is" "are"))))))))))
  input)

(def ^:private exit-linter :metabase/agent-message-exit)

(defn- exit-enabled?
  [config]
  (not= :off (get-in config [:linters exit-linter :level] :off)))

(defn- reg-exit-finding!
  [node message]
  (hooks/reg-finding! (assoc (meta node) :message message :type exit-linter)))

(defn- calls-core?
  "Whether `node` is a call to a `clojure.core` var or special form named in `var-names`."
  [node var-names]
  (when-let [sym (call-name node)]
    (and (contains? var-names (name sym))
         (contains? core-ns (namespace sym)))))

(defn- calls-i18n?
  [node]
  (when-let [sym (call-name node)]
    (contains? #{"tru" "trs" "deferred-tru" "deferred-trs"} (name sym))))

(defn- calls-json-encode?
  "Whether `node` calls `encode` in a namespace or alias whose name ends in `json`."
  [node]
  (when-let [sym (call-name node)]
    (and (= "encode" (name sym))
         (boolean (some-> (namespace sym) (str/ends-with? "json"))))))

(defn- stringy?
  "Whether `node` syntactically evaluates to text: a string literal, a call that builds a string, or a threading,
  branching, or body form whose result is one."
  [node]
  (let [args (rest (:children node))]
    (boolean
     (or (hooks/string-node? node)
         (calls-core? node #{"str" "format" "pr-str"})
         (calls-i18n? node)
         (calls? node string-ns "join")
         (calls-json-encode? node)
         (and (calls-core? node #{"->" "->>" "cond->" "cond->>"})
              (stringy? (first args)))
         (and (calls-core? node #{"if" "if-not" "if-let"})
              (some stringy? (rest args)))
         (and (calls-core? node #{"when" "when-not" "when-let" "let"})
              (next args)
              (stringy? (last args)))
         (and (calls-core? node #{"do"})
              (stringy? (last args)))
         (and (calls-core? node #{"or"})
              (some stringy? args))))))

(defn- lint-exit-text!
  "Flag the argument of exit call `node` at child `index` when it is text rather than a `msg`."
  [node index]
  (let [arg (nth (:children node) index nil)]
    (when (and arg (stringy? arg))
      (reg-exit-finding! arg (format "`%s` passes text to `%s`; build agent-facing text with `msg` so interpolated values are cleaned."
                                     (pr-str (hooks/sexpr arg))
                                     (name (call-name node)))))))

(defn lint-teaching-exit
  "Flag a teaching-error exit whose message, the first argument, is text rather than a `msg`."
  [{:keys [node config] :as input}]
  (when (exit-enabled? config)
    (lint-exit-text! node 1))
  input)

(defn lint-jsonrpc-error
  "Flag a `jsonrpc-error` whose message, the third argument, is text rather than a `msg`."
  [{:keys [node config] :as input}]
  (when (exit-enabled? config)
    (lint-exit-text! node 3))
  input)

(defn lint-success-content
  "Flag a `success-content` whose first argument is text rather than a payload or a `msg`."
  [{:keys [node config] :as input}]
  (when (exit-enabled? config)
    (let [text (second (:children node))]
      (when (and text (stringy? text))
        (reg-exit-finding! text "`success-content` takes data to JSON-encode or a `msg`; pass the payload itself, or build the text with `msg`."))))
  input)

(defn- caller-facing-data?
  "Whether `node` is a map literal with a 4xx `:status-code` literal or an `error-code` key."
  [node]
  (and (hooks/map-node? node)
       (some (fn [[k v]]
               (when (hooks/keyword-node? k)
                 (let [kw (hooks/sexpr k)]
                   (or (= "error-code" (name kw))
                       (and (= :status-code kw)
                            (hooks/token-node? v)
                            (let [status (hooks/sexpr v)]
                              (and (number? status) (<= 400 status 499))))))))
             (partition 2 (:children node)))))

(defn lint-ex-info
  "Flag an `ex-info` whose data marks it as a caller-facing error."
  [{:keys [node config] :as input}]
  (when (exit-enabled? config)
    (when (caller-facing-data? (nth (:children node) 2 nil))
      (reg-exit-finding! node "Caller-facing errors must be thrown with `throw-teaching-error` and a `msg`, so their text is rendered and cleaned.")))
  input)
