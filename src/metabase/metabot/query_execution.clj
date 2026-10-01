(ns metabase.metabot.query-execution
  "Run a serialized MBQL query on behalf of an agent and return one bounded page of rows.
   Shared by the Metabot tools and the MCP query tools, which wrap the page in their own response shapes."
  (:require
   [metabase.api.common :as api]
   [metabase.query-processor.core :as qp]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private query-passthrough-keys
  "The only keys of an incoming query forwarded to the QP. Everything else — `:middleware`,
   `:info`, `:constraints`, and any unknown key — is this namespace's to set, because the query map is
   caller-controlled and an agent that could name its own `:info` would forge `query_execution`
   attribution. A fresh MCP `:query` is also rejected upstream by the closed
   `:metabase.lib.schema/query`, but that covers only the fresh path: an MCP handle's stored query is
   checked shallowly and the `/drills` callback stores one verbatim, so an unknown key does reach
   here. This whitelist, not the schema, is what the guarantee rests on. The QP strips some of
   these itself; that is defense in depth, not this boundary's contract."
  [:lib/type :database :stages :parameters])

(defn- execute!
  "Run a serialized MBQL query through the QP with the standard agent userland preparation,
   capping this call's rows at `row-limit` (within the backend's 2000/10000 userland
   ceilings) and recording the run under `context`. Returns the QP result.
   A run that doesn't complete throws `{:error :query-failed :query-error <QP error text or nil>}`."
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
      (throw (ex-info "Query failed" {:error       :query-failed
                                      :query-error (:error result)})))
    result))

(defn execute-page!
  "Run `serialized-query` for one page of at most `row-limit` rows, recorded under the QP `context`.
   Fetches one row past the limit so truncation is *observed* rather than inferred from a full page:
   a result that fills the page exactly is complete, and is reported that way.
   Returns `{:cols :rows :returned :truncated?}` with the probe row already dropped, so `rows` is the
   page and `(last rows)` is a real page boundary.
   Throws as [[execute!]] does when the run doesn't complete."
  [serialized-query row-limit context]
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
