(ns build-drivers.verify
  (:require [build-drivers.common :as c]
            [colorize.core :as colorize]
            [metabuild-common.core :as u])
  (:import [java.util.zip ZipEntry ZipFile]))

(defn- jar-contains-file? [^String jar-path ^String filename]
  (with-open [zip-file (ZipFile. jar-path)]
    (some
     (fn [^ZipEntry zip-entry]
       (= (str zip-entry) filename))
     (enumeration-seq (.entries zip-file)))))

(defn- verify-has-init-class [driver]
  (let [jar-filename               (c/driver-jar-destination-path driver)
        driver-init-class-filename (format "metabase/driver/%s__init.class" (munge (name driver)))]
    (u/step (format "Check %s contains init class file %s" jar-filename driver-init-class-filename)
      (if (jar-contains-file? jar-filename driver-init-class-filename)
        (u/announce "Driver init class file found.")
        (throw (ex-info (format "Driver verification failed: init class file %s not found" driver-init-class-filename) {}))))))

(defn- verify-has-plugin-manifest [driver]
  (let [jar-filename (c/driver-jar-destination-path driver)]
    (u/step (format "Check %s contains metabase-plugin.yaml" jar-filename)
      (if (jar-contains-file? jar-filename "metabase-plugin.yaml")
        (u/announce "Plugin manifest found.")
        (throw (ex-info "Driver verification failed: plugin manifest missing" {}))))))

(defn verify-driver
  "Run a series of checks to make sure `driver` was built correctly. Throws exception if any checks fail."
  [driver]
  {:pre [(keyword? driver)]}
  (u/step (str (colorize/green "Verify ") (colorize/yellow driver) (colorize/green " driver"))
    (u/assert-file-exists (c/driver-jar-destination-path driver))
    (verify-has-init-class driver)
    (verify-has-plugin-manifest driver)
    (u/announce (format "%s driver verification successful." driver))))
