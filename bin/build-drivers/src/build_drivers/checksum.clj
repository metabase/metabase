(ns build-drivers.checksum
  "Shared code for calculating and reading hex-encoded MD5 checksums for relevant files."
  (:require [build-drivers
             [common :as c]
             [plugin-manifest :as manifest]]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [metabuild-common.core :as u])
  (:import org.apache.commons.codec.digest.DigestUtils))

(defn checksum-from-file
  "Read a saved MD5 hash checksum from a file."
  [filename]
  (u/step (format "Read saved checksum from %s" filename)
    (let [file (io/file filename)]
      (if-not (.exists file)
        (u/announce "%s does not exist" filename)
        (when-let [[checksum-line] (not-empty (str/split-lines (slurp file)))]
          (when-let [[_ checksum-hex] (re-matches #"(^[0-9a-f]{32}).*$" checksum-line)]
            (u/safe-println (format "Saved checksum is %s" checksum-hex))
            checksum-hex))))))

;;; -------------------------------------------- Metabase source checksum --------------------------------------------

(defn- metabase-source-paths []
  (sort
   (cons
    (u/filename u/project-root-directory "project.clj")
    (mapcat (fn [dir]
              (try
                (u/find-files dir #(str/ends-with? % ".clj"))
                (catch Throwable _
                  [])))
            [(u/filename u/project-root-directory "src")
             (u/filename u/project-root-directory "enterprise" "backend" "src")
             (u/filename u/project-root-directory "backend" "mbql")]))))

(defn metabase-source-checksum
  "Checksum of Metabase backend source files and `project.clj`."
  ^String []
  (let [paths (metabase-source-paths)]
    (u/step (format "Calculate checksum for %d Metabase source files" (count paths))
      (let [checksum (DigestUtils/md5Hex (str/join (map slurp paths)))]
        (u/safe-println (format "Current checksum is %s" checksum))
        checksum))))


;;; ---------------------------------------------- Driver source files -----------------------------------------------

(defn existing-driver-checksum
  "Checksum from the relevant sources from last time we built `driver`."
  [driver]
  (checksum-from-file (c/driver-checksum-filename driver)))

(defn- driver-source-paths
  "Returns sequence of the source filenames for `driver`."
  [driver]
  (u/find-files (c/driver-project-dir driver)
                (fn [path]
                  (or (and (str/ends-with? path ".clj")
                           (not (str/starts-with? path (u/filename (c/driver-project-dir driver) "test"))))
                      (str/ends-with? path ".yaml")))))

(defn driver-checksum
  "The driver checksum is based on a checksum of all the driver source files (`.clj` files and the plugin manifest YAML
  file) combined with the checksums for `metabase-core` *and* the parent drivers. After building a driver, we save
  this checksum. Next time the script is ran, we recalculate the checksum to determine whether anything relevant has
  changed -- if it has, and the current checksum doesn't match the saved one, we need to rebuild the driver."
  ^String [driver]
  (let [source-paths (driver-source-paths driver)]
    (u/step (format "Calculate checksum for %d files: %s ..." (count source-paths) (first source-paths))
      (let [checksum (DigestUtils/md5Hex (str/join (concat [(metabase-source-checksum)]
                                                           (map driver-checksum (manifest/parent-drivers driver))
                                                           (map slurp (driver-source-paths driver)))))]
        (u/safe-println (format "Current checksum is %s" checksum))
        checksum))))
