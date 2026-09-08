(ns dev.security-lint-test
  (:require
   [clojure.test :refer :all]
   [dev.security-lint :as sec]))

(set! *warn-on-reflection* true)

(deftest failing-findings-test
  (testing "only :error findings fail a run -- notes and warnings are informational"
    (is (false? (sec/failing? [])))
    (is (false? (sec/failing? [{:severity :note} {:severity :warning}])))
    (is (true? (sec/failing? [{:severity :note} {:severity :error}])))))

(deftest summarize-test
  (testing "counts by severity, for the one-line summary"
    (is (= {:error 2 :note 1}
           (sec/summarize [{:severity :error} {:severity :error} {:severity :note}])))
    (is (= {} (sec/summarize [])))))

(deftest restrict-to-files-test
  (let [fs [{:file "/repo/src/a.clj"} {:file "/repo/src/b.clj"} {:file "/repo/./src/c.clj"}]]
    (testing "keeps findings in the named files, however either side is spelled"
      (is (= ["/repo/src/a.clj" "/repo/./src/c.clj"]
             (map :file (sec/restrict-to-files "/repo" ["src/a.clj" "./src/c.clj"] fs)))))
    (testing "an empty selection keeps nothing -- the caller decides whether that means no filter"
      (is (empty? (sec/restrict-to-files "/repo" [] fs))))))

(deftest reload-order-test
  (let [order (sec/reload-order)
        pos   (into {} (map-indexed (fn [i n] [n i]) order))
        before? (fn [a b] (< (pos a) (pos b)))]
    (testing "every linter namespace is included, and nothing else"
      (is (every? #(re-find #"^dev\.security-lint" (str %)) order))
      (is (contains? pos 'dev.security-lint.rules.crypto))
      (is (contains? pos 'dev.security-lint)))
    (testing "dependencies come first, so a reload in this order leaves no stale reference"
      (is (before? 'dev.security-lint.rule 'dev.security-lint.rules.crypto))
      (is (before? 'dev.security-lint.rules.crypto 'dev.security-lint.rules))
      (is (before? 'dev.security-lint.vocabulary 'dev.security-lint.callgraph))
      (is (before? 'dev.security-lint.engine 'dev.security-lint))
      (is (= 'dev.security-lint (last order))))))

(deftest reload-drops-stale-rules-test
  (testing "a rule that no longer exists on disk -- renamed, deleted, or registered under an old id -- is gone after a reload"
    (swap! dev.security-lint.rule/*registry* assoc :stale/gone {:id :stale/gone})
    (sec/reload!)
    (is (nil? (dev.security-lint.rule/by-id :stale/gone)))
    (is (pos? (count (dev.security-lint.rule/all))))))

(deftest default-paths-test
  (testing "driver modules are production source too -- druid-jdbc calls clj-http directly and was never scanned"
    (let [paths (sec/default-paths)]
      (is (some #{"src"} paths))
      (is (some #{"enterprise/backend/src"} paths))
      (is (some #(re-matches #"modules/drivers/[^/]+/src" %) paths))
      (is (every? #(.isDirectory (java.io.File. ^String %)) paths)))))
