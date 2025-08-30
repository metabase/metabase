(ns metabase.test.util.namespace
  "Test utilities for namespace operations."
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.string :as str]
   [clojure.tools.namespace.find :as ns.find]))

(defonce ^{:doc "Vector of symbols of all Metabase namespaces, excluding test namespaces. This is intended
  for use by various test routines that need to load related namespaces.

  This was moved from metabase.util.jvm for testing purposes only."}
  ^:deprecated metabase-namespace-symbols
  (vec (sort (for [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
                   :when   (and (str/starts-with? ns-symb "metabase")
                                (not (str/includes? ns-symb "test")))]
               ns-symb))))
