(ns metabase.driver.druid.js
  "Util fns for creating Javascript functions."
  (:refer-clojure :exclude [+ - * / or])
  (:require [clojure.string :as s]))

(defn- ->js [x]
  {:pre [(not (coll? x))]}
  (if (keyword? x)
    (name x)
    x))

(defn parens
  "Wrap S (presumably a string) in parens."
  ^String [s]
  (str "(" s ")"))

(defn argslist
  "Generate a list of arguments, e.g. for a function declaration or function call.
   ARGS are separated by commas and wrapped in parens.

     (argslist [:x :y]) -> \"(x, y)\""
  ^String [args]
  (parens (s/join ", " (map ->js args))))

(defn return
  "Generate a javascript `return` statement. STATEMENT-PARTS are combined directly into a single string.

     (return :x :+ :y) -> \"return x+y;\""
  ^String [& statement-parts]
  (str "return " (apply str (map ->js statement-parts)) ";"))

(defn function
  "Create a JavaScript function with ARGS and BODY."
  {:style/indent 1}
  ^String [args & body]
  (str "function" (argslist args) " { "
       (apply str body)
       " }"))

(defn- arithmetic-operator
  "Interpose artihmetic OPERATOR between ARGS, and wrap the entire expression in parens."
  ^String [operator & args]
  (parens (s/join (str " " (name operator) " ")
                  (map ->js args))))

(def ^{:arglists '([& args])} ^String + "Interpose `+` between ARGS, and wrap the entire expression in parens." (partial arithmetic-operator :+))
(def ^{:arglists '([& args])} ^String - "Interpose `-` between ARGS, and wrap the entire expression in parens." (partial arithmetic-operator :-))
(def ^{:arglists '([& args])} ^String * "Interpose `*` between ARGS, and wrap the entire expression in parens." (partial arithmetic-operator :*))
(def ^{:arglists '([& args])} ^String / "Interpose `/` between ARGS, and wrap the entire expression in parens." (partial arithmetic-operator :/))

(defn fn-call
  "Generate a JavaScript function call.

     (fn-call :parseFloat :x :y) -> \"parseFloat(x, y)\""
  ^String [fn-name & args]
  (str (name fn-name) (argslist args)))

(def ^{:arglists '([x])} ^String parse-float
  "Generate a call to the JavaScript `parseFloat` function."
  (partial fn-call :parseFloat))


(defn or
  "Interpose the JavaScript or operator (`||`) betwen ARGS, and wrap the entire expression in parens.

     (or :x :y) -> \"(x || y)\""
  ^String [& args]
  (parens (s/join " || " (map ->js args))))
