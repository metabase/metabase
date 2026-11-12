(ns hooks.clojure.core.let-test
  (:require
   [clj-kondo.core :as kondo]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [hooks.test-util :as test-util]))

(set! *warn-on-reflection* true)

(defn- lint!
  "The `:metabase/dynamic-redefs-captured-proxy` findings from a real kondo run over `body-lines`.
   They follow an `ns` form that requires `metabase.test` as `mt`, `metabase.test.util.dynamic-redefs` as `dr`,
   `example.ns` as `ex` and `example.impl` as `impl`.
   That form takes five rows, so the first body line is row 6.
   With a `cache-dir`, kondo reads the namespaces linted into it, and otherwise it runs without a cache."
  [cache-dir body-lines]
  (let [src (str/join "\n" (concat ["(ns example-test"
                                    "  (:require [metabase.test :as mt]"
                                    "            [metabase.test.util.dynamic-redefs :as dr]"
                                    "            [example.ns :as ex]"
                                    "            [example.impl :as impl]))"]
                                   body-lines))]
    (->> (with-in-str src
           (kondo/run! {:lint       ["-"]
                        :filename   "example_test.clj"
                        :config-dir ".clj-kondo"
                        :cache      (boolean cache-dir)
                        :cache-dir  cache-dir}))
         :findings
         (filterv #(= :metabase/dynamic-redefs-captured-proxy (:type %))))))

(defn- findings!
  "Like [[lint!]], without a cache."
  [& body-lines]
  (lint! nil body-lines))

(defn- reexport-findings!
  "Like [[lint!]], once kondo has cached `example.impl`, which defines `f`, `example.ns`, which re-exports it with
   potemkin, and `example.top`, which re-exports `example.ns/f`."
  [& body-lines]
  (test-util/with-cached-sources!
    {"example/impl.clj" "(ns example.impl)\n(defn f [x] x)\n"
     "example/ns.clj"   (str "(ns example.ns\n  (:require [example.impl] [potemkin :as p]))\n"
                             "(p/import-vars [example.impl f])\n")
     "example/top.clj"  (str "(ns example.top\n  (:require [example.ns] [potemkin :as p]))\n"
                             "(p/import-vars [example.ns f])\n")}
    (fn [cache _dir]
      (lint! cache body-lines))))

(deftest flags-captured-var-test
  (testing "a let binding that captures a var the body redefines"
    (is (=? [{:row 6, :col 12}]
            (findings! "(let [orig ex/f]"
                       "  (mt/with-dynamic-fn-redefs [ex/f (fn [x] (orig x))]"
                       "    (ex/f 1)))")))))

(deftest flags-nested-redefs-test
  (testing "the redefinition can sit anywhere in the body, under the macro's own name too"
    (is (=? [{:row 6, :col 12}]
            (findings! "(let [orig ex/f]"
                       "  (testing \"x\""
                       "    (dr/with-dynamic-fn-redefs [ex/g identity"
                       "                                ex/f (fn [x] (orig x))]"
                       "      (ex/f 1))))")))))

(deftest flags-redefs-in-later-binding-test
  (testing "a redefinition in a later binding counts"
    (is (=? [{:row 6, :col 12}]
            (findings! "(let [orig ex/f"
                       "      r    (mt/with-dynamic-fn-redefs [ex/f (fn [x] (orig x))]"
                       "             (ex/f 1))]"
                       "  r)")))))

(deftest flags-deref-captures-test
  (testing "`@#'x` and `(deref #'x)` capture the var's value too"
    (is (=? [{:row 6, :col 12}
             {:row 9, :col 12}]
            (findings! "(let [orig @#'ex/f]"
                       "  (mt/with-dynamic-fn-redefs [ex/f (fn [x] (orig x))]"
                       "    (ex/f 1)))"
                       "(let [orig (deref #'ex/f)]"
                       "  (mt/with-dynamic-fn-redefs [ex/f (fn [x] (orig x))]"
                       "    (ex/f 1)))")))))

(deftest flags-captured-reexport-test
  (testing "a captured re-export calls what its source calls, so redefining the source counts"
    (is (=? [{:row 6, :col 12}]
            (reexport-findings! "(let [orig ex/f]"
                                "  (mt/with-dynamic-fn-redefs [impl/f (fn [x] (orig x))]"
                                "    (ex/f 1)))")))))

(deftest flags-captured-reexport-of-reexport-test
  (testing "a re-export of a re-export reaches the source too"
    (is (=? [{:row 6, :col 12}]
            (reexport-findings! "(let [orig example.top/f]"
                                "  (mt/with-dynamic-fn-redefs [impl/f (fn [x] (orig x))]"
                                "    (example.top/f 1)))")))))

(deftest flags-capture-through-later-locals-test
  (testing "a redefinition that reaches the capture through later locals"
    (is (=? [{:row 6, :col 19}]
            (findings! "(let [orig        ex/f"
                       "      wrapped     (fn [x] (orig x))"
                       "      replacement (fn [x] (wrapped x))]"
                       "  (mt/with-dynamic-fn-redefs [ex/f replacement]"
                       "    (ex/f 1)))")))))

(deftest message-test
  (testing "the message names the fix with the symbol as written"
    (is (=? [{:message #".*\(mt/original-fn #'ex/f\) instead.*"}]
            (findings! "(let [orig ex/f]"
                       "  (mt/with-dynamic-fn-redefs [ex/f (fn [x] (orig x))]"
                       "    (ex/f 1)))")))))

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

(deftest ignores-capture-used-outside-redefs-test
  (testing "outside the redefinition, the proxy calls the original"
    (is (= []
           (findings! "(let [orig ex/f]"
                      "  (mt/with-dynamic-fn-redefs [ex/f (constantly 2)]"
                      "    (ex/f 1))"
                      "  (orig 1))")))))

(deftest ignores-redefs-before-capture-test
  (testing "a redefinition in an earlier binding can't see the capture"
    (is (= []
           (findings! "(let [r    (mt/with-dynamic-fn-redefs [ex/f (constantly 2)]"
                      "             (ex/f 1))"
                      "      orig ex/f]"
                      "  (orig r))")))))

(deftest ignores-captured-source-test
  (testing "redefining a re-export only intercepts calls made through the re-export"
    (is (= []
           (reexport-findings! "(let [orig impl/f]"
                               "  (mt/with-dynamic-fn-redefs [ex/f (fn [x] (orig x))]"
                               "    (ex/f 1)))")))))
