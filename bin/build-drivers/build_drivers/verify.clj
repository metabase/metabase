(ns build-drivers.verify
  (:require [build-drivers
             [common :as c]
             [util :as u]]
            [colorize.core :as colorize]))

(defn- verify-driver-exists [driver]
  (let [filename (c/driver-jar-destination-path driver)]
    (u/step (format "Check %s exists" filename)
      (if (u/file-exists? filename)
        (u/announce "File exists.")
        (throw (ex-info (format "Driver verification failed: %s does not exist" filename) {}))))))

(defn- verify-driver-init-class [driver]
  (let [filename          (c/driver-jar-destination-path driver)
        driver-init-class (format "metabase/driver/%s__init.class" (munge (name driver)))]
    (u/step (format "Check %s contains init class file %s" filename driver-init-class)
      (if (some (partial = driver-init-class)
                (u/sh {:quiet? true} "jar" "-tf" filename))
        (u/announce "Driver init class file found.")
        (throw (ex-info (format "Driver verification failed: init class file %s not found" driver-init-class) {}))))))

(defn- verify-driver-plugin-manifest [driver]
  (let [filename          (c/driver-jar-destination-path driver)
        driver-init-class (format "metabase/driver/%s__init.class" (munge (name driver)))]
    (u/step (format "Check %s contains metabase-plugin.yaml" filename)
      (if (some (partial = "metabase-plugin.yaml")
                (u/sh {:quiet? true} "jar" "-tf" filename))
        (u/announce "Plugin manifest found.")
        (throw (ex-info (format "Driver verification failed: plugin manifest missing" driver-init-class) {}))))))

(defn verify-driver [driver]
  {:pre [(keyword? driver)]}
  (u/step (str (colorize/green "Verify ") (colorize/yellow driver) (colorize/green " driver"))
    (verify-driver-exists driver)
    (verify-driver-init-class driver)
    (verify-driver-plugin-manifest driver)
    (u/announce (format "%s driver verification successful." driver))))
