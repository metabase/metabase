(ns build-drivers.verify
  (:require
   [build-drivers.common :as c]
   [build-drivers.lint-manifest-file :as lint-manifest-file]
   [clj-yaml.core :as yaml]
   [clojure.spec.alpha :as s]
   [colorize.core :as colorize]
   [expound.alpha :as expound]
   [metabuild-common.core :as u])
  (:import
   (java.util.zip ZipEntry ZipFile)))

(set! *warn-on-reflection* true)

(defn- get-jar-entry [^String jar-path ^String filename]
  (with-open [zip-file (ZipFile. jar-path)]
    (first
      (filter
        (fn [^ZipEntry zip-entry]
          (= (str zip-entry) filename))
        (enumeration-seq (.entries zip-file))))))

(defn- jar-contains-file? [^String jar-path ^String filename]
  (some? (get-jar-entry jar-path filename)))

(defn- verify-has-init-class [driver]
  (let [jar-filename               (c/driver-jar-destination-path driver)
        driver-init-class-filename (format "metabase/driver/%s__init.class" (munge (name driver)))]
    (u/step (format "Check %s contains init class file %s" jar-filename driver-init-class-filename)
      (if (jar-contains-file? jar-filename driver-init-class-filename)
        (u/announce "Driver init class file found.")
        (throw (ex-info (format "Driver verification failed: init class file %s not found" driver-init-class-filename) {}))))))

(defn- verify-does-not-have-clojure-core [driver]
  (let [jar-filename (c/driver-jar-destination-path driver)]
    (u/step (format "Check %s does not contain Clojure core classes" jar-filename)
      (doseq [file ["clojure/spec/alpha__init.class"
                    "clojure/core__init.class"
                    "clojure/core.clj"]]
        (when (jar-contains-file? jar-filename file)
          (throw (ex-info (format "Driver verification failed: driver contains compiled Clojure core file %s" file)
                          {:file file})))))))

(defn- verify-has-plugin-manifest [driver]
  (let [jar-filename (c/driver-jar-destination-path driver)]
    (u/step (format "Check %s contains metabase-plugin.yaml" jar-filename)
      (if-let [manifest-entry (get-jar-entry jar-filename "metabase-plugin.yaml")]
        (with-open [zip-file (ZipFile. jar-filename)]
          (let [entry-is (.getInputStream zip-file manifest-entry)
                yaml-str (slurp entry-is)
                yml      (yaml/parse-string yaml-str)]
            (u/announce "Plugin manifest found; validating it")
            (if-not (s/valid? ::lint-manifest-file/plugin-manifest yml)
              (do
                ;; print a readable explanation of the spec error
                (expound/expound ::lint-manifest-file/plugin-manifest yml)
                (throw (ex-info "Driver verification failed: plugin manifest was invalid; see full explanation above"
                                {:invalid-driver driver})))
              (u/announce "Plugin manifest passed spec validation"))))
        (throw (ex-info "Driver verification failed: plugin manifest missing" {}))))))

(defn verify-driver
  "Run a series of checks to make sure `driver` was built correctly. Throws exception if any checks fail."
  [driver]
  {:pre [(keyword? driver)]}
  (u/step (str (colorize/green "Verify ") (colorize/yellow driver) (colorize/green " driver"))
    (u/assert-file-exists (c/driver-jar-destination-path driver))
    (verify-has-init-class driver)
    (verify-has-plugin-manifest driver)
    (verify-does-not-have-clojure-core driver)
    (u/announce (format "%s driver verification successful." driver))))
