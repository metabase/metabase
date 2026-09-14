(ns hooks.metabase.prose-interpolation
  "Lint that values interpolated into prose are quoted with `pr-str`.

  Agent-facing prose (teaching errors, paging hints, steering lines) reads to an LLM as the server speaking. A value
  interpolated into it unquoted -- a warehouse table name, a driver error, a card name -- can carry newlines and text
  that pose as server-authored instructions. `pr-str` quotes the value and escapes the newlines and quotes inside it,
  so it stays visibly delimited as data.

  Checks `format` `%s` arguments, `tru`-family `{n}` arguments, and the non-literal arguments of a `str` call that
  contains a prose literal. An argument counts as quoted when it is a literal, a `(pr-str ...)` call, or a
  `str/join` over `(map pr-str ...)`. Reports `:metabase/unquoted-prose-interpolation`, which is `:off` except in the
  namespaces `config.edn` enables it for. Every hook returns its input unchanged."
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
          :message (format "`%s` is interpolated into prose unquoted; wrap it in `pr-str` so untrusted text can't pose as server-authored text."
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

(defn- string-arg-indexes
  "Zero-based indexes of the arguments that `%s`/`%S` specifiers in `fmt` consume."
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
                 (and index (contains? #{"s" "S"} conversion)) (conj index)))))))

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
                  :message "The format string must be a literal so its interpolated arguments can be checked for quoting."
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
