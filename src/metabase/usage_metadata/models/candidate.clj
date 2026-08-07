(ns metabase.usage-metadata.models.candidate
  (:require
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/UsageMetadataCandidateRun [_] :usage_metadata_candidate_run)
(methodical/defmethod t2/table-name :model/UsageMetadataCandidate [_] :usage_metadata_candidate)
(methodical/defmethod t2/table-name :model/UsageMetadataCandidateSource [_] :usage_metadata_candidate_source)
(methodical/defmethod t2/table-name :model/UsageMetadataCandidateMatch [_] :usage_metadata_candidate_match)
(methodical/defmethod t2/table-name :model/UsageMetadataCandidateDismissal [_] :usage_metadata_candidate_dismissal)

(derive :model/UsageMetadataCandidateRun :metabase/model)
(derive :model/UsageMetadataCandidate :metabase/model)
(derive :model/UsageMetadataCandidateSource :metabase/model)
(derive :model/UsageMetadataCandidateMatch :metabase/model)
(derive :model/UsageMetadataCandidateDismissal :metabase/model)

(t2/deftransforms :model/UsageMetadataCandidateRun
  {:status        mi/transform-keyword
   :trigger       mi/transform-keyword
   :source_config mi/transform-json
   :summary       mi/transform-json})

(defn- query-definition?
  [definition]
  (and (map? definition)
       (or (contains? definition :stages)
           (contains? definition "stages"))))

(defn- definition-in
  [definition]
  (mi/json-in
   (if (query-definition? definition)
     (lib/prepare-for-serialization (lib/normalize definition))
     definition)))

(defn- definition-out
  [definition]
  (let [definition (mi/json-out-with-keywordization definition)]
    (if (query-definition? definition)
      (dissoc (lib/normalize definition) :lib/metadata)
      definition)))

(def ^:private transform-candidate-definition
  "Persist MBQL definitions in their canonical serializable form.

  Table candidates store a small non-query definition and pass through unchanged."
  {:in definition-in, :out definition-out})

(t2/deftransforms :model/UsageMetadataCandidate
  {:candidate_type   mi/transform-keyword
   :definition       transform-candidate-definition
   :semantic_details mi/transform-json
   :modeling_status  mi/transform-keyword})

(t2/deftransforms :model/UsageMetadataCandidateSource
  {:card_type     mi/transform-keyword
   :stage_numbers mi/transform-json
   :model_lineage mi/transform-json})

(t2/deftransforms :model/UsageMetadataCandidateMatch
  {:relation mi/transform-keyword})

(t2/deftransforms :model/UsageMetadataCandidateDismissal
  {:candidate_type mi/transform-keyword})
