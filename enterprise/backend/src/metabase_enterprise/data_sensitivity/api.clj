(ns metabase-enterprise.data-sensitivity.api
  "`/api/ee/data-sensitivity` routes. Both endpoints run the LLM data-sensitivity classifier and return the diff;
  neither writes a label. The caller needs write access to the database; the Metabot instance gates (enabled,
  provider configured, usage limit) are reported as a 400 before any work starts."
  (:require
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- unavailable-message [reason]
  (case reason
    :metabot-disabled  (tru "Metabot is disabled. Enable Metabot to classify data sensitivity.")
    :no-llm            (tru "No AI provider is configured for Metabot.")
    :usage-limit       (tru "The AI usage limit has been reached.")
    :permission-denied (tru "You do not have permission to use Metabot.")))

(defn- check-available! []
  (when-let [reason (core/unavailable-reason)]
    (throw (ex-info (unavailable-message reason) {:status-code 400 :reason reason}))))

(api.macros/defendpoint :post "/table/:id" :- ::core/table-result
  "Classify every active field of the table with the LLM and diff the proposal against the current
  `data_sensitivity` labels. Nothing is written; the response is the proposal."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [table (api/check-404 (t2/select-one :model/Table :id id))]
    (api/write-check :model/Database (:db_id table))
    (check-available!)
    (core/classify-table! table)))

(api.macros/defendpoint :post "/database/:id" :- ::core/database-result
  "Classify every active table of the database, or only those in `schema` when given, with the LLM and diff the
  proposals against the current `data_sensitivity` labels. Synchronous; nothing is written."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [schema]} :- [:maybe [:map
                                [:schema {:optional true} [:maybe ms/NonBlankString]]]]]
  (let [database (api/write-check :model/Database id)]
    (check-available!)
    (core/classify-database! database :schema schema)))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the data-sensitivity API."
  (api.macros/ns-handler *ns* +auth))
