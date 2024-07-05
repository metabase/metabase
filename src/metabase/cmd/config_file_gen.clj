(ns metabase.cmd.config-file-gen
  "Generates basic configuration file for Metabase, with all settings."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [metabase.cmd.env-var-dox :as dox]))

(defn- get-name-and-default
  "Get a setting's name and its default."
  [{:keys [munged-name default]}]
  {(keyword munged-name) default})

(defn- config-base-template
  "Gets the base configuration template, to which we'll add the settings."
  []
  (yaml/parse-string (slurp (io/resource "metabase/cmd/resources/config-template.yaml"))))

(defn- get-settings
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

(defn- config-template-intro
  "Gets the markdown intro for the configuration file."
  []
  (slurp (io/resource "metabase/cmd/resources/config-file-intro.md")))

(defn- config-file-outro
  "The markdown to follow the config file template."
  []
  (slurp (io/resource "metabase/cmd/resources/config-file-outro.md")))

(defn- build-page
  "Builds a markdown page for a configuration file."
  [config]
  (str (config-template-intro)
       config
       (config-file-outro)))

(def config-file-path
  "Docs location for the config file template."
  "docs/configuring-metabase/config-template.md")

(defn- create-config-template!
  "Generates a configuration file template for Metabase with settings and their default values."
  []
  (let [template (config-base-template)
        config-with-settings (add-settings template)
        config-yaml (yaml/generate-string config-with-settings :dumper-options {:flow-style :block})]
    (spit (io/file config-file-path) (build-page config-yaml))))

(defn generate-config-file!
  "Generates a configuration file template for Metabase with settings and their default values."
  []
  (println "Creating config file...")
  (create-config-template!)
  (println (str "Config file created: `" config-file-path "`.")))
