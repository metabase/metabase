(ns hooks.clojure.core.let-test
  (:require
   [clj-kondo.core :as kondo]
   [clojure.string :as str]
   [clojure.test :refer :all]))

(defn- findings!
  "Rows and columns of `:metabase/dynamic-redefs-captured-proxy` findings from a real kondo run over `body-lines`.
   They follow an `ns` form that requires `metabase.test` as `mt`, `metabase.test.util.dynamic-redefs` as `dr` and
   `example.ns` as `ex`. That form takes four rows, so the first body line is row 5."
  [& body-lines]
  (let [src (str/join "\n" (concat ["(ns example-test"
                                    "  (:require [metabase.test :as mt]"
                                    "            [metabase.test.util.dynamic-redefs :as dr]"
                                    "            [example.ns :as ex]))"]
                                   body-lines))]
    (->> (with-in-str src
           (kondo/run! {:lint       ["-"]
                        :filename   "example_test.clj"
                        :config-dir ".clj-kondo"
                        :cache      false}))
         :findings
         (filter #(= :metabase/dynamic-redefs-captured-proxy (:type %)))
         (mapv (juxt :row :col)))))

(deftest flags-captured-var-test
  (testing "a let binding that captures a var the body redefines"
    (is (= [[5 12]]
           (findings! "(let [orig ex/f]"
                      "  (mt/with-dynamic-fn-redefs [ex/f (fn [x] (orig x))]"
                      "    (ex/f 1)))")))))

(deftest flags-nested-redefs-test
  (testing "the redefinition can sit anywhere in the body, under the macro's own name too"
    (is (= [[5 12]]
           (findings! "(let [orig ex/f]"
                      "  (testing \"x\""
                      "    (dr/with-dynamic-fn-redefs [ex/g identity"
                      "                                ex/f (fn [x] (orig x))]"
                      "      (ex/f 1))))")))))

(deftest ignores-original-fn-test
  (testing "`original-fn` is the fix"
    (is (= []
           (findings! "(let [orig (mt/original-fn #'ex/f)]"
                      "  (mt/with-dynamic-fn-redefs [ex/f (fn [x] (orig x))]"
                      "    (ex/f 1)))")))))

(deftest ignores-other-vars-test
  (testing "capturing a var the body doesn't redefine"
    (is (= []
           (findings! "(let [g ex/g]"
                      "  (mt/with-dynamic-fn-redefs [ex/f (fn [x] (g x))]"
                      "    (ex/f 1)))")))))

(deftest ignores-with-redefs-test
  (testing "`with-redefs` swaps the root, so the proxy it captured calls through to the original"
    (is (= []
           (findings! "(let [orig ex/f]"
                      "  (with-redefs [ex/f (fn [x] (orig x))]"
                      "    (ex/f 1)))")))))
