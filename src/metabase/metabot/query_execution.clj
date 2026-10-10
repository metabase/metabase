(ns metabase.metabot.query-execution
  "Run a serialized MBQL query on behalf of an agent and return one bounded page of rows."
  (:require
   [metabase.api.common :as api]
   [metabase.query-processor.core :as qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private query-passthrough-keys
  "The only keys of an incoming query forwarded to the QP.
   Everything else — `:middleware`, `:info`, `:constraints`, and any unknown key — is this namespace's to set,
   because the query map is caller-controlled and an agent that could name its own `:info` would forge
   `query_execution` attribution.
   This whitelist, not the query schema, is what the guarantee rests on.
   The QP strips some of these itself; that is defense in depth, not this boundary's contract."
  [:lib/type :database :stages :parameters])

(defn- execute!
  "Run a serialized MBQL query through the QP with the standard agent userland preparation.
   Caps this call's rows at `row-limit` (within the backend's 2000/10000 userland ceilings) and records the run
   under `context`."
  [serialized-query row-limit context]
  (let [result (qp/process-query
                (-> (select-keys serialized-query query-passthrough-keys)
                    (assoc :middleware {:js-int-to-string? true})
                    qp/userland-query-with-default-constraints
                    (assoc :constraints {:max-results           row-limit
                                         :max-results-bare-rows row-limit}
                           :info        {:executed-by api/*current-user-id*
                                         :context     context})))]
    (when-not (= (:status result) :completed)
      (throw (ex-info (if-let [error (:error result)]
                        (tru "Query failed: {0}" error)
                        (tru "Query failed: unknown error"))
                      {:agent-error?       true
                       :error              :query-failed
                       :query-error        (:error result)
                       ;; The QP's own refusal, as opposed to an error from the database.
                       :permissions-error? (= :missing-required-permissions (:error_type result))})))
    result))

(defn execute-page!
  "Run `serialized-query` for one page of at most `row-limit` rows, recorded under the QP `context`.
   Returns `{:cols :rows :returned :truncated?}`.
   The `truncated?` flag is true only when more rows exist, so a result that fills the page exactly is complete.
   A run that doesn't complete throws an agent error whose message carries the QP's error text.
   Its ex-data is `{:agent-error? true :error :query-failed :query-error <QP error text or nil>}`, with a true
   `:permissions-error?` when the QP refused the query because the current user may not run it."
  [serialized-query row-limit context]
  ;; Fetch one row past the limit so truncation is observed rather than inferred from a full page.
  ;; Dropping the probe row keeps `(last rows)` a real page boundary.
  (let [result     (execute! serialized-query (inc row-limit) context)
        all-rows   (vec (get-in result [:data :rows]))
        truncated? (> (count all-rows) row-limit)
        rows       (cond-> all-rows truncated? (subvec 0 row-limit))]
    {:cols       (get-in result [:data :cols])
     :rows       rows
     :returned   (count rows)
     :truncated? truncated?}))

(defn response-cols
  "The agent-facing description of result `cols`: name, display name, and qualified type names."
  [cols]
  (mapv (fn [{:keys [name base_type effective_type display_name]}]
          (cond-> {:name         name
                   :base_type    (u/qualified-name base_type)
                   :display_name display_name}
            effective_type (assoc :effective_type (u/qualified-name effective_type))))
        cols))
