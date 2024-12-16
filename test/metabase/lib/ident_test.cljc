(ns metabase.lib.ident-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is]]
   [metabase.lib.ident :as lib.ident]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel random-ident-test
  (let [ids (repeatedly 3 lib.ident/random-ident)]
    (is (every? string? ids))
    (is (= 3 (count (set ids))))))

(deftest ^:parallel keyed-idents-test
  (is (nil? (lib.ident/keyed-idents {})))
  (is (nil? (lib.ident/keyed-idents nil)))
  (let [input  {"foo" [:some {:structure 7}]
                "bar" 8
                :baz  "right-hand side"}
        output (lib.ident/keyed-idents input)]
    (is (= #{"bar" :baz "foo"}
           (set (keys output))))
    (is (every? string? (vals output)))))

(deftest ^:parallel indexed-idents-test
  (is (nil? (lib.ident/indexed-idents {})))
  (is (nil? (lib.ident/indexed-idents nil)))
  (is (nil? (lib.ident/indexed-idents 0)))
  (let [input  [[:some {:structure 7}]
                "a string"
                8]]
    (is (=? {0 string?
             1 string?
             2 string?}
            (lib.ident/indexed-idents input))))
  (is (=? {0 string?
           1 string?}
          (lib.ident/indexed-idents 2))))
