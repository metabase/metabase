#!/usr/bin/env bb
;; Renders the nav tree in docs/util/data/nav.yml as a markdown list of links, one line per
;; relative `url`, so that lychee can check that every page and `#anchor` exists under docs/.
;;
;;   bb --config /dev/null docs/util/nav_links.clj OUT.md
;;   lychee --offline --root-dir ./docs --fallback-extensions md,html --include-fragments OUT.md
;;
;; `./bin/mage docs-check-nav-links` runs both steps and maps each failure back to its nav entry.
;; `--config /dev/null` stops bb from resolving the repo's bb.edn dependencies, which this
;; script does not need. It only uses the YAML parser built into babashka.
;;
;; URL handling:
;;   - `https://...` and other scheme URLs are skipped (external).
;;   - `/learn/...` style leading-slash URLs are metabase.com pages outside this repo, skipped.
;;   - Everything else is written as a root-relative link, which lychee resolves against docs/
;;     to <url>.md, <url>/index.md, or <url>.html.
;;
;; Anchors are matched by lychee using GitHub-style heading slugs plus explicit `{#custom-id}`
;; (kramdown) and `id="..."` attributes. The live docs site is built with Jekyll/kramdown, whose
;; automatic ids differ from GitHub's for headings that start with digits or punctuation. If the
;; nav needs to link to such a heading, give it an explicit `{#id}` suffix.

