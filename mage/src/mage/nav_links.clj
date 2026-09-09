(ns mage.nav-links
  "Checks that every url in docs/util/data/nav.yml points at a page (and anchor) under docs/.

  The heavy lifting is done by lychee, the same link checker CI runs over the docs body.
  `docs/util/nav_links.clj` renders the nav as a markdown list of links, lychee checks that file,
  and this namespace maps each failure back to its nav entry and suggests replacements from
  `redirect_from` frontmatter."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;; Load the standalone script so CI (which runs it directly, without bb.edn) and this task share
;; one implementation. It defines the `nav-links` namespace, which is resolved here at load time
;; because it is not on the classpath.
(load-file (str u/project-root-directory "/docs/util/nav_links.clj"))

(def ^:private read-nav        (resolve 'nav-links/read-nav))
(def ^:private markdown        (resolve 'nav-links/markdown))
(def ^:private redirect-index  (resolve 'nav-links/redirect-index))
(def ^:private suggestions     (resolve 'nav-links/suggestions))
(def ^:private case-mismatches (resolve 'nav-links/case-mismatches))

(def ^:private lychee-args
  ["--offline"
   "--root-dir" (str u/project-root-directory "/docs")
   "--fallback-extensions" "md,html"
   "--include-fragments"
   "--no-progress"])

(defn- run-lychee
  "Runs lychee on `markdown-file` and returns its failures as `[{:line :url :text}]`."
  [markdown-file]
  (let [{:keys [exit out err]} (apply shell/sh* {:quiet? true}
                                      "lychee" (concat lychee-args ["--format" "json" (str markdown-file)]))
        ;; lychee exits 2 for link errors and prints the JSON report either way.
        report (try
                 (json/read-str (str/join "\n" out))
                 (catch Exception _ nil))]
    (when-not report
      (u/exit (str/join "\n" (concat ["lychee did not produce a JSON report:"] out err)) (if (zero? exit) 1 exit)))
    (for [[_ failures] (:error_map report)
          {:keys [url status span]} failures]
      {:line (:line span) :url url :text (:text status)})))

(defn- location
  "Where the entry lives, as `docs/util/data/nav.yml:LINE  Trail > Of > Names`."
  [{:keys [trail nav-line]}]
  (str "docs/util/data/nav.yml" (when nav-line (str ":" nav-line)) "  " trail))

(defn- print-failure [{:keys [url] :as link} text index]
  (let [anchor? (str/includes? (str/lower-case (str text)) "fragment")]
    (println (c/red (if anchor? "ANCHOR   " "MISSING  ")) url)
    (println "         at:" (location link))
    (println "        " text)
    (when-not anchor?
      (let [replacements (suggestions index url)]
        (if (seq replacements)
          (doseq [{:keys [url file]} replacements]
            (println "         suggestion: url:" (c/green (pr-str url)) " (redirect_from in" (str file ")")))
          (println "         no redirect_from matches" (str "/docs/latest/" (first (str/split url #"#")))
                   "so the page may have been deleted; remove the entry or point it elsewhere"))))
    (println)))

(defn- print-case-mismatch [{:keys [url actual] :as link}]
  (println (c/red "CASE     ") url)
  (println "         at:" (location link))
  (println "         the page exists but with different capitalization; this passes on a case-insensitive"
           "filesystem and fails on the docs site")
  (println "         suggestion: url:" (c/green (pr-str actual)))
  (println))

(defn check-nav-links
  "Entry point for `./bin/mage docs-check-nav-links`."
  [_parsed]
  (when-not (binding [u/*skip-warning* true] (u/can-run? "lychee"))
    (u/exit (str (c/red "lychee is not installed.") " Install it with " (c/green "brew install lychee")
                 " (or see https://lychee.cli.rs/installation/).")
            1))
  (let [{:keys [links problems]} (read-nav)]
    (doseq [{:keys [trail message]} problems]
      (println (c/red "STRUCTURE") trail)
      (println "        " message)
      (println))
    (let [markdown-file (fs/create-temp-file {:prefix "nav-links" :suffix ".md"})
          failures      (try
                          (spit (str markdown-file) (markdown links))
                          (run-lychee markdown-file)
                          (finally
                            (fs/delete-if-exists markdown-file)))
          ;; lychee resolves paths through the filesystem, so on macOS it cannot see wrong-case urls.
          mismatches    (case-mismatches links)
          index         (delay (redirect-index))]
      (doseq [{:keys [line text]} (sort-by :line failures)]
        ;; Line N of the generated markdown is link N.
        (print-failure (nth links (dec line)) text @index))
      (doseq [mismatch mismatches]
        (print-case-mismatch mismatch))
      (let [n-bad-links (+ (count failures) (count mismatches))
            n-problems  (+ (count problems) n-bad-links)]
        (println (format "Checked %d nav urls: %d ok, %d problem%s"
                         (count links) (- (count links) n-bad-links) n-problems (if (= n-problems 1) "" "s")))
        (when (pos? n-problems)
          (u/exit 1))))))
