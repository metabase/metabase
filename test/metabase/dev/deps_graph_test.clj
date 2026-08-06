(ns metabase.dev.deps-graph-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [dev.deps-graph :as deps-graph]))

(set! *warn-on-reflection* true)

;; Not ^:parallel: the body rebinds `deps-graph/kondo-config` with `with-redefs`, a global mutation
;; that is unsafe to run alongside other tests.
(deftest kondo-config-diff-excludes-human-owned-keys-test
  (testing "kondo-config-diff does not report human-owned keys as extraneous drift"
    ;; Two modules whose regenerated :api/:uses reproduce the committed values exactly, so the
    ;; human-owned keys are the only ones that could show up in the diff. Excluded, the diff is empty.
    (let [config '{a {:ns-prefix "metabase.a-legacy" :api #{metabase.a-legacy.core} :uses #{}
                      :module-exports #{a.child}}
                   b {:ns-prefix "metabase.b-legacy" :api #{}                        :uses #{a}}}
          deps   '[{:module a :namespace metabase.a-legacy.core
                    :filename "src/metabase/a_legacy/core.clj" :deps []}
                   {:module b :namespace metabase.b-legacy.core
                    :filename "src/metabase/b_legacy/core.clj"
                    :deps [{:module a :namespace metabase.a-legacy.core}]}]]
      (with-redefs [deps-graph/kondo-config (constantly config)]
        (let [diff (pr-str (deps-graph/kondo-config-diff deps))]
          (is (not (re-find #"ns-prefix" diff))
              "the :ns-prefix key must not appear in the config diff")
          (is (not (re-find #"module-exports" diff))
              "the :module-exports key must not appear in the config diff"))))))
