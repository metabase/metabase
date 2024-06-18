(ns metabase.cmd.config-file-gen
  "Generates basic configuration file for Metabase, with all settings."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [metabase.cmd.env-var-dox :as dox]))

(defn- get-name-and-default
  [setting]
  (let [name (:munged-name setting)
        default (:default setting)]
    {(keyword name) default}))

(defn- config-base-template
  "Gets the base configuration template, to which we'll add the settings."
  []
  (yaml/parse-string (slurp (io/resource "metabase/cmd/resources/config-template.yaml"))))

(defn get-settings
  "Gets valid config settings."
  []
  (dox/filter-env-vars (dox/get-settings)))

(defn- settings-map
  "Converts a list of settings (their names and default values) into a sorted map."
  [settings]
  (reduce (fn [acc s]
            (let [[k v] (first s)]
              (assoc acc k v)))
          (sorted-map)
          settings))

(defn- add-settings
  "Adds settings to the configuration template."
  [config]
  (let [settings (map get-name-and-default (get-settings))
        sm (settings-map settings)]
    (assoc-in config [:config :settings] sm)))

(defn- create-config-template!
  "Generates a configuration file template for Metabase with settings and their default values."
  []
  (let [template (config-base-template)
        config-with-settings (add-settings template)
        config-yaml (yaml/generate-string config-with-settings :dumper-options {:flow-style :block})]
    (spit (io/file "docs/configuring-metabase/config-template.yaml") config-yaml)))

(defn generate-config-file!
  "Generates a configuration file template for Metabase with settings and their default values."
  []
  (println "Creating config file...")
  (create-config-template!)
  (println "Config file created: `docs/configuring-metabase/config-template.yaml`"))