(ns nav-links
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(def docs-dir
  "Absolute path of the docs/ directory, derived from this file's location."
  (-> *file* io/file .getAbsoluteFile .getParentFile .getParentFile .getCanonicalFile))

(def nav-file (io/file docs-dir "util" "data" "nav.yml"))

(defn- external?
  "True for scheme URLs (https://...) and site-absolute paths (/learn/...) that live outside docs/."
  [url]
  (boolean (re-find #"^(?:[a-z][a-z0-9+.-]*:|/)" url)))

(defn- problem [trail message]
  {:trail trail :message message})

(defn entries
  "Walks nav `nodes` and returns `{:links [{:trail :url}] :problems [{:trail :message}]}`.
  `:links` are the relative urls in document order, each with its breadcrumb trail of nav names.
  `:problems` are structural issues: entries without a name, or with neither `url` nor `pages`."
  ([nodes] (entries nodes nil))
  ([nodes parent-trail]
   (reduce
    (fn [acc node]
      (if-not (map? node)
        (update acc :problems conj (problem (or parent-trail "(top level)")
                                            (str "entry is not a map: " (pr-str node))))
        (let [{:keys [url pages]} node
              nm    (when (and (string? (:name node)) (not (str/blank? (:name node))))
                      (:name node))
              trail (str/join " > " (remove nil? [parent-trail (or nm "(unnamed)")]))
              acc   (cond-> acc
                      (not nm)
                      (update :problems conj (problem trail "entry has no `name`"))

                      (not (or (contains? node :url) (contains? node :pages)))
                      (update :problems conj (problem trail "entry has neither `url` nor `pages`"))

                      (and (contains? node :url) (not (string? url)))
                      (update :problems conj (problem trail (str "`url` must be a string, got " (pr-str url))))

                      (and (contains? node :pages) (not (sequential? pages)))
                      (update :problems conj (problem trail "`pages` must be a list"))

                      (and (string? url) (not (external? url)))
                      (update :links conj {:trail trail :url url}))]
          (if (sequential? pages)
            (merge-with into acc (entries pages trail))
            acc))))
    {:links [] :problems []}
    nodes)))

(defn with-nav-lines
  "Adds `:nav-line`, the 1-based line of the entry's `url:` in the nav yaml `text`, to each link.
  The YAML parser drops positions, so this scans the text for `url:` lines instead. Links and
  `url:` lines are both in document order, so the Nth link with a given url is the Nth `url:` line
  with that value."
  [links text]
  (let [url-lines (reduce (fn [m [i line]]
                            (if-let [[_ url] (re-find #"^\s*(?:-\s+)?url:\s*[\"']?([^\"'\s]+)" line)]
                              (update m url (fnil conj []) (inc i))
                              m))
                          {}
                          (map-indexed vector (str/split-lines text)))]
    (first (reduce (fn [[out seen] {:keys [url] :as link}]
                     (let [n (get seen url 0)]
                       [(conj out (assoc link :nav-line (get-in url-lines [url n])))
                        (assoc seen url (inc n))]))
                   [[] {}]
                   links))))

(defn read-nav
  "Parses nav.yml and returns [[entries]] of its top-level `categories`, with each link's
  `:nav-line` (see [[with-nav-lines]])."
  []
  (let [text (slurp nav-file)
        nav  (yaml/parse-string text)]
    (if (and (map? nav) (sequential? (:categories nav)))
      (update (entries (:categories nav)) :links with-nav-lines text)
      {:links [] :problems [(problem "(top level)" "expected a single document with a top-level `categories` list")]})))

(defn markdown
  "One markdown link per line. Line N corresponds to `(nth links (dec N))`, which is how
  lychee failures are mapped back to nav entries."
  [links]
  (str/join (map (fn [{:keys [trail url]}]
                   (str "- [" (str/replace trail #"[\[\]]" "\\\\$0") "](/" url ")\n"))
                 links)))

;;; redirect_from suggestions, used by `./bin/mage docs-check-nav-links` when a page is missing

(defn- frontmatter [text]
  (when (str/starts-with? text "---\n")
    (let [end (str/index-of text "\n---" 4)]
      (when end (subs text 4 end)))))

(defn- file->nav-url [file]
  (let [rel (str/replace (str (.relativize (.toPath docs-dir) (.toPath (io/file file)))) "\\" "/")]
    (if (str/ends-with? rel "/index.md")
      (subs rel 0 (- (count rel) (count "index.md")))
      (str/replace rel #"\.md$" ""))))

(defn redirect-index
  "Scans every markdown page under docs/ for `redirect_from: /docs/latest/<old>` frontmatter.
  Returns a map of <old> (no trailing slash) to the nav urls of the pages that redirect from it."
  []
  (reduce (fn [m [from file]]
            (update m from (fnil conj []) file))
          {}
          (for [file  (file-seq docs-dir)
                :when (and (.isFile file)
                           (str/ends-with? (.getName file) ".md")
                           (not (str/includes? (.getPath file) "node_modules")))
                :let  [fm (frontmatter (slurp file))]
                :when fm
                [_ from] (re-seq #"(?m)^(?:redirect_from:|\s*-)\s*[\"']?(/docs/latest/[^\s\"']+)" fm)]
            [(-> from (str/replace #"^/docs/latest/" "") (str/replace #"/$" ""))
             {:url (file->nav-url file) :file (str "docs/" (file->nav-url file) (if (str/ends-with? (.getName file) "index.md") "index.md" ".md"))}])))

(defn suggestions
  "Replacement nav urls for a missing `url`, based on [[redirect-index]]. Keeps any `#anchor`."
  [index url]
  (let [[page anchor] (str/split url #"#" 2)]
    (for [{:keys [url file]} (get index (str/replace page #"/$" ""))]
      {:url (cond-> url anchor (str "#" anchor)) :file file})))

(defn case-mismatches
  "Links whose page only resolves because the filesystem is case-insensitive (macOS, Windows). The
  docs site and CI are case-sensitive, so these fail there. Returns each such link with `:actual`,
  the url as it is spelled on disk. Mirrors lychee's resolution: <url>.md, <url>/index.md, <url>.html."
  [links]
  (for [{:keys [url] :as link} links
        :let [page (-> url (str/split #"#" 2) first (str/replace #"/$" ""))
              file (first (filter #(.exists ^java.io.File %)
                                  [(io/file docs-dir (str page ".md"))
                                   (io/file docs-dir page "index.md")
                                   (io/file docs-dir (str page ".html"))]))]
        :when (and file (not= (.getCanonicalPath file) (.getAbsolutePath file)))]
    (assoc link :actual (file->nav-url (.getCanonicalFile file)))))

(defn -main
  "Writes the markdown to `out-file`, or stdout when omitted. Exits 1 on structural problems."
  [& [out-file]]
  (let [{:keys [links problems]} (read-nav)]
    (doseq [{:keys [trail message]} problems]
      (binding [*out* *err*]
        (println (str "STRUCTURE " trail ": " message))))
    (when (seq problems)
      (System/exit 1))
    (if out-file
      (spit out-file (markdown links))
      (print (markdown links)))))

(when (= *file* (System/getProperty "babashka.file"))
  (apply -main *command-line-args*))
