(ns build-drivers.test
  (:require [build-drivers.common :as c]
            [build-drivers.lint-manifest-file :as lint-manifest-file]
            [clojure.spec.alpha :as s]
            [colorize.core :as colorize]
            [expound.alpha :as expound]
            [clojure.java.io :as io]
            [metabuild-common.core :as u]
            [metabuild-common.input :as input]
            [spell-spec.expound]
            [yaml.core :as yaml])
  (:import [java.util.zip ZipEntry ZipFile]))

(defn prompt-driver-manifest-entries [driver]
  (reduce
    (fn [acc {prop-nm :name
              display-nm :display-name
              placeholder :placeholder
              default-val :default
              spec-type :type
              :as conn-prop}]
      (let [prop-type (or spec-type :string)
            prop-val  (input/read-line-with-prompt (format "Enter value for %s (%s - %s)"
                                                           display-nm
                                                           prop-nm
                                                           prop-type)
                                                   :default   (or default-val placeholder)
                                                   :validator (fn [v]
                                                                 (case prop-type
                                                                   :boolean (Boolean/parseBoolean v)
                                                                   nil)))]
        (assoc acc prop-nm prop-val)))
    {}
    (get-in yml [:driver :connection-properties])))

