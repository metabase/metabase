(ns metabase.driver.druid.js
  "Util fns for creating Javascript functions."
  (:refer-clojure :exclude [+ - * / or])
  (:require [clojure.string :as s]))

(defn- ->js [x]
  {:pre [(not (coll? x))]}
  (if (keyword? x)
    (name x)
    x))

(defn parens [s]
  (str "(" s ")"))

(defn argslist [args]
  (println "arglist" args) ; NOCOMMIT
  (parens (s/join ", " (map ->js args))))

(defn return [& statement-parts]
  (str "return " (apply str statement-parts) ";"))

(defn function {:style/indent 1} [args & body]
  (str "function" (argslist args) " { "
       (apply str body)
       " }"))

(defn- arthitmetic-operator [operator & args]
  (parens (s/join (str " " (name operator) " ")
                  (map ->js args))))

(def ^{:arglists '([& args])} + (partial arthitmetic-operator :+))
(def ^{:arglists '([& args])} - (partial arthitmetic-operator :-))
(def ^{:arglists '([& args])} * (partial arthitmetic-operator :*))
(def ^{:arglists '([& args])} / (partial arthitmetic-operator :/))

(defn fn-call [fn-name & args]
  (println "parse-float" (class args) args)       ; NOCOMMIT
  (str (name fn-name) (argslist args)))

(def parse-float (partial fn-call :parseFloat))


(defn or [& args]
  (parens (s/join " || " (map ->js args))))
