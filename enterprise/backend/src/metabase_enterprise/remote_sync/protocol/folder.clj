(ns metabase-enterprise.remote-sync.protocol.folder
  "A directory of files as a [[protocol/Source]]: one tree, the directory as it is when read, with no history."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.remote-sync.protocol :as protocol])
  (:import
   (java.io File)
   (java.nio.file Path)))

(set! *warn-on-reflection* true)

(def version
  "The one version a folder has: what is on disk now."
  "current")

(defn- relative-path
  "The path of `file` relative to `root`, with `/` separators whatever the platform's."
  [^Path root ^File file]
  (.replace (str (.relativize root (.toPath file))) File/separatorChar \/))

(defrecord FolderSource [^File root]
  protocol/Source
  (has-version? [_ v]
    (= v version))

  (list-files [_ v]
    (when (= v version)
      (let [root-path (.toPath (.getCanonicalFile root))]
        (into []
              (comp (filter #(.isFile ^File %))
                    (map #(relative-path root-path (.getCanonicalFile ^File %))))
              (file-seq root)))))

  (read-file [_ v path]
    (when (= v version)
      (let [file (io/file root path)]
        (when (.isFile file)
          (slurp file))))))

(defn source
  "The [[FolderSource]] of the directory at `path`, throwing when there is no such directory."
  [path]
  (let [root (io/file path)]
    (when-not (.isDirectory root)
      (throw (ex-info (format "%s is not a directory" path) {:path path})))
    (->FolderSource root)))
