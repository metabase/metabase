(ns metabase-enterprise.serialization.v2.storage.kind-folders
  "The top-level folders of the kind layout, for the layout that writes them and the ingestion that reads them."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn namespace-folder
  "The folder, under `collections/`, of the collections of `collection-namespace`, a namespace without a top-level
  folder of its own: its name with `-` turned into `_`."
  ;; Open item 4 of the layout: the proposed rule.
  [collection-namespace]
  (str/replace (name collection-namespace) "-" "_"))

(def top-level-folders
  "Every top-level folder the kind layout writes. The collections of the default namespace outside the Library, and of
  every namespace without a folder of its own, are under `collections/`."
  #{"data" "metrics" "dashboards" "documents" "glossary" "snippets" "data_actions" "transforms" "transform_tags"
    "python_library" "data_apps" "collections" "databases" "transform_jobs" "metabots" "channels" "embedding_themes"
    "custom_viz_plugins" "osi_ai_context"})

(def library-content-folders
  "The top-level folders whose content syncs with the Library: its sections, and the snippets, glossary and data
  actions."
  #{"data" "metrics" "dashboards" "documents" "snippets" "glossary" "data_actions"})
