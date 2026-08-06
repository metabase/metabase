(ns dev.deps-graph-test
  (:require
   [clojure.test :refer :all]
   [dev.deps-graph]
   [rewrite-clj.zip :as z]))

(deftest ^:parallel find-required-namespaces-test
  (are [s expected] (= (quote expected)
                       (#'dev.deps-graph/find-required-namespaces (z/of-string s)))
    "(require 'malli.generator)"              #{malli.generator}
    "(require (quote malli.generator))"       #{malli.generator}
    "(classloader/require 'a 'b)"             #{a b}
    "(requiring-resolve 'a/b 'c/d)"           #{a c}
    "(require '[malli.generator :as mg])"     #{malli.generator}
    "(require '[malli.generator])"            #{malli.generator}
    "(-> 'malli.generator requiring-resolve)" #{malli.generator}))
;; TODO: reader conditionals don't work properly
    ; "(#?(:clj requiring-resolve :cljs resolve) 'malli.generator)" #{malli.generator}))

