(ns mage.security-lint-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.security-lint :as sec]
   [mage.util :as u]))

(deftest scan-opts-test
  (testing "arguments become paths, --sarif a file, --taint a policy keyword"
    (is (= {:paths ["src/a" "src/b"] :sarif-out "o.sarif" :taint-sources :any-local}
           (#'sec/scan-opts {:arguments ["src/a" "src/b"] :options {:sarif "o.sarif" :taint "any-local"}}))))
  (testing "nothing given means the defaults apply downstream"
    (is (= {} (#'sec/scan-opts {:arguments [] :options {}})))))

(deftest changed-files-map-to-only-files-test
  (testing "--branch and --uncommitted narrow the report through :only-files"
    (with-redefs [sec/changed-files (fn [mode _base] [(str "src/" (name mode) ".clj")])]
      (is (= {:only-files ["src/branch.clj"]}      (#'sec/scan-opts {:arguments [] :options {:branch true}})))
      (is (= {:only-files ["src/uncommitted.clj"]} (#'sec/scan-opts {:arguments [] :options {:uncommitted true}}))))))

(deftest branch-base-test
  (testing "--branch diffs against origin/master unless --base names another ref, as a PR check does"
    (let [seen (atom nil)]
      (with-redefs [u/updated-files (fn [target] (reset! seen target) ["src/a.clj"])]
        (sec/changed-files :branch nil)
        (is (= "origin/master...HEAD" @seen))
        (sec/changed-files :branch "abc123")
        (is (= "abc123...HEAD" @seen))))))

(deftest clojure-files-only-test
  (testing "the narrowing keeps Clojure sources and drops the rest; the regex once matched nothing at all"
    (with-redefs [u/updated-files (fn [_] ["src/a.clj" "src/b.cljc" "docs/c.md" "bb.edn"])]
      (is (= ["src/a.clj" "src/b.cljc"] (sec/changed-files :branch nil))))))
