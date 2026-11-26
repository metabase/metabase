(ns metabase.transforms.search
  "The query text of a transform that the search index holds."
  (:require
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.search.core :as search]
   [metabase.transforms.schema :as transforms.schema]))

(set! *warn-on-reflection* true)

(defn maybe-extract-transform-query-text
  "Return the query text (truncated to `max-searchable-value-length`) from transform source; else nil.
  Extracts SQL from query-type transforms and Python code from python-type transforms."
  [{transform-source-type :source_type source :source}]
  (let [source-data (lib/normalize ::transforms.schema/transform-source
                                   (cond-> source (string? source) mi/json-out-without-keywordization))
        query-text  (case (keyword transform-source-type)
                      :native (lib/raw-native-query (:query source-data))
                      :python (:body source-data)
                      nil)]
    (when query-text
      (subs query-text 0 (min (count query-text) search/max-searchable-value-length)))))
