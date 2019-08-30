(ns metabase.domain-entities.specs-test
  (:require [expectations :refer [expect]]
            [metabase.domain-entities.specs :as specs]
            [schema.core :as s]))

;; All specs should be valid YAML (the parser will raise an exception if not) and conforming to the schema.
(expect
  (every? (comp (partial s/validate (var-get #'specs/DomainEntitySpec)) val) @specs/domain-entity-specs))
