(ns metabase.cmd.load-from-h2-test
  (:require [expectations :refer :all]
            metabase.cmd.load-from-h2
            [metabase.util :as u]
            [toucan.models :as models]))

;; Check to make sure we're migrating all of our entities.
;; This fetches the `metabase.cmd.load-from-h2/entities` and compares it all existing entities

(defn- migrated-model-names []
  (set (map :name @(resolve 'metabase.cmd.load-from-h2/entities))))

(def ^:private models-to-exclude
  "Models that should *not* be migrated in `load-from-h2`."
  #{"Query"
    "QueryCache"
    "QueryExecution"})

(defn- all-model-names []
  (set (for [ns       @u/metabase-namespace-symbols
             :when    (or (re-find #"^metabase\.models\." (name ns))
                          (= (name ns) "metabase.db.migrations"))
             :when    (not (re-find #"test" (name ns)))
             [_ varr] (do (require ns)
                          (ns-interns ns))
             :let     [{model-name :name, :as model} (var-get varr)]
             :when    (and (models/model? model)
                           (not (contains? models-to-exclude model-name)))]
         model-name)))

(expect
  (all-model-names)
  (migrated-model-names))
