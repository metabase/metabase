(ns metabase.cmd.copy-test
  (:require [clojure.test :refer :all]
            [flatland.ordered.map :as ordered-map]
            [metabase.cmd.copy :as copy]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [toucan.models :as models]))

(deftest casing-corner-cases-test
  (testing "objects->colums+values property handles columns with weird casing: `sizeX` and `sizeY`"
    (let [cols+vals (-> (#'copy/objects->colums+values
                         :postgres
                         ;; using ordered-map so the results will be in a predictable order
                         [(ordered-map/ordered-map
                           :id    281
                           :row   0
                           :sizex 18
                           :sizey 9)])
                        (update :cols vec))]
      (is (= {:cols ["\"id\"" "\"row\"" "\"sizeX\"" "\"sizeY\""]
              :vals [[281 0 18 9]]}
             cols+vals)))))

(deftest all-models-accounted-for-test
  ;; This fetches the `metabase.cmd.load-from-h2/entities` and compares it all existing entities
  (let [migrated-model-names (set (map :name copy/entities))
        ;; Models that should *not* be migrated in `load-from-h2`.
        models-to-exclude    #{"TaskHistory" "Query" "QueryCache" "QueryExecution"}
        all-model-names      (set (for [ns       u/metabase-namespace-symbols
                                        :when    (or (re-find #"^metabase\.models\." (name ns))
                                                     (= (name ns) "metabase.db.data-migrations"))
                                        :when    (not (re-find #"test" (name ns)))
                                        [_ varr] (do (classloader/require ns)
                                                     (ns-interns ns))
                                        :let     [{model-name :name, :as model} (var-get varr)]
                                        :when    (and (models/model? model)
                                                      (not (contains? models-to-exclude model-name)))]
                                    model-name))]
    (is (= all-model-names migrated-model-names))))
