(ns metabase.api.embed.common-test
  (:require [clojure.test :refer [deftest is]]
            [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
            [metabase.api.embed.common :as api.embed.common]))

(deftest entity-id-models-cover-test
  (is (= (count @#'api.embed.common/eid-table->model)
         (- (count (#'v2.entity-ids/entity-id-models))
            (count [:model/LegacyMetric])))
      "If you add a model with an entity_id, you need to add it to the entity-id-models map in common.clj"))
