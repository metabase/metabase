(ns hooks.clojure.core.with-redefs-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.clojure.core.with-redefs]))

(defn- lint [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/prefer-with-dynamic-fn-redefs {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.core.with-redefs/lint-with-redefs
     {:node (hooks/parse-string (pr-str form))})
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest ^:parallel flags-fn-shaped-rhs-test
  (testing "fn literal"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [foo (fn [x] x)] (foo 1))))))
  (testing "reader-macro fn literal"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [foo #(inc %)] (foo 1))))))
  (testing "(constantly …)"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [foo (constantly 42)] (foo))))))
  (testing "(partial …), (comp …), (complement …), (identity)"
    (is (=? [{}] (lint '(with-redefs [foo (partial + 1)] (foo)))))
    (is (=? [{}] (lint '(with-redefs [foo (comp inc dec)] (foo)))))
    (is (=? [{}] (lint '(with-redefs [foo (complement odd?)] (foo)))))
    (is (=? [{}] (lint '(with-redefs [foo (identity inc)] (foo))))))
  (testing "multiple bindings, all fn-shaped"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [foo (constantly 1)
                                 bar (fn [] 2)]
                     (foo)))))))

(deftest ^:parallel ignores-non-fn-rhs-test
  (testing "literal value"
    (is (= [] (lint '(with-redefs [timeout-ms 200] :body)))))
  (testing "map / vector / set literal"
    (is (= [] (lint '(with-redefs [cfg {:a 1}] :body))))
    (is (= [] (lint '(with-redefs [things [1 2 3]] :body))))
    (is (= [] (lint '(with-redefs [things #{:a}] :body)))))
  (testing "non-fn-producing call (e.g. assoc, make-hierarchy, vec)"
    (is (= [] (lint '(with-redefs [env (assoc env :k :v)] :body))))
    (is (= [] (lint '(with-redefs [h (make-hierarchy)] :body)))))
  (testing "bare symbol — conservatively left alone even though `identity` is a fn"
    (is (= [] (lint '(with-redefs [foo identity] :body)))))
  (testing "one fn-shaped + one non-fn → do not nudge (mixed intent)"
    (is (= [] (lint '(with-redefs [foo (constantly 1)
                                   bar 42]
                       :body))))))
