#!/usr/bin/env bb
(ns nav-links
  "Renders the nav tree in docs/util/data/nav.yml as a markdown list of links, one line per relative
  `url`, so that lychee can check that every page and `#anchor` exists under docs/.

      bb --config /dev/null docs/util/nav_links.clj OUT.md
      lychee --offline --root-dir ./docs --fallback-extensions md,html --include-fragments OUT.md

  `./bin/mage docs-check-nav-links` runs both steps and maps each failure back to its nav entry.
  `--config /dev/null` stops bb from resolving the repo's bb.edn dependencies, which this script does
  not need: it only uses the YAML parser built into babashka."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def docs-dir
  "Absolute path of the docs/ directory, derived from this file's location."
  (-> *file* io/file .getAbsoluteFile .getParentFile .getParentFile .getCanonicalFile))

(def ^:private nav-file (io/file docs-dir "util" "data" "nav.yml"))

;;; ------------------------------------------------ urls and files ------------------------------------------------

(defn- external?
  "True for scheme URLs (https://...) and site-absolute paths (/learn/...) that live outside docs/."
  [url]
  (boolean (re-find #"^(?:[a-z][a-z0-9+.-]*:|/)" url)))

(defn page-path
  "The page part of a nav `url`: no `#anchor`, no trailing slash."
  [url]
  (-> url (str/split #"#" 2) first (str/replace #"/$" "")))

(defn- anchor
  "The part of a nav `url` after `#`, or nil."
  [url]
  (second (str/split url #"#" 2)))

(defn- docs-relative-path
  "Path of `file` relative to docs/, with forward slashes."
  [file]
  (str/replace (str (.relativize (.toPath docs-dir) (.toPath (io/file file)))) "\\" "/"))

(defn- path->nav-url
  "Nav url of a docs-relative markdown `path`: `foo/bar.md` -> `foo/bar`, `foo/index.md` -> `foo/`."
  [path]
  (if (str/ends-with? path "/index.md")
    (subs path 0 (- (count path) (count "index.md")))
    (str/replace path #"\.md$" "")))

(defn- page-ref
  "`{:url :file}` for a page under docs/: its nav url and its repo-relative path."
  [file]
  (let [path (docs-relative-path file)]
    {:url  (path->nav-url path)
     :file (str "docs/" path)}))

(defn- index-pairs
  "`{k [v ...]}` from `[k v]` pairs, keeping each key's values in order."
  [pairs]
  (update-vals (group-by first pairs) #(mapv second %)))

;;; ------------------------------------------------ nav tree walk -------------------------------------------------

(defn- problem [trail message]
  {:trail trail :message message})

(defn- entry-name
  "The entry's `name` when it is a non-blank string, else nil."
  [node]
  (let [value (:name node)]
    (when (and (string? value) (not (str/blank? value)))
      value)))

(defn- node-trail
  "Breadcrumb of nav names down to `node`, like `Analytics > Questions > Editor`."
  [node parent-trail]
  (str/join " > " (remove nil? [parent-trail (or (entry-name node) "(unnamed)")])))

(defn- nodes-with-trails
  "Flattens nav `nodes` depth-first into `[{:node :trail}]` in document order, `:trail` being the
  [[node-trail]] of each node."
  ([nodes] (nodes-with-trails nodes nil))
  ([nodes parent-trail]
   (mapcat (fn [node]
             (if-not (map? node)
               [{:node node :trail (or parent-trail "(top level)")}]
               (let [trail (node-trail node parent-trail)
                     pages (:pages node)]
                 (cons {:node node :trail trail}
                       (when (sequential? pages)
                         (nodes-with-trails pages trail))))))
           nodes)))

(defn- node-problems
  "Structural problems with one nav entry, as `[{:trail :message}]`. Empty when it is well formed."
  [{:keys [node trail]}]
  (if-not (map? node)
    [(problem trail (str "entry is not a map: " (pr-str node)))]
    (let [{:keys [url pages]} node]
      (cond-> []
        (not (entry-name node))
        (conj (problem trail "entry has no `name`"))

        (not (or (contains? node :url) (contains? node :pages)))
        (conj (problem trail "entry has neither `url` nor `pages`"))

        (and (contains? node :url) (not (string? url)))
        (conj (problem trail (str "`url` must be a string, got " (pr-str url))))

        (and (contains? node :pages) (not (sequential? pages)))
        (conj (problem trail "`pages` must be a list"))))))

(defn- node-link
  "`{:trail :url}` when the entry has a relative url that lychee should check, else nil."
  [{:keys [node trail]}]
  (let [url (:url node)]
    (when (and (string? url) (not (external? url)))
      {:trail trail :url url})))

(defn entries
  "Walks nav `nodes` and returns `{:links [{:trail :url}] :problems [{:trail :message}]}`.
  `:links` are the relative urls in document order, each with its breadcrumb trail of nav names.
  `:problems` are structural issues, see [[node-problems]]."
  [nodes]
  (let [flat (nodes-with-trails nodes)]
    {:links    (into [] (keep node-link) flat)
     :problems (into [] (mapcat node-problems) flat)}))

;;; ------------------------------------------------ yaml line numbers ---------------------------------------------

(defn url-line-numbers
  "Map of each url in the nav yaml `text` to the 1-based line numbers of its `url:` lines, in document order."
  [text]
  (index-pairs (keep-indexed (fn [i line]
                               (when-let [[_ url] (re-find #"^\s*(?:-\s+)?url:\s*[\"']?([^\"'\s]+)" line)]
                                 [url (inc i)]))
                             (str/split-lines text))))

(defn- occurrence-indexes
  "How many times each value of `coll` appeared before it: `[a b a]` -> `[0 0 1]`."
  [coll]
  (first (reduce (fn [[out seen] v]
                   [(conj out (get seen v 0)) (update seen v (fnil inc 0))])
                 [[] {}]
                 coll)))

(defn with-nav-lines
  "Adds `:nav-line`, the 1-based line of the entry's `url:` in the nav yaml `text`, to each link.
  `:nav-line` is nil when the url is not found in the text."
  [links text]
  ;; The YAML parser drops positions. Links and `url:` lines are both in document order, so the Nth
  ;; link with a given url is the Nth `url:` line with that value.
  (let [line-numbers (url-line-numbers text)]
    (mapv (fn [{:keys [url] :as link} n]
            (assoc link :nav-line (get-in line-numbers [url n])))
          links
          (occurrence-indexes (map :url links)))))

(defn read-nav
  "Parses nav.yml and returns [[entries]] of its top-level `categories`, with each link's
  `:nav-line` (see [[with-nav-lines]])."
  []
  (let [text (slurp nav-file)
        nav  (yaml/parse-string text)]
    (if (and (map? nav) (sequential? (:categories nav)))
      (update (entries (:categories nav)) :links with-nav-lines text)
      {:links    []
       :problems [(problem "(top level)" "expected a single document with a top-level `categories` list")]})))

(defn markdown
  "One markdown link per line, in order: line N is `(nth links (dec N))`."
  [links]
  (str/join (map (fn [{:keys [trail url]}]
                   (str "- [" (str/replace trail #"[\[\]]" "\\\\$0") "](/" url ")\n"))
                 links)))

;;; ------------------------------------------------ redirect_from suggestions -------------------------------------

(defn- frontmatter [text]
  (second (re-find #"(?s)\A---\n(.*?)\n---" text)))

(defn- markdown-pages
  "Every markdown file under docs/, excluding node_modules."
  []
  (for [^java.io.File file (file-seq docs-dir)
        :when (and (.isFile file)
                   (str/ends-with? (.getName file) ".md")
                   (not (str/includes? (.getPath file) "node_modules")))]
    file))

(defn- redirect-sources
  "The old nav urls a page redirects from, read from `redirect_from: /docs/latest/<old>` entries in
  its frontmatter. Without the `/docs/latest/` prefix or a trailing slash."
  [text]
  (when-let [fm (frontmatter text)]
    (for [[_ from] (re-seq #"(?m)^(?:redirect_from:|\s*-)\s*[\"']?(/docs/latest/[^\s\"']+)" fm)]
      (-> from (str/replace #"^/docs/latest/" "") (str/replace #"/$" "")))))

(defn redirect-index
  "Map of old nav url to the [[page-ref]]s of the pages under docs/ that redirect from it."
  []
  (index-pairs (for [file (markdown-pages)
                     from (redirect-sources (slurp file))]
                 [from (page-ref file)])))

(defn suggestions
  "Replacement nav urls for a missing `url`, based on [[redirect-index]]. Keeps any `#anchor`."
  [index url]
  (let [fragment (anchor url)]
    (for [ref (get index (page-path url))]
      (cond-> ref fragment (update :url str "#" fragment)))))

;;; ------------------------------------------------ case mismatches -----------------------------------------------

(defn- candidate-files
  "The files lychee resolves a nav `page` to, in order: `<page>.md`, `<page>/index.md`, `<page>.html`."
  [page]
  [(io/file docs-dir (str page ".md"))
   (io/file docs-dir page "index.md")
   (io/file docs-dir (str page ".html"))])

(defn- resolved-file
  "The first existing [[candidate-files]] for a nav `page`, or nil."
  [page]
  (first (filter #(.exists ^java.io.File %) (candidate-files page))))

(defn- wrong-case?
  "True when `file` only exists because the filesystem is case-insensitive."
  [^java.io.File file]
  (not= (.getCanonicalPath file) (.getAbsolutePath file)))

(defn case-mismatches
  "Links whose page only resolves because the filesystem is case-insensitive (macOS, Windows). The
  docs site and CI are case-sensitive, so these fail there. Returns each such link with `:actual`,
  the url as it is spelled on disk."
  [links]
  (for [{:keys [url] :as link} links
        :let  [file (resolved-file (page-path url))]
        :when (and file (wrong-case? file))]
    (assoc link :actual (:url (page-ref (.getCanonicalFile ^java.io.File file))))))

;;; ------------------------------------------------ script entry point --------------------------------------------

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
