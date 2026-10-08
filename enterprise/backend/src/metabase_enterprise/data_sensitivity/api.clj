(ns metabase-enterprise.data-sensitivity.api
  "`/api/ee/data-sensitivity` routes. Both endpoints run the LLM data-sensitivity classifier and return the diff. A
  dry run is the default and writes nothing. `?commit=true` requires a superuser, runs the classifier again, and
  writes the labels of that new run, not those of an earlier dry run: the model output can change between runs, so
  the written labels can differ from what a dry run showed. The caller needs write access to the database; the
  Metabot instance gates (enabled, provider configured, usage limit) are reported as a 400 before any work starts."
  (:require
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
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

(def ^:private CommitParams
  [:map {:closed true}
   [:commit {:default false} [:maybe ms/BooleanValue]]])

(defn- check-commit! [commit]
  (when commit
    (api/check-superuser)))

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
  `data_sensitivity` labels. A dry run is the default and writes nothing. With `commit`, classify again and write the
  proposed label of every new or differing field that no human labeled; semantic types are never written. Commit
  does not apply an earlier dry run: the model output can change between runs, so the written labels can differ from
  what a dry run showed."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   {:keys [commit]} :- CommitParams]
  (let [table (api/check-404 (db/active-table id))]
    (api/write-check :model/Database (:db_id table))
    (check-commit! commit)
    (check-available!)
    (classify #(core/classify-table! table :commit? commit))))

(api.macros/defendpoint :post "/database/:id" :- ::core/database-result
  "Classify every active table of the database, or only those in `schema` when given, with the LLM and diff the
  proposals against the current `data_sensitivity` labels. A dry run is the default and writes nothing. With
  `commit`, classify again and write the proposed label of every new or differing field that no human labeled, table
  by table; semantic types are never written. Commit does not apply an earlier dry run: the model output can change
  between runs, so the written labels can differ from what a dry run showed. A table that fails is an error entry in
  a 200 response and the run continues. A `schema` with no active tables is a 404. Synchronous: the whole scan runs
  within the request, so classify a large database one schema at a time."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   {:keys [commit]} :- CommitParams
   {:keys [schema]} :- [:maybe [:map {:closed true}
                                [:schema {:optional true} [:maybe ms/NonBlankString]]]]]
  (let [database (api/write-check :model/Database id)]
    (when schema
      (api/check-404 (db/active-schema? id schema)))
    (check-commit! commit)
    (check-available!)
    (core/classify-database! database :schema schema :commit? commit)))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the data-sensitivity API."
  (api.macros/ns-handler *ns* +auth))
