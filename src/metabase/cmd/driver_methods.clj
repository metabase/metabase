(ns metabase.cmd.driver-methods
  (:require [clojure.java.classpath :as classpath]
            [clojure.string :as str]
            [clojure.tools.namespace.find :as ns-find]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]))

(defn- driver-ns-symbs []
  (sort
   (for [ns-symb (ns-find/find-namespaces (classpath/system-classpath))
         :let    [starts-with? (partial str/starts-with? (name ns-symb))]
         :when   (and (or (starts-with? "metabase.driver")
                          (starts-with? "metabase.test.data"))
                      (do
                        (u/ignore-exceptions (classloader/require ns-symb))
                        (find-ns ns-symb)))]
     ns-symb)))

(defn- available-multimethods
  ([]
   (for [ns-symb (driver-ns-symbs)
         :let    [multimethods (available-multimethods ns-symb)]
         :when   (seq multimethods)]
     [(ns-name ns-symb) multimethods]))
  ([ns-symb]
   (sort
    (for [[symb varr] (ns-publics ns-symb)
          :when       (instance? clojure.lang.MultiFn @varr)]
      [symb varr]))))

(defn print-available-multimethods
  "Print a list of all multimethods a available for a driver to implement."
  []
  (doseq [[namespc multimethods] (available-multimethods)]
    (println (u/format-color 'blue namespc))
    (doseq [[symb varr] multimethods]
      (println (str/join " " (cons (u/format-color 'green symb) (:arglists (meta varr))))))
    (print "\n")))
