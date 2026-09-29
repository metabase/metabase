(ns metabase-enterprise.data-sensitivity.api
  "`/api/ee/data-sensitivity` routes. Both endpoints run the data-sensitivity classifier and return the diff;
  neither writes a label. The caller needs write access to the database; the gates of the chosen engine (for the
  LLM: Metabot enabled, provider configured, usage limit; for Jev: a key) are reported as a 400 before any work
  starts."
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
    :metabot-disabled  (tru "Metabot is disabled. Enable Metabot to classify data sensitivity.")
    :no-llm            (tru "No AI provider is configured for Metabot.")
    :usage-limit       (tru "The AI usage limit has been reached.")
    :no-jev-key        (tru "No TypeSafe Jev API key is configured.")
    :permission-denied (tru "You do not have permission to use Metabot.")))

(defn- unavailable-ex [reason]
  (ex-info (unavailable-message reason) {:status-code 400 :reason reason :error-code reason}))

(defn- check-available! [engine]
  (when-let [reason (core/unavailable-reason engine)]
    (throw (unavailable-ex reason))))

(def ^:private Engine
  [:enum "llm" "jev"])

(defn- classify
  "Run `thunk` and translate a failure the classifier could not work around. A provider rejection becomes a 502
  carrying the vendor's message so the caller sees why instead of a stack trace; a usage limit reached mid-run
  becomes the same 400 the pre-flight reports."
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
  "Classify every active field of the table with `engine` (the LLM by default, or TypeSafe Jev) and diff the
  proposal against the current `data_sensitivity` labels. Nothing is written; the response is the proposal."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [engine]} :- [:maybe [:map {:closed true}
                                [:engine {:optional true} [:maybe Engine]]]]]
  (let [table  (api/check-404 (db/table id))
        engine (keyword (or engine "llm"))]
    (api/write-check :model/Database (:db_id table))
    (check-available! engine)
    (classify #(core/classify-table! table :engine engine))))

(api.macros/defendpoint :post "/database/:id" :- ::core/database-result
  "Classify every active table of the database, or only those in `schema` when given, with `engine` (the LLM by
  default, or TypeSafe Jev) and diff the proposals against the current `data_sensitivity` labels. Synchronous;
  nothing is written."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [schema engine]} :- [:maybe [:map {:closed true}
                                       [:schema {:optional true} [:maybe ms/NonBlankString]]
                                       [:engine {:optional true} [:maybe Engine]]]]]
  (let [database (api/write-check :model/Database id)
        engine   (keyword (or engine "llm"))]
    (check-available! engine)
    (classify #(core/classify-database! database :schema schema :engine engine))))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the data-sensitivity API."
  (api.macros/ns-handler *ns* +auth))
