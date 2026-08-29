(ns metabase.core.kondo-ratchet-check-test
  "The Babashka check on the ignore budgets."
  (:require
   [clojure.java.io :as io]
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
  [ratchets occurrences text]
  (vec (kondo-ratchet/check-report ratchets occurrences text)))

(deftest ^:parallel clean-test
  (let [ratchets {:limits {:a 2, :b 1}}]
    (is (= []
           (report-lines ratchets (occurrences {:a 2, :b 1}) (kondo-ratchet/render ratchets))))))

(deftest ^:parallel over-budget-test
  (let [ratchets {:limits {:a 1}}]
    (is (= ["over budget -- remove an ignore, or seed the budget with `./bin/mage fix-kondo-ratchets --seed <linter>` and defend it in the PR:"
            "  :a: 1 recorded, 3 actual"
            "    f.clj:1"
            "    f.clj:2"
            "    f.clj:3"
            "  :new: 0 recorded, 1 actual"
            "    f.clj:1"]
           (report-lines ratchets (occurrences {:a 3, :new 1}) (kondo-ratchet/render ratchets)))
        "an unbudgeted linter counts as over a budget of 0")))

(deftest ^:parallel unlimited-test
  (let [ratchets {:limits {:bounded 1, :free :unlimited, :empty :unlimited}}]
    (is (= []
           (report-lines ratchets
                         (occurrences {:bounded 1, :free 2})
                         (kondo-ratchet/render ratchets)))
        "unlimited linters do not fail the CI report, even when their actual count reaches zero")))

(deftest ^:parallel stale-test
  (let [ratchets {:limits {:a 5, :gone 2}}]
    (is (= []
           (report-lines ratchets (occurrences {:a 3}) (kondo-ratchet/render ratchets))))))

(deftest ^:parallel not-normalized-test
  (let [ratchets {:limits {:a 1}}
        text     (kondo-ratchet/render ratchets)]
    (is (= [(str kondo-ratchet/*ratchets-file* " is not normalized -- run `./bin/mage fix-kondo-ratchets`"
                 " to fix the formatting")]
           (report-lines ratchets (occurrences {:a 1}) (str/replace text "{:a 1}" "{:a  1}")))
        "same data, different whitespace")))

(deftest ^:parallel combined-test
  (testing "over-budget and formatting problems are reported together"
    (let [ratchets {:limits {:over 1, :stale 2}}]
      (is (= ["over budget -- remove an ignore, or seed the budget with `./bin/mage fix-kondo-ratchets --seed <linter>` and defend it in the PR:"
              "  :over: 1 recorded, 2 actual"
              "    f.clj:1"
              "    f.clj:2"
              (str kondo-ratchet/*ratchets-file* " is not normalized -- run `./bin/mage fix-kondo-ratchets`"
                   " to fix the formatting")]
             (report-lines ratchets (occurrences {:over 2, :stale 1}) "{:limits {}}\n"))))))

(deftest check-disabled-test
  (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                          "kondo-ratchet-check-test"
                          (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets (doto (io/file dir "ratchets.edn") (spit "{:disabled true}\n"))]
    (binding [kondo-ratchet/*ratchets-file* (.getPath budgets)]
      (is (= (str (.getPath budgets) " is disabled -- nothing to check\n")
             (with-out-str (kondo-ratchet/check)))))))

(deftest check-missing-file-test
  (binding [kondo-ratchet/*ratchets-file* "target/does-not-exist/ratchets.edn"]
    (is (str/includes?
         (with-out-str
           (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                 #"only \{:disabled true\} opts out"
                                 (kondo-ratchet/check))))
         "is missing -- only {:disabled true} opts out of enforcement"))))
