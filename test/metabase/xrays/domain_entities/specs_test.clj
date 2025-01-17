(ns metabase.xrays.domain-entities.specs-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.domain-entities.specs :as de.specs]))

(deftest ^:parallel validate-specs-test
  (testing "All specs should be valid YAML (the parser will raise an exception if not) and conforming to the schema."
    (doseq [[spec-name spec] @de.specs/domain-entity-specs]
      (testing spec-name
        (is (mr/validate de.specs/DomainEntitySpec spec))))))
