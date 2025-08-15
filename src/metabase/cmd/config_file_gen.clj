(ns metabase.cmd.config-file-gen
  "Generates a docs page with an example configuration file for Metabase.
  The example config includes all configurable settings and their default values."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [metabase.cmd.env-var-dox :as dox]))

;;;; Get settings and their default values

(def settings-to-reset
  "Some default values require resetting. For example, the `saml-attribute-email` is a link,
   which fails an email validation check when Metabase loads the config file."
  '(:saml-attribute-email))

(defn reset-default-values
  "Sets certain default values to nil."
  [settings]
  (reduce (fn [settings k] (assoc settings k nil)) settings settings-to-reset))

(defn settings
  "Gets valid config settings. We include deprecated settings in the env var docs,
   but we exclude them from the config file template."
  []
  (->> (dox/get-settings)
       dox/remove-env-vars-we-should-not-document))

(defn get-name-and-default
  "Get a setting's name and its default."
  [{:keys [munged-name default]}]
  {(keyword munged-name) default})

;;;; Add settings to YAML template

(defn create-settings-map
  "Creates a sorted map of settings from their names and defaults."
  [settings]
  (->> settings
       (remove :deprecated)
       (map get-name-and-default)
       (into (sorted-map))))

(defn- config-settings
  "Preps settings for the configuration file."
  []
  (-> (settings)
      (create-settings-map)
      (reset-default-values)))

(defn- add-settings
  "Adds settings to the configuration template."
  [config]
  (assoc-in config [:config :settings] (config-settings)))

;;;; Build Markdown file

(def markdown-intro
  "Used as header for config file doc."
  "metabase/cmd/resources/config-file-intro.md")

(def markdown-outro
  "Used as footer for config file doc."
  "metabase/cmd/resources/config-file-outro.md")

(defn- build-markdown-page
  "Take a YAML string and builds a Markdown page for docs on a configuration file."
  [config-yaml]
  (str (slurp (io/resource markdown-intro))
       config-yaml
       (slurp (io/resource markdown-outro))))

(defn- format-yaml
  "Takes configuration map that includes settings data and preps YAML for embedding in Markdown doc."
  [config-with-settings]
  (yaml/generate-string config-with-settings :dumper-options {:flow-style :block}))

(defn- create-config-doc
  "Generates a configuration file Markdown doc with config template for Metabase
   with settings and their default values."
  [yaml-template]
  (-> yaml-template
      (io/resource)
      (slurp)
      (yaml/parse-string)
      (add-settings)
      (format-yaml)
      (build-markdown-page)))

(def config-file-path
  "Docs location for the config file template."
  "docs/configuring-metabase/config-template.md")

(def yaml-template
  "Base template that we'll add the settings to."
  "metabase/cmd/resources/config-template.yaml")

(defn generate-config-file-doc!
  "Generates a configuration file doc with template and saves to docs directory."
  []
  (println "Creating config file doc with template...")
  (spit (io/file config-file-path) (create-config-doc yaml-template))
  (println (str "Config doc file created: `" config-file-path "`.")))
