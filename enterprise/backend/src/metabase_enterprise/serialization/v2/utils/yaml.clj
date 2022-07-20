(ns metabase-enterprise.serialization.v2.utils.yaml
  (:require [clojure.java.io :as io])
  (:import java.io.File
           java.nio.file.Path))

(def ^:private max-label-length 100)

(defn- truncate-label [s]
  (if (> (count s) max-label-length)
      (subs s 0 max-label-length)
      s))

(defn- leaf-file-name
  ([id]       (str id ".yaml"))
  ;; + is a legal, unescaped character on all common filesystems,
  ;; but doesn't appear in `identity-hash` or NanoID!
  ([id label] (if (nil? label)
                (leaf-file-name id)
                (str id "+" (truncate-label label) ".yaml"))))

(defn hierarchy->file
  "Given a :serdes/meta abstract path, return a [[File]] corresponding to it."
  ^File [root-dir hierarchy]
  (let [;; All earlier parts of the hierarchy form Model/id/ pairs.
        prefix                   (apply concat (for [{:keys [model id]} (drop-last hierarchy)]
                                                 [model id]))
        ;; The last part of the hierarchy is used for the basename; this is the only part with the label.
        {:keys [id model label]} (last hierarchy)
        leaf-name                (leaf-file-name id label)]
    (apply io/file root-dir (concat prefix [model leaf-name]))))

(defn path-split
  "Given a root directory and a file underneath it, return a sequence of path parts to get there.
  Given a root of /foo and file /foo/bar/baz/this.file, returns `[\"bar\" \"baz\" \"this.file\"]`."
  [^File root-dir ^File file]
  (let [relative (.relativize (.toPath root-dir) (.toPath file))]
    (for [^Path path (iterator-seq (.iterator relative))]
      (.getName (.toFile path)))))

(defn path->hierarchy
  "Given the list of file path chunks as returned by [[path-split]], reconstruct the `:serdes/meta` abstract path
  corresponding to it."
  [path-parts]
  (let [parentage        (into [] (for [[model id] (partition 2 (drop-last 2 path-parts))]
                                    {:model model :id id}))
        [model basename] (take-last 2 path-parts)
        [_ id label]     (or (re-matches #"^([A-Za-z0-9_\.:-]+)(?:\+(.*))?\.yaml$" basename)
                             (re-matches #"^(.+)\.yaml$" basename))]
    (conj parentage (cond-> {:model model :id id}
                      label (assoc :label label)))))
