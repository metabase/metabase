(ns metabase-enterprise.metabot-v3.api.document
  "`/api/ee/metabot-v3/document` routes"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.core :as metabot-v3.agent]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.query-processor :as qp]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.core :as warehouses]))

(set! *warn-on-reflection* true)

(defn- fix-sql [fix-request]
  (let [response (metabot-v3.client/fix-sql fix-request)
        return-sql (:sql fix-request)]
    (when-let [fixes (:fixes response)]
      (str/join "\n" (reduce
                      (fn [sql-lines fix]
                        (assoc sql-lines (dec (:line_number fix)) (:fixed_sql fix)))
                      (vec (str/split-lines return-sql))
                      fixes)))))

(defn- check-query
  "If the query is valid, return nil. If not, return the error message."
  [query]
  (try
    (qp/process-query query)
    nil
    (catch Exception e
      (ex-message e))))

(defn- maybe-fix-native-sql
  [response references]
  (let [query (get-in response [:draft_card :dataset_query])]
    (if-let [error (when (= "native" (name (:type query))) (check-query query))]
      (let [db-id (-> references
                      keys
                      first
                      name
                      (#(str/split % #":"))
                      last
                      Integer/parseInt)
            db (warehouses/get-database db-id)
            schema-ddl (table-utils/schema-full db-id)]
        ;; Attempt to fix SQL 5 times before returning.
        (loop [attempts-left 5
               sql (get-in query [:native :query])
               error error]
          (let [fixed-sql (fix-sql {:sql           sql
                                    :dialect       (:engine db)
                                    :error_message error
                                    :schema_ddl    schema-ddl})
                ;; Only re-check query if new SQL was produced.
                error (when fixed-sql
                        (check-query (assoc-in query [:native :query] fixed-sql)))]
            (if (and error (> attempts-left 1))
              (recur (dec attempts-left) fixed-sql error)
              (assoc-in response [:draft_card :dataset_query :native :query] (or fixed-sql sql))))))
      response)))

(defn- part->structured-output
  [part]
  (or (get-in part [:result :structured-output])
      (get-in part [:result :structured_output])))

(defn- latest-chart-structured-output
  [parts]
  (->> parts
       (filter #(= :tool-output (:type %)))
       (keep part->structured-output)
       (filter map?)
       (filter #(or (:chart-id %)
                    (= :chart-draft (:result-type %))
                    (and (:dataset_query %) (:display %))))
       last))

(defn- draft-card-from-chart-output
  [chart-output]
  (let [chart-name (:name chart-output)
        query (:dataset_query chart-output)
        chart-type (or (:display chart-output)
                       (:chart_type chart-output))]
    (when (and chart-name (map? query) chart-type)
      {:name                   chart-name
       :display                (name chart-type)
       :dataset_query          query
       :database_id            (:database query)
       :parameters             []
       :visualization_settings {}})))

(defn- last-agent-message
  [parts]
  (let [text-groups (reduce (fn [groups part]
                              (if (= :text (:type part))
                                (update groups (dec (count groups)) conj (:text part))
                                (conj groups [])))
                            [[]]
                            parts)
        last-text-message (some->> text-groups
                                   reverse
                                   (map #(str/trim (str/join "" %)))
                                   (remove str/blank?)
                                   first)]
    last-text-message))

(defn- native-generate-content
  [{:keys [instructions references]}]
  (let [context (assoc
                 (metabot-v3.context/create-context {:capabilities #{"permission:write_sql_queries"}})
                 :references references)
        parts (into [] (metabot-v3.agent/run-agent-loop
                        {:messages   [{:role :user
                                       :content instructions}]
                         :profile-id :document-generate-content
                         :state      {}
                         :context    context}))
        chart-output (latest-chart-structured-output parts)
        draft-card (draft-card-from-chart-output chart-output)
        description (or (:description chart-output)
                        (:name chart-output)
                        (:name draft-card))]

    (if draft-card
      (maybe-fix-native-sql {:draft_card draft-card
                             :description description
                             :error nil} references)
      {:draft_card nil
       :description nil
       :error (or
               (last-agent-message parts)
               "Unable to generate chart content.")})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/generate-content"
  "Create a new piece of content to insert into the document."
  [_route-params
   _query-params

   body :- [:map
            [:instructions ms/NonBlankString]
            [:references {:optional true} ms/Map]]]
  (let [response (metabot-v3.client/document-generate-content {:instructions    (:instructions body)
                                                               :references      (:references body)
                                                               :user_id         api/*current-user-id*
                                                               :conversation_id (str (random-uuid))})]
    (maybe-fix-native-sql response (:references body))))

(api.macros/defendpoint :post "/native-generate-content" :- [:map
                                                             [:draft_card [:maybe [:map
                                                                                   [:name ms/NonBlankString]
                                                                                   [:dataset_query ms/Map]
                                                                                   [:database_id ms/PositiveInt]
                                                                                   [:parameters [:maybe [:sequential ms/Map]]]
                                                                                   [:visualization_settings ms/Map]]]]
                                                             [:error [:maybe ms/NonBlankString]]
                                                             [:description [:maybe ms/NonBlankString]]]
  "Create a new piece of content to insert into the document using the native Clojure agent."
  [_route-params
   _query-params

   body :- [:map
            [:instructions ms/NonBlankString]
            [:references {:optional true} ms/Map]]]
  (native-generate-content body))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/document` routes."
  (api.macros/ns-handler *ns* +auth))
