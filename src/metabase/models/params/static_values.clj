(ns metabase.models.params.static-values
  "Code related to getting values for a parameter where its source values is a card."
  (:require
    [clojure.string :as str]
    [metabase.search.util :as search]))

(defn- query-matches
  "Filter the values according to the `search-term`.

  Values could have 2 shapes
  - [value1, value2]
  - [[value1, label1], [value2, label2]] - we search using label in this case"
  [query values]
  (let [normalized-query (search/normalize query)]
    (filter #(str/includes? (search/normalize (if (string? %)
                                                %
                                                ;; search by label
                                                (second %)))
                            normalized-query) values)))

(defn param->values
  "Given a param return the values"
  [{values-source-options :values_source_config :as _param} query]
  (when-let [values (:values values-source-options)]
    {:values          (if query
                        (query-matches query values)
                        values)
     :has_more_values false}))
