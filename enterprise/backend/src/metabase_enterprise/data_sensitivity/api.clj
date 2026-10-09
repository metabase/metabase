(ns metabase-enterprise.data-sensitivity.api
  "`/api/ee/data-sensitivity` routes. Both endpoints run the LLM data-sensitivity classifier and return the diff. A
  run commits by default. `?dry_run=true` previews the diff and writes nothing. A commit after a dry run runs the
  classifier again and writes the labels of that new run: the model output can change between runs, so the written
  labels can differ from what the dry run showed. Only a superuser may call either endpoint, dry run included,
  because the call skips the Metabot group permissions; see [[metabase-enterprise.data-sensitivity.core]]. The
  Metabot instance gates (enabled, provider configured, usage limit) are reported as a 400 before any work starts."
  (:require
   [metabase-enterprise.data-sensitivity.api.runs :as api.runs]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- unavailable-message [reason]
  (case reason
    :metabot-disabled (tru "Metabot is disabled. Enable Metabot to classify data sensitivity.")
    :no-llm           (tru "No AI provider is configured for Metabot.")
    :usage-limit      (tru "The AI usage limit has been reached.")
    (tru "AI classification is not available: {0}." (name reason))))

(defn- unavailable-ex [reason]
  (ex-info (unavailable-message reason) {:status-code 400 :reason reason :error-code reason}))

(defn- check-available! []
  (when-let [reason (core/unavailable-reason)]
    (throw (unavailable-ex reason))))

(def ^:private DryRunParams
  [:map {:closed true}
   [:dry_run {:default false} [:maybe ms/BooleanValue]]])

(defn- classify
  "Run `thunk` and translate a failure of a single-table run. A provider rejection becomes a 502 carrying the
  vendor's message so the caller sees why instead of a stack trace; a usage limit reached mid-run becomes the same
  400 the pre-flight reports."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (let [{:keys [api-error type]} (ex-data e)]
        (cond
          (= :metabot/usage-limit-reached type)
          (throw (unavailable-ex :usage-limit))

          api-error
          (throw (ex-info (ex-message e)
                          {:status-code 502 :reason "provider-error" :error-code :provider-error}
                          e))

          :else
          (throw e))))))

(api.macros/defendpoint :post "/table/:id" :- ::core/table-result
  "Classify every active field of the active table with the LLM and diff the proposal against the current
  `data_sensitivity` labels. By default the run commits: it writes the proposed label of every new or differing field
  that no human labeled; semantic types are never written. With `dry_run`, the run writes
  nothing. A commit after a dry run classifies again: the model output can change between runs, so the written labels
  can differ from what the dry run showed. Requires a superuser."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   {:keys [dry_run]} :- DryRunParams]
  (let [table (api/check-404 (db/active-table id))]
    (api/check-superuser)
    (check-available!)
    (classify #(core/classify-table! table :commit? (not dry_run)))))

(api.macros/defendpoint :post "/database/:id" :- ::core/database-result
  "Classify every active table of the database, or only those in `schema` when given, with the LLM and diff the
  proposals against the current `data_sensitivity` labels. By default the run commits: it writes the proposed label
  of every new or differing field that no human labeled, table by table; semantic types are never written. With `dry_run`, the run writes nothing. A commit after a dry run classifies again: the model output
  can change between runs, so the written labels can differ from what the dry run showed. A table that fails is an
  error entry in a 200 response and the run continues. A `schema` with no active tables is a 404. Synchronous: the
  whole scan runs within the request, so classify a large database one schema at a time. Requires a superuser."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   {:keys [dry_run]} :- DryRunParams
   {:keys [schema]} :- [:maybe [:map {:closed true}
                                [:schema {:optional true} [:maybe ms/NonBlankString]]]]]
  (let [database (api/check-404 (db/database id))]
    (api/check-superuser)
    (when schema
      (api/check-404 (db/active-schema? id schema)))
    (check-available!)
    (core/classify-database! database :schema schema :commit? (not dry_run))))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the data-sensitivity API, with the metadata generation run routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)
   api.runs/routes))
