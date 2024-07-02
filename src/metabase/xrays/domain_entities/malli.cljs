(ns metabase.xrays.domain-entities.malli
  (:require
    [malli.core :as mc]
    [malli.util :as mut]
    [metabase.xrays.domain-entities.converters])
  (:require-macros [metabase.xrays.domain-entities.malli]))

(clojure.core/defn schema-for-path
  "Given a schema and a *value path* (as opposed to a *schema path*), finds the schema for that
  path. Throws if there are multiple such paths and those paths have different schemas."
  [schema path]
  (let [paths (-> schema mc/schema (mut/in->paths path))]
    (cond
      (empty? paths)      (throw (ex-info "Path does not match schema" {:schema schema :path path}))
      (= (count paths) 1) (mut/get-in schema (first paths))
      :else (let [child-schemas (map #(mut/get-in schema %) paths)]
              (if (apply = child-schemas)
                (first child-schemas)
                (throw (ex-info "Value path has multiple schema paths, with different schemas"
                                {:schema        schema
                                 :paths         paths
                                 :child-schemas child-schemas})))))))
