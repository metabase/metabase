(ns metabase.agent-lib.schema.top-level-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.capabilities.catalog.top-level :as capabilities.top-level]
   [metabase.agent-lib.schema :as schema]))

(def ^:private sample-operations
  {"filter"            ["filter" ["=" ["field" 1] 1]]
   "aggregate"         ["aggregate" ["count"]]
   "breakout"          ["breakout" ["field" 1]]
   "with-fields"       ["with-fields" [["field" 1]]]
   "limit"             ["limit" 10]
   "expression"        ["expression" "Net Amount" ["+" ["field" 1] 1]]
   "join"              ["join" ["join-clause" ["table" 2]]]
   "order-by"          ["order-by" ["field" 1] "desc"]
   "append-stage"      ["append-stage"]
   "drop-stage"        ["drop-stage"]
   "drop-empty-stages" ["drop-empty-stages"]
   "with-page"         ["with-page" {:page 2 :items 25}]})

(deftest ^:parallel top-level-capability-catalog-and-schema-samples-stay-in-sync-test
  (let [capability-ops (mapv (comp name :op) capabilities.top-level/capabilities)]
    (is (= (set capability-ops)
           (set (keys sample-operations))))
    (doseq [op-name capability-ops]
      (testing op-name
        (let [program {:source     {:type "table" :id 1}
                       :operations [(get sample-operations op-name)]}]
          (is (= program
                 (schema/validated-structure program))))))))
