(ns metabase-enterprise.library-branching.mutation-edits-test
  "Every mutation that a test namespace of library branching declares applies to the current source: each edit matches
  one form of its target. A rename in the source makes a pattern stale, and this test names it in seconds, with no test
  run. The mutation tests themselves give the stale mutation :invalid only after their tests ran."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.find :as ns.find]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.mutation.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(defn- module-test-namespaces
  "The symbols of the test namespaces in the directory of this file and its subdirectories."
  []
  (let [dir (.getParentFile (io/file (io/resource "metabase_enterprise/library_branching/mutation_edits_test.clj")))]
    (sort (filter #(str/ends-with? (name %) "-test") (ns.find/find-namespaces-in-dir dir)))))

(defn- mutation-list?
  "True iff `x` is a non-empty sequence of mutation declarations."
  [x]
  (and (sequential? x)
       (seq x)
       (every? #(and (map? %) (contains? % :target) (contains? % :edits)) x)))

(defn- declared-mutations
  "`[var mutation]` for each mutation in a var of the namespace `ns-sym` whose value is a list of mutations."
  [ns-sym]
  (for [v     (sort-by str (vals (ns-interns ns-sym)))
        :when (and (bound? v) (mutation-list? @v))
        m     @v]
    [v m]))

(defn- stale-edits
  "`[var mutation-name message]` for each of `declared` whose edits do not apply."
  [declared]
  (for [[v m] declared
        :let  [message (try (mut/preview m) nil
                            (catch Exception e (ex-message e)))]
        :when message]
    [v (:name m) message]))

(deftest mutation-edits-apply-test
  (let [nses (module-test-namespaces)]
    (apply require nses)
    (let [declared (mapcat declared-mutations nses)]
      (testing "the scan finds the mutations of the module"
        (is (some #{(resolve 'metabase-enterprise.library-branching.deploy-mutation-test/mutations)}
                  (map first declared))))
      (is (= [] (stale-edits declared))))))

(deftest ^:parallel stale-edits-test
  (testing "an edit that matches no form is stale, and the message names the target"
    (let [m {:name   :stale
             :doc    "The pattern is not in the source."
             :target `fixtures/clamp
             :edits  [[:replace '(no-such-form) nil]]}
          [[_ n message]] (stale-edits [[#'stale-edits-test m]])]
      (is (= :stale n))
      (is (re-find #"matches no form" message))
      (is (str/includes? message (str `fixtures/clamp)))))
  (testing "an edit that applies is not stale"
    (is (= [] (stale-edits [[#'stale-edits-test {:name   :fine
                                                 :doc    "The pattern is in the source."
                                                 :target `fixtures/clamp
                                                 :edits  [[:replace '(min hi x) 'x]]}]])))))
