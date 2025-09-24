(ns metabase-enterprise.transforms-python.python-parser
  "Python function parsing utilities for library completions."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- parse-function-arg
  "Parse a single function argument, extracting name and type annotation if present.
   Returns a map with :name and optionally :type."
  [arg-str]
  (let [trimmed (str/trim arg-str)]
    (if (re-find #":" trimmed)
      (let [[name type-annotation] (str/split trimmed #":" 2)]
        {:name (str/trim name)
         :type (str/trim type-annotation)})
      {:name trimmed})))

(defn- split-function-args
  "Split function arguments, respecting nested brackets and parentheses."
  [args-str]
  (if (str/blank? args-str)
    []
    (loop [chars (seq args-str)
           current-arg []
           args []
           bracket-depth 0
           paren-depth 0]
      (if (empty? chars)
        (if (not-empty current-arg)
          (conj args (str/join current-arg))
          args)
        (let [ch (first chars)]
          (case ch
            \[ (recur (rest chars) (conj current-arg ch) args (inc bracket-depth) paren-depth)
            \] (recur (rest chars) (conj current-arg ch) args (dec bracket-depth) paren-depth)
            \( (recur (rest chars) (conj current-arg ch) args bracket-depth (inc paren-depth))
            \) (recur (rest chars) (conj current-arg ch) args bracket-depth (dec paren-depth))
            \, (if (and (= bracket-depth 0) (= paren-depth 0))
                 (recur (rest chars) [] (conj args (str/join current-arg)) bracket-depth paren-depth)
                 (recur (rest chars) (conj current-arg ch) args bracket-depth paren-depth))
            (recur (rest chars) (conj current-arg ch) args bracket-depth paren-depth)))))))

(defn- parse-function-args
  "Parse function arguments string, handling varargs (*args) and kwargs (**kwargs).
   Returns a vector of argument maps with :name, :type (optional), :varargs? and :kwargs? flags."
  [args-str]
  (if (str/blank? args-str)
    []
    (let [args (split-function-args args-str)]
      (mapv (fn [arg]
              (let [trimmed   (str/trim arg)
                    kwargs?   (str/starts-with? trimmed "**")
                    varargs?  (and (str/starts-with? trimmed "*")
                                   (not kwargs?))
                    clean-arg (cond
                                kwargs? (subs trimmed 2)
                                varargs? (subs trimmed 1)
                                :else trimmed)
                    parsed    (parse-function-arg clean-arg)]
                (cond-> parsed
                  varargs? (assoc :varargs? true)
                  kwargs? (assoc :kwargs? true))))
            args))))

(defn extract-functions-from-source
  "Extract function definitions from Python source code using regex.
   Returns a vector of maps with :name, :docstring, and :arguments."
  [source]
  (if (str/blank? source)
    []
    (let [;; Regex to match function definitions with optional type annotations and docstrings
          func-pattern (re-pattern
                        (str "(?s)(?:^|\\n)def\\s+"            ;; def keyword at start of string or after newline
                             "([a-zA-Z_][a-zA-Z0-9_]*)"        ;; function name (group 1)
                             "\\s*\\("                          ;; opening parenthesis
                             "([^)]*)"                          ;; arguments (group 2)
                             "\\)"                              ;; closing parenthesis
                             "(?:\\s*->\\s*[^:]+?)?"            ;; optional return type annotation
                             "\\s*:"                            ;; colon
                             "(?:\\s*\\n\\s*\"\"\"(.*?)\"\"\")?")) ;; optional docstring (group 3)
          ]
      (loop [matches (re-seq func-pattern source)
             result []]
        (if (empty? matches)
          result
          (let [[_ func-name args-str docstring] (first matches)
                args (try
                       (parse-function-args args-str)
                       (catch Exception _
                         ;; If parsing fails, fallback to basic info
                         []))
                func-info {:name func-name
                           :arguments args}
                func-info (if (and docstring (not (str/blank? docstring)))
                            (assoc func-info :docstring (str/trim docstring))
                            func-info)]
            (recur (rest matches)
                   (conj result func-info))))))))