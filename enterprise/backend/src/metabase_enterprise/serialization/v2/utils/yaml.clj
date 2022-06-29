(ns metabase-enterprise.serialization.v2.utils.yaml
  (:require [clojure.java.io :as io]
            [clojure.string :as str])
  (:import java.io.File))

#_(defn- clean-string [s]
  (let [clean  (str/replace s #"[^a-zA-Z0-9+\-_ \.]+" "")]
    (if (> (count clean) 100)
      (.substring clean 0 100)
      clean)))

(def ^:private clean-string identity)

(defn ^File hierarchy->file
  "Given a :serdes/meta hierarchy, return a [[File]] corresponding to it."
  [root-dir hierarchy]
  (let [;; All earlier parts of the hierarchy form Model/id/ pairs.
        prefix     (apply concat (for [{:keys [model id]} (drop-last hierarchy)]
                                   [model (clean-string id)]))
        ;; The last part of the hierarchy is used for the basename; this is the only part with the label.
        {:keys [id model label]} (last hierarchy)
        basename   (if (nil? label)
                     (str id)
                     ;; + is a legal, unescaped character on all common filesystems, but not `identity-hash` or NanoID!
                     (str id "+" label))]
    (apply io/file root-dir (concat prefix [model (str (clean-string basename) ".yaml")]))))

(defn path-split
  "Given a root directory and a file underneath it, return a sequence of path parts to get there.
  Given a root of /foo and file /foo/bar/baz/this.file, returns `[\"bar\" \"baz\" \"this.file\"]`."
  [^File root-dir ^File file]
  (let [relative (.relativize (.toPath root-dir) (.toPath file))]
    (for [path  (iterator-seq (.iterator relative))]
      (.getName (.toFile path)))))

(defn path->hierarchy
  "Given the list of path chunks as returned by [[path-split]], reconstruct the hierarchy corresponding to it."
  [path-parts]
  (let [parentage  (into [] (for [[model id] (partition 2 (drop-last 2 path-parts))]
                              {:model model :id id}))
        [model basename] (take-last 2 path-parts)
        [_ id label]     (or (re-matches #"^([A-Za-z0-9_-]+)(?:\+(.*))?\.yaml$" basename)
                             (re-matches #"^(.+)\.yaml$" basename))]
    (conj parentage (cond-> {:model model :id id}
                      label (assoc :label label)))))
