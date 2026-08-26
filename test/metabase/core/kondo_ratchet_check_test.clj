(ns metabase.core.kondo-ratchet-check-test
  "The report behind `./bin/mage check-kondo-ratchets`, the babashka-only CI gate on the ignore budgets.
  Only the pure report is covered here; `check` itself is exercised by the CI job."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]))

(set! *warn-on-reflection* true)

(defn- occurrences
  "One single-linter ignore form per unit in `linter->count`, all in `f.clj` on successive lines."
  [linter->count]
  (for [[linter n] linter->count
        i          (range n)]
    {:file "f.clj", :line (inc i), :linters [linter]}))

(defn- report-lines
  [ignore-counts occurrences text]
  (vec (kondo-ratchet/check-report {:ignore-counts ignore-counts} occurrences text)))

(deftest ^:parallel clean-test
  (let [ratchets {:ignore-counts {:a 2, :b 1}}]
    (is (= []
           (report-lines (:ignore-counts ratchets) (occurrences {:a 2, :b 1}) (kondo-ratchet/render ratchets))))))

(deftest ^:parallel over-budget-test
  (let [ratchets {:ignore-counts {:a 1}}]
    (is (= ["over budget -- remove an ignore, or seed the budget with `./bin/mage fix-kondo-ratchets --seed <linter>` and defend it in the PR:"
            "  :a: 1 recorded, 3 actual"
            "    f.clj:1"
            "    f.clj:2"
            "    f.clj:3"
            "  :new: 0 recorded, 1 actual"
            "    f.clj:1"]
           (report-lines (:ignore-counts ratchets) (occurrences {:a 3, :new 1}) (kondo-ratchet/render ratchets)))
        "an unbudgeted linter counts as over a budget of 0")))

(deftest ^:parallel stale-test
  (let [ratchets {:ignore-counts {:a 5, :gone 2}}]
    (is (= ["stale -- run `./bin/mage fix-kondo-ratchets`, or label the PR kondo-ratchets-self-healing:"
            "  :a: 5 recorded, 3 actual"
            "  :gone: 2 recorded, 0 actual"]
           (report-lines (:ignore-counts ratchets) (occurrences {:a 3}) (kondo-ratchet/render ratchets))))))

(deftest ^:parallel not-normalized-test
  (let [ratchets {:ignore-counts {:a 1}}
        text     (kondo-ratchet/render ratchets)]
    (is (= [(str kondo-ratchet/ratchets-file " is not normalized -- run `./bin/mage fix-kondo-ratchets`"
                 " to fix the formatting")]
           (report-lines (:ignore-counts ratchets) (occurrences {:a 1}) (str/replace text "{:a 1}" "{:a  1}")))
        "same data, different whitespace")))

(deftest ^:parallel combined-test
  (testing "over-budget, stale, and formatting problems are reported together, in that order"
    (let [ratchets {:ignore-counts {:over 1, :stale 2}}]
      (is (= ["over budget -- remove an ignore, or seed the budget with `./bin/mage fix-kondo-ratchets --seed <linter>` and defend it in the PR:"
              "  :over: 1 recorded, 2 actual"
              "    f.clj:1"
              "    f.clj:2"
              "stale -- run `./bin/mage fix-kondo-ratchets`, or label the PR kondo-ratchets-self-healing:"
              "  :stale: 2 recorded, 1 actual"
              (str kondo-ratchet/ratchets-file " is not normalized -- run `./bin/mage fix-kondo-ratchets`"
                   " to fix the formatting")]
             (report-lines (:ignore-counts ratchets) (occurrences {:over 2, :stale 1}) "{:ignore-counts {}}\n"))))))
