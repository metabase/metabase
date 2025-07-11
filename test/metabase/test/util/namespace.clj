(ns metabase.test.util.namespace
  "Test utilities for namespace operations."
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.string :as str]
   [clojure.tools.namespace.find :as ns.find]))

;; This is made `^:const` so it will get calculated when the uberjar is compiled. `find-namespaces` won't work if
;; source is excluded; either way this takes a few seconds, so doing it at compile time speeds up launch as well.
(defonce ^:const ^{:doc "Vector of symbols of all Metabase namespaces, excluding test namespaces. This is intended
  for use by various test routines that need to load related namespaces.

  DEPRECATED: Using this is an anti-pattern, it messes up our ability to analyze the code and find dependencies between
  namespaces or to topographically sort them correctly during compilation. See
  https://metaboat.slack.com/archives/CKZEMT1MJ/p1734635053499399 or ask Cam for more info.

  This was moved from metabase.util.jvm for testing purposes only."}
  ^:deprecated metabase-namespace-symbols
  (vec (sort (for [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
                   :when   (and (str/starts-with? ns-symb "metabase")
                                (not (str/includes? ns-symb "test")))]
               ns-symb))))
