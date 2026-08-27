(ns metabase.measures.test-util
  "Test helpers for building MBQL5 Measure and Segment definitions against the ambient test metadata
  provider. Shared so tests across modules (measures, serdes, entity-retrieval) don't each redefine them."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(defn measure-definition
  "An MBQL5 measure definition: the sum of `field-id` over `table-id`."
  [table-id field-id]
  (let [mp (mt/metadata-provider)]
    (lib/aggregate (lib/query mp (lib.metadata/table mp table-id))
                   (lib/sum (lib.metadata/field mp field-id)))))

(defn segment-definition
  "An MBQL5 segment definition: a filter of `field-id` > `value` on `table-id`."
  [table-id field-id value]
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                (lib/> (lib.metadata/field mp field-id) value))))
