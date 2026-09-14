(ns hooks.metabase.prose-interpolation
  "Hooks linting agent-facing prose built with `metabase.mcp.v2.message/msg` (`:metabase/agent-message-lines`) and the
  exits that carry it to the agent (`:metabase/agent-message-exit`). Each hook checks only when its linter's level is
  configured and not `:off`, and returns its input unchanged."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]))

(defn- level-on?
  [config linter-key]
  (not= :off (get-in config [:linters linter-key :level] :off)))

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

(defn- literal-string
  "The string value of `node` when it is a string literal or a `str` call over string literals, else nil."
  [node]
  (cond
    (hooks/string-node? node)
    (hooks/sexpr node)

    (and (calls? node core-ns "str")
         (every? hooks/string-node? (rest (:children node))))
    (apply str (map hooks/sexpr (rest (:children node))))))

(defn- digits->long
  "The value of a string of decimal digits."
  [s]
  ;; Kondo's hook interpreter has no `parse-long`.
  (reduce (fn [n c] (+ (* 10 n) (- (int c) (int \0)))) 0 s))

(def ^:private format-specifier
  "A `java.util.Formatter` specifier; groups are explicit index, flags, width, precision, and conversion."
  #"%(?:(\d+)\$)?([-#+ 0,(<]*)(\d+)?(?:\.(\d+))?([tT]?[a-zA-Z%])")

(defn- consumed-args
  "`[index conversion]` for each argument-consuming specifier in `fmt`, with zero-based argument indexes."
  [fmt]
  (loop [[[_ explicit flags _width _precision conversion] & more] (re-seq format-specifier fmt)
         next-index                                               0
         last-index                                               nil
         acc                                                      []]
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

(def ^:private msg-linter :metabase/agent-message-lines)

(defn- reg-msg-finding!
  [node message]
  (hooks/reg-finding! (assoc (meta node) :message message :type msg-linter)))

(defn- line-break?
  "Whether format string `line` contains a line-breaking or control character, or a `%n` specifier."
  [line]
  (boolean (or (re-find #"[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]" line)
               (some #(= "n" (nth % 5)) (re-seq format-specifier line)))))

(defn- altered-string-conversion?
  "Whether format string `line` has a `%S`, or a `%s` with a width, precision, or flags other than `<`."
  [line]
  (boolean
   (some (fn [[_ _ flags width precision conversion]]
           (or (= "S" conversion)
               (and (= "s" conversion)
                    (or width precision (seq (str/replace flags "<" ""))))))
         (re-seq format-specifier line))))

(defn- plural
  [n word]
  (str n " " word (when-not (= 1 n) "s")))

(defn lint-msg
  "Flag `msg` calls whose lines aren't a literal vector of single-line literal strings, that alter a `%s` value, or
  whose arguments don't match the lines' format specifiers."
  [{:keys [node config] :as input}]
  (when (level-on? config msg-linter)
    (let [[fn-node lines-node & args] (:children node)]
      (if-not (and lines-node (hooks/vector-node? lines-node))
        (reg-msg-finding! (or lines-node fn-node)
                          "`msg` takes a literal vector of line strings, one string per line of the message.")
        (let [line-nodes (:children lines-node)
              lines      (map literal-string line-nodes)]
          (doseq [[line-node line] (map vector line-nodes lines)]
            (cond
              (nil? line)
              (reg-msg-finding! line-node
                                (str "Each line of a `msg` must be a string literal or a `str` of string literals; "
                                     "pass values as arguments after the vector."))

              (line-break? line)
              (reg-msg-finding! line-node
                                (str "A `msg` line can't contain a line break, `%n`, or control character; "
                                     "put each line in its own string."))

              (altered-string-conversion? line)
              (reg-msg-finding! line-node
                                (str "`%s` in a `msg` line can't take a width, precision, flags, or `%S`; "
                                     "they would cut or alter the quoted value."))))
          (when (every? some? lines)
            (let [indexes  (map first (consumed-args (str/join "\n" lines)))
                  expected (if (seq indexes) (inc (apply max indexes)) 0)
                  given    (count args)]
              (when (not= expected given)
                (reg-msg-finding! node (format "The `msg` lines take %s but %d %s given."
                                               (plural expected "argument") given (if (= 1 given) "is" "are"))))))))))
  input)

(def ^:private exit-linter :metabase/agent-message-exit)

(defn- exit-enabled?
  [{:keys [config]}]
  (level-on? config exit-linter))

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
      (reg-exit-finding! arg (format (str "`%s` passes text to `%s`; "
                                          "build agent-facing text with `msg` so interpolated values are cleaned.")
                                     (pr-str (hooks/sexpr arg))
                                     (name (call-name node)))))))

(defn lint-teaching-exit
  "Flag a teaching-error exit whose message, the first argument, is text rather than a `msg`."
  [{:keys [node] :as input}]
  (when (exit-enabled? input)
    (lint-exit-text! node 1))
  input)

(defn lint-jsonrpc-error
  "Flag a `jsonrpc-error` whose message, the third argument, is text rather than a `msg`."
  [{:keys [node] :as input}]
  (when (exit-enabled? input)
    (lint-exit-text! node 3))
  input)

(defn lint-success-content
  "Flag a `success-content` whose first argument is text rather than a payload or a `msg`."
  [{:keys [node] :as input}]
  (when (exit-enabled? input)
    (let [text (second (:children node))]
      (when (and text (stringy? text))
        (reg-exit-finding! text (str "`success-content` takes data to JSON-encode or a `msg`; "
                                     "pass the payload itself, or build the text with `msg`.")))))
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
  [{:keys [node] :as input}]
  (when (exit-enabled? input)
    (when (caller-facing-data? (nth (:children node) 2 nil))
      (reg-exit-finding! node (str "Caller-facing errors must be thrown with `throw-teaching-error` and a `msg`, "
                                   "so their text is rendered and cleaned."))))
  input)
