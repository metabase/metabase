;; #!/usr/bin/env bb
(ns release-list.main
  (:require [babashka.process :refer [shell]]
            [clojure.string  :as str]))

(set! *warn-on-reflection* true)

(def release-page
  "Template for docs page that will list releases."
  (slurp "./resources/releases-template.md"))

(defn build-link
  "Given a version, builds a markdown link to the relevant release page."
  [version]
  (str "- [" version "]" "(https://github.com/metabase/metabase/releases/tag/" version ")"))

(defn generate-links
  "Take a line returned by the `gh release list` command and return a markdown link
  to the relevant release page."
  [input-str]
  (->> input-str
       (re-seq #"v\d+[^\s]*\s") ; get version vX.XX.X.X
       (map str/trim)
       (map build-link)))

(defn semver-map
  "Returns a map of the version for use by the `compare-versions` sorting function."
  [version]
  (let [[edition
         major
         point
         hotfix] (->> (str/split version #"\.")
                      (map #(str/replace % #"[^0-9]" "")))] ; handle nonstandard early releases
    {:edition (Integer/parseInt edition)
     :major (Integer/parseInt major)
     :point (if (nil? point) 0 (Integer/parseInt point)) ; more early release handling
     :hotfix (if (nil? hotfix) 0 (Integer/parseInt hotfix))})) ; same here

(defn get-version
  "Gets a line containing release information, and returns a map of release info for sorting."
  [release]
  (->> release
       (re-find #"\[v(.*?)\]") ;get version number
       last
       (#(str/replace % #"[\[\]v]" ""))
       semver-map))

(defn compare-versions
  "Comparator function used to sort Metabase versions."
  [a b]
  (let [av (get-version a)
        bv (get-version b)]
    (compare [(:major av) (:point av) (:hotfix av)]
             [(:major bv) (:point bv) (:hotfix bv)])))

(defn prep-links
  "Creates links to GitHub release pages, and sorts by edition and release."
  [input]
  (-> input
      generate-links
      (#(sort compare-versions %))
      reverse
      distinct))

(defn group-versions
  "Separate releases by edition: Enterprise Edition or Open Source Software."
  [links]
  (group-by #(str/includes? % "[v1") links))

(defn prep-page
  "Combine page template with list of EE and OSS releases."
  [groups]
  (let [ee (get groups true)
        oss (get groups false)
        rlist (str
               "## Metabase Enterprise Edition releases\n\n" (str/join "\n" ee)
               "\n\n## Metabase Open Source Edition releases\n\n"
               (str/join "\n" oss))]
    (str/replace release-page "{{content}}" rlist)))

(def command
  "GitHub CLI command to list all releases, exluding RCs"
  "gh release list --repo metabase/metabase --limit 10000 --exclude-pre-releases --exclude-drafts")

(def list-of-releases
  "Run GitHub CLI command to retrieve list of Metabase releases."
  (->
   (shell {:out :string} command)
   :out))

(defn -main
  "Entry point for creating a release list.
  Run it from `bin/release-list/` with

    bb -m release-list.main"
  []
  ;; Clear existing list of releases
  (let [target "../../docs/releases.md"]
    (shell (str "rm -rf " target))

  ;; Publish releases
    (spit target
          (-> list-of-releases
              prep-links
              group-versions
              prep-page))
    (println "List of releases updated in `docs/releases.md`.")))
