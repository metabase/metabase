(ns build-drivers.verify
  (:require [build-drivers.common :as c]
            [colorize.core :as colorize]
            [metabuild-common.core :as u]))

(defn- verify-exists [driver]
  (let [filename (c/driver-jar-destination-path driver)]
    (u/step (format "Check %s exists" filename)
      (if (u/file-exists? filename)
        (u/announce "File exists.")
        (throw (ex-info (format "Driver verification failed: %s does not exist" filename) {}))))))

(defn- verify-has-init-class [driver]
  (let [filename          (c/driver-jar-destination-path driver)
        driver-init-class (format "metabase/driver/%s__init.class" (munge (name driver)))]
    (u/step (format "Check %s contains init class file %s" filename driver-init-class)
      (if (some (partial = driver-init-class)
                (u/sh {:quiet? true} "jar" "-tf" filename))
        (u/announce "Driver init class file found.")
        (throw (ex-info (format "Driver verification failed: init class file %s not found" driver-init-class) {}))))))

(defn- verify-has-plugin-manifest [driver]
  (let [filename          (c/driver-jar-destination-path driver)
        driver-init-class (format "metabase/driver/%s__init.class" (munge (name driver)))]
    (u/step (format "Check %s contains metabase-plugin.yaml" filename)
      (if (some (partial = "metabase-plugin.yaml")
                (u/sh {:quiet? true} "jar" "-tf" filename))
        (u/announce "Plugin manifest found.")
        (throw (ex-info (format "Driver verification failed: plugin manifest missing" driver-init-class) {}))))))

(defn verify-driver
  "Run a series of checks to make sure `driver` was built correctly. Throws exception if any checks fail."
  [driver]
  {:pre [(keyword? driver)]}
  (u/step (str (colorize/green "Verify ") (colorize/yellow driver) (colorize/green " driver"))
    (verify-exists driver)
    (verify-has-init-class driver)
    (verify-has-plugin-manifest driver)
    (u/announce (format "%s driver verification successful." driver))))
