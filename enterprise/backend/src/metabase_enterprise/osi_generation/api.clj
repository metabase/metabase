(ns metabase-enterprise.osi-generation.api
  "`/api/ee/osi-generation` endpoints: the superuser manual trigger for the generation job."
  (:require
   [metabase-enterprise.osi-generation.core :as osi-generation]
   [metabase-enterprise.osi-generation.settings :as osi-generation.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/generate" :- [:map
                                              [:status [:= 204]]
                                              [:body :nil]]
  "Queue a run of the OSI metadata generation job.

  The run executes on the job scheduler, serialized behind any in-flight weekly run rather than
  concurrently with it. Returns 204 as soon as the run is queued; nothing here waits for generation.
  400 when generation is disabled, unlicensed, has no configured LLM, or the job is not registered;
  500 if Quartz rejects the trigger."
  []
  (api/check-superuser)
  ;; Each gate 400s so the interactive path is loud; the job body no-ops on the same gates. The final
  ;; trigger result is checked separately so scheduler failure is a 500.
  (api/check-400 (osi-generation.settings/osi-generation-enabled)
                 "OSI metadata generation is disabled.")
  (api/check-400 (osi-generation/available?)
                 "OSI metadata generation requires the library and library entity-retrieval features.")
  (api/check-400 (osi-generation.settings/configured?)
                 "No LLM provider is configured for OSI metadata generation.")
  (api/check-400 (task/job-exists? osi-generation/generation-job-key)
                 "The OSI metadata generation job is not registered with the scheduler.")
  (api/check-500 (task/trigger-now! osi-generation/generation-job-key))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/osi-generation` routes."
  (api.macros/ns-handler *ns* +auth))
