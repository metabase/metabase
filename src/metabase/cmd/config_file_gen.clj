(ns metabase.cmd.config-file-gen
  "Generates basic configuration file for Metabase, with all settings."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [metabase.cmd.env-var-dox :as dox]))

;;;; Get Markdown intro, outro, and base template

(defn- config-base-template
  "Gets the base configuration template, to which we'll add the settings."
  []
  (yaml/parse-string (slurp (io/resource "metabase/cmd/resources/config-template.yaml"))))

(defn- config-template-intro
  "Gets the markdown intro for the configuration file."
  []
  (slurp (io/resource "metabase/cmd/resources/config-file-intro.md")))

(defn- config-file-outro
  "The Markdown to follow the config file template."
  []
  (slurp (io/resource "metabase/cmd/resources/config-file-outro.md")))

;;;; Get settings and their default values

(defn- get-settings
  "Gets valid config settings."
  []
  (dox/filter-env-vars (dox/get-settings)))

(defn- get-name-and-default
  "Get a setting's name and its default."
  [{:keys [munged-name default]}]
  {(keyword munged-name) default})

(defn- settings-map
  "Converts a list of settings (their names and default values) into a sorted map."
  [settings]
  (reduce (fn [acc s]
            (let [[k v] (first s)]
              (assoc acc k v)))
          (sorted-map)
          settings))

;;;; Add settings to YAML template and build Markdown file

(defn- add-settings
  "Adds settings to the configuration template."
  [config]
  (let [settings (map get-name-and-default (get-settings))
        sm (settings-map settings)]
    (assoc-in config [:config :settings] sm)))

(defn- build-markdown-page
  "Take a YAML string and builds a Markdown page for docs on a configuration file."
  [config-yaml]
  (str (config-template-intro)
       config-yaml
       (config-file-outro)))

(def config-file-path
  "Docs location for the config file template."
  "docs/configuring-metabase/config-template.md")

(defn format-yaml
  "Takes configuration map that includes settings data and preps YAML for embedding in Markdown doc."
  [config-with-settings]
  (yaml/generate-string config-with-settings :dumper-options {:flow-style :block}))

(defn create-config-doc
  "Generates a configuration file Markdown doc with config template for Metabase
   with settings and their default values."
  []
  (-> (config-base-template)
      (add-settings)
      (format-yaml)
      (build-markdown-page)))

(defn generate-config-file-doc!
  "Generates a configuration file doc with template and saves to docs directory."
  []
  (println "Creating config file doc with template...")
  (spit (io/file config-file-path) (create-config-doc))
  (println (str "Config doc file created: `" config-file-path "`.")))
