(ns metabase-enterprise.data-apps.generate.util
  "The files Metabase generates for a data app."
  (:require
   [metabase-enterprise.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(defn resource-path
  "The path of the file for the export named `export-name` in the app's collection directory."
  [export-name]
  (str (serialization/slugify-name export-name) ".yaml"))

(defn resource-file
  "The file of the extracted `entity` named `export-name`, at its path in the app's collection directory."
  [export-name entity]
  {:path     (resource-path export-name)
   :contents (serialization/entity-yaml entity)})
