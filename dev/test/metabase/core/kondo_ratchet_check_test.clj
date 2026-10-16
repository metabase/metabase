(ns metabase.core.kondo-ratchet-check-test
  "Tests for the Babashka ratchet check."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- occurrences
  "Create the specified number of justified, single-linter ignores for each linter in `linter->count`."
  [linter->count]
  (for [[linter n] linter->count
        i          (range n)]
    {:file "f.clj", :line (inc i), :linters [linter], :justified? true}))

(defn- report-lines
  "Return [[kondo-ratchet/check-report]] output for `ratchets`. Supply the defaults that
  [[kondo-ratchet/read-ratchets]] adds to a partial file. `ratchets` may also carry the module ratchets as
  `:module-counts` and the `:attribute` result as `:attribution`."
  ([ratchets occurrences text]
   (report-lines ratchets occurrences {} text))
  ([ratchets occurrences config-actual text]
   (report-lines ratchets occurrences config-actual {} text))
  ([ratchets occurrences config-actual module-actual text]
   (let [module-ratchets (:module-counts ratchets {})
         attribution     (merge {:actual {}, :unresolved []} (:attribution ratchets))]
     (vec (kondo-ratchet/check-report (-> {:config-counts {}, :comment-exempt #{}}
                                          (merge ratchets)
                                          (dissoc :module-counts :attribution))
                                      module-ratchets occurrences attribution config-actual module-actual text
                                      (kondo-ratchet/render-module-ratchets module-ratchets))))))

(deftest ^:parallel clean-test
  (let [ratchets {:ignore-counts {:a 2, :b 1}}]
    (is (= []
           (report-lines ratchets (occurrences {:a 2, :b 1}) (kondo-ratchet/render ratchets))))))

(deftest ^:parallel stale-flat-discouraged-entry-test
  (let [ratchets {:ignore-counts {:discouraged-var 3, :a 1}}]
    (is (= [(str ":ignore-counts still has a flat budget for :discouraged-var -- each now has its own field "
                 "(:discouraged-var-counts); run `./bin/mage kondo-ratchets-shrink` to drop the stale entry")]
           (report-lines ratchets (occurrences {:discouraged-var 3, :a 1}) (kondo-ratchet/render ratchets)))
        "a flat entry for a linter with its own per-symbol field fails the check even when its count
         happens to match, since nothing reads it and it would only mislead")))

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

(deftest ^:parallel discouraged-counts-over-budget-test
  (let [ratchets {:ignore-counts                {}
                  :discouraged-var-counts       {:a/x 1}
                  :discouraged-namespace-counts {:some.ns 1}
                  :attribution                  {:actual {:discouraged-var       {:a/x 2, :a/new 1}
                                                          :discouraged-namespace {:some.ns 3}}}}]
    (is (= ["discouraged-namespace symbols over budget -- remove an ignore, or seed the symbol's budget with `./bin/mage kondo-ratchets-shrink --seed <name below>` and explain the increase in the PR:"
            "  :discouraged-namespace/some.ns: 1 recorded, 3 actual"
            "discouraged-var symbols over budget -- remove an ignore, or seed the symbol's budget with `./bin/mage kondo-ratchets-shrink --seed <name below>` and explain the increase in the PR:"
            "  :discouraged-var/a/new: 0 recorded, 1 actual"
            "  :discouraged-var/a/x: 1 recorded, 2 actual"]
           (report-lines ratchets [] (kondo-ratchet/render ratchets)))
        "each field reports its over-budget symbols by their own seed name")))

(deftest ^:parallel unresolved-discouraged-finding-test
  (let [ratchets {:ignore-counts {}
                  :attribution   {:unresolved [{:file "f.clj", :line 3, :linters [:discouraged-var]}]}}]
    (is (= ["ignored discouraged-var/namespace findings with no per-symbol budget -- they can't be budgeted, so remove the ignore or the usage:"
            "  f.clj:3: :discouraged-var finding not resolved to a configured symbol"]
           (report-lines ratchets [] (kondo-ratchet/render ratchets))))))

(deftest ^:parallel module-over-budget-test
  (let [ratchets {:ignore-counts {}, :module-counts {:api-any 1, :friend-edges 3}}]
    (is (= ["module escape hatches over budget -- remove one from .clj-kondo/config/modules/config.edn, or raise the budget manually and explain the increase in the PR:"
            "  :api-any: 1 recorded, 2 actual"
            "  :uses-any: 0 recorded, 1 actual"]
           (report-lines ratchets
                         []
                         {}
                         {:api-any 2, :friend-edges 2, :uses-any 1}
                         (kondo-ratchet/render ratchets)))
        "lower counts pass; growth and new metrics are reported")))

(defn- check-with!
  "Output lines of [[kondo-ratchet/check]] against `ratchets` written to a temp file, with `occurrences`
  standing in for the tree scan and `opts` passed to it; `:thrown?` says whether it failed. `:test-counts`
  stands in for the test ratchets file, defaulting to an empty (clean) budget; `{:disabled true}` there is
  honored."
  [ratchets occurrences & [opts]]
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-check-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        test-ratchets (:test-counts ratchets {})
        budgets      (doto (io/file dir "ratchets.edn")
                       (spit (kondo-ratchet/render (merge {:config-counts {}, :comment-exempt #{}}
                                                          (dissoc ratchets :module-counts :test-counts)))))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets (:module-counts ratchets {}))))
        test-budgets (doto (io/file dir "ratchets-test.edn")
                       (spit (if (:disabled test-ratchets)
                               "{:disabled true}\n"
                               (kondo-ratchet/render-test (merge {:ignore-counts {}, :comment-exempt #{}}
                                                                 test-ratchets)))))
        thrown?      (atom false)]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters (constantly (into (set (keys (:ignore-counts ratchets)))
                                                                                (keys (:ignore-counts test-ratchets))))
                                  kondo-ratchet/config-suppressions (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {})
                                  kondo-ratchet/scan          (constantly occurrences)]
        {:lines   (str/split-lines
                   (with-out-str
                     (try
                       (kondo-ratchet/check opts)
                       (catch clojure.lang.ExceptionInfo _
                         (reset! thrown? true)))))
         :thrown? @thrown?}))))

