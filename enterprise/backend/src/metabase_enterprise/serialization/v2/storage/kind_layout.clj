(ns metabase-enterprise.serialization.v2.storage.kind-layout
  "The kind layout of an export: each item is a file `<name>.<kind>.yaml`, each collection a folder `<name>/` with its
  own `_collection.yaml`, and the items an item contains are in the folder `<name>.<kind>/` beside it."
  (:require
   [clojure.string :as str]
   [metabase.collections.core :as collections]))

(set! *warn-on-reflection* true)

(defn namespace-folder
  "The top-level folder of the collections of `collection-namespace`, a namespace without a folder of its own: its
  name with `-` turned into `_`."
  ;; Open item 4 of the layout spec: the proposed rule.
  [collection-namespace]
  (str/replace (name collection-namespace) "-" "_"))

(def other-namespace-folders
  "The top-level folders of the namespaces the default-namespace content may also go in."
  (into #{} (comp (remove nil?) (map namespace-folder)) collections/default-allowed-namespaces))

(def top-level-folders
  "Every top-level folder the kind layout writes."
  (into #{"data" "metrics" "dashboards" "documents" "glossary" "snippets" "data_actions" "transforms" "transform_tags"
          "python_library" "data_apps" "collections" "databases" "transform_jobs" "metabots" "channels"
          "embedding_themes" "custom_viz_plugins" "osi_ai_context"}
        other-namespace-folders))
