(ns build-drivers.checksum
  (:require [build-drivers
             [common :as c]
             [plugin-manifest :as manifest]
             [util :as u]]
            [clojure.java.io :as io]
            [clojure.string :as str])
  (:import org.apache.commons.codec.digest.DigestUtils))

(defn checksum-from-file [filename]
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
    (c/filename c/project-root-directory "project.clj")
    (mapcat (fn [dir]
              (try
                (u/find-files dir #(str/ends-with? % ".clj"))
                (catch Throwable _
                  [])))
            [(c/filename c/project-root-directory "src")
             (c/filename c/project-root-directory "enterprise" "backend" "src")
             (c/filename c/project-root-directory "backend" "mbql")]))))

(defn metabase-source-checksum ^String []
  (let [paths (metabase-source-paths)]
    (u/step (format "Calculate checksum for %d Metabase source files" (count paths))
      (let [checksum (DigestUtils/md5Hex (str/join (map slurp paths)))]
        (u/safe-println (format "Current checksum is %s" checksum))
        checksum))))



;;; ---------------------------------------------- Driver source files -----------------------------------------------

(defn existing-driver-checksum
  [driver]
  (checksum-from-file (c/driver-checksum-filename driver)))

(defn- driver-source-paths
  "Returns sequence of the source filenames for `driver`."
  [driver]
  (u/find-files (c/driver-project-dir driver)
                (fn [path]
                  (or (and (str/ends-with? path ".clj")
                           (not (str/starts-with? path (c/filename (c/driver-project-dir driver) "test"))))
                      (str/ends-with? path ".yaml")))))

(defn driver-checksum
  "Calculate a checksum of all the driver source files. If we've already built the driver and the checksum is the same
  there's no need to build the driver a second time."
  ^String [driver]
  (let [source-paths (driver-source-paths driver)]
    (u/step (format "Calculate checksum for %d files: %s ..." (count source-paths) (first source-paths))
      (let [checksum (DigestUtils/md5Hex (str/join (concat [(metabase-source-checksum)]
                                                           (map driver-checksum (manifest/parent-drivers driver))
                                                           (map slurp (driver-source-paths driver)))))]
        (u/safe-println (format "Current checksum is %s" checksum))
        checksum))))
