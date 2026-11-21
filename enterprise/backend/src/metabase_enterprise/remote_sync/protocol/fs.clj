(ns metabase-enterprise.remote-sync.protocol.fs
  "The repository of a folder on the disk of the server, which only has the version it reads the folder as: nothing is
  kept of earlier ones, and nothing is written to it, so it serves read-only instances, whose pulls take the folder as
  it is."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.net URI)
   (java.nio.charset StandardCharsets)
   (java.nio.file FileVisitOption Files LinkOption Path Paths)))

(set! *warn-on-reflection* true)

(def branch
  "The only branch of a folder."
  "main")

(def ^:private no-follow
  ^"[Ljava.nio.file.LinkOption;" (into-array LinkOption [LinkOption/NOFOLLOW_LINKS]))

(defn- hidden?
  "Whether `path`, relative to the folder, is in or is a file or directory whose name starts with a dot."
  [^Path path]
  (boolean (some #(str/starts-with? (str %) ".") path)))

(defn- folder-files
  "The content of the files of the folder `root` by their path relative to it, but for hidden files and links."
  [^Path root]
  (with-open [paths (Files/walk root (make-array FileVisitOption 0))]
    (into {}
          (comp (filter #(Files/isRegularFile % no-follow))
                (remove #(hidden? (.relativize root %)))
                (map (fn [^Path path]
                       [(str/join "/" (.relativize root path))
                        (String. (Files/readAllBytes path) StandardCharsets/UTF_8)])))
          (iterator-seq (.iterator paths)))))

(defn- read-tree
  "The `:files` of the folder `root` (see [[folder-files]]) and the `:version` only they determine."
  [root]
  (let [files (folder-files root)]
    {:files   files
     :version (codecs/bytes->hex (buddy-hash/sha1 (pr-str (into (sorted-map) files))))}))

(defn- tree
  "The tree `repo` last read its folder as, reading it when it never did."
  [{:keys [root state]}]
  (or @state (reset! state (read-tree root))))

(defn- read-only
  "The error of a write to a folder."
  []
  (ex-info (tru "Remote sync only pulls from a folder.") {}))

(defrecord FsRepository [^Path root state]
  protocol/Source
  (has-version? [this version]
    (= version (:version (tree this))))

  (list-files [this _version]
    (keys (:files (tree this))))

  (read-file [this _version path]
    (get (:files (tree this)) path))

  protocol/Repository
  (fetch! [_]
    (reset! state (read-tree root))
    nil)

  (branches [_]
    [branch])

  (default-branch [_]
    branch)

  (version [this of-branch]
    (when (= branch of-branch)
      (:version (tree this))))

  (commit! [_ _branch _parent _changes _message]
    (throw (read-only)))

  (create-branch! [_ _branch _version]
    (throw (read-only))))

(defn- folder
  "The folder at the `file:///` `url`, which has to exist."
  ^Path [url]
  (when-not (str/starts-with? url "file:///")
    (throw (ex-info (tru "Use the file URL of a folder on the server, such as file:///srv/metabase.") {})))
  (let [root (.normalize (Paths/get (URI. url)))]
    (when-not (Files/isDirectory root (make-array LinkOption 0))
      (throw (ex-info (tru "The folder {0} doesn''t exist." (str root)) {})))
    (.toRealPath root (make-array LinkOption 0))))

(defn repository
  "The repository of the folder at the `file:///` `url`."
  [url]
  (->FsRepository (folder url) (atom nil)))
