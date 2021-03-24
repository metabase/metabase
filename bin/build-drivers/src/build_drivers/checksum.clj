(ns build-drivers.checksum
  "Shared code for calculating and reading hex-encoded MD5 checksums for relevant files."
  (:require [build-drivers.common :as c]
            [build-drivers.plugin-manifest :as manifest]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [colorize.core :as colorize]
            [metabuild-common.core :as u])
  (:import org.apache.commons.codec.digest.DigestUtils))

(defn checksum-from-file
  "Read a saved MD5 hash checksum from a file."
  [filename]
  (u/step (format "Read saved checksum from %s" filename)
    (let [file (io/file filename)]
      (if-not (.exists file)
        (u/announce "%s does not exist" filename)
        (or (when-let [[checksum-line] (not-empty (str/split-lines (slurp file)))]
              (when-let [[_ checksum-hex] (re-matches #"(^(?:\w+-)?[0-9a-f]{32}).*$" checksum-line)]
                (u/safe-println (format "Saved checksum is %s" (colorize/cyan checksum-hex)))
                checksum-hex))
            (u/error (format "Checksum file %s exists, but does not contain a valid checksum" filename)))))))

;;; -------------------------------------------- Metabase source checksum --------------------------------------------

(defn- metabase-source-paths []
  (sort
   (cons
    (u/filename u/project-root-directory "project.clj")
    (mapcat (fn [dir]
              (try
                (u/find-files dir (fn [s]
                                    (or (str/ends-with? s ".clj")
                                        (str/ends-with? s ".cljc"))))
                (catch Throwable _
                  [])))
            [(u/filename u/project-root-directory "src")
             (u/filename u/project-root-directory "enterprise" "backend" "src")
             (u/filename u/project-root-directory "shared" "src")]))))

(defn metabase-source-checksum
  "Checksum of Metabase backend source files and `project.clj`."
  ^String []
  (let [paths (metabase-source-paths)]
    (u/step (format "Calculate checksum for %d Metabase source files" (count paths))
      (let [checksum (DigestUtils/md5Hex (str/join (map slurp paths)))]
        (u/safe-println (format "Current checksum of Metabase files is %s" (colorize/cyan checksum)))
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
  ^String [driver edition]
  (let [source-paths (driver-source-paths driver)]
    (u/step (format "Calculate checksum for %d files: %s ..." (count source-paths) (first source-paths))
      (let [checksum (str
                      (c/edition-checksum-prefix driver edition)
                      (DigestUtils/md5Hex (str/join (concat [(metabase-source-checksum)]
                                                            (map #(driver-checksum % edition)
                                                                 (manifest/parent-drivers driver))
                                                            (map slurp (driver-source-paths driver))))))]
        (u/safe-println (format "Current checksum of %s driver (%s edition) is %s" driver edition (colorize/cyan checksum)))
        checksum))))
