(ns metabase-enterprise.osi-generation.init
  "Startup wiring for OSI metadata generation.
  Requires the settings namespace for its `defsetting` side effects and the task namespace for its
  schedule registration; without this load the model setting never exists and the weekly job never runs."
  (:require
   [metabase-enterprise.osi-generation.settings]
   [metabase-enterprise.osi-generation.task.generate]
   [metabase.llm.provider :as llm.provider]))

(set! *warn-on-reflection* true)

;; Keep the generation model reference on whatever an edited connection actually serves, the same as Metabot's.
(llm.provider/register-model-ref-setting! :osi-generation-model)
