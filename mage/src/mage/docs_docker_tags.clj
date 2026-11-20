(ns mage.docs-docker-tags
  "Keeps the fixed Docker tags in [[pages]] on the newest release of the version that the docs describe.
  The `docker-tags` suite of `docs-generate` runs this namespace in the checkout of the target branch."
  (:require
   [babashka.http-client :as http]
   [babashka.process :as p]
   [cheshire.core :as json]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private version-info-url
  "The file that the version support page and the update checks read."
  "https://static.metabase.com/version-info.json")

(def pages
  "The docs pages with pinned Docker tags. Every tag in these pages moves to the newest release, so don't add a page
  that names an old release on purpose."
  ["docs/installation-and-operation/running-metabase-on-docker.md"
   "docs/installation-and-operation/upgrading-metabase.md"])

(def ^:private tag-pattern
  "`metabase/metabase:v0.65.5`, `metabase/metabase-enterprise:v1.64.3.1`, and the same with `docker.io/` in front.
  Not mutable tags like `v0.65.x` or `v0.65.5.x`, not prereleases like `v0.66.0-beta`, and not other images like
  `foometabase/metabase:v0.65.5`."
  #"(?<![\w.-])(metabase/metabase(?:-enterprise)?):v[01]\.\d+(?:\.\d+){1,2}(?!\.?[\w-])")

(defn- version-numbers
  "`\"v0.64.3.1\"` -> `[64 3 1]`. Drops the edition prefix, so OSS and Enterprise versions compare the same."
  [version]
  (mapv parse-long (rest (str/split (str/replace version #"^v" "") #"\."))))

(defn branch-major
  "The major version that the docs on `branch` describe, or nil for the newest release."
  [branch]
  (some->> branch (re-matches #"release-x\.(\d+)\.x") second parse-long))

(defn newest-release
  "The newest release in `version-info` (parsed `version-info.json`) for `major`, like `\"64.7\"`. When `major` is nil,
  the newest release for the major version of the `latest` release. That can be newer than `latest`: a new release
  goes into `older` first, and becomes `latest` later. Nil when `major` has no release yet, for example while it is
  in beta."
  [version-info major]
  (let [major (or major (first (version-numbers (:version (:latest version-info)))))]
    (some->> (cons (:latest version-info) (:older version-info))
             (map :version)
             (filter #(= major (first (version-numbers %))))
             ;; Pad to one length: Clojure compares a shorter vector as smaller, so [64 9 1] > [64 10].
             (sort-by #(vec (take 3 (concat (version-numbers %) (repeat 0)))))
             last
             version-numbers
             (str/join "."))))

(defn pin-tags
  "Replace every fixed Metabase Docker tag in `text` with `release` (like `\"65.5\"`), keeping each image's edition
  prefix: `v0.` for `metabase/metabase`, `v1.` for `metabase/metabase-enterprise`."
  [text release]
  (str/replace text tag-pattern
               (fn [[_ image]]
                 (str image ":" (if (str/ends-with? image "-enterprise") "v1." "v0.") release))))

(defn- current-branch []
  (str/trim (:out (p/shell {:out :string} "git" "branch" "--show-current"))))

(defn- fetch-version-info []
  (json/parse-string (:body (http/get version-info-url {:timeout 30000})) true))

(defn -main
  "Pin the tags in [[pages]], in the current directory, to the newest release for the current branch."
  [& _args]
  (let [branch  (current-branch)
        major   (branch-major branch)
        release (newest-release (fetch-version-info) major)]
    (if-not release
      (println "No release of Metabase" major "in" version-info-url "yet, so the Docker tags stay as they are")
      (doseq [page pages]
        (let [text   (slurp page)
              pinned (pin-tags text release)]
          (when (not= text pinned)
            (spit page pinned)
            (println "Pinned the Docker tags in" page "to" release)))))))
