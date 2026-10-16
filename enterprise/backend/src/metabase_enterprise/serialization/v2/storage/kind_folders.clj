(ns metabase-enterprise.serialization.v2.storage.kind-folders
  "The top-level folders of the kind layout, for the layout that writes them and the ingestion that reads them."
  (:require
   [clojure.string :as str]
   [metabase.collections.core :as collections]))

(set! *warn-on-reflection* true)

(defn namespace-folder
  "The top-level folder of the collections of `collection-namespace`, a namespace without a folder of its own: its
  name with `-` turned into `_`."
  ;; Open item 4 of the layout: the proposed rule.
  [collection-namespace]
  (str/replace (name collection-namespace) "-" "_"))

(def top-level-folders
  "Every top-level folder the kind layout writes."
  (into #{"data" "metrics" "dashboards" "documents" "glossary" "snippets" "data_actions" "transforms" "transform_tags"
          "python_library" "data_apps" "collections" "databases" "transform_jobs" "metabots" "channels"
          "embedding_themes" "custom_viz_plugins" "osi_ai_context"}
        (comp (remove nil?) (map namespace-folder))
        collections/default-allowed-namespaces))
