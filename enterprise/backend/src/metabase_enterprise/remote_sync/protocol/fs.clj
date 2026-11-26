(ns metabase-enterprise.remote-sync.protocol.fs
  "The repository of a folder on the disk of the server, where no branch is the folder itself and its branches are its
  directories, each with only the version it is read as: nothing is kept of earlier ones, and nothing is written to it,
  so it serves read-only instances, whose pulls take the folder as it is."
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

(def ^:private no-follow
  ^"[Ljava.nio.file.LinkOption;" (into-array LinkOption [LinkOption/NOFOLLOW_LINKS]))

(defn- hidden?
  "Whether `path`, relative to the folder, is in or is a file or directory whose name starts with a dot."
  [^Path path]
  (boolean (some #(str/starts-with? (str %) ".") path)))

(defn- branch-names
  "The sorted names of the directories of the folder `root`, but for hidden ones and links."
  [^Path root]
  (with-open [paths (Files/list root)]
    (into []
          (comp (filter #(Files/isDirectory % no-follow))
                (map #(.relativize root ^Path %))
                (remove hidden?)
                (map str))
          (sort (iterator-seq (.iterator paths))))))

(defn- directory-files
  "The content of the files of the directory `root` by their path relative to it, but for hidden files and links."
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
  "The `:files` of the directory `root` (see [[directory-files]]) and the `:version` only they determine."
  [root]
  (let [files (directory-files root)]
    {:files   files
     :version (codecs/bytes->hex (buddy-hash/sha1 (pr-str (into (sorted-map) files))))}))

(defn- branch-tree
  "The tree `repo` read `branch`, the folder itself when nil, as since its last fetch, reading it when it did not, or
  nil when there is no such branch."
  [{:keys [^Path root state]} branch]
  (when (or (nil? branch) (some #{branch} (branch-names root)))
    (or (get @state branch)
        (get (swap! state assoc branch (read-tree (cond-> root branch (.resolve ^String branch)))) branch))))

(defn- version-tree
  "The tree of `version` among those `repo` read since its last fetch."
  [{:keys [state]} version]
  (some #(when (= version (:version %)) %) (vals @state)))

(defn- read-only
  "The error of a write to a folder."
  []
  (ex-info (tru "Remote sync only pulls from a folder.") {}))

(defrecord FsRepository [^Path root state]
  protocol/Source
  (has-version? [this version]
    (some? (version-tree this version)))

  (list-files [this version]
    (keys (:files (version-tree this version))))

  (read-file [this version path]
    (get (:files (version-tree this version)) path))

  protocol/Repository
  (fetch! [_]
    (reset! state {})
    nil)

  (branches [_]
    (branch-names root))

  (default-branch [_]
    nil)

  (version [this branch]
    (:version (branch-tree this branch)))

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
  "The repository of the folder at the `file:///` `url`, whose directories are its branches and which is what no branch names."
  [url]
  (->FsRepository (folder url) (atom {})))
