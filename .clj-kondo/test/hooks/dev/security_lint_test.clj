(ns hooks.dev.security-lint-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.test :refer :all]
   [hooks.dev.security-lint]))

(defn- is-valid-node [x]
  (is (api/node? x))
  (doseq [child (:children x)]
    (is-valid-node child)))

(deftest ^:parallel defrule-test
  (letfn [(expand [form]
            (let [node (-> form pr-str api/parse-string)]
              (is-valid-node node)
              (-> {:node node} hooks.dev.security-lint/defrule :node api/sexpr)))]
    (testing "a rule becomes a defn with a docstring, so the style linters are satisfied"
      (is (= '(defn command-injection "Security rule detector." [{:keys [node]}] (when node {:message "m"}))
             (expand '(defrule command-injection
                        {:name "n" :severity :error :triggers #{clojure.java.shell/sh}}
                        [{:keys [node]}]
                        (when node {:message "m"}))))))
    (testing "the spec -- and the unresolvable trigger symbols in it -- is dropped from what kondo analyzes"
      (is (not (re-find #"clojure\.java\.shell"
                        (pr-str (expand '(defrule r {:triggers #{clojure.java.shell/sh}} [_] nil))))))))
  (testing "a malformed form is left alone rather than rewritten into something misleading"
    (is (nil? (hooks.dev.security-lint/defrule {:node (api/parse-string "(defrule only-a-name)")})))))
