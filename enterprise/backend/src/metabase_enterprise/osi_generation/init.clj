(ns metabase-enterprise.osi-generation.init
  "Startup wiring for OSI metadata generation.
  Requires the settings namespace for its `defsetting` side effects, so the model setting registers at
  boot; without this load it never exists and the job's gates read unconfigured."
  (:require
   [metabase-enterprise.osi-generation.settings]
   [metabase.llm.provider :as llm.provider]))

(set! *warn-on-reflection* true)

;; Keep the generation model reference on whatever an edited connection actually serves, the same as Metabot's.
(llm.provider/register-model-ref-setting! :osi-generation-model)
