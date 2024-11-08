(ns metabase-enterprise.metabot-v3.tools.run-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.util.malli :as mu])
  (:import
    (clojure.lang ExceptionInfo)))

(defmulti apply-step
  "Applies a query step."
  {:arglists '([query step])}
  (fn [_query step]
    (-> step :type keyword)))

(defmethod apply-step :limit
  [query {:keys [limit]}]
  (if (neg-int? limit)
    (throw (ex-info "Row limit must be a non-negative number." {}))
    (lib/limit query limit)))

(defn- apply-steps
  [query steps]
  (reduce apply-step query steps))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/run-query
  [_tool-name {:keys [steps]} {:keys [dataset_query]}]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database dataset_query))
        query             (lib/query metadata-provider dataset_query)]
    (try
      {:reactions [{:type  :metabot.reaction/run-query
                    :query (-> query
                               (apply-steps steps)
                               lib.query/->legacy-MBQL)}]
       :output "success"}
      (catch ExceptionInfo e
        {:reactions [{:type    :metabot.reaction/writeback
                      :message (ex-message e)}]
         :output "failure"}))))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/run-query
  [_tool-name {:keys [dataset_query]}]
  (some? dataset_query))
