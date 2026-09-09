(ns mage.nav-links-test
  "Tests for the pure parts of `docs/util/nav_links.clj`, the standalone script shared with CI.
  Requiring `mage.nav-links` `load-file`s that script, which defines the `nav-links` namespace."
  (:require
   [clj-yaml.core]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.nav-links]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private entries         (resolve 'nav-links/entries))
(def ^:private markdown        (resolve 'nav-links/markdown))
(def ^:private suggestions     (resolve 'nav-links/suggestions))
(def ^:private case-mismatches (resolve 'nav-links/case-mismatches))
(def ^:private with-nav-lines  (resolve 'nav-links/with-nav-lines))

(deftest entries-collects-relative-urls-with-trails
  (let [{:keys [links problems]} (entries [{:name  "Analytics"
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

(deftest entries-reports-structural-problems
  (let [{:keys [links problems]} (entries [{:url "no-name"}
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

(deftest with-nav-lines-finds-each-entry-in-the-yaml
  (let [text  (str/join "\n" ["categories:"
                              "  - name: A"
                              "    url: \"a/start\""
                              "    pages:"
                              "      - name: B"
                              "        url: 'b'"
                              "      - name: Dup"
                              "        url: a/start"
                              "      - {name: Inline, url: inline}"])
        links [{:url "a/start"} {:url "b"} {:url "a/start"} {:url "inline"}]]
    (testing "quoted, unquoted, and repeated urls map to their own line; unmatched urls get nil"
      (is (= [3 6 8 nil] (map :nav-line (with-nav-lines links text)))))
    (testing "the real nav.yml gives every link a line"
      (let [nav-text (slurp (io/file u/project-root-directory "docs/util/data/nav.yml"))
            links    (with-nav-lines (:links (entries (:categories (clj-yaml.core/parse-string nav-text)))) nav-text)]
        (is (seq links))
        (is (every? :nav-line links))))))

(deftest markdown-writes-one-link-per-line
  (testing "line N is link N, and brackets in names are escaped"
    (is (= "- [A > B \\[beta\\]](/questions/start)\n- [A > C](/questions/introduction#anchor)\n"
           (markdown [{:trail "A > B [beta]" :url "questions/start"}
                      {:trail "A > C" :url "questions/introduction#anchor"}])))))

(deftest suggestions-follow-redirects
  (let [index {"old/page" [{:url "new/page" :file "docs/new/page.md"}]}]
    (testing "trailing slash is ignored and the anchor is kept"
      (is (= [{:url "new/page#section" :file "docs/new/page.md"}]
             (suggestions index "old/page/#section"))))
    (is (empty? (suggestions index "unknown/page")))))

(deftest case-mismatches-detects-wrong-capitalization
  (let [right "questions/introduction"
        wrong "Questions/introduction"
        file  (io/file u/project-root-directory "docs" (str wrong ".md"))]
    (is (.exists (io/file u/project-root-directory "docs" (str right ".md"))))
    (testing "a correctly spelled url is never a mismatch"
      (is (empty? (case-mismatches [{:trail "A" :url right}]))))
    ;; Only a case-insensitive filesystem can resolve the wrong-case path at all.
    (when (.exists file)
      (testing "a wrong-case url is reported with the spelling on disk"
        (is (= [{:trail "A" :url (str wrong "#anchor") :actual right}]
               (case-mismatches [{:trail "A" :url (str wrong "#anchor")}])))))))

(deftest script-defines-no-mage-dependencies
  (testing "the standalone script only needs what babashka ships, since CI runs it without bb.edn"
    (let [requires (->> (slurp (io/file u/project-root-directory "docs/util/nav_links.clj"))
                        (re-seq #"\[([a-z][a-z0-9.-]*) :as")
                        (map second))]
      (is (seq requires))
      (is (empty? (filter #(str/starts-with? % "mage.") requires))))))
