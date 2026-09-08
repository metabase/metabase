(ns metabase.core.kondo-ratchet-check-test
  "The Babashka check on the ignore budgets."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]))

(set! *warn-on-reflection* true)

(defn- occurrences
  "Create the specified number of justified, single-linter ignores for each linter in `linter->count`."
  [linter->count]
  (for [[linter n] linter->count
        i          (range n)]
    {:file "f.clj", :line (inc i), :linters [linter], :justified? true}))

(defn- report-lines
  "Return [[kondo-ratchet/check-report]] output for `ratchets`. Supply the defaults that
  [[kondo-ratchet/read-ratchets]] adds to a partial file."
  ([ratchets occurrences text]
   (report-lines ratchets occurrences {} text))
  ([ratchets occurrences config-actual text]
   (vec (kondo-ratchet/check-report (merge {:config-counts {}, :comment-exempt #{}} ratchets)
                                    occurrences config-actual text))))

(deftest ^:parallel clean-test
  (let [ratchets {:ignore-counts {:a 2, :b 1}}]
    (is (= []
           (report-lines ratchets (occurrences {:a 2, :b 1}) (kondo-ratchet/render ratchets))))))

(deftest ^:parallel over-budget-test
  (let [ratchets {:ignore-counts {:a 1}}]
    (is (= ["over budget -- remove an ignore, or seed the budget with `./bin/mage kondo-ratchets-shrink --seed <linter>` and explain the increase in the PR:"
            "  :a: 1 recorded, 3 actual"
            "    f.clj:1"
            "    f.clj:2"
            "    f.clj:3"
            "  :new: 0 recorded, 1 actual"
            "    f.clj:1"]
           (report-lines ratchets (occurrences {:a 3, :new 1}) (kondo-ratchet/render ratchets)))
        "an unbudgeted linter counts as over a budget of 0")))

(deftest ^:parallel unlimited-test
  (let [ratchets {:ignore-counts {:bounded 1, :free :unlimited, :empty :unlimited}}]
    (is (= []
           (report-lines ratchets
                         (occurrences {:bounded 1, :free 2})
                         (kondo-ratchet/render ratchets)))
        "unlimited linters do not fail the CI report, even when their actual count reaches zero")))

(deftest ^:parallel unjustified-test
  (let [ratchets    {:ignore-counts {:a 3, :b 1, :grandfathered 1}, :comment-exempt #{:grandfathered}}
        occurrences [{:file "f.clj", :line 7,  :linters [:a],             :justified? false}
                     {:file "g.clj", :line 12, :linters [:a :b],          :justified? false}
                     {:file "g.clj", :line 20, :linters [:a],             :justified? true}
                     {:file "h.clj", :line 3,  :linters [:grandfathered], :justified? false}]]
    (is (= ["ignores without required comments -- add a `;;` comment above the form or at the end of the same line, explaining why the suppression is necessary:"
            "  f.clj:7 [:a]"
            "  g.clj:12 [:a :b]"]
           (report-lines ratchets occurrences (kondo-ratchet/render ratchets)))
        "a commented ignore passes, and so does an uncommented one whose every linter is exempt")))

(deftest ^:parallel config-over-budget-test
  (let [ratchets {:ignore-counts {}, :config-counts {:a 1, :b 2}}]
    (is (= ["config suppressions over budget -- remove the entry from .clj-kondo/config.edn, or raise the budget manually and explain the increase in the PR:"
            "  :a: 1 recorded, 2 actual"
            "  :new: 0 recorded, 1 actual"]
           (report-lines ratchets [] {:a 2, :b 1, :new 1} (kondo-ratchet/render ratchets)))
        "a lowered config count passes; growth and new entries are reported")))

(defn- check-with!
  "Output lines of [[kondo-ratchet/check]] against `ratchets` written to a temp file, with `occurrences`
  standing in for the tree scan; `:thrown?` says whether it failed."
  [ratchets occurrences]
  (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                          "kondo-ratchet-check-test"
                          (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets (doto (io/file dir "ratchets.edn")
                  (spit (kondo-ratchet/render (merge {:config-counts {}, :comment-exempt #{}} ratchets))))
        thrown? (atom false)]
    (binding [kondo-ratchet/*ratchets-file* (.getPath budgets)]
      (with-redefs [kondo-ratchet/known-linters (constantly (set (keys (:ignore-counts ratchets))))
                    kondo-ratchet/config-suppressions (constantly {})
                    kondo-ratchet/scan          (constantly occurrences)]
        {:lines   (str/split-lines
                   (with-out-str
                     (try
                       (kondo-ratchet/check)
                       (catch clojure.lang.ExceptionInfo _
                         (reset! thrown? true)))))
         :thrown? @thrown?}))))

(deftest check-reports-empty-unlimited-test
  (let [ratchets {:ignore-counts {:z-empty :unlimited, :a-empty :unlimited, :free :unlimited, :over 1}}]
    (is (= {:lines   ["WARNING: :unlimited policies with no ignores left: :a-empty, :z-empty -- delete an entry by hand once its linter no longer needs one"
                      "ok -- 2 ignore forms within 4 policies"]
            :thrown? false}
           (check-with! ratchets (occurrences {:free 1, :over 1})))
        "the warning comes first, sorted, and does not fail the check")
    (is (= {:lines   ["WARNING: :unlimited policies with no ignores left: :a-empty, :z-empty -- delete an entry by hand once its linter no longer needs one"
                      "over budget -- remove an ignore, or seed the budget with `./bin/mage kondo-ratchets-shrink --seed <linter>` and explain the increase in the PR:"
                      "  :over: 1 recorded, 2 actual"
                      "    f.clj:1"
                      "    f.clj:2"]
            :thrown? true}
           (check-with! ratchets (occurrences {:free 1, :over 2})))
        "a real failure still fails, after the warning")
    (is (= {:lines   ["ok -- 4 ignore forms within 4 policies"]
            :thrown? false}
           (check-with! ratchets (occurrences {:z-empty 1, :a-empty 1, :free 1, :over 1})))
        "no warning when every unlimited policy is in use")))

(deftest check-reports-stale-exemptions-test
  (let [ratchets    {:ignore-counts  {:grandfathered 1, :none-left 1, :still-needed 1}
                     :comment-exempt #{:grandfathered :none-left :still-needed}}
        occurrences [{:file "f.clj", :line 1, :linters [:grandfathered], :justified? true}
                     {:file "g.clj", :line 1, :linters [:still-needed], :justified? false}]]
    (is (= {:lines   ["WARNING: :comment-exempt is no longer needed for these linters: :grandfathered, :none-left -- delete the stale entries by hand"
                      "ok -- 2 ignore forms within 3 policies"]
            :thrown? false}
           (check-with! ratchets occurrences))
        "exemptions with only commented ignores or no ignores are named, and do not fail the check")))

(deftest ^:parallel stale-test
  (let [ratchets {:ignore-counts {:a 5, :gone 2}}]
    (is (= []
           (report-lines ratchets (occurrences {:a 3}) (kondo-ratchet/render ratchets))))))

(deftest ^:parallel not-normalized-test
  (let [ratchets {:ignore-counts {:a 1}}
        text     (kondo-ratchet/render ratchets)]
    (is (= [(str kondo-ratchet/*ratchets-file* " is not normalized -- run `./bin/mage kondo-ratchets-shrink`"
                 " to fix the formatting")]
           (report-lines ratchets (occurrences {:a 1}) (str/replace text "{:a 1}" "{:a  1}")))
        "same data, different whitespace")))

(deftest ^:parallel combined-test
  (testing "over-budget and formatting problems are reported together"
    (let [ratchets {:ignore-counts {:over 1, :stale 2}}]
      (is (= ["over budget -- remove an ignore, or seed the budget with `./bin/mage kondo-ratchets-shrink --seed <linter>` and explain the increase in the PR:"
              "  :over: 1 recorded, 2 actual"
              "    f.clj:1"
              "    f.clj:2"
              (str kondo-ratchet/*ratchets-file* " is not normalized -- run `./bin/mage kondo-ratchets-shrink`"
                   " to fix the formatting")]
             (report-lines ratchets (occurrences {:over 2, :stale 1}) "{:ignore-counts {}}\n"))))))

(deftest check-disabled-test
  (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                          "kondo-ratchet-check-test"
                          (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets (doto (io/file dir "ratchets.edn") (spit "{:disabled true}\n"))]
    (binding [kondo-ratchet/*ratchets-file* (.getPath budgets)]
      (is (= (str (.getPath budgets) " is disabled -- nothing to check\n")
             (with-out-str (kondo-ratchet/check)))))))

(deftest check-unknown-linter-test
  (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                          "kondo-ratchet-check-test"
                          (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets (doto (io/file dir "ratchets.edn")
                  (spit (kondo-ratchet/render {:ignore-counts  {:a 1, :bogus 1}
                                               :config-counts  {}
                                               :comment-exempt #{}})))]
    (binding [kondo-ratchet/*ratchets-file* (.getPath budgets)]
      (with-redefs [kondo-ratchet/known-linters (constantly #{:a})]
        (let [out (with-out-str
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"names 1 unknown linter: :bogus"
                                          (kondo-ratchet/check))))]
          (is (str/includes? out (str (.getPath budgets) " names 1 unknown linter: :bogus -- policies must name"))
              "the message is printed for the task output, then the task exits nonzero"))))))

(deftest check-missing-file-test
  (binding [kondo-ratchet/*ratchets-file* "target/does-not-exist/ratchets.edn"]
    (is (str/includes?
         (with-out-str
           (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                 #"only \{:disabled true\} opts out"
                                 (kondo-ratchet/check))))
         "is missing -- only {:disabled true} opts out of enforcement"))))
