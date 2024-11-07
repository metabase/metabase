(ns metabase-enterprise.metabot-v3.context
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [metabase.config :as config]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)
;; todo: remove this before shipping. This is quick and dirty
(defn log
  "Log a payload. Direction should be `:llm.log/fe->be` or similar. This should not be shipping in this form. This is
  not a rolling log, or logging to the console. This pretty prints to the file `llm-payloads`. It is explicitly useful
  for dev work and not production.

  Examples calls are ;; using doto
    (doto (request message context history)
      (metabot-v3.context/log :llm.log/be->fe))
    ;; or just regularly
    (metabot-v3.context/log _body :llm.log/fe->be)"
  [payload direction]
  (when config/is-dev?
    (let [directions {:llm.log/fe->be "\"FE -----------------> BE\""
                      :llm.log/be->llm "\"BE -----------------> LLM\""
                      :llm.log/llm->be "\"LLM -----------------> BE\""
                      :llm.log/be->fe "\"BE -----------------> FE\""}]
      (with-open [^java.io.BufferedWriter w (io/writer "llm-payloads" :append true)]
        (io/copy (directions direction (name direction)) w)
        (.newLine w)
        (let [payload' (json/generate-string payload {:pretty true})]
          (io/copy payload' w))
        (.newLine w)
        (.newLine w)))))

;;; TODO
(mr/def ::context
  [:map-of
   ;; TODO -- should this be recursive?
   {:encode/api-request #(update-keys % u/->snake_case_en)}
   :keyword
   :any])

(mu/defn hydrate-context
  "Hydrate context (about what the current user is currently looking at in the FE app), for example

    {:current_dashboard_id 1}

  With enough information that the LLM will be able to make meaningful decisions with it, e.g.

    {:current_dashboard {:name \"Car Dashboard\", :id 1, :cards [{:name \"Credit Card\", :id 2}}

  This should be a 'sparse' hydration rather than `SELECT * FROM dashboard WHERE id = 1` -- we should only include
  information needed for the LLM to do its thing rather than everything in the world."
  [{query :current_query :as context}]
  (merge context
         (when query
           (let [metadata-provider  (lib.metadata.jvm/application-database-metadata-provider (:database query))
                 query              (lib/query metadata-provider query)
                 filterable-columns (lib/filterable-columns query)]
             {:current_query
              {:string_filterable_columns  (into []
                                                 (comp (filter lib.types.isa/string?)
                                                       (map #(lib/display-name query %)))
                                                 filterable-columns)
               :number_filterable_columns  (into []
                                                 (comp (filter lib.types.isa/numeric?)
                                                       (map #(lib/display-name query %)))
                                                 filterable-columns)
               :boolean_filterable_columns (into []
                                                 (comp (filter lib.types.isa/boolean?)
                                                       (map #(lib/display-name query %)))
                                                 filterable-columns)
               :date_filterable_columns    (into []
                                                 (comp (filter lib.types.isa/date-or-datetime?)
                                                       (map #(lib/display-name query %)))
                                                 filterable-columns)
               :aggregation_operators      (mapv #(lib/display-name query %)
                                                 (lib/available-aggregation-operators query))
               :breakoutable_columns       (mapv #(lib/display-name query %)
                                                 (lib/breakoutable-columns query))
               :orderable_columns          (mapv #(lib/display-name query %)
                                                 (lib/orderable-columns query))}}))))
