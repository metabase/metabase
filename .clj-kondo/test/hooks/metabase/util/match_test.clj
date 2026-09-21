(ns hooks.metabase.util.match-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.util.match :as sut]))

(defn- expand [src]
  (-> (sut/match-one {:node (hooks/parse-string (pr-str src))})
      :node
      hooks/sexpr))

(defn- lint [src]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/match-odd-clauses {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (expand src)
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest odd-clauses-triggers-warning-test
  (is (=? [{:type :metabase/match-odd-clauses}]
          (lint '(metabase.util.match/match-one [] [a b c])))))

(deftest expansion-test
  (testing "simple expansion example"
    (is (= '(let [_ []
                  &match (rand-nth ())
                  &parents (rand-nth ())
                  &recur (rand-nth ())
                  _ &match
                  _ &parents
                  _ &recur
                  a (rand-nth ())
                  b (rand-nth ())
                  c (rand-nth ())]
              (clojure.core/or (+ a b) (rand-nth ())))
           (expand '(match-one [] [a b c] (+ a b))))))
  (testing "complicated expansion example that uses most match-one macro features, and also binding deduplication by the rewriter"
    (is (= '(let [_ []
                  &match (rand-nth ())
                  &parents (rand-nth ())
                  &recur (rand-nth ())
                  _ &match
                  _ &parents
                  _ &recur
                  val1 (rand-nth ())
                  a (rand-nth ())
                  _ #{maybe important}
                  rst (rand-nth ())
                  x (rand-nth ())
                  _ (= x 3)
                  b (rand-nth ())]
              (clojure.core/or (+ a val1) (rand-nth ())))
           (expand '(match-one []
                               (:or [{:key1 val1, :key2 &truthy, :key3 _} _ a #{maybe important} & rst]
                                    (:and (x :guard (= x 3))
                                          [a b]))
                               (+ a val1)))))))
