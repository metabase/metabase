(ns metabase.metabot.api.document
  "`/api/metabot/document` routes"
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.agent.core :as metabot.agent]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.context :as metabot.context]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private generate-content-body-schema
  [:map
   [:instructions ms/NonBlankString]
   [:references {:optional true} ms/Map]])

(def ^:private generate-content-response-schema
  [:map
   [:draft_card [:maybe [:map
                         [:name ms/NonBlankString]
                         [:dataset_query ms/Map]
                         [:database_id ms/PositiveInt]
                         [:parameters [:maybe [:sequential ms/Map]]]
                         [:visualization_settings ms/Map]]]]
   [:error [:maybe ms/NonBlankString]]
   [:description [:maybe ms/NonBlankString]]])

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

(defn- last-tool-output-message
  [parts]
  (some->> parts
           reverse
           (keep (fn [part]
                   (when (= :tool-output (:type part))
                     (or (get-in part [:result :output])
                         (some-> part :error :message)))))
           (remove str/blank?)
           first))

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
    (or last-text-message
        (last-tool-output-message parts))))

(api.macros/defendpoint :post "/generate-content" :- generate-content-response-schema
  "Create a new piece of content to insert into the document. Kept for backwards compatibility; now uses the native Clojure agent."
  [_route-params
   _query-params

   {:keys [instructions references]} :- generate-content-body-schema]
  (metabot.config/check-metabot-enabled!)
  (metabot.usage/check-metabase-managed-free-limit!)
  (let [context      (assoc
                      (metabot.context/create-context {:capabilities #{"permission:write_sql_queries"}})
                      :references references)
        parts        (into [] (metabot.agent/run-agent-loop
                               {:messages      [{:role    :user
                                                 :content instructions}]
                                :profile-id    :document-generate-content
                                :state         {}
                                :context       context
                                :tracking-opts {:source "document_generate_content"}}))
        chart-output (latest-chart-structured-output parts)
        draft-card   (draft-card-from-chart-output chart-output)
        description  (or (:description chart-output)
                         (:name chart-output)
                         (:name draft-card))]
    (if draft-card
      {:draft_card  draft-card
       :description description
       :error       nil}
      {:draft_card  nil
       :description nil
       :error       (or (last-agent-message parts)
                        "Unable to generate chart content.")})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/document` routes."
  (api.macros/ns-handler *ns* +auth))
