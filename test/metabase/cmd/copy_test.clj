(ns metabase.cmd.copy-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.copy :as copy]
   [metabase.db.util :as mdb.u]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]))

(deftest all-models-accounted-for-test
  ;; This fetches the `metabase.cmd.load-from-h2/entities` and compares it all existing entities
  (let [migrated-model-names (set (map :name copy/entities))
        ;; Models that should *not* be migrated in `load-from-h2`.
        models-to-exclude    #{"TaskHistory" "Query" "QueryCache" "QueryExecution" "CardFavorite" "DashboardFavorite"}
        all-model-names      (set (for [ns       u/metabase-namespace-symbols
                                        :when    (or (re-find #"^metabase\.models\." (name ns))
                                                     (= (name ns) "metabase.db.data-migrations"))
                                        :when    (not (re-find #"test" (name ns)))
                                        [_ varr] (do (classloader/require ns)
                                                     (ns-interns ns))
                                        :let     [{model-name :name, :as model} (var-get varr)]
                                        :when    (and (mdb.u/toucan-model? model)
                                                      (not (contains? models-to-exclude model-name)))]
                                    model-name))]
    (is (= all-model-names migrated-model-names))))
