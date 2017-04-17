(ns metabase.cmd.load-from-h2-test
  (:require [clojure.java.classpath :as classpath]
            [clojure.tools.namespace.find :as ns-find]
            [expectations :refer :all]
            [toucan.models :as models]
            metabase.cmd.load-from-h2))

;; Check to make sure we're migrating all of our entities.
;; This fetches the `metabase.cmd.load-from-h2/entities` and compares it all existing entities

(defn- migrated-model-names []
  (set (map :name @(resolve 'metabase.cmd.load-from-h2/entities))))

(def ^:private models-to-exclude
  "Models that should *not* be migrated in `load-from-h2`."
  #{"LegacyQueryExecution"
    "Query"
    "QueryCache"
    "QueryExecution"})

(defn- all-model-names []
  (set (for [ns       (ns-find/find-namespaces (classpath/classpath))
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
