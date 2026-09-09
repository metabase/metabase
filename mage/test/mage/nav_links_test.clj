(ns mage.nav-links-test
  "Tests for the pure parts of `docs/util/nav_links.clj`, the standalone script CI runs without bb.edn,
  plus the report formatting in [[mage.nav-links]]."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.nav-links]
   [mage.util :as u]
   [nav-links :as nav]))

(set! *warn-on-reflection* true)

(def ^:private summary #'mage.nav-links/summary)

(deftest entries-collects-relative-urls-with-trails-test
  (let [{:keys [links problems]}
        (nav/entries [{:name  "Analytics"
                       :pages [{:name "Getting started" :url "/learn/getting-started"}
                               {:name "Docs home" :url "https://www.metabase.com/docs"}
                               {:name  "Questions"
                                :url   "questions/start"
                                :pages [{:name "Editor" :url "questions/query-builder/editor#top"}]}]}])]
    (testing "external and site-absolute urls are skipped"
      (is (= ["questions/start" "questions/query-builder/editor#top"] (map :url links))))
    (testing "each link carries its breadcrumb trail"
      (is (= ["Analytics > Questions" "Analytics > Questions > Editor"] (map :trail links))))
    (is (empty? problems))))

(deftest entries-reports-structural-problems-test
  (let [{:keys [links problems]} (nav/entries [{:url "no-name"}
                                               {:name "Nothing"}
                                               {:name "Bad url" :url 42}
                                               {:name "Bad pages" :pages "questions/start"}
                                               "not a map"])]
    (testing "an unnamed entry's url is still checked"
      (is (= ["no-name"] (map :url links))))
    (is (= ["(unnamed): entry has no `name`"
            "Nothing: entry has neither `url` nor `pages`"
            "Bad url: `url` must be a string, got 42"
            "Bad pages: `pages` must be a list"
            "(top level): entry is not a map: \"not a map\""]
           (map (fn [{:keys [trail message]}] (str trail ": " message)) problems)))))

(def ^:private sample-nav-text
  (str/join "\n" ["categories:"
                  "  - name: A"
                  "    url: \"a/start\""
                  "    pages:"
                  "      - name: B"
                  "        url: 'b'"
                  "      - name: Dup"
                  "        url: a/start"
                  "      - {name: Inline, url: inline}"]))

(deftest url-line-numbers-test
  (testing "quoted and unquoted urls are found, and a repeated url keeps every line"
    (is (= {"a/start" [3 8] "b" [6]}
           (nav/url-line-numbers sample-nav-text)))))

(deftest with-nav-lines-test
  (testing "repeated urls map to their own line in order; urls the scan cannot find get nil"
    (is (= [3 6 8 nil]
           (map :nav-line (nav/with-nav-lines [{:url "a/start"} {:url "b"} {:url "a/start"} {:url "inline"}]
                            sample-nav-text))))))

(deftest with-nav-lines-covers-the-real-nav-test
  (let [nav-text (slurp (io/file u/project-root-directory "docs/util/data/nav.yml"))
        links    (nav/with-nav-lines (:links (nav/entries (:categories (yaml/parse-string nav-text)))) nav-text)]
    (is (seq links))
    (is (every? :nav-line links))))

(deftest markdown-writes-one-link-per-line-test
  (testing "line N is link N, and brackets in names are escaped"
    (is (= "- [A > B \\[beta\\]](/questions/start)\n- [A > C](/questions/introduction#anchor)\n"
           (nav/markdown [{:trail "A > B [beta]" :url "questions/start"}
                          {:trail "A > C" :url "questions/introduction#anchor"}])))))

(deftest page-path-test
  (is (= "questions/start" (nav/page-path "questions/start/#anchor")))
  (is (= "questions/start" (nav/page-path "questions/start"))))

(deftest suggestions-follow-redirects-test
  (let [index {"old/page" [{:url "new/page" :file "docs/new/page.md"}]}]
    (testing "trailing slash is ignored and the anchor is kept"
      (is (= [{:url "new/page#section" :file "docs/new/page.md"}]
             (nav/suggestions index "old/page/#section"))))
    (is (empty? (nav/suggestions index "unknown/page")))))

(deftest case-mismatches-ignores-correct-urls-test
  (is (.exists (io/file u/project-root-directory "docs/questions/introduction.md")))
  (is (empty? (nav/case-mismatches [{:trail "A" :url "questions/introduction"}]))))

(deftest case-mismatches-on-case-insensitive-filesystems-test
  ;; Only a case-insensitive filesystem (macOS, Windows) can resolve the wrong-case path at all, so this
  ;; test has nothing to assert on Linux.
  (let [right "questions/introduction"
        wrong "Questions/introduction"]
    (when (.exists (io/file u/project-root-directory "docs" (str wrong ".md")))
      (testing "a wrong-case url is reported with the spelling on disk"
        (is (= [{:trail "A" :url (str wrong "#anchor") :actual right}]
               (nav/case-mismatches [{:trail "A" :url (str wrong "#anchor")}])))))))

(deftest summary-test
  (is (= "Checked 3 nav urls: 3 ok, 0 problems" (summary {:links 3 :failures 0 :mismatches 0 :problems 0})))
  (is (= "Checked 3 nav urls: 2 ok, 1 problem" (summary {:links 3 :failures 1 :mismatches 0 :problems 0})))
  (testing "structure problems count as problems but not as bad urls"
    (is (= "Checked 3 nav urls: 1 ok, 3 problems" (summary {:links 3 :failures 1 :mismatches 1 :problems 1})))))

(deftest script-has-no-mage-dependencies-test
  (testing "the standalone script only needs what babashka ships, since CI runs it without bb.edn"
    (let [requires (->> (slurp (io/file u/project-root-directory "docs/util/nav_links.clj"))
                        (re-seq #"\[([a-z][a-z0-9.-]*) :as")
                        (map second))]
      (is (seq requires))
      (is (empty? (filter #(str/starts-with? % "mage.") requires))))))