(deftest check-reports-empty-unlimited-test
  (let [ratchets {:ignore-counts {:z-empty :unlimited, :a-empty :unlimited, :free :unlimited, :over 1}}]
    (is (= {:lines   ["WARNING: :unlimited policies with no ignores left: :a-empty, :z-empty -- delete an entry by hand once its linter no longer needs one"
                      "ok -- 2 ignore forms within 4 policies"
                      "ok -- 0 test ignore forms within 0 test policies"]
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
    (is (= {:lines   ["ok -- 4 ignore forms within 4 policies"
                      "ok -- 0 test ignore forms within 0 test policies"]
            :thrown? false}
           (check-with! ratchets (occurrences {:z-empty 1, :a-empty 1, :free 1, :over 1})))
        "no warning when every unlimited policy is in use")))

(deftest check-reports-stale-exemptions-test
  (let [ratchets    {:ignore-counts  {:grandfathered 1, :none-left 1, :still-needed 1}
                     :comment-exempt #{:grandfathered :none-left :still-needed}}
        occurrences [{:file "f.clj", :line 1, :linters [:grandfathered], :justified? true}
                     {:file "g.clj", :line 1, :linters [:still-needed], :justified? false}]]
    (is (= {:lines   ["WARNING: :comment-exempt is no longer needed for these linters: :grandfathered, :none-left -- delete the stale entries by hand"
                      "ok -- 2 ignore forms within 3 policies"
                      "ok -- 0 test ignore forms within 0 test policies"]
            :thrown? false}
           (check-with! ratchets occurrences))
        "exemptions with only commented ignores or no ignores are named, and do not fail the check")))

;;;; ---------------------------------------------------------------------------
;;;; Prod/test split
;;;; ---------------------------------------------------------------------------

(deftest check-splits-prod-and-test-occurrences-test
  (let [ratchets    {:ignore-counts {:a 1}
                     :test-counts   {:ignore-counts {:a 1}}}
        occurrences [{:file "src/f.clj",  :line 1, :linters [:a], :justified? true}
                     {:file "test/g.clj", :line 1, :linters [:a], :justified? true}
                     {:file "test/h.clj", :line 2, :linters [:a], :justified? true}]]
    (is (= {:lines   ["over budget -- remove an ignore, or seed the budget with `./bin/mage kondo-ratchets-shrink --seed <linter>` and explain the increase in the PR:"
                      "  :a: 1 recorded, 2 actual"
                      "    test/g.clj:1"
                      "    test/h.clj:2"]
            :thrown? true}
           (check-with! ratchets occurrences))
        "one prod occurrence stays within the prod budget; the two test occurrences alone blow the
         test budget, independent of the prod count")))

(deftest check-test-ratchets-disabled-test
  (let [ratchets    {:ignore-counts {}
                     :test-counts   {:disabled true}}
        occurrences [{:file "test/g.clj", :line 1, :linters [:unbudgeted], :justified? true}]]
    (is (= {:lines [(str "ok -- 0 ignore forms within 0 policies")], :thrown? false}
           (check-with! ratchets occurrences))
        "a disabled test-ratchets file opts the test tree out of enforcement, even with an unbudgeted
         test-only linter")))

(deftest check-discouraged-attribution-test
  (let [ratchets         {:ignore-counts {}}
        occurrences      [{:file "f.clj", :line 1, :linters [:discouraged-var], :justified? true}]
        attribution      {:actual {}, :unattributed [], :unresolved []}
        ;; check attributes the prod and test occurrences in one call; only the prod ones carry anything here
        with-attribution (fn [m] {:attribute (constantly [(merge attribution m) attribution])})
        finding-at       (fn [line] [{:file "f.clj", :line line, :linters [:discouraged-var]}])]
    (testing "without an :attribute, a discouraged-var ignore fails instead of counting as zero"
      (is (=? {:lines   [#"attributing :discouraged-var/:discouraged-namespace ignores needs a kondo run.*"]
               :thrown? true}
              (check-with! ratchets occurrences))))
    (testing "an ignore covering no finding warns without failing"
      (is (= {:lines   ["WARNING: f.clj:1 ignores :discouraged-var but kondo reports no such finding under it -- probably stale, under a nested ignore for the same linter, or in a reader branch kondo skips"
                        "ok -- 1 ignore forms within 0 policies"
                        "ok -- 0 test ignore forms within 0 test policies"]
              :thrown? false}
             (check-with! ratchets occurrences
                          (with-attribution {:unattributed (finding-at 1)})))))
    (testing "a finding with no configured symbol fails"
      (is (=? {:lines   ["ignored discouraged-var/namespace findings with no per-symbol budget -- they can't be budgeted, so remove the ignore or the usage:"
                         "  f.clj:2: :discouraged-var finding not resolved to a configured symbol"]
               :thrown? true}
              (check-with! ratchets occurrences
                           (with-attribution {:unresolved (finding-at 2)})))))))

(deftest check-unconfigured-budget-test
  (let [ratchets {:ignore-counts {:a 1}, :discouraged-var-counts {:a/gone 2, :a/x 1}}]
    (mt/with-dynamic-fn-redefs [kondo-ratchet/discouraged-count-keys (constantly #{:a/x})]
      (is (=? {:lines   [#"WARNING: .*ratchets\.edn budgets :discouraged-var symbols no longer configured in \.clj-kondo/config\.edn: :a/gone -- `\./bin/mage kondo-ratchets-shrink` drops them"
                         "ok -- 1 ignore forms within 3 policies"
                         "ok -- 0 test ignore forms within 0 test policies"]
               :thrown? false}
              (check-with! ratchets (occurrences {:a 1})))
          "a budget for a symbol removed from the config warns without failing, and the policy count
           includes the per-symbol budgets"))))

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
      (mt/with-dynamic-fn-redefs
        [kondo-ratchet/known-linters         #(throw (AssertionError. "read the known linters"))
         kondo-ratchet/scan                  #(throw (AssertionError. "scanned the source tree"))
         kondo-ratchet/config-suppressions   #(throw (AssertionError. "counted config suppressions"))
         kondo-ratchet/module-escape-hatches #(throw (AssertionError. "counted module escape hatches"))]
        (is (= (str (.getPath budgets) " is disabled -- nothing to check\n")
               (with-out-str (kondo-ratchet/check))))))))

(deftest check-unknown-linter-test
  (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                          "kondo-ratchet-check-test"
                          (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets (doto (io/file dir "ratchets.edn")
                  (spit (kondo-ratchet/render {:ignore-counts  {:a 1, :bogus 1}
                                               :config-counts  {}
                                               :comment-exempt #{}})))]
    (binding [kondo-ratchet/*ratchets-file* (.getPath budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters (constantly #{:a})]
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

(deftest check-unknown-linter-in-test-file-names-the-right-file-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-check-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets      (doto (io/file dir "ratchets.edn")
                       (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {}, :comment-exempt #{}})))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (doto (io/file dir "ratchets-test.edn")
                       (spit (kondo-ratchet/render-test {:ignore-counts {:bogus 1}, :comment-exempt #{}})))]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters (constantly #{})]
        (let [out (with-out-str
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"names 1 unknown linter: :bogus"
                                          (kondo-ratchet/check))))]
          (is (str/includes? out (str (.getPath test-budgets) " names 1 unknown linter: :bogus"))
              "the test file is named, not the prod file")
          (is (not (str/includes? out (.getPath budgets)))
              "the prod file is never mentioned"))))))

(deftest check-rejects-nonempty-test-config-counts-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-check-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets      (doto (io/file dir "ratchets.edn")
                       (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {}, :comment-exempt #{}})))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (doto (io/file dir "ratchets-test.edn")
                       (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {:a 1}, :comment-exempt #{}})))]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters (constantly #{:a})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              (re-pattern (str (java.util.regex.Pattern/quote (.getPath test-budgets))
                                               " must not set :config-counts -- config-level suppressions"
                                               " are tracked only in "
                                               (java.util.regex.Pattern/quote (.getPath budgets))))
                              (kondo-ratchet/check)))))))

(deftest check-flags-a-test-file-in-prod-format-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-check-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        empty-policy {:ignore-counts {}, :config-counts {}, :comment-exempt #{}}
        budgets      (doto (io/file dir "ratchets.edn") (spit (kondo-ratchet/render empty-policy)))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (doto (io/file dir "ratchets-test.edn") (spit (kondo-ratchet/render empty-policy)))]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters         (constantly #{})
                                  kondo-ratchet/scan                  (constantly [])
                                  kondo-ratchet/config-suppressions   (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {})]
        (let [out (with-out-str
                    (is (thrown? clojure.lang.ExceptionInfo (kondo-ratchet/check))))]
          (is (= [(str (.getPath test-budgets) " is not normalized -- run `./bin/mage kondo-ratchets-shrink`"
                       " to fix the formatting")]
                 (str/split-lines out))
              "the prod header and an empty :config-counts are not the test file's canonical text"))))))
