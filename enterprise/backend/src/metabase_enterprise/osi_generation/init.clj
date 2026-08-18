(ns metabase-enterprise.osi-generation.init
  "Startup wiring for OSI metadata generation.
  Requires the settings namespace for its `defsetting` side effects so the provider/model/credential
  settings register at boot; without this load they never exist and the job's gates read unconfigured."
  (:require
   [metabase-enterprise.osi-generation.settings]))

(set! *warn-on-reflection* true)
