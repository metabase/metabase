(ns mage.actionlint
  "Lint GitHub Actions files with actionlint (https://github.com/rhysd/actionlint)."
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private version
  "Pinned actionlint version. Bumping this invalidates the local cache and the CI cache automatically."
  "1.7.12")

(def ^:private cache-dir
  "Gitignored directory where the downloaded actionlint binary lives."
  (str u/project-root-directory "/.actionlint"))

(defn- os+arch
  "Return the actionlint release's `[os arch]` naming for the current platform."
  []
  (let [os   (str/lower-case (System/getProperty "os.name"))
        arch (str/lower-case (System/getProperty "os.arch"))]
    [(cond
       (str/includes? os "mac")   "darwin"
       (str/includes? os "linux") "linux"
       :else (throw (ex-info (str "Unsupported OS for actionlint: " os
                                  ". Install actionlint manually and put it on your PATH.") {})))
     (cond
       (#{"aarch64" "arm64"} arch) "arm64"
       (#{"amd64" "x86_64"} arch)  "amd64"
       :else (throw (ex-info (str "Unsupported architecture for actionlint: " arch) {})))]))

(def ^:private binary-path
  "Path to the pinned actionlint binary."
  (str cache-dir "/actionlint-" version))

(defn- download-binary!
  "Download and extract the pinned actionlint binary into [[cache-dir]]."
  []
  (let [[os arch] (os+arch)
        url       (format "https://github.com/rhysd/actionlint/releases/download/v%s/actionlint_%s_%s_%s.tar.gz"
                          version version os arch)
        tmp-dir   (str (fs/create-temp-dir))
        tarball   (str tmp-dir "/actionlint.tar.gz")]
    (println (c/green (format "Downloading actionlint %s for %s/%s..." version os arch)))
    (shell/sh "curl" "--fail" "--silent" "--show-error" "--location" "--output" tarball url)
    (fs/create-dirs cache-dir)
    (shell/sh "tar" "-xzf" tarball "-C" tmp-dir "actionlint")
    (fs/move (str tmp-dir "/actionlint") binary-path {:replace-existing true})
    (fs/set-posix-file-permissions binary-path "rwxr-xr-x")
    (fs/delete-tree tmp-dir)))

(defn- ensure-binary!
  "Return the path to the actionlint binary, downloading it first if it isn't cached yet."
  []
  (when-not (fs/exists? binary-path)
    (download-binary!))
  binary-path)

(defn actionlint
  "Run actionlint over the repo's GitHub Actions workflows.

  Any passed path that no longer exists on disk is dropped, so a diff that only *deletes* workflow files
  is a clean no-op rather than an actionlint \"file not found\" error.

  `cli-args` are the raw command-line args: mage's option parser would
  otherwise strip single-dash tokens, so passing them raw lets actionlint flags (e.g. `-shellcheck=`)
  reach the binary."
  [cli-args]
  (let [bin      (ensure-binary!)
        flags    (filter #(str/starts-with? % "-") cli-args)
        paths    (remove #(str/starts-with? % "-") cli-args)
        existing (filter #(fs/exists? (str u/project-root-directory "/" %)) paths)]
    (if (and (seq paths) (empty? existing))
      (do (println (c/green "No existing GitHub Actions workflow files to lint."))
          (System/exit 0))
      (let [{:keys [exit], :or {exit -1}} (apply shell/sh* bin (concat flags existing))]
        (System/exit exit)))))
