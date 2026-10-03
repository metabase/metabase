(ns metabase.core.module-history-test
  (:require
   [clojure.test :refer :all]
   [dev.module-history :as module-history]
   [dev.module-source :as module-source]))

(deftest ^:parallel source-requires-test
  (testing "static requires come from the ns form, dynamic ones from require calls outside comments"
    (is (= '{:namespace metabase.x.core
             :static    #{metabase.a.core metabase.b.core}
             :dynamic   #{metabase.d.core metabase.f.core}}
           (module-source/source-requires
            (str "(ns metabase.x.core (:require [metabase.a.core :as a] [metabase.b.core]))\n"
                 "(comment (require 'metabase.c.core))\n"
                 "(defn g [] (requiring-resolve 'metabase.d.core/h))\n"
                 "(defn i [] (-> 'metabase.f.core require))\n")))))
  (testing "a source without an ns form has no namespace"
    (is (= {:namespace nil, :static #{}, :dynamic #{}}
           (module-source/source-requires "(def x 1)")))))

(deftest ^:parallel legacy-modules-test
  (testing "the pre-:metabase/modules linter config translates root namespaces to module names"
    (is (= '{api            {:api :any}
             enterprise/sso {:api #{metabase-enterprise.sso.core}}
             lib            {:api #{metabase.lib.core}}
             setup          {}}
           (#'module-history/legacy-modules
            (pr-str '{:linters {:metabase/ns-module-checker
                                {:api-namespaces {metabase.api                 :any
                                                  metabase.lib                 #{metabase.lib.core}
                                                  metabase-enterprise.sso      #{metabase-enterprise.sso.core}
                                                  metabase.setup               nil}}}}))))))

(deftest ^:parallel commit-metrics-test
  ;; x.y is nested in x, which does not export it; z lets x into its internals; w has `:api :any`.
  ;; z requires x only through `requiring-resolve`, so the static-only cycle is smaller than the full one.
  (let [deps    '[{:namespace metabase.x.core
                   :filename  "src/metabase/x/core.clj"
                   :module    x
                   :deps      [{:namespace metabase.x.y.core, :module x.y}
                               {:namespace metabase.z.impl, :module z}]}
                  {:namespace metabase.x.impl
                   :filename  "src/metabase/x/impl.clj"
                   :module    x
                   :deps      []}
                  {:namespace metabase.x.y.core
                   :filename  "src/metabase/x/y/core.clj"
                   :module    x.y
                   :deps      [{:namespace metabase.x.core, :module x}]}
                  {:namespace metabase.z.core
                   :filename  "src/metabase/z/core.clj"
                   :module    z
                   :deps      [{:namespace metabase.x.core, :module x, :dynamic :require-and-friends}]}
                  {:namespace metabase.z.impl
                   :filename  "src/metabase/z/impl.clj"
                   :module    z
                   :deps      []}
                  {:namespace metabase.w.core
                   :filename  "src/metabase/w/core.clj"
                   :module    w
                   :deps      [{:namespace metabase.z.core, :module z}]}]
        modules '{w   {:api :any}
                  x   {:api #{metabase.x.core}}
                  x.y {}
                  z   {:friends #{x}}}]
    (is (= {:namespaces                          6
            :modules                             4
            :configured-modules                  4
            :top-level-modules                   3
            :nested-modules                      1
            :module-edges                        5
            :top-level-edges                     3
            :scc-largest-modules                 3
            :scc-largest-namespaces              5
            :scc-largest-pct                     (* 100.0 (/ 5 6))
            :scc-cyclic-modules                  3
            :scc-cyclic-namespaces               5
            :scc-components                      1
            :scc-static-largest-namespaces       3
            :scc-dynamic-only-namespaces         2
            :upward-requires                     1
            :upward-module-edges                 1
            :upward-internal-requires            0
            :upward-cycle-requires               1
            :exposed-namespaces                  3
            :hidden-modules                      1
            :hidden-namespaces                   1
            :cross-top-level-required-namespaces 3
            :api-any-modules                     1
            :api-any-namespaces                  1
            :uses-any-modules                    0
            :friend-grants                       1
            :cross-top-level-friend-grants       1
            :friend-exposed-namespaces           1
            :friend-access-paths                 1
            :distinct-namespaces                 6
            :configured-top-level-modules        3
            :scc1-modules                        3
            :scc1-namespaces                     5
            :scc2-modules                        0
            :scc2-namespaces                     0
            :scc3-modules                        0
            :scc3-namespaces                     0
            ;; x.core and x.y.core require each other.
            :largest-ns-level-scc                2
            ;; x and z; x and x.y also require each other, but one is nested in the other.
            :mutual-dependency-pairs             1
            ;; x.core requiring z.impl, past z's API, which z's friend grant allows.
            :friend-internal-namespaces          1
            :friend-internal-requires            1
            :non-api-cross-module-requires       1
            :total-api-namespaces                3
            :ns-prefixes                         0
            :model-imports-bypass                0
            :legacy-rest-modules                 0
            ;; One cycle of 4 edges, each the only way between its ends.
            :cycles                              '[{:modules        [x x.y z]
                                                    :namespaces     5
                                                    :edges          4
                                                    :density        0.67
                                                    :cycle-rank     2
                                                    :strong-bridges 4}]}
           (module-history/commit-metrics deps modules)))))
