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
  ;; A cycle of base, mid and top, three namespaces each. One require goes up from base into mid, and two go up
  ;; from mid into top. An unrelated module requires base, and base.a requires inside its own module.
  (let [deps [(row 'metabase.base.core 'base '[[metabase.mid.core mid]])
              (row 'metabase.base.a 'base '[[metabase.base.core base]])
              (row 'metabase.base.b 'base [])
              (row 'metabase.mid.core 'mid '[[metabase.base.core base] [metabase.top.core top]])
              (row 'metabase.mid.a 'mid '[[metabase.top.core top]])
              (row 'metabase.mid.b 'mid [])
              (row 'metabase.top.core 'top '[[metabase.mid.core mid] [metabase.base.core base]])
              (row 'metabase.top.a 'top [])
              (row 'metabase.top.b 'top [])
              (row 'metabase.other.core 'other '[[metabase.base.core base]])]]
    (testing "a bottom layer is offered when cutting it loose frees more than every cheaper cut, cheapest first"
      ;; The order is base, top, mid. One require frees base; two leave no cycle at all.
      (is (= '[{:base-modules  1
                :cycle-modules 3
                :requires      [[metabase.base.core metabase.mid.core]]
                :edges         [[base mid 1]]
                :largest-after 6
                :freed         3}
               {:base-modules  2
                :cycle-modules 3
                :requires      [[metabase.base.core metabase.mid.core]
                                [metabase.top.core metabase.mid.core]]
                :edges         [[base mid 1] [top mid 1]]
                :largest-after 0
                :freed         9}]
             (module-cuts/cut-candidates deps 30))))
    (testing "the cycle with the most namespaces is the one cut, not the one with the most modules"
      (is (= [{:cycle-modules 2, :edges '[[q p 1]], :largest-after 0, :freed 10}]
             (map #(select-keys % [:cycle-modules :edges :largest-after :freed])
                  (module-cuts/cut-candidates (into deps
                                                    (concat [(row 'metabase.p.core 'p '[[metabase.q.core q]])
                                                             (row 'metabase.q.core 'q '[[metabase.p.core p]])]
                                                            (for [n (range 8)]
                                                              (row (symbol (str "metabase.p.n" n)) 'p []))))
                                              30)))))
    (testing "another cycle in the graph does not count as what is left of this one"
      (is (= [[1 6] [2 0]]
             (map (juxt :base-modules :largest-after)
                  (module-cuts/cut-candidates (concat deps
                                                      [(row 'metabase.p.core 'p '[[metabase.q.core q]])
                                                       (row 'metabase.p.a 'p [])
                                                       (row 'metabase.q.core 'q '[[metabase.p.core p]])
                                                       (row 'metabase.q.a 'q [])])
                                              30)))))
    (testing "a layer that costs as much as another and frees less is dropped, and the cheapest comes first"
      ;; With far on top the order is top, mid, base, far. The bottom two cost three requires, as the bottom one
      ;; does, and free less; the bottom three cost one. Requires are listed by module edge, then by namespace.
      (is (= '[{:base-modules 3
                :requires     [[metabase.top.c metabase.far.core]]
                :freed        1}
               {:base-modules 1
                :requires     [[metabase.top.core metabase.base.core]
                               [metabase.top.c metabase.far.core]
                               [metabase.top.core metabase.mid.core]]
                :freed        5}]
             (map #(select-keys % [:base-modules :requires :freed])
                  (module-cuts/cut-candidates
                   (concat deps
                           [(row 'metabase.far.core 'far '[[metabase.top.core top]
                                                           [metabase.top.a top]
                                                           [metabase.mid.core mid]])
                            (row 'metabase.top.c 'top '[[metabase.far.core far]])])
                   30)))))
    (testing "a require inside one module is not an edge"
      (is (not-any? (fn [[from to]] (= from to))
                    (keys (#'module-cuts/requires-by-edge deps)))))
    (testing "a candidate needing more requires than the limit is left out"
      (is (= [1]
             (map :base-modules (module-cuts/cut-candidates deps 1)))))
    (testing "without a cycle there is nothing to cut"
      (is (= []
             (module-cuts/cut-candidates [(row 'metabase.base.core 'base [])
                                          (row 'metabase.top.core 'top '[[metabase.base.core base]])]
                                         30))))))
