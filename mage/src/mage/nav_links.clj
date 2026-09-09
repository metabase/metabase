(ns mage.nav-links
  "`./bin/mage docs-check-nav-links`: runs lychee over the markdown that `docs/util/nav_links.clj`
  renders from the nav, maps each failure back to its nav entry, and suggests replacements."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]
   [nav-links :as nav]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ lychee --------------------------------------------------------

(def ^:private lychee-args
  ["--offline"
   "--root-dir" (str u/project-root-directory "/docs")
   "--fallback-extensions" "md,html"
   "--include-fragments"
   "--no-progress"])

(defn- lychee-failure
  "One entry of lychee's JSON `error_map` as `{:line :url :text :anchor?}`. `:anchor?` is true when
  the page exists but its `#fragment` does not."
  [{:keys [url status span]}]
  {:line    (:line span)
   :url     url
   :text    (:text status)
   :anchor? (str/includes? (str/lower-case (str (:text status))) "fragment")})

(defn- run-lychee!
  "Runs lychee on `markdown-file` and returns its failures, see [[lychee-failure]]."
  [markdown-file]
  (let [{:keys [exit out err]} (apply shell/sh* {:quiet? true}
                                      "lychee" (concat lychee-args ["--format" "json" (str markdown-file)]))
        ;; lychee exits 2 for link errors and prints the JSON report either way.
        report (try
                 (json/read-str (str/join "\n" out))
                 (catch Exception _ nil))]
    (when-not report
      (u/exit (str/join "\n" (concat ["lychee did not produce a JSON report:"] out err))
              (if (zero? exit) 1 exit)))
    (for [[_ failures] (:error_map report)
          failure      failures]
      (lychee-failure failure))))

(defn- lychee-failures!
  "Renders `links` as markdown in a temp file, runs lychee on it, and returns the failures by line."
  [links]
  (let [markdown-file (fs/create-temp-file {:prefix "nav-links" :suffix ".md"})]
    (try
      (spit (str markdown-file) (nav/markdown links))
      (sort-by :line (run-lychee! markdown-file))
      (finally
        (fs/delete-if-exists markdown-file)))))

;;; ------------------------------------------------ report --------------------------------------------------------

(defn- location
  "Where the entry lives in the nav file, as `docs/util/data/nav.yml:LINE`."
  [{:keys [nav-line]}]
  (str "docs/util/data/nav.yml" (when nav-line (str ":" nav-line))))

(defn- print-location [{:keys [trail] :as link}]
  (println "         at:" (location link))
  (println "         in:" trail))

(defn- print-structure-problem [{:keys [trail message]}]
  (println (c/red "STRUCTURE") trail)
  (println "        " message)
  (println))

(defn- print-suggestions
  "Prints the replacement urls for a missing `url` from the redirect `index`, or a hint when there are none."
  [index url]
  (let [replacements (nav/suggestions index url)]
    (if (seq replacements)
      (doseq [{:keys [url file]} replacements]
        (println "         suggestion: url:" (c/green (pr-str url)) " (redirect_from in" (str file ")")))
      (println "         no redirect_from matches" (str "/docs/latest/" (nav/page-path url))
               "so the page may have been deleted; remove the entry or point it elsewhere"))))

(defn- print-failure
  "Prints one lychee `failure` for its nav `link`. `index` is a delay of [[nav/redirect-index]]."
  [{:keys [url] :as link} {:keys [text anchor?]} index]
  (println (c/red (if anchor? "ANCHOR   " "MISSING  ")) url)
  (print-location link)
  (println "        " text)
  (when-not anchor?
    (print-suggestions @index url))
  (println))

(defn- print-case-mismatch [{:keys [url actual] :as link}]
  (println (c/red "CASE     ") url)
  (print-location link)
  (println "         the page exists but with different capitalization; this passes on a case-insensitive"
           "filesystem and fails on the docs site")
  (println "         suggestion: url:" (c/green (pr-str actual)))
  (println))

(defn- summary
  "The closing `Checked N nav urls: N ok, N problems` line, from the `counts` of links, lychee failures,
  case mismatches, and structure problems."
  [{:keys [links failures mismatches problems] :as _counts}]
  (let [bad-links  (+ failures mismatches)
        n-problems (+ problems bad-links)]
    (format "Checked %d nav urls: %d ok, %d problem%s"
            links (- links bad-links) n-problems (if (= n-problems 1) "" "s"))))

;;; ------------------------------------------------ task ----------------------------------------------------------

(defn- require-lychee! []
  (when-not (binding [u/*skip-warning* true] (u/can-run? "lychee"))
    (u/exit (str (c/red "lychee is not installed.") " Install it with " (c/green "brew install lychee")
                 " (or see https://lychee.cli.rs/installation/).")
            1)))

(defn check-nav-links
  "Entry point for `./bin/mage docs-check-nav-links`."
  [_parsed]
  (require-lychee!)
  (let [{:keys [links problems]} (nav/read-nav)
        failures   (lychee-failures! links)
        mismatches (nav/case-mismatches links)
        index      (delay (nav/redirect-index))]
    (run! print-structure-problem problems)
    (doseq [{:keys [line] :as failure} failures]
      ;; Line N of the generated markdown is link N.
      (print-failure (nth links (dec line)) failure index))
    (run! print-case-mismatch mismatches)
    (println (summary (update-vals {:links links :failures failures :mismatches mismatches :problems problems}
                                   count)))
    (when (or (seq problems) (seq failures) (seq mismatches))
      (u/exit 1))))
