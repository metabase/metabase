(ns metabase.agent-lib.validate.semantic
  "Semantic validation rules for repaired structured MBQL programs."
  (:require
   [metabase.agent-lib.validate.context :as validate.context]
   [metabase.agent-lib.validate.program :as validate.program]))

(set! *warn-on-reflection* true)

(defn validate-program
  "Validate semantic structured-program rules after repair and structural validation."
  [program context]
  (let [allowed-ids (validate.context/context-allowed-ids context)]
    (validate.program/validate-program-body! allowed-ids context [] program 0 {:node-count 0})
    program))
