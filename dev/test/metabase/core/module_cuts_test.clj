(ns metabase.core.module-cuts-test
  (:require
   [clojure.test :refer :all]
   [dev.module-cuts :as module-cuts]))

(defn- row
  "A dependency row for `namespace` in `module` that requires each `[namespace module]` of `requires`."
  [namespace module requires]
  {:namespace namespace
   :module    module
   :deps      (for [[required-namespace required-module] requires]
                {:namespace required-namespace, :module required-module})})

(deftest ^:parallel upward-pairs-test
  ;; x requires its children x.y and x.z, so their requires back into x close a cycle. x.w requires x, and
  ;; nothing requires x.w.
  (let [modules '{x {}, x.y {}, x.z {}, x.w {}}
        deps    [(row 'metabase.x.core 'x '[[metabase.x.y.core x.y] [metabase.x.z.core x.z]])
                 (row 'metabase.x.impl 'x [])
                 (row 'metabase.x.y.core 'x.y '[[metabase.x.core x] [metabase.x.impl x]])
                 (row 'metabase.x.y.other 'x.y '[[metabase.x.impl x]])
                 (row 'metabase.x.z.core 'x.z '[[metabase.x.core x]])
                 (row 'metabase.x.w.core 'x.w '[[metabase.x.impl x]])]]
    (testing "pairs that close a cycle are counted, with the requires that reach past the ancestor's API"
      (is (= '[{:module x.y, :ancestor x, :requires 3, :internal 2}
               {:module x.z, :ancestor x, :requires 1, :internal 0}]
             (module-cuts/upward-pairs deps modules))))))

(deftest ^:parallel cut-candidates-test
  ;; A cycle of base, mid and top, three namespaces each. One require goes up from base, into mid, and two go up
  ;; from mid into top. An unrelated module requires base.
  (let [deps (concat
              [(row 'metabase.base.core 'base '[[metabase.mid.core mid]])
               (row 'metabase.base.a 'base [])
               (row 'metabase.base.b 'base [])
               (row 'metabase.mid.core 'mid '[[metabase.base.core base] [metabase.top.core top]])
               (row 'metabase.mid.a 'mid '[[metabase.top.core top]])
               (row 'metabase.mid.b 'mid [])
               (row 'metabase.top.core 'top '[[metabase.mid.core mid] [metabase.base.core base]])
               (row 'metabase.top.a 'top [])
               (row 'metabase.top.b 'top [])
               (row 'metabase.other.core 'other '[[metabase.base.core base]])])]
    (testing "a bottom layer is offered when cutting it loose frees more than every cheaper cut, cheapest first"
      ;; The order is base, top, mid. One require frees base; two leave no cycle at all.
      (is (= '[{:base-modules  1
                :cycle-modules 3
                :requires      [[metabase.base.core metabase.mid.core]]
                :largest-after 6
                :freed         3}
               {:base-modules  2
                :cycle-modules 3
                :requires      [[metabase.base.core metabase.mid.core]
                                [metabase.top.core metabase.mid.core]]
                :largest-after 0
                :freed         9}]
             (module-cuts/cut-candidates deps 30))))
    (testing "a candidate needing more requires than the limit is left out"
      (is (= [1]
             (map :base-modules (module-cuts/cut-candidates deps 1)))))
    (testing "without a cycle there is nothing to cut"
      (is (= []
             (module-cuts/cut-candidates [(row 'metabase.base.core 'base [])
                                          (row 'metabase.top.core 'top '[[metabase.base.core base]])]
                                         30))))))
